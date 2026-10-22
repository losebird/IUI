/**
 * C2/C5/C6: single source of truth for third-party libraries used inside the
 * ```iui-html sandbox. Each file can be served by the plugin's own asset route
 * (`<assetBase>/vendor/<pkg>@<version>/<file>`, copied from node_modules at
 * build time by scripts/vendor-assets.mjs) and falls back to public CDNs.
 */

import { VENDOR_INTEGRITY } from './vendor-integrity.ts'

export interface VendorLib {
  /** npm package name */
  readonly pkg: string
  /** pinned version — must equal the installed devDependency */
  readonly version: string
  /**
   * main UMD script (path inside the package). C7: every CDN serves this exact
   * npm file (no CDN-only `.min` variants — unpkg 404s on those and jsDelivr
   * minifies them on the fly), so one sha384 covers every candidate URL.
   */
  readonly js?: string
  /** stylesheets (path inside the package) */
  readonly css?: readonly string[]
  /** extra files/dirs copied for local serving (images, fonts) */
  readonly extra?: readonly string[]
}

export const VENDOR_LIBS = {
  chart: { pkg: 'chart.js', version: '4.4.1', js: 'dist/chart.umd.js' },
  leaflet: { pkg: 'leaflet', version: '1.9.4', js: 'dist/leaflet.js', css: ['dist/leaflet.css'], extra: ['dist/images'] },
  d3: { pkg: 'd3', version: '7.9.0', js: 'dist/d3.min.js' },
  echarts: { pkg: 'echarts', version: '5.6.0', js: 'dist/echarts.min.js' },
  agGrid: { pkg: 'ag-grid-community', version: '32.3.3', js: 'dist/ag-grid-community.min.js', css: ['styles/ag-grid.css', 'styles/ag-theme-quartz.css'] },
  mermaid: { pkg: 'mermaid', version: '11.16.0', js: 'dist/mermaid.min.js' },
  // ESM only (importmap). three.module.js imports ./three.core.js; addons import bare 'three'.
  three: { pkg: 'three', version: '0.180.0', extra: ['build/three.module.js', 'build/three.core.js', 'examples/jsm/controls', 'examples/jsm/geometries', 'examples/jsm/utils', 'examples/jsm/math'] },
} as const satisfies Record<string, VendorLib>

export type VendorId = keyof typeof VENDOR_LIBS

/** ESM-only packages served through the importmap (not copied locally). */
export const VENDOR_ESM_ONLY = { gsap: '3.12.5' } as const

/**
 * C2: the only place CDN URLs are spelled out. Everything else (runtime
 * defaults, starters, map embed, offline export, probes) derives from these.
 */
export const VENDOR_CDN_PREFIX = {
  /** `<prefix><pkg>@<version>/<file>` */
  jsdelivr: 'https://cdn.jsdelivr.net/npm/',
  /** `<prefix><pkg>@<version>/<file>` */
  unpkg: 'https://unpkg.com/',
  /** `<prefix><pkg>/<version>/files/<file>` */
  npmmirror: 'https://registry.npmmirror.com/',
  /** ESM rewrite service for bare imports (`<prefix><pkg>@<version>`) */
  esmSh: 'https://esm.sh/',
} as const

/** CDN hosts used as fallbacks (also added to the sandbox CSP). */
export const VENDOR_CDN_HOSTS = ['cdn.jsdelivr.net', 'registry.npmmirror.com', 'unpkg.com'] as const

/** jsDelivr URL of one registry file — preset-independent (runtime defaults, starters, export). */
export function vendorCdnUrl(id: VendorId, file: string): string {
  const lib: VendorLib = VENDOR_LIBS[id]
  return `${VENDOR_CDN_PREFIX.jsdelivr}${lib.pkg}@${lib.version}/${file}`
}

const VENDOR_ALIASES: Record<string, VendorId> = {
  chart: 'chart', chartjs: 'chart', 'chart.js': 'chart',
  leaflet: 'leaflet', map: 'leaflet', maps: 'leaflet',
  d3: 'd3', echarts: 'echarts',
  aggrid: 'agGrid', 'ag-grid': 'agGrid', 'ag-grid-community': 'agGrid', grid: 'agGrid',
  mermaid: 'mermaid', three: 'three', 'three.js': 'three', threejs: 'three',
}

/**
 * C9: the fence's declared `libs` (header `libs: leaflet, chart` or JSON
 * `"libs": [...]`) → registry ids. Unknown names are dropped; at most 8.
 */
