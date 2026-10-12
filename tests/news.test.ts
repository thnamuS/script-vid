import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { allSources, allArticles, allScripts, database, saveArticle, saveSource } from '../lib/server/sqlite-store'
import { extractArticle, isPublicAddress, validateUrl, publicFetch, scanSources } from '../lib/server/scraper'
import { openRouterModel, isFreeModel, generateScript } from '../lib/server/openrouter'
import { validateVideoBrief, formatVideoScript } from '../lib/server/script-format'

function videoBrief() {
  return { hook: 'Shipping update', summary: 'Demand is changing.', keyPoints: ['Demand', 'Ports', 'Capacity'], productionNotes: 'Neutral voiceover. Documentary style. Caption safe margins.', scenes: Array.from({ length: 6 }, () => ({ durationSeconds: 10, narration: 'According to the publisher, shipping demand is changing.', visuals: 'Illustrative generic container-port B-roll; slow camera pan, daylight; not actual event footage.', onScreenText: 'Illustrative footage' })) }
}
import { GET, POST, PATCH, DELETE } from '../app/api/[...path]/route'
import { recentJobs, trackJob } from '../lib/server/jobs'

const dir = mkdtempSync(join(tmpdir(), 'shipping-news-'))
process.env.NEWS_STORAGE = 'sqlite'
process.env.NEWS_DATABASE_PATH = join(dir, 'test.sqlite')
const originalFetch = globalThis.fetch
const key = process.env.OPENROUTER_API_KEY
const model = process.env.OPENROUTER_MODEL
const token = process.env.NEWS_API_TOKEN
delete process.env.NEWS_API_TOKEN
delete process.env.OPENROUTER_MODEL

test.after(() => {
  globalThis.fetch = originalFetch
  if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key
  if (model === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = model
  if (token === undefined) delete process.env.NEWS_API_TOKEN; else process.env.NEWS_API_TOKEN = token
  database().close()
  rmSync(dir, { recursive: true, force: true })
})
function request(method: string, path: string, data?: unknown) {
  const handler = { GET, POST, PATCH, DELETE }[method as 'GET' | 'POST' | 'PATCH' | 'DELETE']
  return handler(new NextRequest(`http://localhost:3000/api/${path}`, { method, ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }) }), { params: Promise.resolve({ path: path.split('/') }) })
}

test('public networking rejects private, reserved, mapped, and non-HTTP URLs', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '100.64.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
  for (const url of ['file:///etc/passwd', 'https://user:pass@example.com', 'http://example.com:8000']) assert.throws(() => validateUrl(url))
  await assert.rejects(publicFetch('http://127.0.0.1/'), /Private or reserved/)
})

test('extracts article text and excludes navigation, scripts, and ads', () => {
  const paragraph = 'Container shipping demand rose during the quarter, according to the publisher, while port congestion continued to affect delivery schedules. '
  const result = extractArticle(`<html><head><meta property="og:title" content="Maritime update"><meta property="article:published_time" content="2026-10-01T12:00:00Z"></head><body><nav><p>Unrelated menu</p></nav><article><h1>Maritime update</h1><p>${paragraph.repeat(4)}</p><script>malicious instruction</script></article></body></html>`, 'https://example.com/news')
  assert.equal(result.title, 'Maritime update')
  assert.equal(result.publishedAt, '2026-10-01T12:00:00.000Z')
  assert.ok(!result.content.includes('Unrelated menu'))
  assert.ok(!result.content.includes('malicious instruction'))
  assert.throws(() => extractArticle('<h1>Short preview</h1><p>Subscribe</p>', 'https://example.com'), /No substantive/)
  assert.throws(() => extractArticle('<script>{"isAccessibleForFree":false}</script>', 'https://example.com'), /paywalled/)
})

