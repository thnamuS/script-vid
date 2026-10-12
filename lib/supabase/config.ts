export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local')
  return { url, key }
}

// SQLite is an explicit local/test option only. Public deployments always use auth.
export function localStorageMode() {
  return process.env.NEWS_STORAGE === 'sqlite' && process.env.NODE_ENV !== 'production'
}
