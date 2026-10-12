'use client'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Check, Copy, FileText, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import DashboardShell, { buttonClass, secondaryClass, inputClass, StatusBadge, EmptyState, PageLoading } from '@/components/dashboard-shell'
import type { Script } from '@/lib/mock-data'
import { useNews } from '@/lib/use-news'
import { newsRequest } from '@/lib/api'
import { formatDate } from '@/lib/display'

export default function ScriptDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: script, loading, error, setData } = useNews<Script | null>(`scripts/${id}`, null)
  const [copied, setCopied] = useState(false), [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(''), [feedback, setFeedback] = useState(''), [notice, setNotice] = useState('')
  const [view, setView] = useState<'scenes' | 'full'>('scenes')
  async function copy() {
    if (!script) return
    try { await navigator.clipboard.writeText(script.script); setCopied(true); setActionError(''); setTimeout(() => setCopied(false), 1800) }
    catch { setActionError('Could not copy automatically. Select and copy the full script below.') }
  }
  async function regenerate() {
    if (!script || !confirm('Replace this script with a new version? Generation uses your configured OpenRouter model and may incur charges. Your current script is retained if it fails.')) return
    setBusy(true); setActionError(''); setCopied(false); setNotice('')
    try { setData(await newsRequest<Script>(`articles/${script.articleId}/generate`, 'POST', { regenerate: true, feedback: feedback.trim() })); setFeedback(''); setNotice('New version saved. Review the updated scenes before copying.') }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Generation failed') }
    finally { setBusy(false) }
  }
  if (loading) return <DashboardShell title="Script review"><PageLoading /></DashboardShell>
  if (!script) return <DashboardShell title="Script not found"><EmptyState title="Script not found" description={error || 'This script may have been removed.'} action={<Link className={secondaryClass} href="/scripts">Back to scripts</Link>} /></DashboardShell>
  let elapsed = 0
  return <DashboardShell title="Script review" description="Check the story, refine the direction, then copy it into your video platform." actions={<button disabled={busy} className={buttonClass} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy full script'}</button>}>
    <div className="space-y-6">
      <Link href="/scripts" className="text-link text-xs"><ArrowLeft className="size-3.5" />All scripts</Link>
      {(actionError || notice) && <p role={actionError ? 'alert' : 'status'} className={actionError ? 'error-notice' : 'notice'}>{actionError || notice}</p>}
      <div className="max-w-3xl"><div className="mb-3 flex flex-wrap items-center gap-3"><StatusBadge kind={script.format === 'video-ready-v1' ? 'green' : 'gray'}>{script.format === 'video-ready-v1' ? 'Video-ready' : 'Narration only'}</StatusBadge><span className="text-[11px] text-slate-500">{script.source}</span></div><h2 className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{script.title}</h2><p className="mt-3 text-[11px] text-slate-500">Updated {formatDate(script.generatedAt)}{script.durationSeconds ? ` · ${script.durationSeconds}s · ${script.scenes?.length || 0} scenes · Vertical 9:16` : ''}</p></div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-[#dbe5d3] bg-[#eef3e8] p-5"><p className="eyebrow text-primary">Opening hook</p><p className="mt-3 text-lg font-medium leading-8 text-[#33472f]">{script.hook}</p></section>
          <details className="panel p-5"><summary className="text-xs font-semibold">Summary & key facts</summary><p className="mt-4 text-xs leading-6 text-slate-500">{script.summary}</p><ol className="mt-4 space-y-3">{script.keyPoints.map((point, i) => <li key={i} className="flex gap-3 text-xs leading-6"><span className="text-primary">{String(i + 1).padStart(2, '0')}</span><span className="text-slate-600">{point}</span></li>)}</ol></details>
          <div className="toolbar"><div role="group" aria-label="Script display" className="flex gap-1 rounded-lg border border-border bg-white p-1">{script.scenes && <button aria-pressed={view === 'scenes'} className={`rounded-md px-3 py-1.5 text-xs ${view === 'scenes' ? 'bg-[#eaf0e4] text-primary' : 'text-slate-500'}`} onClick={() => setView('scenes')}>Scene breakdown</button>}<button aria-pressed={view === 'full' || !script.scenes} className={`rounded-md px-3 py-1.5 text-xs ${view === 'full' || !script.scenes ? 'bg-[#eaf0e4] text-primary' : 'text-slate-500'}`} onClick={() => setView('full')}>Full script</button></div><span className="text-[10px] text-slate-400">Copy includes all production instructions</span></div>
          {view === 'scenes' && script.scenes ? <div className="space-y-4">{script.scenes.map((scene, index) => { const start = elapsed; elapsed += scene.durationSeconds; return <section key={index} className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-[#fbfcf9] px-5 py-3"><h3 className="text-xs font-semibold">Scene {String(index + 1).padStart(2, '0')}</h3><span className="text-[10px] tabular-nums text-slate-500">{start}–{elapsed}s · {scene.durationSeconds}s</span></div><div className="space-y-4 p-5"><div><p className="eyebrow">Voiceover</p><p className="mt-2 text-sm leading-7 text-slate-700">{scene.narration}</p></div><div className="border-t border-border pt-4"><p className="eyebrow">Visual direction · not spoken</p><p className="mt-2 text-xs leading-6 text-slate-500">{scene.visuals}</p></div>{scene.onScreenText && <div className="rounded-md bg-[#f3f5ef] p-3"><p className="eyebrow">On-screen text</p><p className="mt-1 text-xs leading-6 text-slate-600">{scene.onScreenText}</p></div>}</div></section> })}</div> : <section className="panel p-5 sm:p-7"><h3 className="mb-5 text-xs font-semibold">Complete creation brief</h3><div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-slate-600">{script.script}</div></section>}
          {script.productionNotes && <section className="panel p-5"><h3 className="text-xs font-semibold">Production notes</h3><p className="mt-3 text-xs leading-6 text-slate-500">{script.productionNotes}</p></section>}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-6">
          <section className="panel p-5"><div className="flex items-center gap-2"><RotateCcw className="size-3.5 text-primary" /><h3 className="text-sm font-semibold">Revise script</h3></div><p className="mt-2 text-xs leading-6 text-slate-500">Tell the model what to improve, or leave blank for a fresh alternative.</p><label htmlFor="revision-feedback" className="mt-4 block text-[11px] font-medium">Feedback <span className="font-normal text-slate-400">(optional)</span></label><textarea id="revision-feedback" disabled={busy} maxLength={2000} rows={5} className={`${inputClass} mt-2 resize-y text-xs leading-6`} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="A stronger hook, simpler language, more specific visuals…" /><div className="mt-2 flex flex-wrap gap-1.5">{['Stronger hook', 'Simpler language', 'Clearer visuals'].map(f => <button key={f} disabled={busy} className="rounded-md border border-border px-2 py-1 text-[10px] text-slate-500 hover:bg-[#f2f5ee] disabled:opacity-50" onClick={() => setFeedback(previous => `${previous}${previous ? '\n' : ''}${f}.`.slice(0, 2000))}>{f}</button>)}</div><p className="mt-2 text-right text-[10px] text-slate-400">{feedback.length}/2000</p><button disabled={busy} className={`${buttonClass} mt-4 w-full`} onClick={() => void regenerate()}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}{busy ? 'Rewriting…' : script.format === 'video-ready-v1' ? 'Regenerate script' : 'Convert to video-ready'}</button>{busy && <Link href="/" className="mt-3 block text-center text-[11px] text-primary underline">Follow job progress →</Link>}<p className="mt-3 text-[10px] leading-5 text-slate-500">A successful revision replaces this version. Failed attempts keep your current script. Paid models may incur charges.</p></section>
          <section className="panel p-5"><h3 className="text-xs font-semibold">Source article</h3><p className="mt-2 text-xs text-slate-500">{script.source}</p><Link className="text-link mt-4 text-xs" href={`/articles/${script.articleId}`}><FileText className="size-3.5" />Review original facts<ArrowUpRight className="size-3" /></Link></section>
          <p className="px-1 text-[10px] leading-5 text-slate-500">Review claims before publishing. The full brief is intended for prompt or storyboard inputs. Narration-only inputs should use only the voiceover text.</p>
        </aside>
      </div>
    </div>
  </DashboardShell>
}
