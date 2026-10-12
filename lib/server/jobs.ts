import { randomUUID } from 'node:crypto'
import { readStoredJobs, saveStoredJob } from './store'
import { localStorageMode } from '@/lib/supabase/config'
import type { JobKind, NewsJob, ReportProgress } from '@/lib/jobs'

type StoredJob = NewsJob & { ownerPid: number }
export async function recentJobs(): Promise<NewsJob[]> {
  const jobs = await readStoredJobs<StoredJob>()
  for (const job of jobs) {
    // PIDs aren't meaningful across instances. In Supabase use a stale heartbeat.
    const interrupted = localStorageMode() ? job.ownerPid !== process.pid : Date.now() - Date.parse(job.updatedAt) > 10 * 60 * 1000
    if (job.status === 'running' && interrupted) {
      job.status = 'interrupted'
      job.error = 'Job stopped reporting progress. Review saved results before retrying.'
      job.finishedAt = job.updatedAt = new Date().toISOString()
      await saveStoredJob(job)
    }
  }
  return jobs.map(({ ownerPid: _owner, ...job }) => job).sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt.localeCompare(a.startedAt))
}
export async function trackJob<T>(kind: JobKind, task: (report: ReportProgress) => Promise<T>): Promise<T> {
  const now = new Date().toISOString()
  const job: StoredJob = { id: randomUUID(), ownerPid: process.pid, kind, status: 'running', stage: 'starting', currentItem: null, completed: 0, total: 0, articlesSaved: 0, scriptsGenerated: 0, issues: [], startedAt: now, updatedAt: now, finishedAt: null, error: null }
  await saveStoredJob(job)
  let pending = Promise.resolve()
  let persistenceError: unknown
  const report: ReportProgress = progress => {
    Object.assign(job, progress, { updatedAt: new Date().toISOString() })
    job.issues = job.issues.slice(-30).map(issue => issue.slice(0, 1000))
    const snapshot = structuredClone(job)
    // Serialize progress writes; never let an older update overwrite completion.
    pending = pending.then(() => saveStoredJob(snapshot)).catch(error => { persistenceError = error })
  }
  try {
    const result = await task(report)
    await pending
    if (persistenceError) throw persistenceError
    job.status = job.issues.length ? 'completed_with_issues' : 'completed'
    job.stage = 'finished'
    job.currentItem = null
    job.completed = job.total
    return result
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : 'Job failed'
    throw error
  } finally {
    await pending
    job.finishedAt = job.updatedAt = new Date().toISOString()
    await saveStoredJob(job)
  }
}