test('sources are seeded once, uncertain URLs are disabled, and articles deduplicate', () => {
  assert.equal(allSources().length, 8)
  assert.equal(allSources().filter(s => !s.url && !s.active).length, 2)
  const source = allSources().find(s => s.url)!
  const article = { id: 'test-article', sourceId: source.id, title: 'Shipping update', source: source.name, url: 'https://example.com/news', publishedAt: 'Unknown', status: 'new' as const, content: 'Public article content '.repeat(40), createdAt: new Date().toISOString() }
  saveArticle(article)
  saveArticle({ ...article, id: 'duplicate' })
  assert.equal(allArticles().length, 1)
  assert.equal(allSources().length, 8)
})

test('free and paid model configuration, provider failures, JSON validation, and persistent generation', async () => {
  assert.equal(openRouterModel(), 'openrouter/free')
  assert.equal(isFreeModel(openRouterModel()), true)
  process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b'
  assert.equal(openRouterModel(), 'openai/gpt-oss-20b')
  assert.equal(isFreeModel(openRouterModel()), false)
  process.env.OPENROUTER_MODEL = 'not a model id'
  assert.throws(openRouterModel, /exact OpenRouter model ID/)
  process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b'
  process.env.OPENROUTER_API_KEY = 'test-key'
  const article = allArticles()[0]
  globalThis.fetch = async () => new Response('{}', { status: 429 })
  await assert.rejects(generateScript(article), /rate limit/)
  globalThis.fetch = async () => Response.json({ error: { message: 'Insufficient credits' } }, { status: 402 })
  await assert.rejects(generateScript(article), /credits.*spending limit/)
  globalThis.fetch = async () => Response.json({ error: { message: 'No endpoints found' } }, { status: 404 })
  await assert.rejects(generateScript(article), /openai\/gpt-oss-20b.*not found/)
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'invalid' } }] })
  await assert.rejects(generateScript(article), /invalid JSON/)
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls++
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, 'openai/gpt-oss-20b')
    assert.ok(body.messages[0].content.includes('VOICEOVER') || body.messages[0].content.includes('Narration and visuals'))
    const brief = videoBrief()
    if (calls === 2) {
      const input = JSON.parse(body.messages[1].content)
      assert.equal(input.revisionFeedback, 'Make the hook stronger and simplify the language.')
      assert.ok(input.previousDraft.includes('VIDEO CREATION BRIEF'))
      assert.ok(body.messages[0].content.includes('Feedback and the previous draft are not evidence'))
      brief.hook = 'A new angle on shipping demand'
      brief.scenes[0].narration = 'Here is the shipping demand update, according to the publisher.'
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(brief) } }] })
  }
  const script = await generateScript(article)
  assert.equal(script.articleId, article.id)
  assert.equal(script.format, 'video-ready-v1')
  assert.equal(script.durationSeconds, 60)
  assert.ok(script.script.includes('SCENE 6 | 0:50–1:00'))
  assert.ok(script.script.includes('VISUALS (not spoken):'))
  assert.ok(script.script.includes(article.url))
  assert.equal(allArticles()[0].status, 'processed')
  assert.equal(allScripts().length, 1)
  assert.equal((await generateScript(article)).id, script.id)
  assert.equal(calls, 1)
  const regenerated = await generateScript(article, true, 'Make the hook stronger and simplify the language.')
  assert.equal(regenerated.id, script.id)
  assert.notEqual(regenerated.script, script.script)
  assert.equal(allScripts().length, 1)
  assert.equal(calls, 2)
  globalThis.fetch = async () => Response.json({ error: { message: 'Rate limited' } }, { status: 429 })
  await assert.rejects(generateScript(article, true, 'Try again'), /rate limit/)
  assert.equal(allScripts()[0].script, regenerated.script)
  await assert.rejects(generateScript(article, true, 'x'.repeat(2001)), /2000 characters/)
  await assert.rejects(generateScript(article, false, 'Change it'), /requires regenerate/)
  delete process.env.OPENROUTER_MODEL
})

