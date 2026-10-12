"use client";
import { Check, CircleAlert, Loader2, Radio } from "lucide-react";
import { SectionHeading, StatusBadge } from "./dashboard-shell";
import type { NewsJob } from "@/lib/jobs";
import { formatDate } from "@/lib/display";

const titles = {
  pipeline: "News pipeline",
  scrape: "Article discovery",
  generate: "Script generation",
  regenerate: "Script revision",
};
const statuses = {
  running: "In progress",
  completed: "Completed",
  completed_with_issues: "Needs attention",
  failed: "Failed",
  interrupted: "Interrupted",
};
export default function JobProgress({
  jobs,
  loading,
  error,
}: {
  jobs: NewsJob[];
  loading: boolean;
  error: string;
}) {
  const active = jobs.filter((job) => job.status === "running");
  const visible = [
    ...active,
    ...jobs.filter((job) => job.status !== "running").slice(0, 3),
  ];
  return (
    <section aria-label="Job progress">
      <SectionHeading
        title="Live activity"
        action={
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Radio className="size-3 text-primary" />
            Updates every 2s
          </span>
        }
      />
      {error && (
        <p role="alert" className="error-notice mb-3">
          {error} · Progress may be out of date.
        </p>
      )}
      <div className="panel divide-y divide-border overflow-hidden">
        {!visible.length && (
          <div className="flex items-center gap-3 p-5">
            <span className="grid size-8 place-items-center rounded-lg bg-[#eff3e9]">
              <Radio className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-xs font-medium">
                {loading ? "Loading job status…" : "No running jobs"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {loading
                  ? "Fetching the latest job status."
                  : "Start a pipeline or revise a script. Progress will appear here."}
              </p>
            </div>
          </div>
        )}
        {visible.map((job) => {
          const running = job.status === "running";
          const successful =
            job.status === "completed" ||
            job.status === "completed_with_issues";
          const attention = !successful || job.issues.length > 0;
          const percent = job.total
            ? Math.round((job.completed / job.total) * 100)
            : successful
              ? 100
              : running
                ? null
                : 0;
          const stage =
            job.stage === "scraping"
              ? "Collecting articles"
              : job.stage === "generating"
                ? "Writing scripts"
                : "Starting";
          return (
            <article
              key={job.id}
              className={`p-5 ${running ? "bg-[#f7faf4]" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${running ? "bg-[#e6eee0] text-primary" : attention ? "bg-amber-50 text-amber-700" : "bg-[#f0f3eb] text-primary"}`}
                >
                  {running ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : attention ? (
                    <CircleAlert className="size-3.5" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-medium">{titles[job.kind]}</h3>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatDate(job.startedAt)}
                  </p>
                </div>
                <span className="hidden text-[11px] text-slate-500 sm:block">
                  {job.articlesSaved} articles · {job.scriptsGenerated} scripts
                </span>
                <StatusBadge
                  kind={running ? "blue" : attention ? "amber" : "green"}
                >
                  {statuses[job.status]}
                </StatusBadge>
              </div>
              {running && (
                <div className="mt-4 sm:ml-11">
                  <div className="mb-2 flex justify-between gap-3 text-[11px] text-slate-500">
                    <span>{stage}</span>
                    <span>
                      {job.completed}/{job.total} items
                      {percent !== null ? ` · ${percent}%` : ""}
                    </span>
                  </div>
                  <progress
                    aria-label={`${titles[job.kind]}: ${stage}`}
                    max={100}
                    value={percent ?? undefined}
                    className="h-1.5 w-full accent-primary"
                  />
                  {job.currentItem && (
                    <p className="mt-2 break-words text-[11px] text-slate-500">
                      {job.currentItem}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-slate-400">
                    Current-stage completion, not model-token progress. You can
                    leave this page and return.
                  </p>
                </div>
              )}
              <p className="mt-2 text-[10px] text-slate-500 sm:hidden">
                {job.articlesSaved} articles · {job.scriptsGenerated} scripts
              </p>
              {job.error && (
                <p className="mt-3 break-words text-xs text-red-700 sm:ml-11">
                  {job.error}
                </p>
              )}
              {!!job.issues.length && (
                <details className="mt-3 text-[11px] text-amber-800 sm:ml-11">
                  <summary>
                    {job.issues.length} reported issues · View details
                  </summary>
                  <ul className="mt-2 list-disc space-y-2 pl-4">
                    {job.issues.map((issue, index) => (
                      <li className="break-words leading-5" key={index}>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
