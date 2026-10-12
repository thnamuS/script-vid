"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Globe2,
  LayoutDashboard,
  Menu,
  Newspaper,
  X,
  BarChart3,
  PanelLeft,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/login/actions";

const nav = [
  ["Overview", "/", LayoutDashboard],
  ["Sources", "/sources", Globe2],
  ["Articles", "/articles", Newspaper],
  ["Scripts", "/scripts", FileText],
] as const;
export function DashboardShell({
  children,
  title,
  description,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function check() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND || ""}/api/health`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401 && !disposed)
          window.location.assign("/login");
        if (!disposed) setHealth(response.ok ? "connected" : "disconnected");
      } catch {
        if (!disposed) setHealth("disconnected");
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(check, 15000);
      }
    }
    void check();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab") {
        const elements = [
          ...(sidebar.current?.querySelectorAll<HTMLElement>("a, button") ||
            []),
        ].filter((el) => el.getClientRects().length);
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);
  const section =
    nav.find(([, href]) =>
      href === "/" ? path === "/" : path.startsWith(href),
    )?.[0] || "Overview";
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-white p-3 focus:not-sr-only"
      >
        Skip to content
      </a>
      {open && (
        <button
          aria-label="Close navigation overlay"
          tabIndex={-1}
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm lg:hidden"
          onClick={() => {
            setOpen(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col lg:w-[228px] border-r border-border bg-[#fbfcf9] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/" onClick={() => setOpen(false)} className="rounded-sm text-[18px] font-semibold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">ShippingShorts</Link>
          <button
            className="p-1 lg:hidden"
            aria-label="Close navigation"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        </div>
        <nav
          aria-label="Main navigation"
          className="mt-3 flex flex-col gap-1 px-3"
        >
          {nav.map(([label, href, Icon]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] transition-colors ${active ? "bg-[#e8eee5] font-semibold text-primary" : "text-slate-500 hover:bg-[#eff2eb] hover:text-slate-800"}`}
              >
                <Icon strokeWidth={1.7} className="size-[17px]" />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-[228px]">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white/70 px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              ref={menuButton}
              className="rounded-md p-1.5 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="workspace-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <span className="text-xs font-medium text-slate-500">
              {section}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {process.env.NEXT_PUBLIC_SUPABASE_URL && (
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs text-slate-500 hover:text-primary"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
        >
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] sm:text-[32px]">
                {title}
              </h1>
              {description && (
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}
export function StatusBadge({
  children,
  kind = "green",
}: {
  children: React.ReactNode;
  kind?: "green" | "gray" | "blue" | "red" | "amber";
}) {
  const color = {
    green: "bg-[#edf3e9] text-[#41633e]",
    gray: "bg-slate-100 text-slate-500",
    blue: "bg-[#edf3f5] text-[#426879]",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
  }[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${color}`}
    >
      <span className="size-1 rounded-full bg-current" />
      {children}
    </span>
  );
}
export function StatCard({
  label,
  value,
  detail,
  Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  Icon: React.ElementType;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon strokeWidth={1.5} className="size-4 text-[#7b8d7b]" />
      </div>
      <p className="mt-3 text-[32px] font-medium leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-3 text-[11px] text-slate-400">{detail}</p>
    </div>
  );
}
export const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#193e2d] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4";
export const secondaryClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-[#f2f5ee] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4";
export const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#679881] focus:ring-2 focus:ring-[#679881]/15 disabled:opacity-50";
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel px-6 py-14 text-center">
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-[#edf1e8] text-primary">
        <FileText strokeWidth={1.5} className="size-5" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-slate-500">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function PageLoading() {
  return (
    <div
      role="status"
      className="flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500"
    >
      <span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
      Loading…
    </div>
  );
}
export function StarButton({ starred, busy, onClick, label }: { starred?: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return <button type="button" aria-label={`${starred ? 'Unstar' : 'Star'} ${label}`} aria-pressed={!!starred} disabled={busy} title={starred ? 'Remove from starred' : 'Save to starred'} onClick={onClick} className={`grid size-11 shrink-0 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-50 ${starred ? 'bg-yellow-50 text-yellow-500 hover:bg-yellow-100' : 'text-slate-400 hover:bg-[#f2f5ee] hover:text-yellow-500'}`}>
    <Star aria-hidden="true" className={`size-5 ${starred ? 'fill-yellow-400' : 'fill-none'}`} strokeWidth={1.7} />
  </button>
}
export function LogoMark() {
  return <BarChart3 className="size-4" />;
}
export function SidebarIcon() {
  return <PanelLeft className="size-4" />;
}
export default DashboardShell;