test('video brief validates scene shape and total timing', () => {
  assert.throws(() => validateVideoBrief({ ...videoBrief(), scenes: [] }), /complete scene-by-scene/)
  assert.throws(() => validateVideoBrief({ ...videoBrief(), scenes: videoBrief().scenes.map(s => ({ ...s, durationSeconds: 5 })) }), /60–90/)
  assert.throws(() => validateVideoBrief({ ...videoBrief(), scenes: videoBrief().scenes.map(s => ({ ...s, visuals: '' })) }), /complete scene-by-scene/)
  const script = formatVideoScript(allArticles()[0], validateVideoBrief(videoBrief()))
  assert.ok(script.includes('Use narration only from VOICEOVER sections'))
  assert.ok(script.includes('Source:'))
})

test('API persists source CRUD, validates input, and serves generated content', async () => {
  assert.equal((await request('GET', 'articles')).status, 200)
  const created = await (await request('POST', 'sources', { name: 'Test source', url: 'https://example.com/feed' })).json()
  assert.ok(created.id)
  await request('PATCH', `sources/${created.id}`, { active: false })
  assert.equal(allSources().find(s => s.id === created.id)?.active, false)
  assert.equal((await request('POST', 'sources', { name: 'Bad', url: 'file:///tmp' })).status, 400)
  assert.equal((await request('GET', 'articles/missing')).status, 404)
  assert.equal((await request('GET', `scripts/${allScripts()[0].id}`)).status, 200)
  assert.equal((await request('POST', `articles/${allArticles()[0].id}/generate`, { regenerate: true, feedback: 123 })).status, 400)
  await request('DELETE', `sources/${created.id}`)
  assert.equal(allSources().some(s => s.id === created.id), false)
})

test('stars persist, synchronize article/script views, and survive generation and regeneration', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify(videoBrief()) } }] })
  try {
    const source = allSources()[0]
    saveArticle({ id: 'star-article', sourceId: source.id, title: 'Important shipping news', source: source.name, url: 'https://example.com/star-article', publishedAt: 'Unknown', status: 'new', content: 'Public article facts '.repeat(40), createdAt: new Date().toISOString() })
    assert.equal((await request('PATCH', 'articles/star-article', { starred: true })).status, 200)
    const generated = await (await request('POST', 'articles/star-article/generate', {})).json()
    assert.equal(generated.starred, true)
    assert.equal((await (await request('GET', `scripts/${generated.id}`)).json()).starred, true)
    const revised = await (await request('POST', 'articles/star-article/generate', { regenerate: true })).json()
    assert.equal(revised.starred, true)
    assert.equal((await request('PATCH', `scripts/${generated.id}`, { starred: false })).status, 200)
    assert.equal((await (await request('GET', 'articles/star-article')).json()).starred, false)
    assert.equal((await (await request('GET', `scripts/${generated.id}`)).json()).starred, false)
    await request('PATCH', `scripts/${generated.id}`, { starred: true })
    assert.equal((await (await request('GET', 'articles/star-article')).json()).starred, true)
    assert.equal((await request('PATCH', `scripts/${generated.id}`, { starred: 'yes' })).status, 400)
    assert.equal((await request('PATCH', 'articles/star-article', { starred: true, title: 'Overwrite' })).status, 400)
    assert.equal((await request('PATCH', 'scripts/missing', { starred: true })).status, 404)
    assert.equal((await request('PATCH', 'articles/missing', { starred: true })).status, 404)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('pipeline handles no active sources without network work', async () => {
  for (const source of allSources()) saveSource({ ...source, active: false })
  const response = await request('POST', 'pipeline', {})
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { scans: [], generated: [], errors: [], remaining: 0 })
})

