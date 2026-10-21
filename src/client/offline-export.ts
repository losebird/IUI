/**
 * F20 / D12: "offline" share file. Starting from the normal share document,
 * everything the live page actually fetched (classic libraries, their CSS,
 * ES modules, images and the visible map tiles) is fetched by the host and
 * inlined, so the file opens without network. Over the size cap the caller
 * falls back to the linked version.
 */
import {
  VENDOR_LIBS,
  vendorCssUrls,
  vendorJsUrls,
  withVendorSource,
  type VendorId,
  type VendorSource,
} from '../shared/vendor-registry.ts'

export const OFFLINE_EXPORT_MAX_BYTES = 15 * 1024 * 1024
const MAX_ASSET_BYTES = 3 * 1024 * 1024
const MAX_TILES = 96
const MAX_MODULES = 400
const FETCH_TIMEOUT_MS = 12_000

export interface SandboxResource { url: string; type: string }

export interface FetchedBody { body: string | Uint8Array; type: string }
export type ExportFetcher = (url: string, as: 'text' | 'bytes') => Promise<FetchedBody | null>

export interface OfflineExportOptions {
  assetBase?: string
  cdnSource?: VendorSource
  fetcher?: ExportFetcher
  maxBytes?: number
  /** `zh` / `en` for the offline map note. */
  lang?: string
}

export interface OfflineExportResult {
  html: string
  bytes: number
  tooLarge: boolean
  /** URLs inlined (scripts, styles, modules, images). */
  inlined: string[]
  /** URLs the page used that could not be fetched (still linked). */
  failed: string[]
}

export const defaultExportFetcher: ExportFetcher = async (url, as) => {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : undefined
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', ...(ctl ? { signal: ctl.signal } : {}) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (as === 'text') return { body: await res.text(), type }
    return { body: new Uint8Array(await res.arrayBuffer()), type }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function base64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}

function dataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${base64(bytes)}`
}

function escapeScript(text: string): string {
  return text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

function decodeAttr(v: string): string {
  return v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

const TILE_RE = /\/tile\/\d+\/\d+\/\d+|\/\d+\/\d+\/\d+(?:@2x)?\.(?:png|jpe?g|webp)(?:[?#]|$)|[?&](?:x|tilecol)=\d+.*[?&](?:y|tilerow)=\d+/i
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:[?#]|$)/i
const MODULE_RE = /\.m?js(?:[?#]|$)|^https:\/\/esm\.sh\//i

function guessMime(url: string, fallback: string): string {
  const t = fallback.split(';')[0]!.trim()
  if (t && t !== 'application/octet-stream' && t !== 'binary/octet-stream') return t
  const ext = (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1] ?? '').toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!
      await fn(item)
    }
  })
  await Promise.all(workers)
}

/** Import specifiers (static, re-export, side-effect, dynamic literal). */
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"'\n]+)\2/g

export async function buildOfflineExport(
  doc: string,
  resources: readonly SandboxResource[],
  options: OfflineExportOptions = {},
): Promise<OfflineExportResult> {
  const fetcher = options.fetcher ?? defaultExportFetcher
  const maxBytes = options.maxBytes ?? OFFLINE_EXPORT_MAX_BYTES
  const base = options.assetBase?.replace(/\/+$/, '')
  const localVendor = base ? `${base}/vendor/` : null
  const portable = (u: string): string =>
    localVendor && u.startsWith(localVendor) ? `https://cdn.jsdelivr.net/npm/${u.slice(localVendor.length)}` : u
  const used = new Set(resources.map((r) => r.url))
  const inlined: string[] = []
  const failed: string[] = []
  const handled = new Set<string>()
  let html = doc

  const fetchFirst = async (cands: string[], as: 'text' | 'bytes'): Promise<{ url: string; got: FetchedBody } | null> => {
    const ordered = [...cands.filter((c) => used.has(c)), ...cands.filter((c) => !used.has(c))]
    for (const url of ordered) {
      const got = await fetcher(url, as)
      if (got) return { url, got }
    }
    return null
  }

  // ---- CSS: absolutize url(), inline the ones the page used.
  const assets: Record<string, string> = {}
  const fetchAsset = async (url: string): Promise<string | null> => {
    if (assets[url]) return assets[url]!
    const got = await fetcher(url, 'bytes')
    if (!got || typeof got.body === 'string' || got.body.byteLength > MAX_ASSET_BYTES) { failed.push(url); return null }
    const uri = dataUri(got.body, guessMime(url, got.type))
    assets[url] = uri
    inlined.push(url)
    return uri
  }
  const inlineCss = async (css: string, cssUrl: string): Promise<string> => {
    const refs: Array<{ raw: string; abs: string }> = []
    css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, _q: string, ref: string) => {
      if (/^(?:data|blob):/i.test(ref) || ref.startsWith('#')) return m
      try { refs.push({ raw: m, abs: new URL(ref, cssUrl).href }) } catch { /* ignore */ }
      return m
    })
    const map = new Map<string, string>()
    await pool(refs, 6, async (r) => {
      const uri = used.has(r.abs) ? await fetchAsset(r.abs) : null
      map.set(r.raw, `url("${uri ?? portable(r.abs)}")`)
    })
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m) => map.get(m) ?? m)
  }

  // ---- Static <script src> / <link rel=stylesheet> tags that actually loaded.
  const tagJobs: Array<{ tag: string; replace: string }> = []
  const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi)].map((m) => m[0])
  const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t))
  await pool(scriptTags, 4, async (tag) => {
    const src = attr(tag, 'src')
    if (!src || /type\s*=\s*["']?module/i.test(tag)) return
    const cands = [decodeAttr(src), ...(attr(tag, 'data-iui-fallback') ?? '').split(/\s+/).filter(Boolean).map(decodeAttr)]
    if (!cands.some((c) => used.has(c))) return
    const hit = await fetchFirst(cands, 'text')
    if (!hit) { failed.push(cands[0]!); return }
    cands.forEach((c) => handled.add(c))
    inlined.push(hit.url)
    tagJobs.push({ tag, replace: `<script data-iui-inlined="${hit.url.replace(/"/g, '')}">${escapeScript(String(hit.got.body))}\n</script>` })
  })
  await pool(linkTags, 4, async (tag) => {
    const href = attr(tag, 'href')
    if (!href) return
    const cands = [decodeAttr(href), ...(attr(tag, 'data-iui-fallback') ?? '').split(/\s+/).filter(Boolean).map(decodeAttr)]
    if (!cands.some((c) => used.has(c))) return
    const hit = await fetchFirst(cands, 'text')
    if (!hit) { failed.push(cands[0]!); return }
    cands.forEach((c) => handled.add(c))
    inlined.push(hit.url)
    tagJobs.push({ tag, replace: `<style data-iui-inlined="${hit.url.replace(/"/g, '')}">${(await inlineCss(String(hit.got.body), hit.url)).replace(/<\/style/gi, '<\\/style')}</style>` })
  })
  for (const job of tagJobs) html = html.replace(job.tag, () => job.replace)

  // ---- Libraries the runtime loads on demand (Leaflet, Chart.js, ag-grid…).
  const head: string[] = []
  const libJobs: Array<{ id: VendorId; js: string[]; css: string[][] }> = []
  withVendorSource(options.cdnSource, () => {
    for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
      libJobs.push({ id, js: vendorJsUrls(id, options.assetBase), css: vendorCssUrls(id, options.assetBase) })
    }
  })
  const classic = new Set<string>()
  for (const job of libJobs) {
    job.js.forEach((u) => classic.add(u))
    const jsUsed = job.js.some((u) => used.has(u)) && !job.js.some((u) => handled.has(u))
    for (const cands of job.css) {
      if (!cands.some((u) => used.has(u)) || cands.some((u) => handled.has(u))) continue
      const hit = await fetchFirst(cands, 'text')
      if (!hit) { failed.push(cands[0]!); continue }
      cands.forEach((u) => handled.add(u))
      inlined.push(hit.url)
      head.push(`<style data-iui-inlined="${hit.url}">${(await inlineCss(String(hit.got.body), hit.url)).replace(/<\/style/gi, '<\\/style')}</style>`)
    }
    if (!jsUsed) continue
    const hit = await fetchFirst(job.js, 'text')
    if (!hit) { failed.push(job.js[0]!); continue }
    job.js.forEach((u) => handled.add(u))
    inlined.push(hit.url)
    head.push(`<script data-iui-inlined="${hit.url}">${escapeScript(String(hit.got.body))}\n</script>`)
  }

  // ---- ES modules: flat import map of absolute URL → data: module.
  const moduleData = new Map<string, string>()
  const mapMatch = /<script type="importmap">([\s\S]*?)<\/script>/i.exec(html)
  if (mapMatch) {
    const queue = resources
      .filter((r) => MODULE_RE.test(r.url) && !classic.has(r.url) && !handled.has(r.url) && r.type !== 'img')
      .map((r) => r.url)
    const seen = new Set(queue)
    while (queue.length && moduleData.size < MAX_MODULES) {
      const batch = queue.splice(0, 6)
      await Promise.all(batch.map(async (url) => {
        const got = await fetcher(url, 'text')
        if (!got) { failed.push(url); return }
        const text = String(got.body).replace(SPEC_RE, (m, lead: string, q: string, spec: string) => {
          if (!/^(?:\.{1,2}\/|\/(?!\/)|https?:)/.test(spec)) return m // bare: the import map resolves it
          let abs: string
          try { abs = new URL(spec, url).href } catch { return m }
          if (!seen.has(abs)) { seen.add(abs); queue.push(abs) }
          return `${lead}${q}${portable(abs)}${q}`
        })
        moduleData.set(url, `data:text/javascript;base64,${base64(utf8(text))}`)
        inlined.push(url)
      }))
    }
    if (moduleData.size) {
      let imports: Record<string, string> = {}
      try { imports = (JSON.parse(mapMatch[1]!.replace(/<\\\//g, '</')) as { imports?: Record<string, string> }).imports ?? {} } catch { /* keep empty */ }
      const next: Record<string, string> = {}
      for (const [k, t] of Object.entries(imports)) {
        if (k.endsWith('/')) {
          for (const [u, d] of moduleData) if (u.startsWith(t)) next[k + u.slice(t.length)] = d
          next[k] = portable(t)
        } else next[k] = moduleData.get(t) ?? portable(t)
      }
      for (const [u, d] of moduleData) next[portable(u)] = d
      const json = JSON.stringify({ imports: next }).replace(/<\//g, '<\\/')
      html = html.replace(mapMatch[0], () => `<script type="importmap">${json}</script>`)
    }
  }

  // ---- Images + visible map tiles → asset table swapped in at runtime.
  const docImgs = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["'](https?:[^"']+)["']/gi)].map((m) => decodeAttr(m[1]!))
  const imgUrls = [...new Set([
    ...docImgs,
    ...resources.filter((r) => !handled.has(r.url) && !moduleData.has(r.url) && !classic.has(r.url)
      && (r.type === 'img' || r.type === 'css' || IMAGE_RE.test(r.url))).map((r) => r.url),
  ])]
  let tiles = 0
  const wanted = imgUrls.filter((u) => {
    if (!TILE_RE.test(u)) return true
    return ++tiles <= MAX_TILES
  })
  await pool(wanted, 6, async (u) => { await fetchAsset(u) })
  // CSS backgrounds written in the page itself.
  html = html.replace(/url\(\s*(["']?)(https?:[^"')]+)\1\s*\)/g, (m, _q: string, u: string) => (assets[u] ? `url("${assets[u]}")` : m))

  const zh = /^zh/i.test(options.lang ?? '')
  const note = zh ? '离线：只保存了导出时看到的地图范围' : 'Offline: only the map area visible at export was saved'
  head.push(`<script data-iui-offline-assets>${escapeScript(`(function () {
  var A = window.__iuiOfflineAssets = ${JSON.stringify(assets)};
  try {
    var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (d && d.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, A[v] || v); } });
  } catch (e) {}
  function sw(img) { var s = img.getAttribute('src'); if (s && A[s]) img.setAttribute('src', A[s]); }
  function scan(n) { if (!n || n.nodeType !== 1) return; if (n.tagName === 'IMG') sw(n); if (n.querySelectorAll) n.querySelectorAll('img[src]').forEach(sw); }
  try {
    new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'attributes') sw(m.target); else m.addedNodes.forEach(scan); }); })
      .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () { scan(document.documentElement); });
  var noted = false;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (noted || !t || t.tagName !== 'IMG' || String(t.className).indexOf('leaflet-tile') < 0) return;
    var box = t.closest && t.closest('.leaflet-container');
    if (!box) return;
    noted = true;
    var n = document.createElement('div');
    n.setAttribute('data-iui-offline-note', '');
    n.textContent = ${JSON.stringify(note)};
    n.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:1000;padding:4px 8px;border-radius:6px;background:rgba(30,30,34,.78);color:#fff;font:12px/1.4 system-ui,sans-serif;pointer-events:none';
    box.appendChild(n);
  }, true);
})();`)}</script>`)

  // Inlined libraries/assets go before the first page script (the runtime
  // sees the globals and skips loading them).
  const firstScript = html.search(/<script\b/i)
  const block = head.join('\n')
  html = firstScript >= 0 ? html.slice(0, firstScript) + block + html.slice(firstScript) : block + html

  // CSP: data: modules; drop the local plugin origin from the shared file.
  html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/i, (_m, a: string, csp: string, c: string) => {
    let next = csp.replace(/script-src ([^;]*)/, (_s, list: string) => `script-src ${list} data:`)
    if (base) {
      try {
        const origin = new URL(base).origin
        next = next.split(` ${origin}`).join('')
      } catch { /* ignore */ }
    }
    return a + next + c
  })
  if (localVendor) html = html.split(localVendor).join('https://cdn.jsdelivr.net/npm/')

  const bytes = utf8(html).byteLength
  return { html, bytes, tooLarge: bytes > maxBytes, inlined, failed: [...new Set(failed)] }
}
