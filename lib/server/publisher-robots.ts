import robotsParser from 'robots-parser'
import { AGENT, PublisherError, publicFetch, publisherLog, validateUrl } from './publisher-http'

// RFC 9309 §2.2.2: decode percent-encoded unreserved ASCII before matching,
// but keep reserved characters encoded. robots-parser handles groups, longest
// match, wildcard/$ rules and Allow precedence for equally specific rules.
function normalize(value: string) {
  return value.replace(/%([0-9a-f]{2})/gi, (encoded, hex) => {
    const char = String.fromCharCode(parseInt(hex, 16))
    return /[A-Za-z0-9._~-]/.test(char) ? char : encoded.toUpperCase()
  })
}
export function createRobotsChecker(fetchRobots = publicFetch, now = Date.now) {
  const cache = new Map<string, { expires: number; rules?: ReturnType<typeof robotsParser>; error?: string }>()
  const pending = new Map<string, Promise<void>>()
  async function refresh(origin: string) {
    const robotsUrl = `${origin}/robots.txt`
    try {
      let text = ''
      try {
        const response = await fetchRobots(robotsUrl)
        if (!/text\/plain/i.test(response.type) || /^\s*(?:<!doctype|<html)/i.test(response.text)) throw Error(`Invalid robots.txt response (${response.type}); expected plain text`)
        text = normalize(response.text.replace(/^\uFEFF/, ''))
      } catch (error) {
        // RFC permits access on unavailable 4xx; only confirmed absence is
        // treated as permission here. 401/403/406/429 remain fail-closed.
        if (!(error instanceof PublisherError && [404,410].includes(error.status || 0))) throw error
        publisherLog('robots_absent', { url: robotsUrl, status: error.status })
      }
      // Use ORIGINAL origin when robots.txt redirects to another authority.
      cache.set(origin, { expires: now() + 3600000, rules: robotsParser(robotsUrl, text) })
      publisherLog('robots_verified', { url: robotsUrl, cacheSeconds: 3600 })
    } catch (error) {
      const reason = `Unable to verify publisher robots.txt (${robotsUrl}): ${error instanceof Error ? error.message : String(error)}; scan skipped`
      // Never reuse stale permission after an unreachable/error response.
      cache.set(origin, { expires: now() + 60000, error: reason })
      publisherLog('robots_unverified', { url: robotsUrl, reason, cacheSeconds: 60 })
    }
  }
  return async function checkRobots(value: string) {
    const url = validateUrl(value)
    let cached = cache.get(url.origin)
    if (!cached || cached.expires <= now()) {
      let task = pending.get(url.origin)
      if (!task) {
        task = refresh(url.origin).finally(() => pending.delete(url.origin))
        pending.set(url.origin, task)
      }
      await task
      cached = cache.get(url.origin)!
    } else publisherLog('robots_cache_hit', { origin: url.origin, verified: !cached.error })
    if (cached.error) throw Error(cached.error)
    if (cached.rules!.isAllowed(normalize(url.href), AGENT) === false) {
      publisherLog('robots_disallowed', { url: url.href })
      throw Error(`Publisher robots.txt disallows this page: ${url.href}`)
    }
  }
}
export const checkRobots = createRobotsChecker()
export async function permittedFetch(value: string) {
  await checkRobots(value)
  return publicFetch(value, 0, checkRobots)
}
