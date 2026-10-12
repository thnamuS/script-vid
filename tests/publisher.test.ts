import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { ACCEPT, createPublicFetcher, PublisherError, networkError, type HttpDependencies } from '../lib/server/publisher-http'
import { createRobotsChecker } from '../lib/server/publisher-robots'
import { discoverXinde } from '../lib/server/xinde'

const page = (text: string, type = 'text/plain', url = 'https://example.com/robots.txt') => ({ text, type, url })
function transport(replies: Array<{ status?: number; location?: string; text?: string; error?: string; hang?: boolean }>) {
  let calls = 0
  const request = ((_url: URL, options: any, callback: Function) => {
    assert.ok(options.headers.Accept.includes('text/plain'))
    const reply = replies[Math.min(calls++, replies.length - 1)]
    const req = new EventEmitter() as any
    req.destroy = (error: Error) => { req.emit('error', error); req.emit('close') }
    req.end = () => queueMicrotask(() => {
      if (reply.hang) return
      if (reply.error) { req.destroy(Object.assign(Error(reply.error), { code: reply.error })); return }
      const response = new EventEmitter() as any
      response.statusCode = reply.status || 200
      response.headers = { 'content-type': 'text/plain', ...(reply.location ? { location: reply.location } : {}) }
      response.resume = () => req.emit('close')
      callback(response)
      response.emit('data', Buffer.from(reply.text || 'User-agent: *\nDisallow:'))
      response.emit('end')
      req.emit('close')
    })
    return req
  }) as HttpDependencies['request']
  return { request, calls: () => calls }
}
const lookup = (async () => [{ address: '8.8.8.8', family: 4 }]) as HttpDependencies['lookup']

test('HTTP Accept accepts plain robots, retries temporary statuses and records typed failures', async () => {
  assert.ok(ACCEPT.includes('text/plain'))
  const mock = transport([{ status: 503 }, { status: 429 }, { status: 200 }])
  await createPublicFetcher({ lookup, request: mock.request, sleep: async () => {} })('https://example.com/robots.txt')
  assert.equal(mock.calls(), 3)
  for (const status of [404,410,403,406]) {
    const mock = transport([{ status }])
    await assert.rejects(createPublicFetcher({ lookup, request: mock.request })('https://example.com/robots.txt'), error => error instanceof PublisherError && error.status === status)
    assert.equal(mock.calls(), 1)
  }
  assert.match(networkError(Object.assign(Error('certificate expired'), { code: 'CERT_HAS_EXPIRED' })).message, /SSL failure/)
})

test('standard redirects support five hops across hosts and check redirected pages', async () => {
  const mock = transport([301,302,303,307,308].map((status, n) => ({ status, location: `https://other.example/step${n}` })).concat([{ status: 200, location: '' }]))
  const checked: string[] = []
  await createPublicFetcher({ lookup, request: mock.request })('https://example.com/robots.txt', 0, async url => { checked.push(url) })
  assert.equal(mock.calls(), 6)
  assert.equal(checked.length, 5)
  const loop = transport([{ status: 302, location: '/loop' }])
  await assert.rejects(createPublicFetcher({ lookup, request: loop.request })('https://example.com/robots.txt'), /five redirects/)
  assert.equal(loop.calls(), 6)
  const blocked = transport([{ status: 302, location: '/blocked' }])
  await assert.rejects(createPublicFetcher({ lookup, request: blocked.request })('https://example.com/', 0, async () => { throw Error('robots disallows redirect') }), /disallows redirect/)
  assert.equal(blocked.calls(), 1)
})

test('DNS, SSL, timeouts and unsafe redirected destinations never imply permission', async () => {
  const dns = (async () => { throw Object.assign(Error('not found'), { code: 'ENOTFOUND' }) }) as HttpDependencies['lookup']
  await assert.rejects(createPublicFetcher({ lookup: dns })('https://example.com/'), /DNS failure.*ENOTFOUND/)
  const tls = transport([{ error: 'CERT_HAS_EXPIRED' }])
  await assert.rejects(createPublicFetcher({ lookup, request: tls.request })('https://example.com/'), /SSL failure/)
  assert.equal(tls.calls(), 1)
  const timeout = transport([{ hang: true }])
  await assert.rejects(createPublicFetcher({ lookup, request: timeout.request, requestTimeout: 5, sleep: async () => {} })('https://example.com/'), /timed out/)
  assert.equal(timeout.calls(), 3)
  const privateLookup = (async (host: string) => [{ address: host === 'private.example' ? '127.0.0.1' : '8.8.8.8', family: 4 }]) as HttpDependencies['lookup']
  const redirect = transport([{ status: 302, location: 'https://private.example/' }])
  await assert.rejects(createPublicFetcher({ lookup: privateLookup, request: redirect.request })('https://example.com/'), /Private or reserved/)
})

