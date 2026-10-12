'use client'
import { useEffect, useState } from 'react'
import { newsRequest } from './api'
import type { NewsJob } from './jobs'

export function useJobs() {
  const [jobs, setJobs] = useState<NewsJob[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await newsRequest<NewsJob[]>('jobs')
        if (!disposed) { setJobs(result); setError('') }
      } catch (error) {
        if (!disposed) setError(error instanceof Error ? error.message : 'Could not refresh job progress')
      } finally {
        if (!disposed) { setLoading(false); timer = setTimeout(poll, 2000) }
      }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [])
  return { jobs, error, loading }
}
