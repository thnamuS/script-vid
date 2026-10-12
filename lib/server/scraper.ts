import { validateUrl } from './publisher-http'
import { permittedFetch } from './publisher-robots'
import { discoverXinde, isXindeListing } from './xinde'
export { publicFetch, validateUrl, isPublicAddress } from './publisher-http'
import { load } from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import { randomUUID } from 'node:crypto'
import { allArticles, allSources, saveArticle, saveSource, type NewsSource } from './store'
import type { Article } from '@/lib/mock-data'
import type { ReportProgress } from '@/lib/jobs'

export function extractArticle(html: string, url: string) {
  const $ = load(html)
  const title = $('meta[property="og:title"]').attr('content') || $('.news-detail-title').first().text() || $('h1').first().text() || $('title').text()
  let structuredDate: string | undefined
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const data = JSON.parse($(script).text())
      const entries = Array.isArray(data) ? data : data['@graph'] || [data]
      const article = entries.find((entry: any) => ['NewsArticle', 'Article', 'BlogPosting'].includes(entry?.['@type']))
      if (typeof article?.datePublished === 'string') structuredDate = article.datePublished
    } catch { /* Ignore invalid publisher metadata, not article content. */ }
  })
  const published = $('meta[property="article:published_time"]').attr('content') || structuredDate || $('time[datetime]').first().attr('datetime')
  const paywall = /"isAccessibleForFree"\s*:\s*(?:false|"false")/.test(html)
  if (paywall) throw Error('Publisher marks this article as paywalled; access is not bypassed')
  $('script,style,nav,header,footer,aside,form,iframe,noscript,.advertisement,.ads').remove()
  const body = $('.news-detail-body').first().length ? $('.news-detail-body').first() : $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body')
  const paragraphs = body.find('p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get().filter(p => p.length > 60)
  const content = paragraphs.join('\n\n').slice(0, 40000)
  if (!title.trim() || content.length < 400) throw Error('No substantive public article text found (may require a transcript, login, or JavaScript)')
  return { title: title.trim().slice(0, 500), content, publishedAt: published && !isNaN(Date.parse(published)) ? new Date(published).toISOString() : 'Unknown', url }
}
function candidates(text: string, base: string): string[] {
  const $ = load(text)
  if (/^\s*(<\?xml|<rss|<feed)/.test(text)) {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(text)
    const entries = parsed.rss?.channel?.item || parsed.feed?.entry || []
    return (Array.isArray(entries) ? entries : [entries]).flatMap((item: any) => {
      const links = Array.isArray(item.link) ? item.link : [item.link]
      return links.map((link: any) => typeof link === 'string' ? link : link?.['@_href']).filter(Boolean)
    }).map((url: string) => new URL(url, base).href)
  }
  return $('a[href]').map((_, a) => {
    const href = $(a).attr('href')!
    try {
      const url = validateUrl(new URL(href, base).href)
      if (new URL(base).hostname === 'www.xindemarinenews.com' && !/^\/news\/\d+$/.test(url.pathname)) return ''
      if (url.hostname !== new URL(base).hostname || url.pathname === '/' || /\/(tag|category|author|login|contact|about|privacy|subscribe|wp-json)(\/|$)/i.test(url.pathname) || /\.(pdf|jpg|png|mp4|mp3)$/i.test(url.pathname)) return ''
      return $(a).text().trim().length >= 25 ? url.href : ''
    } catch { return '' }
  }).get().filter(Boolean)
}
export async function ingest(source: NewsSource, url: string, fetchPage = permittedFetch): Promise<Article> {
  const page = await fetchPage(url)
  const extracted = extractArticle(page.text, page.url)
  return saveArticle({ ...extracted, id: randomUUID(), sourceId: source.id, source: source.name, status: 'new', createdAt: new Date().toISOString() })
}
let scanning = false
export async function scanSources(sourceId?: string, report: ReportProgress = () => {}, fetchPage = permittedFetch) {
  if (scanning) throw Error('A scan is already running')
  scanning = true
  try {
    const results = []
    const sources = (await allSources()).filter(s => s.active && (!sourceId || s.id === sourceId))
    let articlesSaved = 0
    const issues: string[] = []
    report({ stage: 'scraping', completed: 0, total: sources.length, articlesSaved: 0, currentItem: null })
    for (const source of sources) {
      report({ currentItem: source.name })
      let added = 0
      const articleIds: string[] = []
      const errors: string[] = []
      try {
        if (!source.url) throw Error('Set the confirmed source URL first')
        const known = new Set((await allArticles()).map(a => a.url))
        const limit = Math.min(10, Math.max(1, Number(process.env.NEWS_SCAN_LIMIT) || 3))
        const page = await fetchPage(source.url)
        const $ = load(page.text)
        const feed = $('link[rel="alternate"][type*="xml"]').first().attr('href')
        let urls = candidates(page.text, page.url)
        if (feed) {
          try { const rss = await fetchPage(new URL(feed, page.url).href); urls = candidates(rss.text, rss.url) }
          catch (error) { errors.push(`Feed: ${error instanceof Error ? error.message : 'failed'}`) }
        } else if (isXindeListing(source.url)) {
          try { urls = await discoverXinde(source.url, known, limit, fetchPage, errors) }
          catch (error) { errors.push(`Xinde public API discovery: ${error instanceof Error ? error.message : 'failed'}`) }
        }
        // Follow explicit HTML next links only; no guessed endpoints or query changes.
        if (!feed && !isXindeListing(source.url)) {
          let listing = page
          const visited = new Set([page.url])
          for (let n = 1; n < 5 && new Set(urls.filter(url => !known.has(url))).size < limit; n++) {
            const next = load(listing.text)('a[rel="next"], link[rel="next"]').first().attr('href')
            if (!next) break
            const nextUrl = validateUrl(new URL(next, listing.url).href)
            if (nextUrl.origin !== new URL(page.url).origin || visited.has(nextUrl.href)) break
            visited.add(nextUrl.href)
            await new Promise(resolve => setTimeout(resolve, 1000))
            listing = await fetchPage(nextUrl.href)
            urls.push(...candidates(listing.text, listing.url))
          }
        }
        for (const url of [...new Set(urls)].filter(url => !known.has(url)).slice(0, limit)) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          report({ currentItem: `${source.name} — ${url}` })
          try {
            const article = await ingest(source, url, fetchPage)
            // Redirects or duplicate links can resolve to an existing article.
            if (!known.has(article.url)) {
              known.add(article.url)
              articleIds.push(article.id)
              added++; articlesSaved++
              report({ articlesSaved })
            }
          }
          catch (error) { errors.push(`${url}: ${error instanceof Error ? error.message : 'Extraction failed'}`) }
        }
        if (!urls.length) errors.push('No article links discovered. Add a direct article or RSS feed URL.')
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Scan failed') }
      await saveSource({ ...source, lastCheckedAt: new Date().toISOString(), articleCount: (await allArticles()).filter(a => a.sourceId === source.id).length, lastError: errors.length ? errors.join('\n') : null })
      results.push({ sourceId: source.id, added, articleIds, errors })
      issues.push(...errors.map(error => `${source.name}: ${error}`))
      report({ completed: results.length, articlesSaved, issues, currentItem: source.name })
    }
    return results
  } finally { scanning = false }
}
