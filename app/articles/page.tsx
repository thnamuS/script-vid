"use client";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
import type { Article } from "@/lib/mock-data";
import { useNews } from "@/lib/use-news";
import { formatDate } from "@/lib/display";
import { articleService } from "@/lib/services";

export default function Articles() {
  const {
    data: articles,
    error,
    loading,
    setData,
  } = useNews<Article[]>("articles", []);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState("");
  async function toggleStar(article: Article) {
    if (saving.has(article.id)) return;
    setSaving((previous) => new Set(previous).add(article.id));
    setSaveError("");
    try {
      const saved = await articleService.setStarred(
        article.id,
        !article.starred,
      );
      setData((previous) =>
        previous.map((item) => (item.id === saved.id ? saved : item)),
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save the star. Try again.",
      );
    } finally {
      setSaving((previous) => {
        const next = new Set(previous);
        next.delete(article.id);
        return next;
      });
    }
  }
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  const filtered = articles.filter(
    (a) =>
      (filter === "all" ||
        (filter === "starred" ? a.starred : a.status === filter)) &&
      `${a.title} ${a.source}`.toLowerCase().includes(query.toLowerCase()),
  );
  const perPage = 15,
    pages = Math.max(1, Math.ceil(filtered.length / perPage)),
    currentPage = Math.min(page, pages - 1);
  return (
    <DashboardShell
      title="Articles"
      description="Read extracted news, check the facts, and turn an article into a script."
      actions={
        <Link href="/sources" className={secondaryClass}>
          Manage sources
          <ArrowRight />
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
          <div
            role="group"
            aria-label="Filter articles"
            className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1"
          >
            {["all", "new", "processed", "failed", "starred"].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
                className={`rounded-md px-3 py-1.5 text-xs capitalize ${filter === f ? "bg-[#eaf0e4] font-medium text-primary" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {f}
                <span className="ml-2 text-[10px] opacity-60">
                  {f === "all"
                    ? articles.length
                    : articles.filter((a) =>
                        f === "starred" ? a.starred : a.status === f,
                      ).length}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 size-3.5 text-slate-400" />
            <input
              aria-label="Search articles"
              className={`${inputClass} pl-9`}
              placeholder="Search title or publication…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        {loading && !articles.length ? (
          <PageLoading />
        ) : filtered.length ? (
          <div className="panel overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,2fr)_1fr_0.7fr_0.6fr_44px_16px] items-center gap-5 border-b border-border bg-[#fbfcf9] px-5 py-3 lg:grid">
              <span className="eyebrow">Headline</span>
              <span className="eyebrow">Publication</span>
              <span className="eyebrow">Published</span>
              <span className="eyebrow">Status</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {filtered
                .slice(currentPage * perPage, (currentPage + 1) * perPage)
                .map((article) => (
                  <div key={article.id} className="relative">
                    <Link
                      href={`/articles/${article.id}`}
                      className="group grid items-center gap-3 p-5 transition hover:bg-[#f9faf6] lg:grid-cols-[minmax(0,2fr)_1fr_0.7fr_0.6fr_44px_16px] lg:gap-5"
                    >
                      <div>
                        <h2 className="line-clamp-2 text-[13px] font-medium leading-6">
                          {article.title}
                        </h2>
                        <p className="mt-1 text-[10px] text-slate-400 lg:hidden">
                          {article.source} ·{" "}
                          {formatDate(article.publishedAt, false)}
                        </p>
                      </div>
                      <span className="hidden text-xs text-slate-500 lg:block">
                        {article.source}
                      </span>
                      <span className="hidden text-[11px] text-slate-500 lg:block">
                        {formatDate(article.publishedAt, false)}
                      </span>
                      <div className="flex items-center justify-between">
                        <StatusBadge
                          kind={
                            article.status === "processed"
                              ? "green"
                              : article.status === "new"
                                ? "blue"
                                : "red"
                          }
                        >
                          {article.status === "processed"
                            ? "Script created"
                            : article.status === "new"
                              ? "New"
                              : "Failed"}
                        </StatusBadge>
                        <ArrowRight className="size-3.5 text-slate-400 lg:hidden" />
                      </div>
                      <span className="hidden lg:block" aria-hidden="true" />
                      <ArrowRight className="hidden size-3.5 text-slate-400 group-hover:text-primary lg:block" />
                    </Link>
                    <div className="absolute bottom-1.5 right-12 lg:bottom-auto lg:right-14 lg:top-1/2 lg:-translate-y-1/2">
                      <StarButton
                        label={`article: ${article.title}`}
                        starred={article.starred}
                        busy={saving.has(article.id)}
                        onClick={() => void toggleStar(article)}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title={
              filter === "starred" && !query
                ? "No starred articles"
                : "No articles found"
            }
            description={
              filter === "starred" && !query
                ? "Press the star next to an article’s arrow to save it here. Its related script will also be starred."
                : query || filter !== "all"
                  ? "Try a different search or status filter."
                  : "Run article discovery from Sources to collect public news articles."
            }
            action={
              !query && filter === "all" ? (
                <Link href="/sources" className="text-link">
                  Go to sources
                  <ArrowRight className="size-3.5" />
                </Link>
              ) : undefined
            }
          />
        )}
        {!!filtered.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <p>
              {currentPage * perPage + 1}–
              {Math.min((currentPage + 1) * perPage, filtered.length)} of{" "}
              {filtered.length} articles
            </p>
            <div className="flex gap-2">
              <button
                aria-label="Previous page"
                disabled={!currentPage}
                className={secondaryClass}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </button>
              <button
                aria-label="Next page"
                disabled={currentPage === pages - 1}
                className={secondaryClass}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
