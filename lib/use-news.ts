'use client'
import { useCallback, useEffect, useState } from 'react'
import { newsRequest } from './api'
export function useNews<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try { setData(await newsRequest<T>(path)); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load data') }
    finally { setLoading(false) }
  }, [path])
  useEffect(() => { void reload() }, [reload])
  return { data, setData, error, loading, reload }
}
