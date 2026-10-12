"use client";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  FileText,
  Globe2,
  Loader2,
  Newspaper,
  Play,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import DashboardShell, {
  SectionHeading,
  StatCard,
  StatusBadge,
  buttonClass,
  EmptyState,
} from "@/components/dashboard-shell";
import type { Source, Article, Script } from "@/lib/mock-data";
import { useNews } from "@/lib/use-news";
import { newsRequest, type ScriptProvider } from "@/lib/api";
import { useJobs } from "@/lib/use-jobs";
import JobProgress from "@/components/job-progress";
import { formatDate } from "@/lib/display";

export default function Dashboard() {
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [runError, setRunError] = useState("");
  const providersData = useNews<ScriptProvider[]>("providers", []);
  const provider = providersData.data[0];
  const sourcesData = useNews<Source[]>("sources", []);
  const articlesData = useNews<Article[]>("articles", []);
  const scriptsData = useNews<Script[]>("scripts", []);
  const { jobs, error: jobsError, loading: jobsLoading } = useJobs();
  const pipelineBusy =
    scanning ||
    jobs.some(
      (job) =>
        job.status === "running" &&
        (job.kind === "pipeline" || job.kind === "scrape"),
    );
  const progressKey = jobs
    .map(
      (job) =>
        `${job.id}:${job.status}:${job.articlesSaved}:${job.scriptsGenerated}`,
    )
    .join("|");
  const reloadSources = sourcesData.reload,
    reloadArticles = articlesData.reload,
    reloadScripts = scriptsData.reload;
  useEffect(() => {
    if (progressKey)
      void Promise.all([reloadSources(), reloadArticles(), reloadScripts()]);
  }, [progressKey, reloadSources, reloadArticles, reloadScripts]);
  const scripts = [...scriptsData.data].sort((a, b) =>
    b.generatedAt.localeCompare(a.generatedAt),
  );
  const sources = sourcesData.data;
  const pending = articlesData.data.filter(
    (a) => a.status !== "processed",
  ).length;
  async function runScan() {
    setScanning(true);
    setMessage("");
    setRunError("");
    try {
      const result = await newsRequest<any>("pipeline", "POST", {});
      const issues =
        result.scans.flatMap((s: any) => s.errors).length +
        result.errors.length;
      setMessage(
        `${result.scans.reduce((n: number, s: any) => n + s.added, 0)} articles saved · ${result.generated.length} scripts generated · ${result.remaining} pending${issues ? ` · ${issues} issues (see job details)` : ""}`,
      );
      await Promise.all([reloadSources(), reloadArticles(), reloadScripts()]);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Pipeline failed");
    } finally {
      setScanning(false);
    }
  }
  const loadError =
    providersData.error ||
    sourcesData.error ||
    articlesData.error ||
    scriptsData.error;
  return (
    <DashboardShell
      title="Overview"
      description="Monitor sources, collected articles, script generation, and active jobs."
      actions={
        <button
          className={buttonClass}
          disabled={pipelineBusy || !provider?.configured}
          onClick={() => void runScan()}
        >
          {pipelineBusy ? <Loader2 className="animate-spin" /> : <Play />}
          {pipelineBusy ? "Pipeline running" : "Run pipeline"}
        </button>
      }
    >
      <div className="space-y-7">
        {(loadError || runError) && (
          <p role="alert" className="error-notice">
            {loadError || runError}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="size-3.5 text-primary" />
            {provider
              ? `${provider.model} · ${provider.configured ? "API key configured" : "API key missing"}`
              : "Loading model configuration…"}
          </p>
          {provider && (
            <p className="text-[11px] text-slate-500">
              {provider.free
                ? "Free model · rate limits apply"
                : "Paid model · newly scraped articles only · charges apply"}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Monitored sources"
            value={sources.length}
            detail={`${sources.filter((s) => s.active).length} enabled for discovery`}
            Icon={Globe2}
          />
          <StatCard
            label="Articles collected"
            value={articlesData.data.length}
            detail="Extracted from public publishers"
            Icon={Newspaper}
          />
          <StatCard
            label="Scripts generated"
            value={scripts.length}
            detail="Ready for editorial review"
            Icon={FileText}
          />
          <StatCard
            label="Awaiting a script"
            value={pending}
            detail="Generate older articles individually from Articles"
            Icon={Activity}
          />
        </div>
        <JobProgress jobs={jobs} loading={jobsLoading} error={jobsError} />
        <div className="grid items-start gap-6 xl:grid-cols-[1.65fr_1fr]">
          <section>
            <SectionHeading
              title="Recent scripts"
              action={
                <Link href="/scripts" className="text-link text-xs">
                  All scripts
                  <ArrowUpRight className="size-3.5" />
                </Link>
              }
            />
            {scripts.length ? (
              <div className="panel divide-y divide-border overflow-hidden">
                {scripts.slice(0, 4).map((s) => (
                  <Link
                    href={`/scripts/${s.id}`}
                    key={s.id}
                    className="group flex items-start gap-4 p-5 transition hover:bg-[#f9faf6]"
                  >
                    <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-[#f7f8f4]">
                      <FileText
                        className="size-4 text-primary"
                        strokeWidth={1.5}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">{s.source}</p>
                      <h3 className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-6">
                        {s.title}
                      </h3>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {formatDate(s.generatedAt)}
                        {s.durationSeconds
                          ? ` · ${s.durationSeconds}s · ${s.scenes?.length || 0} scenes`
                          : ""}
                      </p>
                    </div>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No scripts yet"
                description="Run the pipeline to turn discovered articles into platform-neutral scripts."
                action={
                  <Link href="/sources" className="text-link">
                    Manage sources
                    <ArrowRight className="size-3.5" />
                  </Link>
                }
              />
            )}
          </section>
          <section>
            <SectionHeading
              title="Source watch"
              action={
                <Link href="/sources" className="text-link text-xs">
                  Manage
                  <ArrowUpRight className="size-3.5" />
                </Link>
              }
            />
            <div className="panel p-5">
              <div className="space-y-5">
                {sources.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f0f2eb] text-[10px] font-semibold text-primary">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{s.name}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {s.articleCount} articles collected
                      </p>
                    </div>
                    <StatusBadge kind={s.active ? "green" : "gray"}>
                      {s.active ? "Active" : "Paused"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
              {!sources.length && (
                <p className="text-xs text-slate-400">
                  No sources configured yet.
                </p>
              )}
              <Link
                href="/sources"
                className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-primary"
              >
                View all sources
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