export function normalizeDeclaredLibs(value: unknown): VendorId[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,，、;|]+/) : []
  const out: VendorId[] = []
  for (const item of raw.slice(0, 16)) {
    if (typeof item !== 'string') continue
    const id = VENDOR_ALIASES[item.trim().toLowerCase().replace(/[\[\]"'`]/g, '')]
    if (id && !out.includes(id)) out.push(id)
  }
  return out.slice(0, 8)
}

/**
 * F19: where sandbox libraries come from (Settings → IUI → 资源源).
 * - `local`  plugin asset route → jsDelivr → npmmirror (default)
 * - `china`  plugin asset route → npmmirror → jsDelivr (no overseas-first hop)
 * - `global` jsDelivr → unpkg → plugin asset route
 * - `custom` user template → plugin asset route → jsDelivr → npmmirror
 */
export type CdnPreset = 'local' | 'china' | 'global' | 'custom'
export const CDN_PRESETS: readonly CdnPreset[] = ['local', 'china', 'global', 'custom']

export interface VendorSource {
  readonly preset: CdnPreset
  /** custom only: `https://my.cdn/{name}@{version}/{file}` */
  readonly template?: string
}

export function normalizeCdnPreset(value: unknown): CdnPreset {
  return typeof value === 'string' && (CDN_PRESETS as readonly string[]).includes(value) ? value as CdnPreset : 'local'
}

/** A custom template must be https and contain `{file}` (plus `{name}` / `{version}` to be useful). */
export function isValidCdnTemplate(template: unknown): template is string {
  if (typeof template !== 'string' || template.length > 300 || !template.includes('{file}')) return false
  try {
    const u = new URL(template.replace(/\{(?:name|version|file)\}/g, 'x'))
    return u.protocol === 'https:' && u.hostname.length > 0 && !/["'<>\s]/.test(template)
  } catch {
    return false
  }
}

let activeSource: VendorSource = { preset: 'local' }

/** Current source (module-level; set around a srcdoc build). */
export function getVendorSource(): VendorSource {
  return activeSource
}

/** Run `fn` with a different library source (srcdoc builds are synchronous). */
export function withVendorSource<T>(source: VendorSource | undefined, fn: () => T): T {
  if (!source) return fn()
  const prev = activeSource
  activeSource = { preset: normalizeCdnPreset(source.preset), ...(isValidCdnTemplate(source.template) ? { template: source.template } : {}) }
  try { return fn() } finally { activeSource = prev }
}

/** Origin of the custom template, when the active preset uses one. */
export function customCdnOrigin(source: VendorSource = activeSource): string | null {
  if (source.preset !== 'custom' || !isValidCdnTemplate(source.template)) return null
  try { return new URL(source.template.replace(/\{(?:name|version|file)\}/g, 'x')).origin } catch { return null }
}

function joinBase(base: string): string {
  return base.replace(/\/+$/, '')
}

/** Ordered candidate URLs for one file, following the active {@link CdnPreset}. */
export function vendorUrls(id: VendorId, file: string, assetBase?: string): string[] {
  const lib: VendorLib = VENDOR_LIBS[id]
  const local = assetBase ? `${joinBase(assetBase)}/vendor/${lib.pkg}@${lib.version}/${file}` : null
  const jsd = vendorCdnUrl(id, file)
  const npmm = `${VENDOR_CDN_PREFIX.npmmirror}${lib.pkg}/${lib.version}/files/${file}`
  const unpkg = `${VENDOR_CDN_PREFIX.unpkg}${lib.pkg}@${lib.version}/${file}`
  const src = activeSource
  let order: Array<string | null>
  if (src.preset === 'china') order = [local, npmm, jsd]
  else if (src.preset === 'global') order = [jsd, unpkg, local]
  else if (src.preset === 'custom' && isValidCdnTemplate(src.template)) {
    const custom = src.template
      .replace(/\{name\}/g, lib.pkg)
      .replace(/\{version\}/g, lib.version)
      .replace(/\{file\}/g, file)
    order = [custom, local, jsd, npmm]
  } else order = [local, jsd, npmm]
  return [...new Set(order.filter((u): u is string => u !== null))]
}

export function vendorJsUrls(id: VendorId, assetBase?: string): string[] {
  const lib: VendorLib = VENDOR_LIBS[id]
  return lib.js ? vendorUrls(id, lib.js, assetBase) : []
}

export function vendorCssUrls(id: VendorId, assetBase?: string): string[][] {
  const lib: VendorLib = VENDOR_LIBS[id]
  return (lib.css ?? []).map((f) => vendorUrls(id, f, assetBase))
}

/** Origin of the local asset base (for CSP), or null when not configured / not http(s). */
export function vendorBaseOrigin(assetBase?: string): string | null {
  if (!assetBase) return null
  try {
    const u = new URL(assetBase)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

const PKG_TO_ID: Record<string, VendorId> = Object.fromEntries(
  (Object.keys(VENDOR_LIBS) as VendorId[]).map((id) => [VENDOR_LIBS[id].pkg, id]),
) as Record<string, VendorId>

/**
 * C8: model-authored `<script src>` / `<link href>` pointing at a public CDN
 * copy of a registry library are rewritten to the registry's first candidate
 * (local when available). Unknown packages/paths are left untouched.
 */
export function rewriteKnownCdnUrl(url: string, assetBase?: string): string {
  const m = /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com|fastly\.jsdelivr\.net\/npm)\/((?:@[^/]+\/)?[^@/]+)(?:@[^/]+)?(\/[^?#]*)?/.exec(url)
  if (m) {
    const id = PKG_TO_ID[m[1]!]
    if (!id) return url
    const lib: VendorLib = VENDOR_LIBS[id]
    const path = (m[2] ?? '').replace(/^\//, '')
    if (/\.css$/i.test(path)) {
      const name = path.split('/').pop()!
      const hit = (lib.css ?? []).find((c) => c.endsWith('/' + name) || c === name)
      return hit ? vendorUrls(id, hit, assetBase)[0]! : url
    }
    if (/\.m?js$/i.test(path) || path === '') return vendorJsUrls(id, assetBase)[0] ?? url
    return url
  }
  const cdnjs = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/[^/]+\/([^?#]+)/.exec(url)
  if (cdnjs) {
    const alias: Record<string, VendorId> = { 'Chart.js': 'chart', leaflet: 'leaflet', d3: 'd3', echarts: 'echarts', mermaid: 'mermaid' }
    const id = alias[cdnjs[1]!]
    if (!id) return url
    if (/\.css$/i.test(cdnjs[2]!)) return vendorCssUrls(id, assetBase)[0]?.[0] ?? url
    return vendorJsUrls(id, assetBase)[0] ?? url
  }
  return url
}

/** Files to copy for local serving: [pkg, version, relative path]. */
export function vendorCopyList(): Array<{ pkg: string; version: string; path: string }> {
  const out: Array<{ pkg: string; version: string; path: string }> = []
  for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
    const lib: VendorLib = VENDOR_LIBS[id]
    for (const p of [lib.js, ...(lib.css ?? []), ...(lib.extra ?? [])]) if (p) out.push({ pkg: lib.pkg, version: lib.version, path: p })
  }
  return out
}

/**
 * C3 + C6: importmap for bare imports. Versions are pinned (esm.sh used to be
 * "latest"), and `three` resolves to the local asset route when available.
 */
export function buildVendorImportMap(assetBase?: string): { imports: Record<string, string>; integrity?: Record<string, string> } {
  const src = activeSource
  const gsap = VENDOR_ESM_ONLY.gsap
  // F19: china keeps every ESM hop on npmmirror (esm.sh is often unreachable).
  const gsapRoot = src.preset === 'china'
    ? `${VENDOR_CDN_PREFIX.npmmirror}gsap/${gsap}/files/`
    : `${VENDOR_CDN_PREFIX.jsdelivr}gsap@${gsap}/`
  const esm = (pkg: string, version: string): string => `${VENDOR_CDN_PREFIX.esmSh}${pkg}@${version}`
  const imports: Record<string, string> = {
    gsap: `${gsapRoot}index.js`,
    'gsap/': gsapRoot,
    d3: esm('d3', VENDOR_LIBS.d3.version),
    'd3/': `${esm('d3', VENDOR_LIBS.d3.version)}/`,
    'chart.js': esm('chart.js', VENDOR_LIBS.chart.version),
    'chart.js/': `${esm('chart.js', VENDOR_LIBS.chart.version)}/`,
  }
  // three: first candidate of the active preset (local route, mirror or CDN);
  // three.module.js pulls ./three.core.js relative to itself.
  const mod = vendorUrls('three', 'build/three.module.js', assetBase)[0]!
  const root = mod.replace(/build\/three\.module\.js$/, '')
  imports.three = mod
  imports['three/'] = root
  imports['three/addons/'] = `${root}examples/jsm/`
  imports['three/examples/jsm/'] = `${root}examples/jsm/`
  // C7: importmap integrity for the CDN copies of three's entry + core.
  const integrity: Record<string, string> = {}
  for (const f of ['build/three.module.js', 'build/three.core.js']) {
    const url = `${root}${f}`
    const h = vendorIntegrity(url)
    if (h) integrity[url] = h
  }
  return Object.keys(integrity).length ? { imports, integrity } : { imports }
}

/**
 * C7: `pkg@version/file` for a jsDelivr / unpkg / npmmirror URL (the key of
 * {@link VENDOR_INTEGRITY}); null for any other URL (local route, custom CDN).
 */
export function vendorFileKey(url: string): string | null {
  for (const p of [VENDOR_CDN_PREFIX.jsdelivr, VENDOR_CDN_PREFIX.unpkg]) {
    if (url.startsWith(p)) return url.slice(p.length).split(/[?#]/)[0]!
  }
  if (url.startsWith(VENDOR_CDN_PREFIX.npmmirror)) {
    const [head, file] = url.slice(VENDOR_CDN_PREFIX.npmmirror.length).split(/[?#]/)[0]!.split('/files/')
    const parts = (head ?? '').split('/')
    const version = parts.pop()
    return file && version ? `${parts.join('/')}@${version}/${file}` : null
  }
  return null
}

/** C7: sha384 SRI for a public-CDN copy of a registry file (null when unknown / not a CDN URL). */
export function vendorIntegrity(url: string): string | null {
  const key = vendorFileKey(url)
  return key ? VENDOR_INTEGRITY[key] ?? null : null
}

/** C7: ` integrity="…" crossorigin="anonymous"` for CDN URLs of registry files, else ''. */
export function vendorSriAttrs(url: string): string {
  const h = vendorIntegrity(url)
  return h ? ` integrity="${h}" crossorigin="anonymous"` : ''
}

/**
 * C7: in-frame twin of {@link vendorFileKey} + {@link vendorIntegrity}
 * (`window.__iuiSriFor(url)` → hash or ''), used by the fallback swapper and
 * the runtime loader. Only UMD js/css entries (three goes via the importmap).
 */
export function buildSriLookupSource(): string {
  const map: Record<string, string> = {}
  for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
    const lib: VendorLib = VENDOR_LIBS[id]
    for (const f of [lib.js, ...(lib.css ?? [])]) {
      const key = f ? `${lib.pkg}@${lib.version}/${f}` : ''
      if (key && VENDOR_INTEGRITY[key]) map[key] = VENDOR_INTEGRITY[key]!
    }
  }
  return `window.__iuiSriFor = (function (S, P, M) {
  return function (u) {
    u = String(u || '').split('#')[0].split('?')[0];
    var k = '';
    for (var i = 0; i < P.length; i++) if (u.indexOf(P[i]) === 0) k = u.slice(P[i].length);
    if (!k && u.indexOf(M) === 0) {
      var a = u.slice(M.length).split('/files/'), b = a[0].split('/'), v = b.pop();
      if (a[1] && v) k = b.join('/') + '@' + v + '/' + a[1];
    }
    return (k && Object.prototype.hasOwnProperty.call(S, k)) ? S[k] : '';
  };
})(${JSON.stringify(map)}, ${JSON.stringify([VENDOR_CDN_PREFIX.jsdelivr, VENDOR_CDN_PREFIX.unpkg])}, ${JSON.stringify(VENDOR_CDN_PREFIX.npmmirror)});`
}

/** C10: one small registry file per public CDN, for the connectivity probe. */
export function vendorProbeUrls(): Array<{ id: 'jsdelivr' | 'npmmirror' | 'unpkg'; url: string }> {
  const lib = VENDOR_LIBS.leaflet
  const file = lib.css[0]
  return [
    { id: 'jsdelivr', url: vendorCdnUrl('leaflet', file) },
    { id: 'npmmirror', url: `${VENDOR_CDN_PREFIX.npmmirror}${lib.pkg}/${lib.version}/files/${file}` },
    { id: 'unpkg', url: `${VENDOR_CDN_PREFIX.unpkg}${lib.pkg}@${lib.version}/${file}` },
  ]
}

/** C7: files that get an SRI hash — every UMD js/css plus three's ESM entry + core. */
export function vendorIntegrityFiles(): Array<{ pkg: string; version: string; path: string }> {
  const out: Array<{ pkg: string; version: string; path: string }> = []
  for (const id of Object.keys(VENDOR_LIBS) as VendorId[]) {
    const lib: VendorLib = VENDOR_LIBS[id]
    const files = id === 'three' ? ['build/three.module.js', 'build/three.core.js'] : [lib.js, ...(lib.css ?? [])]
    for (const p of files) if (p) out.push({ pkg: lib.pkg, version: lib.version, path: p })
  }
  return out
}
