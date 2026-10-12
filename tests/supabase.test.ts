import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { allArticles, allSources, saveSource, saveScript, storageContext, NewsDatabaseError, setScriptStarred } from '../lib/server/store'
import { localStorageMode } from '../lib/supabase/config'
import type { NewsSource } from '../lib/server/store'
import type { Script } from '../lib/mock-data'

// Adapter tests use a mocked transport; live database/RLS checks require the migration.
test('Supabase storage refuses requests without an authenticated context', async () => {
  delete process.env.NEWS_STORAGE
  await assert.rejects(allArticles(), /Authenticated database context/)
})

test('Supabase requests are user-scoped and script saving uses the transactional RPC', async () => {
  const calls: { path: string; search: string; body: any }[] = []
  const client = createClient('https://example.supabase.co', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      calls.push({ path: url.pathname, search: url.search, body: init?.body ? JSON.parse(String(init.body)) : null })
      return url.pathname.includes('/rpc/') || init?.method === 'POST'
        ? new Response(null, { status: 204 })
        : Response.json([{ data: { id: 'article-a' } }])
    } },
  })
  const source: NewsSource = { id: 'source-a', name: 'Test', url: 'https://example.com', active: true, kind: 'website', lastError: null, lastCheckedAt: 'Not checked yet', articleCount: 0 }
  await storageContext.run({ client, userId: 'user-a' }, async () => {
    assert.equal((await allArticles())[0].id, 'article-a')
    await allSources()
    await saveSource(source)
    await saveScript({ id: 'script-a', articleId: 'article-a' } as Script)
  })
  const reads = calls.filter(call => call.path.endsWith('/articles') || call.path.endsWith('/sources') && !call.body)
  for (const read of reads) assert.equal(new URLSearchParams(read.search).get('user_id'), 'eq.user-a')
  assert.ok(calls.some(call => call.path.endsWith('/rpc/seed_news_sources')))
  assert.equal(calls.find(call => call.path.endsWith('/sources') && call.body)?.body.user_id, 'user-a')
  assert.deepEqual(calls.find(call => call.path.endsWith('/rpc/save_news_script'))?.body, { script_data: { id: 'script-a', articleId: 'article-a' } })
  assert.equal(storageContext.getStore(), undefined)
})

test('Supabase script stars update the user-scoped article with compare-and-swap', async () => {
  let article = { id: 'article-a', status: 'processed', starred: false }
  const calls: { path: string; search: string; method: string }[] = []
  const client = createClient('https://example.supabase.co', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      const method = init?.method || 'GET'
      calls.push({ path: url.pathname, search: url.search, method })
      if (method === 'PATCH') {
        assert.equal(url.pathname, '/rest/v1/articles')
        assert.equal(url.searchParams.get('data'), `eq.${JSON.stringify(article)}`)
        article = JSON.parse(String(init?.body)).data
        return Response.json({ data: article })
      }
      return Response.json([{ data: url.pathname.endsWith('/scripts') ? { id: 'script-a', articleId: 'article-a' } : article }])
    } },
  })
  await storageContext.run({ client, userId: 'user-a' }, async () => {
    assert.equal((await setScriptStarred('script-a', true))?.starred, true)
    assert.equal((await allArticles())[0].starred, true)
    assert.equal(article.status, 'processed')
  })
  for (const call of calls) assert.equal(new URLSearchParams(call.search).get('user_id'), 'eq.user-a')
  assert.equal(calls.filter(call => call.method === 'PATCH').length, 1)
})

test('missing Supabase functions return an actionable setup error', async () => {
  const client = createClient('https://example.supabase.co', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json({ code: 'PGRST202', message: 'Function missing', details: null, hint: null }, { status: 404 }) },
  })
  await storageContext.run({ client, userId: 'user-a' }, async () => {
    await assert.rejects(allSources(), (error: unknown) => {
      assert.ok(error instanceof NewsDatabaseError)
      assert.equal(error.status, 503)
      assert.equal(error.code, 'DATABASE_SETUP_REQUIRED')
      assert.match(error.message, /setup SQL provided in chat/)
      return true
    })
  })
})

test('SQLite opt-out cannot bypass authentication in production', () => {
  const originalMode = process.env.NEWS_STORAGE
  const originalEnv = process.env.NODE_ENV
  try {
    process.env.NEWS_STORAGE = 'sqlite'
    Object.assign(process.env, { NODE_ENV: 'production' })
    assert.equal(localStorageMode(), false)
  } finally {
    if (originalMode === undefined) delete process.env.NEWS_STORAGE; else process.env.NEWS_STORAGE = originalMode
    if (originalEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: originalEnv })
  }
})
