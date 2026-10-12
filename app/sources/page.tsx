'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Globe2, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import DashboardShell, { buttonClass, secondaryClass, inputClass, StatusBadge, EmptyState, PageLoading } from '@/components/dashboard-shell'
import { formatSourceUrl } from '@/lib/mock-data'
import type { NewsSource } from '@/lib/server/store'
import { useNews } from '@/lib/use-news'
import { useJobs } from '@/lib/use-jobs'
import { newsRequest, type ScriptProvider } from '@/lib/api'
import { formatDate } from '@/lib/display'

export default function SourcesPage() {
  const { data: items, error: loadError, loading, reload } = useNews<NewsSource[]>('sources', [])
  const { data: providers, error: providerError } = useNews<ScriptProvider[]>('providers', [])
  const { jobs } = useJobs()
  const provider = providers[0]
  const [modal, setModal] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState(''), [url, setUrl] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const scanning = busy || jobs.some(job => job.status === 'running' && (job.kind === 'pipeline' || job.kind === 'scrape'))
  useEffect(() => { if (modal) dialog.current?.showModal(); else dialog.current?.close() }, [modal])
  const jobKey = jobs.map(job => `${job.id}:${job.status}:${job.articlesSaved}`).join('|')
  useEffect(() => { if (jobKey) void reload() }, [jobKey, reload])
  async function perform(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await task(); await reload() }
    catch (error) { setError(error instanceof Error ? error.message : 'Request failed') }
    finally { setBusy(false) }
  }
  function open(source?: NewsSource) { setEditing(source?.id || null); setName(source?.name || ''); setUrl(source?.url || ''); setModal(true); setError('') }
  async function scan(pipeline: boolean) {
    await perform(async () => {
      const result = await newsRequest<any>(pipeline ? 'pipeline' : 'scan', 'POST', {})
      const scans = pipeline ? result.scans : result
      const added = scans.reduce((n: number, s: any) => n + s.added, 0)
      const issues = scans.flatMap((s: any) => s.errors).length + (result.errors?.length || 0)
      setNotice(`${added} articles saved${pipeline ? ` · ${result.generated.length} scripts generated · ${result.remaining} pending` : ''} · ${issues} issues. See source or dashboard job details${result.errors?.length ? `: ${result.errors.map((e: any) => e.detail).join('; ')}` : '.'}`)
    })
  }
  const list = items.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'active' ? s.active : !s.active)))
  return <DashboardShell title="Sources" description="Manage publications and feeds used for article discovery." actions={<><button disabled={scanning} className={secondaryClass} onClick={() => open()}><Plus />Add source</button><button disabled={scanning || !provider?.configured} className={buttonClass} onClick={() => void scan(true)}>{scanning ? <Loader2 className="animate-spin" /> : <Globe2 />}{scanning ? 'Discovery running' : 'Run pipeline'}</button></>}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-[#eef2e9] px-4 py-3"><p className="text-xs text-[#57704f]"><strong className="font-semibold">{items.filter(s => s.active).length} active sources</strong> · {items.length} in your collection</p><button disabled={scanning} className="text-link text-xs disabled:opacity-50" onClick={() => void scan(false)}>Scrape articles only<ArrowUpRight className="size-3.5" /></button></div>
      {(error || loadError || providerError) && !modal && <p role="alert" className="error-notice">{error || loadError || providerError}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {scanning && <p className="flex flex-wrap items-center gap-2 text-xs text-primary"><Loader2 className="size-3.5 animate-spin" />Work is in progress.<Link href="/" className="underline underline-offset-4">Follow live progress on the dashboard →</Link></p>}
      <div className="toolbar"><div role="group" aria-label="Filter sources" className="flex gap-1 rounded-lg border border-border bg-white p-1">{['all', 'active', 'paused'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1.5 text-xs capitalize ${filter === f ? 'bg-[#eaf0e4] font-medium text-primary' : 'text-slate-500 hover:bg-slate-50'}`}>{f}</button>)}</div><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-3 size-3.5 text-slate-400" /><input aria-label="Search sources" className={`${inputClass} pl-9`} placeholder="Find a source…" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
      {loading && !items.length ? <PageLoading /> : list.length ? <div className="panel overflow-hidden"><div className="hidden grid-cols-[minmax(0,1.5fr)_0.5fr_0.9fr_0.6fr] gap-4 border-b border-border bg-[#fbfcf9] px-5 py-3 md:grid"><span className="eyebrow">Publication</span><span className="eyebrow">Articles</span><span className="eyebrow">Last checked</span><span className="eyebrow text-right">Manage</span></div><div className="divide-y divide-border">{list.map(s => <div key={s.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.5fr)_0.5fr_0.9fr_0.6fr] md:items-start">
        <div className="flex min-w-0 gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-[#f4f6ef] text-[11px] font-semibold text-primary">{s.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="text-xs font-semibold">{s.name}</p>{s.url ? <a className="mt-1 block truncate text-[11px] text-slate-500 hover:text-primary" href={s.url} target="_blank" rel="noopener noreferrer">{formatSourceUrl(s.url)} ↗</a> : <p className="mt-1 text-[11px] text-amber-700">Confirm a public URL</p>}<button className="mt-2" disabled={scanning || !s.url} aria-label={`${s.active ? 'Pause' : 'Enable'} ${s.name}`} onClick={() => void perform(async () => { await newsRequest(`sources/${s.id}`, 'PATCH', { active: !s.active }) })}><StatusBadge kind={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Paused'}</StatusBadge></button>{s.lastError && <details className="mt-2 text-[11px] text-amber-800"><summary>Source needs attention</summary><p className="mt-2 whitespace-pre-line break-words leading-5">{s.lastError}</p></details>}</div></div>
        <p className="text-xs tabular-nums text-slate-500"><span className="mr-2 md:hidden">Articles:</span>{s.articleCount}</p><p className="text-[11px] leading-5 text-slate-500">{formatDate(s.lastCheckedAt)}</p><div className="flex items-center justify-end gap-3"><button disabled={scanning} className="text-xs font-medium text-primary disabled:opacity-50" onClick={() => open(s)}>Edit</button><button disabled={scanning} aria-label={`Remove ${s.name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" onClick={() => { if (confirm(`Remove ${s.name}? Saved articles and scripts will remain.`)) void perform(async () => { await newsRequest(`sources/${s.id}`, 'DELETE') }) }}><Trash2 className="size-3.5" /></button></div>
      </div>)}</div></div> : <EmptyState title="No sources here yet" description={query || filter !== 'all' ? 'Try a different search or filter.' : 'Add a publication or RSS feed to start discovering stories.'} />}
      <div className="flex flex-wrap justify-between gap-2 text-[10px] leading-5 text-slate-500"><p>Public articles only. Podcasts and videos need public transcript pages.</p><p>{provider ? `${provider.model} · ${provider.free ? 'Free model' : 'Paid · up to 5 scripts per run'}` : 'Model configuration loading…'}</p></div>
    </div>
    <dialog ref={dialog} aria-labelledby="source-dialog-title" onCancel={() => setModal(false)} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-border bg-white p-0 shadow-xl backdrop:bg-slate-950/30 backdrop:backdrop-blur-sm"><form className="p-6" onSubmit={e => { e.preventDefault(); void perform(async () => { await newsRequest(editing ? `sources/${editing}` : 'sources', editing ? 'PATCH' : 'POST', { name, url, ...(editing ? { active: true } : {}) }); setModal(false) }) }}><div className="flex items-start justify-between gap-3"><div><h2 id="source-dialog-title" className="text-xl font-semibold">{editing ? 'Edit publication' : 'Add source'}</h2></div><button type="button" aria-label="Close dialog" disabled={busy} className="rounded-md p-1 text-slate-400" onClick={() => setModal(false)}><X className="size-4" /></button></div><p className="mt-2 text-xs leading-6 text-slate-500">Use a public news page or RSS feed for better article discovery.</p><label className="mt-5 block text-xs font-medium">Publication name<input autoFocus required maxLength={120} className={`${inputClass} mt-2`} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. India Shipping News" /></label><label className="mt-4 block text-xs font-medium">Website or feed URL<input required type="url" className={`${inputClass} mt-2`} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label>{error && <p role="alert" className="error-notice mt-3">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} className={secondaryClass} onClick={() => setModal(false)}>Cancel</button><button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save source'}</button></div></form></dialog>
  </DashboardShell>
}
