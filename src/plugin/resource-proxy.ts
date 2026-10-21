/**
 * G12: same-origin resource proxy for "save as image".
 *
 * The ```iui-html sandbox is a null-origin srcdoc without a general
 * connect-src, so when it rasterises itself it asks the host to fetch remote
 * images / stylesheets. The host tries a CORS fetch first and falls back to
 * this route, which only fetches public http(s) images and CSS, with a size
 * cap, timeout and a locked-down response (no scripts, sandbox CSP).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const PROXY_MAX_BYTES = 8 * 1024 * 1024
export const PROXY_TIMEOUT_MS = 8000
const PROXY_MAX_REDIRECTS = 3

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true // multicast / reserved / broadcast
  return false
}

/** True for loopback / private / link-local / reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return ipv4Private(ip)
  if (kind === 6) {
    const v = ip.toLowerCase()
    if (v === '::' || v === '::1') return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (mapped) return ipv4Private(mapped[1]!)
    if (/^::ffff:/.test(v)) return true
    if (/^f[cd]/.test(v)) return true // unique local
    if (/^fe[89ab]/.test(v)) return true // link-local
    if (/^ff/.test(v)) return true // multicast
    return false
  }
  return true
}

/** True when the hostname alone is clearly not a public internet host. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (h.length === 0) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true
  if (isIP(h) !== 0) return isPrivateAddress(h)
  if (!h.includes('.')) return true // single-label intranet names
  return false
}

/** Validate a proxy target; returns the URL or a reason string. */
export function parseProxyTarget(raw: string | null | undefined): URL | string {
  if (!raw || raw.length > 2000) return 'bad-url'
  let u: URL
  try { u = new URL(raw) } catch { return 'bad-url' }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'bad-scheme'
  if (u.username || u.password) return 'bad-url'
  if (isBlockedHostname(u.hostname)) return 'blocked-host'
  return u
}

export type ProxyResolver = (hostname: string) => Promise<string[]>

const defaultResolver: ProxyResolver = async (hostname) => {
  const list = await lookup(hostname, { all: true, verbatim: true })
  return list.map((x) => x.address)
}

async function hostResolvesPublic(hostname: string, resolver: ProxyResolver): Promise<boolean> {
  const h = hostname.replace(/^\[|\]$/g, '')
  if (isIP(h) !== 0) return !isPrivateAddress(h)
  try {
    const ips = await resolver(h)
    return ips.length > 0 && ips.every((ip) => !isPrivateAddress(ip))
  } catch {
    return false
  }
}

export function allowedProxyContentType(ct: string): string | null {
  const base = ct.split(';')[0]!.trim().toLowerCase()
  if (/^image\/[a-z0-9.+-]+$/.test(base)) return base === 'image/svg+xml' ? 'image/svg+xml' : base
  if (base === 'text/css') return 'text/css; charset=utf-8'
  return null
}

export interface ProxyDeps {
  fetch?: typeof fetch
  resolve?: ProxyResolver
}

function fail(res: ServerResponse, status: number, reason: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  })
  res.end(reason)
}

/** Handle `GET <asset route>/proxy?u=<url>`. */
export async function serveResourceProxy(req: IncomingMessage, res: ServerResponse, deps: ProxyDeps = {}): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  let target: URL | string
  try {
    target = parseProxyTarget(new URL(req.url ?? '/', 'http://x').searchParams.get('u'))
  } catch {
    target = 'bad-url'
  }
  if (typeof target === 'string') return fail(res, 400, target)
  const doFetch = deps.fetch ?? fetch
  const resolver = deps.resolve ?? defaultResolver
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS)
  try {
    let url = target
    let upstream: Response | undefined
    for (let hop = 0; hop <= PROXY_MAX_REDIRECTS; hop++) {
      if (!(await hostResolvesPublic(url.hostname, resolver))) return fail(res, 403, 'blocked-host')
      upstream = await doFetch(url.href, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { accept: 'image/*,text/css;q=0.9,*/*;q=0.1', 'user-agent': 'IUI-image-export/1' },
      })
      if (upstream.status >= 300 && upstream.status < 400) {
        const loc = upstream.headers.get('location')
        const next = loc ? parseProxyTarget(new URL(loc, url).href) : 'bad-redirect'
        if (typeof next === 'string') return fail(res, 403, next)
        url = next
        upstream = undefined
        continue
      }
      break
    }
    if (!upstream) return fail(res, 508, 'too-many-redirects')
    if (!upstream.ok) return fail(res, 502, `upstream-${upstream.status}`)
    const ct = allowedProxyContentType(upstream.headers.get('content-type') ?? '')
    if (!ct) return fail(res, 415, 'bad-type')
    const declared = Number(upstream.headers.get('content-length') ?? '0')
    if (declared > PROXY_MAX_BYTES) return fail(res, 413, 'too-large')
    const chunks: Uint8Array[] = []
    let total = 0
    if (upstream.body) {
      const reader = upstream.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > PROXY_MAX_BYTES) {
          void reader.cancel().catch(() => {})
          return fail(res, 413, 'too-large')
        }
        chunks.push(value)
      }
    }
    const body = Buffer.concat(chunks)
    res.writeHead(200, {
      'content-type': ct,
      'content-length': String(body.byteLength),
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'cross-origin-resource-policy': 'cross-origin',
    })
    if (req.method !== 'HEAD') res.write(body)
    res.end()
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    if (!(res as { headersSent?: boolean }).headersSent) fail(res, aborted ? 504 : 502, aborted ? 'timeout' : 'fetch-failed')
    else res.end()
  } finally {
    clearTimeout(timer)
  }
}
