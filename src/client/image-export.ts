/**
 * G12: host side of "save as image".
 *
 * The sandbox rasterises itself (SVG foreignObject → canvas) but cannot fetch
 * cross-origin images or stylesheets (null origin, no connect-src). While an
 * export is running the host answers its `fetchResource` requests: a CORS
 * fetch first, then the plugin's same-origin proxy. A capture window bounds
 * how much the frame may pull, and requests outside that window are refused.
 */

export const CAPTURE_WINDOW_MS = 30_000
export const CAPTURE_MAX_FETCHES = 300
export const CAPTURE_MAX_BYTES = 40 * 1024 * 1024
const RESOURCE_MAX_BYTES = 8 * 1024 * 1024

export interface CaptureBudget {
  until: number
  fetches: number
  bytes: number
}

export function openCaptureBudget(now = Date.now()): CaptureBudget {
  return { until: now + CAPTURE_WINDOW_MS, fetches: 0, bytes: 0 }
}

/** Reserve one fetch; false when the window closed or the count ran out. */
export function takeCaptureFetch(budget: CaptureBudget | null, now = Date.now()): boolean {
  if (!budget || now > budget.until || budget.fetches >= CAPTURE_MAX_FETCHES) return false
  budget.fetches += 1
  return true
}

/** Account bytes; false when the total would exceed the capture cap. */
export function chargeCaptureBytes(budget: CaptureBudget | null, bytes: number): boolean {
  if (!budget) return false
  if (budget.bytes + bytes > CAPTURE_MAX_BYTES) return false
  budget.bytes += bytes
  return true
}

export function isCapturableUrl(url: string): boolean {
  if (url.length === 0 || url.length > 2000) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'blob:'
  } catch {
    return false
  }
}

export function proxyUrlFor(base: string | undefined, url: string): string | null {
  if (!base) return null
  if (!/^https?:/i.test(url)) return null
  return `${base.replace(/\/+$/, '')}/proxy?u=${encodeURIComponent(url)}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function tryFetch(fetchImpl: FetchLike, url: string, as: 'dataUrl' | 'text', signal: AbortSignal): Promise<{ data: string; bytes: number } | null> {
  try {
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', signal, cache: 'force-cache' })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (as === 'text') {
      if (ct && !/text\/css|text\/plain/.test(ct)) return null
      const text = await res.text()
      return text.length > RESOURCE_MAX_BYTES ? null : { data: text, bytes: text.length }
    }
    const blob = await res.blob()
    if (blob.size > RESOURCE_MAX_BYTES) return null
    const type = (blob.type || ct).toLowerCase()
    if (type && !type.startsWith('image/')) return null
    const data = await blobToDataUrl(blob)
    return data.startsWith('data:') ? { data, bytes: blob.size } : null
  } catch {
    return null
  }
}

/** Fetch one resource for the frame: direct CORS first, then the proxy. */
export async function fetchCaptureResource(
  url: string,
  as: 'dataUrl' | 'text',
  opts: { proxyBase?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<{ data: string; bytes: number } | null> {
  if (!isCapturableUrl(url)) return null
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000)
  try {
    const direct = await tryFetch(fetchImpl, url, as, ctrl.signal)
    if (direct) return direct
    const proxied = proxyUrlFor(opts.proxyBase, url)
    return proxied ? await tryFetch(fetchImpl, proxied, as, ctrl.signal) : null
  } finally {
    clearTimeout(timer)
  }
}

export function imageFileName(title: string | undefined): string {
  const stem = (title ?? 'iui-page').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 48) || 'iui-page'
  return `${stem}.png`
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) return null
  try {
    if (m[2]) {
      const bin = atob(m[3]!)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new Blob([bytes], { type: m[1]! })
    }
    return new Blob([decodeURIComponent(m[3]!)], { type: m[1]! })
  } catch {
    return null
  }
}

export function downloadDataUrl(filename: string, dataUrl: string): boolean {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return false
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    return true
  } catch {
    return false
  }
}

/** First non-transparent background colour walking up from `el`. */
export function effectiveBackground(el: Element | null): string {
  const view = el?.ownerDocument.defaultView
  for (let node: Element | null = el; node && view; node = node.parentElement) {
    const bg = view.getComputedStyle(node).backgroundColor
    if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg.slice(0, 100)
  }
  return '#ffffff'
}
