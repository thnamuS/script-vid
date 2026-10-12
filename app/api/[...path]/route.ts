import { NextRequest, NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  allSources,
  allArticles,
  allScripts,
  saveSource,
  removeSource,
  storageContext,
  NewsDatabaseError,
  setScriptStarred,
  setArticleStarred,
} from "@/lib/server/store";
import { ingest, scanSources, validateUrl } from "@/lib/server/scraper";
import {
  generateScript,
  openRouterModel,
  isFreeModel,
} from "@/lib/server/openrouter";
import { recentJobs, trackJob } from "@/lib/server/jobs";

import { createClient } from '@/lib/supabase/server';
import { localStorageMode } from '@/lib/supabase/config';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
async function body(request: NextRequest): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 10000) throw Error("Request body too large");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("Expected a JSON object");
  return parsed;
}
let pipelineRunning = false;
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    // Browser writes must be same-origin; optional bearer token protects all API access.
    const token = process.env.NEWS_API_TOKEN;
    if (token) {
      const supplied =
        request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
      if (
        Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
      )
        return json({ detail: "Unauthorized" }, 401);
    }
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && origin !== request.nextUrl.origin)
      return json({ detail: "Cross-origin writes are not permitted" }, 403);
    const { path } = await context.params;
    const [resource, id, action] = path;
    if (resource === "jobs" && request.method === "GET") {
      const jobs = await recentJobs();
      if (!id) return json(jobs);
      const job = jobs.find((job) => job.id === id);
      return job ? json(job) : json({ detail: "Job not found" }, 404);
    }
    if (resource === "sources") {
      if (request.method === "GET" && !id) return json(await allSources());
      if (request.method === "POST" && !id) {
        const data = await body(request);
        if (
          typeof data.name !== "string" ||
          !data.name.trim() ||
          data.name.length > 120 ||
          typeof data.url !== "string"
        )
          throw Error("Provide a source name and URL");
        const url = validateUrl(data.url).href;
        return json(
          await saveSource({
            id: randomUUID(),
            name: data.name.trim(),
            url,
            active: true,
            kind: data.kind === "transcript" ? "transcript" : "website",
            lastCheckedAt: "Not checked yet",
            articleCount: 0,
            lastError: null,
          }),
          201,
        );
      }
      const source = (await allSources()).find((s) => s.id === id);
      if (!source) return json({ detail: "Source not found" }, 404);
      if (request.method === "PATCH") {
        const data = await body(request);
        if ("active" in data && typeof data.active !== "boolean")
          throw Error("active must be a boolean");
        if ("url" in data && typeof data.url !== "string")
          throw Error("url must be a string");
        if (
          "name" in data &&
          (typeof data.name !== "string" ||
            !data.name.trim() ||
            data.name.length > 120)
        )
          throw Error("Provide a valid source name");
        const url =
          typeof data.url === "string"
            ? validateUrl(data.url).href
            : source.url;
        if (data.active === true && !url)
          throw Error("Confirm and set the source URL before enabling it");
        return json(
          await saveSource({
            ...source,
            url,
            name:
              typeof data.name === "string" ? data.name.trim() : source.name,
            active:
              typeof data.active === "boolean" ? data.active : source.active,
            lastError: typeof data.url === "string" ? null : source.lastError,
          }),
        );
      }
      if (request.method === "DELETE") {
        await removeSource(source.id);
        return json({ deleted: true });
      }
    }
    if (resource === "articles") {
      if (request.method === "GET" && !id) return json(await allArticles());
      if (request.method === "POST" && !id) {
        const data = await body(request);
        const source = (await allSources()).find((s) => s.id === data.sourceId);
        if (!source || typeof data.url !== "string")
          throw Error("Provide a valid sourceId and article URL");
        const url = data.url;
        return json(
          await trackJob("scrape", async (report) => {
            report({
              stage: "scraping",
              currentItem: url,
              completed: 0,
              total: 1,
            });
            const known = new Set((await allArticles()).map((a) => a.id));
            const article = await ingest(source, url);
            await saveSource({
              ...source,
              articleCount: (await allArticles()).filter(
                (a) => a.sourceId === source.id,
              ).length,
            });
            report({
              completed: 1,
              articlesSaved: known.has(article.id) ? 0 : 1,
            });
            return article;
          }),
          201,
        );
      }
      const article = (await allArticles()).find((a) => a.id === id);
      if (!article) return json({ detail: "Article not found" }, 404);
      if (request.method === "GET") return json(article);
      if (request.method === "PATCH" && !action) {
        const data = await body(request);
        if (typeof data.starred !== "boolean" || Object.keys(data).some(key => key !== "starred"))
          throw Error("Provide only starred as a boolean");
        const updated = await setArticleStarred(article.id, data.starred);
        return updated ? json(updated) : json({ detail: "Article not found" }, 404);
      }
      if (request.method === "POST" && action === "generate") {
        const data = await body(request);
        if ("regenerate" in data && typeof data.regenerate !== "boolean")
          throw Error("regenerate must be a boolean");
        if (
          "feedback" in data &&
          (typeof data.feedback !== "string" || data.feedback.length > 2000)
        )
          throw Error(
            "Revision feedback must be text of at most 2000 characters",
          );
        const regenerating = data.regenerate === true;
        const hadScript = (await allScripts()).some((s) => s.articleId === article.id);
        return json(
          await trackJob(
            regenerating ? "regenerate" : "generate",
            async (report) => {
              report({
                stage: "generating",
                currentItem: article.title,
                completed: 0,
                total: 1,
              });
              const script = await generateScript(
                article,
                regenerating,
                typeof data.feedback === "string" ? data.feedback : "",
              );
              report({
                completed: 1,
                scriptsGenerated: !hadScript || regenerating ? 1 : 0,
              });
              return script;
            },
          ),
        );
      }
    }
    if (resource === "scripts") {
      if (request.method === "GET") {
        if (!id) return json(await allScripts());
        const script = (await allScripts()).find((s) => s.id === id);
        return script ? json(script) : json({ detail: "Script not found" }, 404);
      }
      if (request.method === "PATCH" && id && !action) {
        const data = await body(request);
        if (typeof data.starred !== "boolean" || Object.keys(data).some(key => key !== "starred"))
          throw Error("Provide only starred as a boolean");
        const script = await setScriptStarred(id, data.starred);
        return script ? json(script) : json({ detail: "Script not found" }, 404);
      }
    }
    if (resource === "scan" && request.method === "POST") {
      const data = await body(request);
      if (data.sourceId && !(await allSources()).some((s) => s.id === data.sourceId))
        return json({ detail: "Source not found" }, 404);
      return json(
        await trackJob("scrape", (report) =>
          scanSources(
            typeof data.sourceId === "string" ? data.sourceId : undefined,
            report,
          ),
        ),
      );
    }
    if (resource === "pipeline" && request.method === "POST") {
      if (pipelineRunning)
        return json({ detail: "A pipeline is already running" }, 409);
      if (!process.env.OPENROUTER_API_KEY)
        throw Error(
          "Set OPENROUTER_API_KEY in .env.local before running the pipeline",
        );
      openRouterModel();
      const data = await body(request);
      const sourceId =
        typeof data.sourceId === "string" ? data.sourceId : undefined;
      if (sourceId && !(await allSources()).some((s) => s.id === sourceId))
        return json({ detail: "Source not found" }, 404);
      pipelineRunning = true;
      try {
        return json(
          await trackJob("pipeline", async (report) => {
            const scans = await scanSources(sourceId, report);
            // Only articles added by this scan belong to this pipeline run.
            // Old pending/failed articles are left for explicit manual generation.
            const scannedIds = new Set(scans.flatMap((scan) => scan.articleIds));
            const pending = (await allArticles()).filter(
              (a) => a.status !== "processed" && scannedIds.has(a.id),
            );
            const generated = [];
            const errors = [];
            const issues = scans.flatMap((scan) => scan.errors);
            report({
              stage: "generating",
              completed: 0,
              total: pending.length,
              currentItem: null,
              issues,
            });
            for (const article of pending) {
              report({ currentItem: article.title });
              try {
                generated.push(await generateScript(article));
              } catch (error) {
                const detail =
                  error instanceof Error ? error.message : "Generation failed";
                errors.push({ articleId: article.id, detail });
                issues.push(`${article.title}: ${detail}`);
              }
              report({
                completed: generated.length + errors.length,
                scriptsGenerated: generated.length,
                issues,
              });
            }
            return {
              scans,
              generated,
              errors,
              remaining: (await allArticles()).filter(
                (a) => a.status !== "processed" && (!sourceId || a.sourceId === sourceId),
              ).length,
            };
          }),
        );
      } finally {
        pipelineRunning = false;
      }
    }
    if (resource === "health" && request.method === "GET") {
      await allSources(); // Verify persistent storage is accessible.
      return json({ status: "ok" });
    }
    if (resource === "providers" && request.method === "GET")
      return json([
        {
          id: "openrouter",
          label: "OpenRouter",
          kind: "script",
          model: openRouterModel(),
          free: isFreeModel(openRouterModel()),
          configured: !!process.env.OPENROUTER_API_KEY?.trim(),
        },
      ]);
    return json({ detail: "Endpoint not found" }, 404);
  } catch (error) {
    console.error("News API:", error);
    return json(
      {
        detail: error instanceof Error ? error.message : "Request failed",
        ...(error instanceof NewsDatabaseError ? { code: error.code } : {}),
      },
      error instanceof NewsDatabaseError ? error.status : 400,
    );
  }
}
async function authenticatedHandler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (localStorageMode()) return handler(request, context);
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ detail: 'Sign in to continue' }, 401);
    return await storageContext.run({ client, userId: user.id }, () => handler(request, context));
  } catch (error) {
    console.error('Supabase API configuration:', error);
    return json({ detail: 'Authentication is unavailable. Check the Supabase configuration.' }, 503);
  }
}
export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as PATCH, authenticatedHandler as DELETE };
