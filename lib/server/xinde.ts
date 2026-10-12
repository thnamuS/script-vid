import { validateUrl, publisherLog, type PublisherPage } from './publisher-http'

export function isXindeListing(value: string) {
  const url = validateUrl(value)
  return url.hostname === 'www.xindemarinenews.com' && ['/news-list', '/latest-news'].includes(url.pathname)
}
// Public endpoint used by /pages/news-list/js/news-list.js and
// /pages/latest-news/js/latest-news.js. No tokens, credentials or private APIs.
// Use it only for discovery; never ingest content exposed for paid rows.
export async function discoverXinde(sourceUrl: string, known: Set<string>, limit: number, fetchPage: (url: string) => Promise<PublisherPage>, errors: string[]) {
  const source = validateUrl(sourceUrl)
  const links = new Set<string>()
  const seen = new Set<string>()
  const pageSize = 10
  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const api = new URL('/portal/news/list', source)
    api.searchParams.set('pageNum', String(pageNum))
    api.searchParams.set('pageSize', String(pageSize))
    for (const key of ['tags', 'categoryCode', 'categoryId']) {
      const value = source.searchParams.get(key)
      if (value) api.searchParams.set(key, value)
    }
    if (pageNum > 1) await new Promise(resolve => setTimeout(resolve, 1000))
    const page = await fetchPage(api.href) // Includes robots check for /portal/.
    const data = JSON.parse(page.text)
    if (data.code !== 200 || !Array.isArray(data.rows)) throw Error(`Xinde public API returned an invalid/error response (code ${data.code})`)
    if (!data.rows.length) break
    let unseen = 0
    for (const row of data.rows) {
      if (typeof row.id !== 'string' || !/^\d+$/.test(row.id)) throw Error('Xinde API returned an invalid article ID')
      if (seen.has(row.id)) continue
      seen.add(row.id); unseen++
      const url = row.targetType === '1' && row.targetUrl ? validateUrl(new URL(row.targetUrl, source).href).href : new URL(`/news/${row.id}`, source).href
      if (!['N', false, 0, '0'].includes(row.isPaid)) {
        errors.push(`${url}: Publisher marks article as paid or access status is unknown; skipped`)
        continue
      }
      links.add(url)
    }
    const newLinks = [...links].filter(url => !known.has(url)).length
    publisherLog('xinde_discovery', { sourceUrl, api: api.href, pageNum, rows: data.rows.length, newLinks })
    if (newLinks >= limit || !unseen || data.rows.length < pageSize || (Number.isFinite(data.total) && pageNum * pageSize >= data.total)) break
  }
  return [...links]
}
