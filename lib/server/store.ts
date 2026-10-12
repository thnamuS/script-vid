import { AsyncLocalStorage } from 'node:async_hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Article, Script } from '@/lib/mock-data'
import { localStorageMode } from '@/lib/supabase/config'
import * as sqlite from './sqlite-store'
export type { NewsSource } from './sqlite-store'
import type { NewsSource } from './sqlite-store'

export const storageContext = new AsyncLocalStorage<{ client: SupabaseClient; userId: string }>()
export const database = sqlite.database // Legacy backup/test tooling only.
function context() {
  const ctx = storageContext.getStore()
  if (!ctx) throw Error('Authenticated database context is required')
  return ctx
}
export class NewsDatabaseError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message)
    this.name = 'NewsDatabaseError'
  }
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return
  console.error('Supabase database request failed:', error)
  const missingSchema = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code || '')
  if (missingSchema) {
    throw new NewsDatabaseError(
      'Database setup required: run the complete setup SQL provided in chat in this project’s Supabase SQL Editor. This creates the tables and functions and refreshes the API schema cache. Your user account does not need to be recreated.',
      503,
      'DATABASE_SETUP_REQUIRED',
    )
  }
  if (error.code === '42501') {
    throw new NewsDatabaseError('Database access denied. Sign in again and verify the migration’s authenticated grants and row-level security policies.', 403, 'DATABASE_ACCESS_DENIED')
  }
  throw new NewsDatabaseError('Database request failed. Check the server logs and Supabase project status.', 500, 'DATABASE_REQUEST_FAILED')
}
async function list<T>(table: string): Promise<T[]> {
  const { client, userId } = context()
  const { data, error } = await client.from(table).select('data').eq('user_id', userId).order('created_at', { ascending: false })
  check(error)
  return (data || []).map(row => row.data as T)
}
export async function allSources(): Promise<NewsSource[]> {
  if (localStorageMode()) return sqlite.allSources()
  const { client } = context()
  const { error } = await client.rpc('seed_news_sources')
  check(error)
  return list<NewsSource>('sources')
}
export async function allArticles(): Promise<Article[]> {
  return localStorageMode() ? sqlite.allArticles() : list<Article>('articles')
}
export async function allScripts(): Promise<Script[]> {
  const [scripts, articles] = await Promise.all([
    localStorageMode() ? sqlite.allScripts() : list<Script>('scripts'),
    allArticles(),
  ])
  const stars = new Map(articles.map(article => [article.id, !!article.starred]))
  // Article is the single source of truth, so revisions cannot erase a star.
  return scripts.map(script => ({ ...script, starred: stars.get(script.articleId) ?? false }))
}
export async function saveSource(source: NewsSource) {
  if (localStorageMode()) return sqlite.saveSource(source)
  const { client, userId } = context()
  const { error } = await client.from('sources').upsert({ id: source.id, user_id: userId, data: source }, { onConflict: 'user_id,id' })
  check(error)
  return source
}
export async function removeSource(id: string) {
  if (localStorageMode()) return sqlite.removeSource(id)
  const { client, userId } = context()
  const { error } = await client.from('sources').delete().eq('user_id', userId).eq('id', id)
  check(error)
}
export async function saveArticle(article: Article) {
  if (localStorageMode()) return sqlite.saveArticle(article)
  const { client, userId } = context()
  const { error } = await client.from('articles').upsert({ id: article.id, user_id: userId, url: article.url, data: article }, { onConflict: 'user_id,url', ignoreDuplicates: true })
  check(error)
  const { data, error: readError } = await client.from('articles').select('data').eq('user_id', userId).eq('url', article.url).single()
  check(readError)
  return data!.data as Article
}
export async function saveScript(script: Script) {
  if (localStorageMode()) {
    sqlite.saveScript(script)
  } else {
    const { client } = context()
    // Update the script and article status in a single database transaction.
    const { error } = await client.rpc('save_news_script', { script_data: script })
    check(error)
  }
  const article = (await allArticles()).find(item => item.id === script.articleId)
  return { ...script, starred: !!article?.starred }
}
export async function setArticleStarred(id: string, starred: boolean): Promise<Article | null> {
  if (localStorageMode()) {
    const row = database().prepare('SELECT data FROM articles WHERE id=?').get(id)
    if (!row) return null
    const article: Article = { ...JSON.parse(String(row.data)), starred }
    database().prepare('UPDATE articles SET data=? WHERE id=?').run(JSON.stringify(article), id)
    return article
  }
  const { client, userId } = context()
  // Compare-and-swap also preserves status changes made by script generation.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readError } = await client.from('articles').select('data').eq('user_id', userId).eq('id', id).maybeSingle()
    check(readError)
    if (!row) return null
    const updated: Article = { ...row.data, starred }
    const { data, error } = await client.from('articles').update({ data: updated }).eq('user_id', userId).eq('id', id).eq('data', JSON.stringify(row.data)).select('data').maybeSingle()
    check(error)
    if (data) return data.data as Article
  }
  throw new NewsDatabaseError('The article changed while saving. Please try starring it again.', 409, 'ARTICLE_CHANGED')
}
export async function setScriptStarred(id: string, starred: boolean): Promise<Script | null> {
  const script = (await allScripts()).find(item => item.id === id)
  if (!script) return null
  const article = await setArticleStarred(script.articleId, starred)
  return article ? { ...script, starred: !!article.starred } : null
}

export async function readStoredJobs<T>(): Promise<T[]> {
  if (localStorageMode()) return database().prepare('SELECT data FROM jobs ORDER BY rowid DESC LIMIT 30').all().map(row => JSON.parse(String(row.data)))
  const { client, userId } = context()
  const { data, error } = await client.from('jobs').select('data').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
  check(error)
  return (data || []).map(row => row.data as T)
}
export async function saveStoredJob(job: { id: string }) {
  if (localStorageMode()) {
    database().prepare('INSERT INTO jobs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, JSON.stringify(job))
    return
  }
  const { client, userId } = context()
  const { error } = await client.from('jobs').upsert({ id: job.id, user_id: userId, data: job }, { onConflict: 'user_id,id' })
  check(error)
}
