"use client";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowUpRight,
  Clock3,
  FileText,
  Layers,
  Search,
  Star,
} from "lucide-react";
import { useState } from "react";
import DashboardShell, {
  inputClass,
  StatusBadge,
  EmptyState,
  PageLoading,
  secondaryClass,
  StarButton,
} from "@/components/dashboard-shell";
import type { Script } from "@/lib/mock-data";
import { useNews } from "@/lib/use-news";
import { formatDate } from "@/lib/display";
import { scriptService } from '@/lib/services';

export default function Scripts() {
  const { data: scripts, error, loading, setData } = useNews<Script[]>("scripts", []);
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<"new" | "old">("new");
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState('');
  async function toggleStar(script: Script) {
    if (saving.has(script.id)) return;
    setSaving(previous => new Set(previous).add(script.id));
    setSaveError('');
    try {
      const saved = await scriptService.setStarred(script.id, !script.starred);
      setData(previous => previous.map(item => item.id === saved.id ? saved : item));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the star. Try again.');
    } finally {
      setSaving(previous => { const next = new Set(previous); next.delete(script.id); return next; });
    }
  }
  const list = scripts
    .filter((s) =>
      (filter === 'all' || s.starred) && `${s.title} ${s.source}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "new"
        ? b.generatedAt.localeCompare(a.generatedAt)
        : a.generatedAt.localeCompare(b.generatedAt),
    );
  return (
    <DashboardShell
      title="Scripts"
      description="Review, revise, and copy article-based scripts for your chosen video platform."
      actions={
        <Link className={secondaryClass} href="/articles">
          Browse articles
          <ArrowUpRight />
        </Link>
      }
    >
      <div className="space-y-5">
        {(error || saveError) && (
          <p role="alert" className="error-notice">
            {error || saveError}
          </p>
        )}
        <div className="toolbar">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 size-3.5 text-slate-400" />
            <input
              aria-label="Search scripts"
              className={`${inputClass} pl-9`}
              placeholder="Search title or publication…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Filter scripts" className="flex gap-1 rounded-lg border border-border bg-white p-1">
              {(['all', 'starred'] as const).map(value => (
                <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${filter === value ? 'bg-[#eaf0e4] text-primary' : 'text-slate-500 hover:bg-[#f2f5ee]'}`}>
                  {value === 'starred' && <Star className="size-3.5" />}
                  {value === 'all' ? 'All scripts' : 'Starred'}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">
              {list.length} scripts
            </span>
            <button
              className={secondaryClass}
              onClick={() => setSort(sort === "new" ? "old" : "new")}
            >
              <ArrowDownUp />
              {sort === "new" ? "Newest first" : "Oldest first"}
            </button>
          </div>
        </div>
        {loading && !scripts.length ? (
          <PageLoading />
        ) : list.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => (
              <article
                key={s.id}
                className="panel group flex min-w-0 flex-col p-5 transition hover:border-[#99b09a] hover:shadow-sm"
              >
                <div className="relative mb-5 flex min-h-11 items-center justify-between gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f0f3ea] text-primary">
                    <FileText className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="absolute left-1/2 -translate-x-1/2">
                    <StarButton label={`script: ${s.title}`} starred={s.starred} busy={saving.has(s.id)} onClick={() => void toggleStar(s)} />
                  </div>
                  <StatusBadge
                    kind={s.format === "video-ready-v1" ? "green" : "gray"}
                  >
                    {s.format === "video-ready-v1"
                      ? "Video-ready"
                      : "Narration only"}
                  </StatusBadge>
                </div>
                <Link href={`/scripts/${s.id}`} className="flex flex-1 flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="eyebrow truncate">{s.source}</p>
                <h2 className="mt-2 line-clamp-3 text-[15px] font-semibold leading-6 tracking-tight">
                  {s.title}
                </h2>
                <p className="mt-3 line-clamp-3 text-xs leading-6 text-slate-500">
                  {s.summary}
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-[10px] text-slate-500">
                  {s.durationSeconds && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="size-3" />
                      {s.durationSeconds}s
                    </span>
                  )}
                  {s.scenes && (
                    <span className="flex items-center gap-1">
                      <Layers className="size-3" />
                      {s.scenes.length} scenes
                    </span>
                  )}
                  <span>Platform-neutral</span>
                </div>
                <div className="mt-auto pt-5">
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                    <span className="text-[10px] text-slate-400">
                      {formatDate(s.generatedAt, false)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                      Review script
                      <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={filter === 'starred' && !query ? 'No starred scripts' : 'No scripts found'}
            description={
              query
                ? "Try searching for a different title or publication."
                : filter === 'starred'
                  ? 'Press the star at the top of a script card to save important scripts here.'
                  : "Choose an article or run the pipeline to generate your first script."
            }
            action={filter === 'starred' ? (
              <button className={secondaryClass} onClick={() => setFilter('all')}>Show all scripts</button>
            ) : (
              <Link href="/articles" className="text-link">
                Browse articles
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          />
        )}
      </div>
    </DashboardShell>
  );
}
