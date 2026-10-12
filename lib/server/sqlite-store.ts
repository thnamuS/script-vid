import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Source, Article, Script } from '@/lib/mock-data'

export type NewsSource = Source & { kind: 'website' | 'transcript'; lastError: string | null }
const defaults = [
  ['Drewry', 'https://www.drewry.co.uk/'],
  ['Maritime Analytica', ''],
  ["Lloyd’s List Maritime", 'https://www.lloydslist.com/'],
  ['Shipping & Freight Resource', 'https://www.shippingandfreightresource.com/'],
  ['Marine Insight', 'https://www.marineinsight.com/'],
  ['Expeditors articles and podcasts', 'https://info.expeditors.com/'],
  ['Jiss Mathew videos', ''],
  ['India Shipping News', 'https://indiashippingnews.com/'],
]
let db: DatabaseSync
export function database() {
  if (db) return db
  const path = resolve(/* turbopackIgnore: true */ process.env.NEWS_DATABASE_PATH || './data/news.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scripts (id TEXT PRIMARY KEY, article_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY);`)
  if (!db.prepare("SELECT key FROM metadata WHERE key='seeded'").get()) {
    db.exec('BEGIN')
    try {
      for (const [name, url] of defaults) {
        saveSource({ id: randomUUID(), name, url, active: !!url, kind: name.includes('videos') ? 'transcript' : 'website', lastCheckedAt: 'Not checked yet', articleCount: 0, lastError: url ? null : 'Confirm this source’s exact public URL before enabling.' })
      }
      db.prepare("INSERT INTO metadata VALUES ('seeded')").run()
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  return db
}
function list<T>(table: 'sources' | 'articles' | 'scripts'): T[] {
  return database().prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all().map(row => JSON.parse(String(row.data)))
}
export const allSources = () => list<NewsSource>('sources')
export const allArticles = () => list<Article>('articles')
export const allScripts = () => list<Script>('scripts')
export function saveSource(source: NewsSource) {
  database().prepare('INSERT INTO sources VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(source.id, JSON.stringify(source))
  return source
}
export function removeSource(id: string) { database().prepare('DELETE FROM sources WHERE id=?').run(id) }
export function saveArticle(article: Article) {
  database().prepare('INSERT INTO articles VALUES (?, ?, ?) ON CONFLICT(url) DO NOTHING').run(article.id, article.url, JSON.stringify(article))
  return allArticles().find(a => a.url === article.url)!
}
export function saveScript(script: Script) {
  const store = database()
  store.exec('BEGIN IMMEDIATE')
  try {
    store.prepare('INSERT INTO scripts VALUES (?, ?, ?) ON CONFLICT(article_id) DO UPDATE SET data=excluded.data, id=excluded.id').run(script.id, script.articleId, JSON.stringify(script))
    const article = allArticles().find(a => a.id === script.articleId)!
    store.prepare('UPDATE articles SET data=? WHERE id=?').run(JSON.stringify({ ...article, status: 'processed' }), article.id)
    store.exec('COMMIT')
  } catch (error) { store.exec('ROLLBACK'); throw error }
  return script
}