test('pipeline skips older pending and failed articles, leaving manual generation available', async () => {
  const sources = allSources()
  const previousFetch = globalThis.fetch
  let calls = 0
  for (let i = 0; i < 8; i++) {
    const source = sources[i === 7 ? 1 : 0]
    saveArticle({ id: `backlog-${i}`, sourceId: source.id, title: `Backlog ${i}`, source: source.name, url: `https://example.com/backlog/${i}`, publishedAt: 'Unknown', status: 'new', content: 'Public article content '.repeat(40), createdAt: new Date().toISOString() })
  }
  globalThis.fetch = async () => {
    calls++
    return Response.json({ error: { message: 'Rate limited' } }, { status: 429 })
  }
  try {
    await assert.rejects(generateScript(allArticles().find(a => a.id === 'backlog-3')!), /rate limit/)
    calls = 0
    const response = await request('POST', 'pipeline', {})
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { scans: [], generated: [], errors: [], remaining: 8 })
    const scoped = await (await request('POST', 'pipeline', { sourceId: sources[1].id })).json()
    assert.equal(scoped.generated.length, 0)
    assert.equal(scoped.remaining, 1)
    assert.equal(calls, 0)
    assert.equal(allArticles().find(a => a.id === 'backlog-3')?.status, 'new')

    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify(videoBrief()) } }] })
    assert.equal((await request('POST', 'articles/backlog-3/generate', {})).status, 200)
    assert.equal(allArticles().find(a => a.id === 'backlog-3')?.status, 'processed')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('scan returns IDs only for newly saved articles, excluding old URLs and redirect duplicates', async () => {
  const source = { ...allSources()[0], active: true, url: 'https://example.com/scan-home' }
  const previousLimit = process.env.NEWS_SCAN_LIMIT
  process.env.NEWS_SCAN_LIMIT = '10'
  saveSource(source)
  const oldUrl = 'https://example.com/backlog/0'
  const freshUrls = Array.from({ length: 7 }, (_, i) => `https://example.com/fresh/${i}`)
  const redirectUrl = 'https://example.com/redirect-old'
  const fetchPage = async (url: string) => ({
    url: url === redirectUrl ? oldUrl : url,
    type: 'text/html',
    text: url === source.url
      ? [...freshUrls, oldUrl, redirectUrl].map(link => `<a href="${link}">Read this detailed maritime shipping update</a>`).join('')
      : `<article><h1>New shipping update</h1><p>${'Public shipping news with port and container demand facts. '.repeat(20)}</p></article>`,
  })
  try {
    const scans = await scanSources(source.id, () => {}, fetchPage)
    assert.equal(scans[0].added, 7)
    assert.equal(scans[0].articleIds.length, 7)
    assert.equal(new Set(scans[0].articleIds).size, 7)
    assert.ok(!scans[0].articleIds.includes('backlog-0'))
    const newIds = new Set(scans.flatMap(scan => scan.articleIds))
    const selected = allArticles().filter(article => article.status !== 'processed' && newIds.has(article.id))
    assert.equal(selected.length, 7)
    assert.deepEqual(new Set(selected.map(article => article.url)), new Set(freshUrls))
  } finally {
    saveSource({ ...source, active: false })
    if (previousLimit === undefined) delete process.env.NEWS_SCAN_LIMIT; else process.env.NEWS_SCAN_LIMIT = previousLimit
  }
})

