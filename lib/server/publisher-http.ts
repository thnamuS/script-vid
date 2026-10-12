import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

export const AGENT = 'ShippingShortsBot/1.0'
const blocked = new BlockList()
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) blocked.addSubnet(ip, prefix)
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4')
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(db8|0|[12]):/i.test(address) && !/^2002:/i.test(address)
}
export function validateUrl(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw Error('Use a public HTTP(S) URL on a standard port')
  url.hash = ''
  return url
}
export class PublisherError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) { super(message) }
}
export function publisherLog(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ component: 'publisher', event, ...fields }))
}
export function networkError(error: unknown): PublisherError {
  if (error instanceof PublisherError) return error
  const code = (error as NodeJS.ErrnoException)?.code || 'NETWORK_ERROR'
  const kind = /ENOTFOUND|EAI_AGAIN|EAI_FAIL/.test(code) ? 'DNS' : /CERT|SSL|TLS|SELF_SIGNED/.test(code) ? 'SSL' : /TIMEOUT|TIMEDOUT/.test(code) ? 'TIMEOUT' : 'NETWORK'
  return new PublisherError(`${kind} failure (${code}): ${error instanceof Error ? error.message : String(error)}`, code)
}
export type PublisherPage = { url: string; text: string; type: string }
export const ACCEPT = 'text/plain, text/html, application/rss+xml, application/atom+xml, application/xml, application/json, */*;q=0.1'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type HttpDependencies = {
  lookup: (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>
  request: typeof httpsRequest
  sleep: (ms: number) => Promise<unknown>
  dnsTimeout: number
  requestTimeout: number
}
const defaults: HttpDependencies = {
  lookup, request: ((url: URL, ...args: any[]) => (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, ...args as [any, any])) as typeof httpsRequest,
  sleep, dnsTimeout: 10000, requestTimeout: 15000,
}
async function fetchOnce(value: string, redirects: number, checkRedirect: ((url: string) => Promise<void>) | undefined, deps: HttpDependencies): Promise<PublisherPage> {
  if (redirects > 5) throw new PublisherError('Publisher exceeded five redirects', 'REDIRECT_LIMIT')
  const url = validateUrl(value)
  // Bounded DNS lookup plus a total connection/TLS/body deadline per redirect.
  let dnsTimer: ReturnType<typeof setTimeout> | undefined
  const addresses = await Promise.race([
    deps.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true }),
    new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new PublisherError('DNS lookup timed out', 'ETIMEDOUT')), deps.dnsTimeout) }),
  ]).finally(() => clearTimeout(dnsTimer))
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new PublisherError('Private or reserved network addresses are not allowed', 'UNSAFE_ADDRESS')
  const address = addresses[0]
  return new Promise((resolve, reject) => {
    const request = deps.request(url, {
      agent: false, headers: { 'User-Agent': AGENT, Accept: ACCEPT },
      lookup: ((_host: string, options: { all?: boolean }, cb: Function) => options.all ? cb(null, [address]) : cb(null, address.address, address.family)) as any,
    }, response => {
      const status = response.statusCode || 500
      publisherLog('http_response', { url: url.href, status, redirects, contentType: response.headers['content-type'] })
      if ([301,302,303,307,308].includes(status) && response.headers.location) {
        response.resume()
        let destination: string
        try { destination = validateUrl(new URL(response.headers.location, url).href).href }
        catch { reject(new PublisherError('Invalid or unsafe publisher redirect URL', 'INVALID_REDIRECT')); return }
        publisherLog('redirect', { url: url.href, status, destination, redirects })
        ;(async () => {
          if (checkRedirect) await checkRedirect(destination)
          return fetchOnce(destination, redirects + 1, checkRedirect, deps)
        })().then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new PublisherError(`Publisher returned HTTP ${status}`, 'HTTP_STATUS', status)); return }
      const type = String(response.headers['content-type'] || (status === 204 ? 'text/plain' : ''))
      if (!/html|xml|text\/plain|json/i.test(type)) { response.resume(); reject(new PublisherError(`Unsupported publisher content type: ${type || 'missing'}`, 'CONTENT_TYPE')); return }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 3_000_000) request.destroy(new PublisherError('Publisher response exceeds 3 MB', 'BODY_LIMIT'))
        else chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('aborted', () => reject(new PublisherError('Publisher response interrupted', 'ECONNRESET')))
      response.on('end', () => resolve({ url: url.href, text: Buffer.concat(chunks).toString('utf8'), type }))
    })
    const timer = setTimeout(() => request.destroy(new PublisherError('Publisher request timed out', 'ETIMEDOUT')), deps.requestTimeout)
    request.on('close', () => clearTimeout(timer))
    request.on('error', reject)
    request.end()
  })
}
export function createPublicFetcher(overrides: Partial<HttpDependencies> = {}) {
  const deps = { ...defaults, ...overrides }
  return async function publicFetch(value: string, redirects = 0, checkRedirect?: (url: string) => Promise<void>): Promise<PublisherPage> {
    for (let attempt = 1; ; attempt++) {
      try { return await fetchOnce(value, redirects, checkRedirect, deps) }
      catch (cause) {
        const error = networkError(cause)
        const retry = attempt < 3 && (error.status === 429 || (error.status !== undefined && error.status >= 500) || ['EAI_AGAIN','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'].includes(error.code))
        publisherLog('http_failure', { url: value, attempt, status: error.status, code: error.code, reason: error.message, retry })
        if (!retry) throw error
        await deps.sleep(500 * 2 ** (attempt - 1))
      }
    }
  }
}
export const publicFetch = createPublicFetcher()
