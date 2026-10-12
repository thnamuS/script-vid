export type ScriptProvider = { id: string; label: string; kind: 'script'; model: string; free: boolean; configured: boolean }

const BACKEND = process.env.NEXT_PUBLIC_BACKEND || ''

export async function newsRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BACKEND}/api/${path}`, {
    method, cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object' && 'error' in detail) return String(detail.error)
  } catch {
    // Fall through to a generic message.
  }
  return `Request failed (${response.status})`
}