test('robots honors merged groups, specific agent, longest matches, allow ties and encoded paths', async () => {
  const check = createRobotsChecker(async () => page('User-agent: *\nDisallow: /\nUser-agent: ShippingShortsBot\nDisallow: /private\nAllow: /private/open\nDisallow: /same\nAllow: /same\nDisallow: /encoded/%7Euser\nDisallow: /reserved/%2F\nUser-agent: ShippingShortsBot\nDisallow: /*.pdf$'))
  await check('https://example.com/news')
  await check('https://example.com/private/open')
  await check('https://example.com/same')
  await check('https://example.com/reserved//')
  for (const path of ['/private/closed', '/encoded/~user', '/reserved/%2f', '/doc.pdf']) await assert.rejects(check(`https://example.com${path}`), /disallows/)
})

test('robots caches absence on confirmed 404/410 but fails closed on other statuses and invalid bodies', async () => {
  for (const status of [404,410]) {
    let calls = 0
    const check = createRobotsChecker(async () => { calls++; throw new PublisherError(`Publisher returned HTTP ${status}`, 'HTTP_STATUS', status) })
    await check('https://example.com/news'); await check('https://example.com/other')
    assert.equal(calls, 1)
  }
  for (const status of [401,403,406,429,500,503]) {
    const check = createRobotsChecker(async () => { throw new PublisherError(`Publisher returned HTTP ${status}`, 'HTTP_STATUS', status) })
    await assert.rejects(check('https://example.com/news'), new RegExp(`HTTP ${status}.*scan skipped`))
  }
  await assert.rejects(createRobotsChecker(async () => page('<html>Server error</html>', 'text/html'))('https://example.com/news'), /Invalid robots/)
})

test('robots caches original origin after redirects, coalesces requests and expires failures without stale permission', async () => {
  let time = 0, calls = 0, unreachable = false
  const check = createRobotsChecker(async () => {
    calls++
    if (unreachable) throw new PublisherError('DNS failure (ENOTFOUND)', 'ENOTFOUND')
    return page('User-agent: *\nDisallow: /blocked', 'text/plain', 'https://cdn.example/robots.txt')
  }, () => time)
  await Promise.all([check('https://example.com/news'), check('https://example.com/other')])
  assert.equal(calls, 1)
  await assert.rejects(check('https://example.com/blocked'), /disallows/)
  time += 3600001; unreachable = true
  await assert.rejects(check('https://example.com/news'), /DNS failure/)
  await assert.rejects(check('https://example.com/other'), /DNS failure/)
  assert.equal(calls, 2)
  time += 60001; unreachable = false
  await check('https://example.com/news')
  assert.equal(calls, 3)
})

test('Xinde discovery keeps category queries and paginates past known articles without paid-content ingestion', async () => {
  const known = new Set(Array.from({ length: 10 }, (_, i) => `https://www.xindemarinenews.com/news/${i}`))
  const fetched: string[] = []
  const errors: string[] = []
  const urls = await discoverXinde('https://www.xindemarinenews.com/news-list?tags=Global%20News', known, 2, async url => {
    fetched.push(url)
    const query = new URL(url).searchParams
    assert.equal(query.get('tags'), 'Global News')
    return page(JSON.stringify({ code: 200, total: 13, rows: query.get('pageNum') === '1' ? Array.from({ length: 10 }, (_, i) => ({ id: String(i), isPaid: 'N' })) : [{ id: '11', isPaid: 'Y' }, { id: '12', isPaid: 'N' }, { id: '12', isPaid: 'N' }] }), 'application/json', url)
  }, errors)
  assert.equal(fetched.length, 2)
  assert.deepEqual(urls.filter(url => !known.has(url)), ['https://www.xindemarinenews.com/news/12'])
  assert.match(errors[0], /paid/)
})
