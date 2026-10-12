export type JobKind = 'pipeline' | 'scrape' | 'generate' | 'regenerate'
export type JobProgress = {
  stage: 'starting' | 'scraping' | 'generating' | 'finished'
  currentItem: string | null
  completed: number
  total: number
  articlesSaved: number
  scriptsGenerated: number
  issues: string[]
}
export type NewsJob = JobProgress & {
  id: string
  kind: JobKind
  status: 'running' | 'completed' | 'completed_with_issues' | 'failed' | 'interrupted'
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  error: string | null
}
export type ReportProgress = (progress: Partial<JobProgress>) => void
