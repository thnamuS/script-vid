"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import DashboardShell, {
  buttonClass,
  secondaryClass,
  StatusBadge,
  EmptyState,
  PageLoading,
} from "@/components/dashboard-shell";
import type { Article, Script } from "@/lib/mock-data";
import { useNews } from "@/lib/use-news";
import { newsRequest, type ScriptProvider } from "@/lib/api";
import { formatDate } from "@/lib/display";

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    data: article,
    error,
    loading,
    reload,
  } = useNews<Article | null>(`articles/${id}`, null);
  const {
    data: scripts,
    reload: reloadScripts,
    error: scriptError,
  } = useNews<Script[]>("scripts", []);
  const { data: providers, error: providerError } = useNews<ScriptProvider[]>(
    "providers",
    [],
  );
  const provider = providers[0];
  const [busy, setBusy] = useState(false),
    [generationError, setGenerationError] = useState("");
  if (loading)
    return (
      <DashboardShell title="Article">
        <PageLoading />
      </DashboardShell>
    );
  if (!article)
    return (
      <DashboardShell title="Article not found">
        <EmptyState
          title="Article not found"
          description={error || "This article may have been removed."}
          action={
            <Link className={secondaryClass} href="/articles">
              Back to articles
            </Link>
          }
        />
      </DashboardShell>
    );
  const script = scripts.find((s) => s.articleId === article.id);
  async function generate() {
    setBusy(true);
    setGenerationError("");
    try {
      await newsRequest(`articles/${id}/generate`, "POST", {});
      await Promise.all([reload(), reloadScripts()]);
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "Generation failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <DashboardShell
      title="Article review"
      description="The extracted source material behind your next script."
      actions={
        <a
          className={secondaryClass}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Original article
          <ArrowUpRight />
        </a>
      }
    >
      <div className="space-y-6">
        <Link href="/articles" className="text-link text-xs">
          <ArrowLeft className="size-3.5" />
          All articles
        </Link>
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              kind={article.status === "processed" ? "green" : "blue"}
            >
              {article.status === "processed"
                ? "Script created"
                : "New article"}
            </StatusBadge>
            <span className="text-[11px] text-slate-500">{article.source}</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
            {article.title}
          </h2>
          <p className="mt-3 text-[11px] text-slate-500">
            Published {formatDate(article.publishedAt)} · Collected{" "}
            {formatDate(article.createdAt)}
          </p>
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
          <article className="panel p-6 sm:p-8">
            <p className="eyebrow mb-6">Extracted article</p>
            <div className="space-y-5">
              {article.content.split(/\n\n+/).map((paragraph, i) => (
                <p
                  key={i}
                  className="break-words text-sm leading-8 text-slate-600"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
          <aside className="space-y-4 xl:sticky xl:top-6">
            <section className="panel p-5">
              <span className="mb-4 grid size-9 place-items-center rounded-lg bg-[#edf2e6] text-primary">
                <FileText className="size-4" />
              </span>
              <h3 className="text-sm font-semibold">
                {script ? "Script is ready" : "Create a script"}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {script
                  ? "Review the scene-by-scene brief, revise it, and copy it into your chosen platform."
                  : "Turn these facts into a 60–90 second brief with narration, scene directions, and on-screen text."}
              </p>
              {script ? (
                <Link
                  className={`${buttonClass} mt-5 w-full`}
                  href={`/scripts/${script.id}`}
                >
                  Review script
                  <ArrowUpRight />
                </Link>
              ) : (
                <button
                  disabled={busy || !provider?.configured}
                  className={`${buttonClass} mt-5 w-full`}
                  onClick={() => void generate()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {busy ? "Writing script…" : "Generate script"}
                </button>
              )}
              {busy && (
                <Link
                  href="/"
                  className="mt-3 block text-center text-[11px] text-primary underline"
                >
                  Follow live job progress →
                </Link>
              )}
              {(generationError || providerError || scriptError) && (
                <p role="alert" className="error-notice mt-4">
                  {generationError || providerError || scriptError}
                </p>
              )}
              {provider && (
                <div className="mt-4 border-t border-border pt-4 text-[10px] leading-5 text-slate-500">
                  <p className="break-words font-medium">{provider.model}</p>
                  <p>
                    {provider.configured
                      ? "API key configured"
                      : "API key missing"}
                  </p>
                  <p>
                    {provider.free
                      ? "Free model · rate limits apply"
                      : "Paid model · uses your OpenRouter credits"}
                  </p>
                </div>
              )}
            </section>
            <p className="px-1 text-[10px] leading-5 text-slate-500">
              The original article remains the factual source. Check the
              generated script before publishing.
            </p>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