test('three Xinde source records retain mappings, ingest public articles and deduplicate repeat scans', async () => {
  const base = allSources()[0]
  const previousLimit = process.env.NEWS_SCAN_LIMIT
  process.env.NEWS_SCAN_LIMIT = '1'
  const sources = [
    { ...base, id: 'xinde-global', name: 'Xinde Global News', url: 'https://www.xindemarinenews.com/news-list?tags=Global%20News', active: true, category: 'Global News' },
    { ...base, id: 'xinde-breaking', name: 'Xinde Breaking News', url: 'https://www.xindemarinenews.com/news-list?tags=Breaking%20News', active: true, category: 'Breaking News' },
    { ...base, id: 'xinde-latest', name: 'Xinde Latest News', url: 'https://www.xindemarinenews.com/latest-news', active: true, category: 'Latest News' },
  ]
  sources.forEach(saveSource)
  const fetchPage = async (url: string) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/portal/news/list') {
      const tag = parsed.searchParams.get('tags')
      const id = tag === 'Global News' ? '9001' : tag === 'Breaking News' ? '9002' : '9003'
      return { url, type: 'application/json', text: JSON.stringify({ code: 200, total: 2, rows: [{ id, isPaid: 'N' }, { id, isPaid: 'N' }] }) }
    }
    return { url, type: 'text/html', text: /^\/news\/\d+$/.test(parsed.pathname)
      ? `<h1>Wrong section title</h1><h1 class="news-detail-title">Xinde public update</h1><time datetime="2026-10-10"></time><div class="news-detail-body"><p>${'Public shipping news and container market facts. '.repeat(15)}</p></div><aside><p>${'Unrelated recommended news. '.repeat(20)}</p></aside>`
      : '<div id="newsListGrid"></div>' }
  }
  try {
    for (const source of sources) {
      const result = (await scanSources(source.id, () => {}, fetchPage))[0]
      assert.equal(result.added, 1)
      assert.deepEqual(result.errors, [])
      const saved = allArticles().find(article => article.id === result.articleIds[0])!
      assert.equal(saved.sourceId, source.id)
      assert.equal(saved.title, 'Xinde public update')
      assert.ok(!saved.content.includes('Unrelated'))
      assert.equal((await scanSources(source.id, () => {}, fetchPage))[0].added, 0)
      const retained = allSources().find(item => item.id === source.id)! as typeof source
      assert.equal(retained.category, source.category)
      assert.equal(retained.url, source.url)
      assert.equal(retained.name, source.name)
    }
    const failure = (await scanSources(sources[0].id, () => {}, async () => { throw Error('Unable to verify publisher robots.txt: DNS failure (ENOTFOUND); scan skipped') }))[0]
    assert.equal(failure.added, 0)
    assert.match(failure.errors[0], /DNS failure.*ENOTFOUND/)
    assert.match(allSources().find(item => item.id === sources[0].id)!.lastError!, /ENOTFOUND/)
  } finally {
    for (const source of sources) database().prepare('DELETE FROM sources WHERE id=?').run(source.id)
    if (previousLimit === undefined) delete process.env.NEWS_SCAN_LIMIT; else process.env.NEWS_SCAN_LIMIT = previousLimit
  }
})

test('jobs expose live progress, retain completion/errors, and detect interrupted jobs', async () => {
  let finish!: () => void
  const wait = new Promise<void>(resolve => { finish = resolve })
  const task = trackJob('regenerate', async report => {
    report({ stage: 'generating', currentItem: 'Shipping update', completed: 0, total: 1 })
    await wait
    report({ completed: 1, scriptsGenerated: 1 })
    return 'saved'
  })
  await new Promise(resolve => setImmediate(resolve))
  const running = (await recentJobs()).find(job => job.status === 'running')!
  assert.ok(running)
  assert.equal(running.currentItem, 'Shipping update')
  assert.equal(running.completed, 0)
  const response = await request('GET', `jobs/${running.id}`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'running')
  finish()
  assert.equal(await task, 'saved')
  const done = (await recentJobs()).find(job => job.id === running.id)!
  assert.equal(done.status, 'completed')
  assert.equal(done.scriptsGenerated, 1)
  assert.ok(done.finishedAt)
  await assert.rejects(trackJob('scrape', async report => {
    report({ stage: 'scraping', currentItem: 'Unavailable publisher', completed: 0, total: 1 })
    throw Error('Publisher failed')
  }), /Publisher failed/)
  assert.ok((await recentJobs()).some(job => job.status === 'failed' && job.error === 'Publisher failed'))
  await trackJob('pipeline', async report => { report({ issues: ['Publisher blocked scraping'] }); return null })
  assert.ok((await recentJobs()).some(job => job.status === 'completed_with_issues'))
  database().prepare('INSERT INTO jobs VALUES (?, ?)').run('interrupted-test', JSON.stringify({ ...running, id: 'interrupted-test', ownerPid: -1 }))
  assert.equal((await recentJobs()).find(job => job.id === 'interrupted-test')?.status, 'interrupted')
  assert.equal((await request('GET', 'jobs/missing')).status, 404)
})

test('optional API token rejects unauthenticated requests', async () => {
  process.env.NEWS_API_TOKEN = 'private-test-token'
  assert.equal((await request('GET', 'sources')).status, 401)
  delete process.env.NEWS_API_TOKEN
})
