/**
 * Open ```iui-html sandbox: parse fence body into css/html/js and build a
 * sandboxed iframe srcdoc. CDN hosts live in HTML_SANDBOX_CDN_ALLOWLIST
 * (single source of truth). Design tokens inject via build options.
 */

import { IUI_TOKEN_CATALOG, tokenCatalogToCssVars, cssVarsToInline } from '../themes/tokens.ts'
import { sandboxBrandCssVars } from '../themes/sandbox-brand.ts'
import {
  buildOiuDesignSystemCss,
  buildOiuImportmapScriptTag,
  buildTripAnimatorScriptTag,
} from '../themes/oiu-design-system.ts'
import { OIU_PATTERN_STARTERS } from './oiu-pattern-starters.ts'
import { buildTripPhotoFillScript, enrichPlaceMediaHtml } from './trip-images.ts'
import { buildAuthorJsRuntimeSource, splitAuthorJsChunks, jsonEmbed } from './author-js-runtime.ts'
export { splitAuthorJsChunks } from './author-js-runtime.ts'

/** Allowed script/link host suffixes (exact host or subdomain). HTTPS only. */
export const HTML_SANDBOX_CDN_ALLOWLIST = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'esm.sh',
  'unpkg.com',
  'cdn.skypack.dev',
] as const

/**
 * Default Leaflet raster tiles (world coverage).
 * tile.openstreetmap.org often returns HTTP 200 + x-blocked stub PNGs from
 * datacenter / null-origin srcdoc sandboxes — markers render, basemap stays gray.
 * CartoCDN light_all is OSM-derived, allowlisted, and reliable in sandboxes.
 */
export const IUI_DEFAULT_MAP_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
export const IUI_DEFAULT_MAP_TILE_ATTR =
  'Tiles &copy; Esri'
/**
 * Fallback raster chain when Esri returns tileerror or regional gaps
 * ("Map data not yet available"). OSM FR HOT is first fallback (China/JP
 * coverage); Esri Light Gray / Topo follow. East-Asia map centers skip
 * Esri Street and start on OSM FR HOT immediately.
 * Order: try next URL after repeated tileerror / stub-gap detection.
 */
export const IUI_MAP_TILE_FALLBACKS: readonly { url: string; attribution: string }[] = [
  // Prefer OSM FR HOT early: Esri Street often serves "Map data not yet available"
  // stubs across China / East Asia (HTTP 200, no tileerror).
  {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team',
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
]

export type HtmlSandboxSpec = {
  title?: string
  height?: number
  /** Streaming chrome placeholder (shown before css/html ready). */
  placeholder?: string
  css: string
  html: string
  js: string
  /** Optional function body(s) — concatenated before jsExpressions when present. */
  jsFunctions?: string
  /** Optional expression list — run one-by-one after js/jsFunctions (fail-soft). */
  jsExpressions?: readonly string[]
  /** Which sections were detected (for streaming chrome). */
  stages: ReadonlyArray<'css' | 'html' | 'js' | 'placeholder'>
  /** True when JSON/sections look unfinished (streaming). */
  partial: boolean
  /** css field complete enough to open preview iframe. */
  cssComplete?: boolean
  /** html field complete (not mid-stream). */
  htmlComplete?: boolean
  /** js / expressions ready to execute in final iframe. */
  jsComplete?: boolean
}

export type HtmlSandboxBuildOptions = {
  /** CSS custom properties injected as :root (active IUI theme). */
  designTokens?: Readonly<Record<string, string>>
  /** Extra base CSS after design tokens, before author css. */
  baseCss?: string
  /**
   * Opaque id echoed in postMessage so the host can filter frames.
   * Required for resize/action bridging.
   */
  frameId?: string
  /** Pack brand for shared-density base CSS (default shadcn). */
  brandId?: string
  /** When true (default), merge sandboxBrandCssVars into design tokens. */
  mergePackTokens?: boolean
  /**
   * When true, omit author JS / expressions from srcdoc (streaming preview).
   * Host should re-build with deferAuthorJs=false once jsComplete.
   */
  deferAuthorJs?: boolean
}

/** Inputs that decide whether the host iframe must rebuild `srcdoc`. */
export type HtmlSandboxSrcdocRebuildInput = {
  parsed: HtmlSandboxSpec | null
  reloadToken: number
  starterOverride: string | null
  forceFinalSrcdoc: boolean
  usedPreviewShell: boolean
  lockedFinal: boolean
}

/**
 * Stable iframe rebuild identity.
 *
 * Streaming growth of html/css/js must NOT change this key — the host
 * patches `#iui-preview-root` / author CSS via postMessage instead of
 * rewriting `srcdoc` (each rewrite flashes a blank document).
 */
export function htmlSandboxSrcdocRebuildKey(input: HtmlSandboxSrcdocRebuildInput): string {
  const { parsed, reloadToken, starterOverride, forceFinalSrcdoc, usedPreviewShell, lockedFinal } = input
  const starterBit = starterOverride ? 's' : ''
  if (!parsed) return `empty|${reloadToken}`
  if (forceFinalSrcdoc || starterOverride || lockedFinal) {
    return `final|${reloadToken}|${starterBit}`
  }
  // Atomic first paint: fence already complete before any preview shell existed.
  if (parsed.jsComplete === true && parsed.partial !== true && !usedPreviewShell) {
    return `final|${reloadToken}|${starterBit}`
  }
  return `preview-shell|${reloadToken}|${starterBit}`
}

/** Host ← sandbox postMessage envelope (source must be `iui-html`). */
export type IuiSandboxHostMessage =
  | { source: 'iui-html'; type: 'resize'; frameId: string; height: number }
  | { source: 'iui-html'; type: 'action'; frameId: string; action: string; payload: Record<string, unknown> }
  | { source: 'iui-html'; type: 'sendPrompt'; frameId: string; text: string }
  | { source: 'iui-html'; type: 'openLink'; frameId: string; url: string }
  /** @deprecated Prefer bridgeReady — kept as handshake alias. Does NOT mean libs/author ready. */
  | { source: 'iui-html'; type: 'ready'; frameId: string }
  | { source: 'iui-html'; type: 'bridgeReady'; frameId: string }
  | { source: 'iui-html'; type: 'libsReady'; frameId: string }
  | { source: 'iui-html'; type: 'authorSettled'; frameId: string; ok: boolean; failedChunks?: number }
  | { source: 'iui-html'; type: 'error'; frameId: string; message: string; kind?: 'author' | 'host'; chunkIndex?: number; chunkTotal?: number }
  | { source: 'iui-html'; type: 'localState'; frameId: string; state: Record<string, unknown> }


/** Host → sandbox postMessage (optional; sandbox listens when bridge present). */
export type IuiSandboxFrameCommand =
  | { source: 'iui-html-host'; type: 'ping'; frameId: string }
  | { source: 'iui-html-host'; type: 'measure'; frameId: string }
  | { source: 'iui-html-host'; type: 'theme'; frameId: string; tokens: Record<string, string> }
  | { source: 'iui-html-host'; type: 'bindings'; frameId: string; values: Record<string, string> }
  | { source: 'iui-html-host'; type: 'appData'; frameId: string; data: Record<string, unknown> }
  | { source: 'iui-html-host'; type: 'previewHtml'; frameId: string; html: string }
  | { source: 'iui-html-host'; type: 'previewCss'; frameId: string; css: string }
  | { source: 'iui-html-host'; type: 'runAuthorJs'; frameId: string; js: string; jsFunctions?: string; jsExpressions?: string[]; jsChunks?: string[]; force?: boolean }
  | { source: 'iui-html-host'; type: 'rerunAuthorJs'; frameId: string }
  | { source: 'iui-html-host'; type: 'restoreLocalState'; frameId: string; state: Record<string, unknown> }

export function isIuiSandboxFrameCommand(data: unknown): data is IuiSandboxFrameCommand {
  if (data === null || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.source !== 'iui-html-host') return false
  if (typeof record.frameId !== 'string' || record.frameId.length === 0) return false
  if (record.type === 'ping' || record.type === 'measure') return true
  if (record.type === 'theme') {
    return typeof record.tokens === 'object' && record.tokens !== null && !Array.isArray(record.tokens)
  }
  if (record.type === 'bindings') {
    return typeof record.values === 'object' && record.values !== null && !Array.isArray(record.values)
  }
  if (record.type === 'appData') {
    return typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data)
  }
  if (record.type === 'previewHtml') {
    // Cap aligned with HTML_SANDBOX_MAX_HTML_BYTES (+ small truncation marker).
    return typeof record.html === 'string' && record.html.length <= 200_064
  }
  if (record.type === 'previewCss') {
    return typeof record.css === 'string' && record.css.length <= 200_064
  }
  if (record.type === 'runAuthorJs') {
    if (typeof record.js !== 'string' || record.js.length > 200_064) return false
    if (record.jsFunctions !== undefined && (typeof record.jsFunctions !== 'string' || record.jsFunctions.length > 200_064)) return false
    if (record.jsExpressions !== undefined) {
      if (!Array.isArray(record.jsExpressions) || record.jsExpressions.length > 64) return false
      if (!record.jsExpressions.every((x) => typeof x === 'string' && x.length <= 32_000)) return false
    }
    if (record.jsChunks !== undefined) {
      if (!Array.isArray(record.jsChunks) || record.jsChunks.length > 256) return false
      if (!record.jsChunks.every((x) => typeof x === 'string' && x.length <= 200_064)) return false
    }
    if (record.force !== undefined && typeof record.force !== 'boolean') return false
    return true
  }
  if (record.type === 'rerunAuthorJs') return true
  if (record.type === 'restoreLocalState') {
    return typeof record.state === 'object' && record.state !== null && !Array.isArray(record.state)
  }
  return false
}

export function isIuiSandboxHostMessage(data: unknown): data is IuiSandboxHostMessage {
  if (data === null || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.source !== 'iui-html') return false
  if (typeof record.frameId !== 'string' || record.frameId.length === 0) return false
  if (record.type === 'resize') {
    return typeof record.height === 'number' && Number.isFinite(record.height)
  }
  if (record.type === 'action') {
    return typeof record.action === 'string'
      && (record.payload === undefined
        || (typeof record.payload === 'object' && record.payload !== null && !Array.isArray(record.payload)))
  }
  if (record.type === 'sendPrompt') {
    return typeof record.text === 'string' && record.text.trim().length > 0 && record.text.length <= 8000
  }
  if (record.type === 'openLink') {
    return typeof record.url === 'string' && record.url.length > 0 && record.url.length <= 2000
  }
  if (record.type === 'ready' || record.type === 'bridgeReady' || record.type === 'libsReady') return true
  if (record.type === 'authorSettled') {
    return typeof record.ok === 'boolean'
  }
  if (record.type === 'error') {
    if (typeof record.message !== 'string') return false
    if (record.kind !== undefined && record.kind !== 'author' && record.kind !== 'host') return false
    if (record.chunkIndex !== undefined && typeof record.chunkIndex !== 'number') return false
    if (record.chunkTotal !== undefined && typeof record.chunkTotal !== 'number') return false
    return true
  }
  if (record.type === 'localState') {
    return typeof record.state === 'object' && record.state !== null && !Array.isArray(record.state)
  }
  return false
}

const SECTION_HEADER = /^(?:---\s*)?(css|html|js)\s*$/iu

function hostAllowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
    const host = parsed.hostname.toLowerCase()
    return HTML_SANDBOX_CDN_ALLOWLIST.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    )
  } catch {
    return false
  }
}


/** HTTPS (or mailto) only — used by openLink bridge. */
export function isAllowedSandboxOpenUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'mailto:') return true
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
    return true
  } catch {
    return false
  }
}

/** Max author CSS / JS bytes kept in srcdoc (defence in depth). */
export const HTML_SANDBOX_MAX_AUTHOR_BYTES = 48_000
/** Max author HTML bytes kept in srcdoc. */
export const HTML_SANDBOX_MAX_HTML_BYTES = 200_000
/** Soft ceiling for entire srcdoc (warn/truncate author assets earlier). */
export const HTML_SANDBOX_MAX_SRCDOC_BYTES = 500_000

/** Rewrite blocked OSM.org raster URLs to the sandbox default tile endpoint. */
export function rewriteBlockedMapTileUrls(source: string): string {
  let out = source
    .replace(
      /https:\/\/\{s\}\.tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/gi,
      IUI_DEFAULT_MAP_TILE_URL,
    )
    .replace(
      /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/gi,
      IUI_DEFAULT_MAP_TILE_URL,
    )
  // CartoCDN now serves API-KEY watermark tiles — strip any carto raster URL.
  out = out.replace(/https:\/\/\{s\}\.basemaps\.cartocdn\.com\/[^\s'"\`)]+/gi, IUI_DEFAULT_MAP_TILE_URL)
  out = out.replace(/https:\/\/[a-d]\.basemaps\.cartocdn\.com\/[^\s'"\`)]+/gi, IUI_DEFAULT_MAP_TILE_URL)
  out = out.replace(/https:\/\/basemaps\.cartocdn\.com\/[^\s'"\`)]+/gi, IUI_DEFAULT_MAP_TILE_URL)
  return out
}

/**
 * Soft-harden model-authored JS before eval in the sandbox.
 * Fixes the long-tail SyntaxErrors we can heal without a full parser:
 * smart quotes, BOM/control chars, `</script>` breakout, lightly unbalanced braces.
 * Does NOT claim to fix arbitrary broken model JS.
 */
export function hardenAuthorJs(source: string): string {
  if (!source) return source
  let out = source
    .replace(/^\uFEFF/, '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    // Keep \t \n \r; strip other C0 controls that break parsers.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/script/gi, '<\\/script')
  // Soft-fix model typos BEFORE paren/brace balancing so we don't insert an extra `)`.
  out = out.replace(
    /\b(var|let|const)\s+([A-Za-z_$][\w$]*)\s+([A-Za-z_$][\w$]*)\s*(=)/g,
    '$1 $3 $4',
  )
  out = softFixArrayCallbackParens(out)
  // Soft-close truncated objects/arrays/parens (common when model cuts mid-fence).
  const opens = { '{': 0, '[': 0, '(': 0 }
  const excess = { '{': 0, '[': 0, '(': 0 }
  let inStr: '"' | "'" | '`' | null = null
  let escape = false
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]!
    if (inStr) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '{') opens['{']++
    else if (ch === '}') {
      if (opens['{'] > 0) opens['{']--
      else excess['{']++
    } else if (ch === '[') opens['[']++
    else if (ch === ']') {
      if (opens['['] > 0) opens['[']--
      else excess['[']++
    } else if (ch === '(') opens['(']++
    else if (ch === ')') {
      if (opens['('] > 0) opens['(']--
      else excess['(']++
    }
  }
  if (opens['('] > 0 && opens['('] <= 4) out += ')'.repeat(opens['('])
  if (opens['['] > 0 && opens['['] <= 4) out += ']'.repeat(opens['['])
  if (opens['{'] > 0 && opens['{'] <= 4) out += '}'.repeat(opens['{'])
  // Peel extra Chart `}` first, then drop any remaining depth-0 closers.
  out = softRepairSyntax(out)
  out = softTrimExcessClosers(out, excess)
  // Soft-strip invalid RegExp flags (common model typo → "Invalid regular expression flags").
  out = sanitizeAuthorRegexFlags(out)
  return out
}

/** Peel `}` immediately before `)` until `new Function` accepts (extra Chart-options brace). */
export function softRepairSyntax(source: string): string {
  if (!source) return source
  const ok = (src: string): boolean => {
    try {
      // Host-side prepareAuthorJs only.
      // eslint-disable-next-line no-new-func
      new Function(src)
      return true
    } catch {
      return false
    }
  }
  if (ok(source)) return source
  // Prefer peeling later runs first (first Chart block is often correctly braced).
  const re = /\}\}\}\}+(?=\s*\))/g
  const sites: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) sites.push(m.index)
  for (let n = 0; n < sites.length; n++) {
    const at = sites[sites.length - 1 - n]!
    let end = at
    while (end < source.length && source[end] === '}') end++
    const candidate = source.slice(0, end - 1) + source.slice(end)
    if (ok(candidate)) return candidate
  }
  return source
}

/** Drop closers that fire while depth is already 0 (cap so we don't erase whole files). */
export function softTrimExcessClosers(
  source: string,
  _excess?: { '{': number; '[': number; '(': number },
): string {
  if (!source) return source
  // Drop closers that fire while depth is already 0 (cap so we don't erase whole files).
  let skipBrace = 4, skipBracket = 4, skipParen = 4
  let out = ''
  let depthB = 0, depthK = 0, depthP = 0
  let inStr: '"' | "'" | '`' | null = null
  let escape = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    if (inStr) {
      out += ch
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; out += ch; continue }
    if (ch === '{') { depthB++; out += ch; continue }
    if (ch === '}') {
      if (depthB === 0) { if (skipBrace > 0) skipBrace--; continue }
      depthB--
      out += ch
      continue
    }
    if (ch === '[') { depthK++; out += ch; continue }
    if (ch === ']') {
      if (depthK === 0) { if (skipBracket > 0) skipBracket--; continue }
      depthK--
      out += ch
      continue
    }
    if (ch === '(') { depthP++; out += ch; continue }
    if (ch === ')') {
      if (depthP === 0) { if (skipParen > 0) skipParen--; continue }
      depthP--
      out += ch
      continue
    }
    out += ch
  }
  return out
}

/**
 * Models often write `arr.forEach(function (x) { ... };` (close with `};` instead of `});`).
 * Insert the missing `)` before `;` when an array-callback call is left open.
 */
export function softFixArrayCallbackParens(source: string): string {
  if (!source) return source
  const re = /\.(forEach|map|filter|some|every|find|findIndex|reduce|reduceRight|flatMap)\s*\(\s*function\b/g
  let out = source
  let match: RegExpExecArray | null
  const inserts: number[] = []
  while ((match = re.exec(source)) !== null) {
    // Walk from after `function` to find function body close, then expect `)` before `;`.
    let i = match.index + match[0].length
    // skip optional name
    while (i < source.length && /\s/.test(source[i]!)) i++
    if (/[A-Za-z_$]/.test(source[i]!)) {
      while (i < source.length && /[\w$]/.test(source[i]!)) i++
    }
    while (i < source.length && /\s/.test(source[i]!)) i++
    if (source[i] !== '(') continue
    // skip params
    let depth = 0
    let inStr: '"' | "'" | '`' | null = null
    let escape = false
    for (; i < source.length; i++) {
      const ch = source[i]!
      if (inStr) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === inStr) inStr = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) { i++; break }
      }
    }
    while (i < source.length && /\s/.test(source[i]!)) i++
    if (source[i] !== '{') continue
    // walk function body
    depth = 0
    inStr = null
    escape = false
    for (; i < source.length; i++) {
      const ch = source[i]!
      if (inStr) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === inStr) inStr = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { i++; break }
      }
    }
    while (i < source.length && /\s/.test(source[i]!)) i++
    // Expected `)` to close .forEach( — if we see `;` or another statement start, insert `)`.
    if (source[i] === ')') continue
    if (source[i] === ';' || source[i] === '}' || source[i] === '\n') {
      inserts.push(i)
    }
  }
  if (inserts.length === 0) return out
  // apply from end
  for (let k = inserts.length - 1; k >= 0; k--) {
    const at = inserts[k]!
    out = out.slice(0, at) + ')' + out.slice(at)
  }
  return out
}

/** Keep only gimsuy flags on .match/.replace/.split/.search/.test(/.../flags) and new RegExp(..., 'flags'). */
export function sanitizeAuthorRegexFlags(source: string): string {
  if (!source) return source
  let out = source.replace(
    /(\.(?:match|replace|split|search|test)\s*\(\s*)\/((?:\\.|[^\\\/\n])+)\/([a-zA-Z]*)/g,
    (_m, prefix: string, body: string, flags: string) => {
      const valid = flags.replace(/[^gimsuy]/gi, '')
      return `${prefix}/${body}/${valid}`
    },
  )
  out = out.replace(
    /new\s+RegExp\s*\((['"\`])([\s\S]*?)\1\s*,\s*(['"\`])([a-zA-Z]*)\3\s*\)/g,
    (_m, q1: string, body: string, q2: string, flags: string) => {
      const valid = flags.replace(/[^gimsuy]/gi, '')
      return `new RegExp(${q1}${body}${q1}, ${q2}${valid}${q2})`
    },
  )
  return out
}

/**
 * Rewrite ESM `import('chart.js')` to the host-injected UMD global.
 * esm.sh chart imports are flaky in null-origin srcdoc → blank weather canvases.
 */
export function rewriteChartEsmImports(source: string): string {
  if (!source) return source
  return source.replace(
    /import\s*\(\s*['"]chart\.js(?:\/auto)?['"]\s*\)/g,
    'Promise.resolve(window.__iuiChartMod||{Chart:window.Chart,default:window.Chart,registerables:[]})',
  )
}

/** Apply all author-JS rewrites used before sandbox eval. */
export function prepareAuthorJs(source: string): string {
  return hardenAuthorJs(rewriteChartEsmImports(rewriteBlockedMapTileUrls(source)))
}


/** Strip dangerous CSS constructs (@import, expression, javascript urls). */
export function sanitizeSandboxCss(css: string): string {
  return css
    .replace(/@import\b[^;\n]*/gi, '/* blocked import */')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/url\s*\(\s*[\'"]?\s*(?:javascript|vbscript|data)\s*:/gi, 'url(blocked:')
    .replace(/-moz-binding\s*:/gi, '/* blocked binding */:')
    .replace(/behavior\s*:/gi, '/* blocked behavior */:')
}

function truncateAuthor(source: string, kind: 'css' | 'js' | 'html'): string {
  const limit = kind === 'html' ? HTML_SANDBOX_MAX_HTML_BYTES : HTML_SANDBOX_MAX_AUTHOR_BYTES
  if (source.length <= limit) return source
  const cut = source.slice(0, limit)
  if (kind === 'css') return `${cut}\n/* css truncated */`
  if (kind === 'js') return `${cut}\n/* js truncated */`
  return `${cut}\n<!-- html truncated -->`
}

function truncationBanner(parts: Array<'css' | 'js' | 'html'>): string {
  if (parts.length === 0) return ''
  const label = parts.join('+')
  return `<pre class="iui-sandbox-muted" data-iui-error="1">资源过大已截断（${label}）。请缩小页面后再试。</pre>`
}

/** Strip disallowed external resources and inline event handlers. */
export function sanitizeSandboxMarkup(html: string): string {
  return html
    .replace(/\\p>/g, '<p>')
    .replace(/(?<=[>\n])\\(?=\s)/g, '') // stray model backslash junk
    .replace(/\\n(?=\s|[\u4e00-\u9fff])/g, '') // visible '\\n' leaked into text
    // Keep simple author handlers (fn / fn() / fn(event)) as data-iui-on-* for bridge delegation.
    // Anything else (alert(1), inline statements) is still stripped below.
    .replace(
      /\s+on(click|change|input|submit)\s*=\s*(["'])\s*([A-Za-z_$][\w$]*)\s*(?:\(\s*(?:event|ev|e)?\s*\))?\s*\2/gi,
      (_full, evt: string, _q: string, fn: string) => ` data-iui-on-${String(evt).toLowerCase()}="${fn}"`,
    )
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<base\b[^>]*>/gi, '<!-- blocked base -->')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '<!-- blocked meta -->')
    .replace(/<form\b([^>]*)>/gi, (full, attrs: string) => {
      const action = /\baction\s*=\s*["']([^"']+)["']/i.exec(attrs)
      if (!action) return full
      const value = action[1]!.trim()
      if (value === '' || value.startsWith('#') || value.startsWith('?')) return full
      try {
        const url = new URL(value, 'https://sandbox.invalid')
        if (url.protocol === 'https:' && hostAllowed(url.href)) return full
      } catch { /* fall through */ }
      return full.replace(action[0]!, 'action="#" data-blocked-action=""')
        .replace(/^<form/, '<!-- blocked form action --><form')
    })
    // P1-6: strip inline <script> bodies; only allowlisted external src survives.
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_full, attrs: string) => {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)
      if (!src) return '<!-- blocked inline script -->'
      if (!hostAllowed(src[1]!)) return '<!-- blocked script src -->'
      return `<script src="${src[1]}"><\/script>`
    })
    .replace(/<script\b([^>]*)\/?>/gi, (full, attrs: string) => {
      if (/\/\s*>$/i.test(full) || !/\bsrc\s*=/i.test(attrs)) {
        const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)
        if (!src) return '<!-- blocked inline script -->'
        if (!hostAllowed(src[1]!)) return '<!-- blocked script src -->'
      }
      return full
    })
    .replace(/<\/?iframe\b[^>]*>/gi, '<!-- blocked iframe -->')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '<!-- blocked object -->')
    .replace(/<embed\b[^>]*>/gi, '<!-- blocked embed -->')
    .replace(/<link\b([^>]*)>/gi, (full, attrs: string) => {
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)
      if (href && /rel\s*=\s*["'][^"']*stylesheet/i.test(attrs) && !hostAllowed(href[1]!)) {
        return '<!-- blocked stylesheet -->'
      }
      return full
    })
    .replace(/\b(?:href|src)\s*=\s*["']\s*(?:javascript|data|vbscript):[^"']*["']/gi, 'data-blocked=""')
}

function parseSections(raw: string): {
  sections: Record<'css' | 'html' | 'js', string>
  stages: Array<'css' | 'html' | 'js'>
  sawHeader: boolean
} {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const sections: Record<'css' | 'html' | 'js', string> = { css: '', html: '', js: '' }
  const stages: Array<'css' | 'html' | 'js'> = []
  let current: 'css' | 'html' | 'js' | null = null
  const buf: string[] = []
  let sawHeader = false
  const flush = () => {
    if (current === null) return
    sections[current] = buf.join('\n').trim()
    buf.length = 0
  }
  for (const line of lines) {
    const header = SECTION_HEADER.exec(line.trim())
    if (header) {
      flush()
      current = header[1]!.toLowerCase() as 'css' | 'html' | 'js'
      if (!stages.includes(current)) stages.push(current)
      sawHeader = true
      continue
    }
    if (current !== null) buf.push(line)
  }
  flush()
  return { sections, stages, sawHeader }
}

function looksPartialJson(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return false
  try {
    JSON.parse(repairLooseJsonStrings(trimmed))
    return false
  } catch {
    return true
  }
}

function extractPartialJsonFields(raw: string): Partial<Record<'css' | 'html' | 'js' | 'title' | 'placeholder' | 'jsFunctions', string>> & { height?: number; jsExpressions?: string[] } {
  const out: Partial<Record<'css' | 'html' | 'js' | 'title' | 'placeholder' | 'jsFunctions', string>> & { height?: number; jsExpressions?: string[] } = {}
  for (const key of ['css', 'html', 'js', 'title', 'placeholder', 'jsFunctions'] as const) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'u')
    const match = re.exec(raw)
    if (match) {
      try {
        out[key] = JSON.parse(`"${match[1]}"`) as string
      } catch {
        out[key] = match[1]!.replace(/\\n/g, '\n').replace(/\\"/g, '"')
      }
    }
  }
  const heightMatch = /"height"\s*:\s*(\d+)/u.exec(raw)
  if (heightMatch) {
    const n = Number(heightMatch[1])
    if (Number.isFinite(n)) out.height = n
  }
  return out
}

/**
 * Parse fence body: prefer JSON `{css,html,js,title?,height?}`; else
 * section markers `css` / `html` / `js` (optional `---` prefix); else bare HTML.
 * Tolerates streaming partial JSON / unfinished sections.
 */

/** Escape raw newlines/tabs/control chars inside JSON string literals (models often emit them). */
function repairLooseJsonStrings(text: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (escape) {
      out += ch
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') {
        out += ch
        escape = true
        continue
      }
      if (ch === '"') {
        out += ch
        inString = false
        continue
      }
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
      const code = ch.charCodeAt(0)
      if (code < 32) {
        out += '\\u' + code.toString(16).padStart(4, '0')
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    out += ch
  }
  return out
}

/** Strip trailing junk after a complete JSON object (e.g. leaked `</arg_value></tool_call>`). */
function stripTrailingJunk(text: string): string {
  if (!text.startsWith('{')) return text
  const repaired = repairLooseJsonStrings(text)
  try { JSON.parse(repaired); return repaired } catch { /* try trimming */ }
  let end = repaired.lastIndexOf('}')
  for (let tries = 0; end > 0 && tries < 8; tries++) {
    const candidate = repaired.slice(0, end + 1)
    try { JSON.parse(candidate); return candidate } catch { end = repaired.lastIndexOf('}', end - 1) }
  }
  return repaired
}

export function parseHtmlSandboxFence(raw: string): HtmlSandboxSpec | null {
  const trimmed = stripTrailingJunk(raw.trim())
  if (trimmed.length === 0) return null

  if (trimmed.startsWith('{')) {
    if (looksPartialJson(trimmed)) {
      const partial = extractPartialJsonFields(trimmed)
      const css = partial.css ?? ''
      const html = partial.html ?? ''
      const js = partial.js ?? ''
      if (css === '' && html === '' && js === '') return null
      const stages: Array<'css' | 'html' | 'js' | 'placeholder'> = []
      if (partial.placeholder) stages.push('placeholder')
      if (css) stages.push('css')
      if (html) stages.push('html')
      if (js || partial.jsFunctions) stages.push('js')
      const height = typeof partial.height === 'number' && Number.isFinite(partial.height)
        ? Math.min(1200, Math.max(120, Math.round(partial.height)))
        : undefined
      return {
        css,
        html,
        js,
        stages,
        partial: true,
        cssComplete: css.length > 0,
        htmlComplete: false,
        jsComplete: false,
        ...(typeof partial.placeholder === 'string' ? { placeholder: partial.placeholder } : {}),
        ...(typeof partial.jsFunctions === 'string' ? { jsFunctions: partial.jsFunctions } : {}),
        ...(typeof partial.title === 'string' ? { title: partial.title } : {}),
        ...(height !== undefined ? { height } : {}),
      }
    }
    try {
      const parsed = JSON.parse(repairLooseJsonStrings(trimmed)) as Record<string, unknown>
      const html = typeof parsed.html === 'string' ? parsed.html : ''
      const css = typeof parsed.css === 'string' ? parsed.css : ''
      const js = typeof parsed.js === 'string' ? parsed.js : ''
      const placeholder = typeof parsed.placeholder === 'string' ? parsed.placeholder
        : typeof parsed.placeholderMessages === 'string' ? parsed.placeholderMessages
        : Array.isArray(parsed.placeholderMessages) ? parsed.placeholderMessages.map(String).join(' · ')
        : undefined
      const jsFunctions = typeof parsed.jsFunctions === 'string' ? parsed.jsFunctions : undefined
      const jsExpressions = Array.isArray(parsed.jsExpressions)
        ? parsed.jsExpressions.filter((x): x is string => typeof x === 'string').slice(0, 64)
        : undefined
      if (html.trim() === '' && css.trim() === '' && js.trim() === '' && !jsFunctions && !(jsExpressions && jsExpressions.length)) return null
      const stages: Array<'css' | 'html' | 'js' | 'placeholder'> = []
      if (placeholder && placeholder.trim()) stages.push('placeholder')
      if (css.trim()) stages.push('css')
      if (html.trim()) stages.push('html')
      if (js.trim() || jsFunctions || (jsExpressions && jsExpressions.length)) stages.push('js')
      const height = typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? Math.min(1200, Math.max(120, Math.round(parsed.height)))
        : undefined
      return {
        css,
        html,
        js,
        stages,
        partial: false,
        cssComplete: true,
        htmlComplete: true,
        jsComplete: true,
        ...(placeholder && placeholder.trim() ? { placeholder: placeholder.trim() } : {}),
        ...(jsFunctions ? { jsFunctions } : {}),
        ...(jsExpressions && jsExpressions.length ? { jsExpressions } : {}),
        ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
        ...(height !== undefined ? { height } : {}),
      }
    } catch {
      // fall through
    }
  }

  const { sections, stages, sawHeader } = parseSections(trimmed)
  if (sawHeader) {
    if (sections.html === '' && sections.css === '' && sections.js === '') return null
    const partial = stages.length > 0 && (!stages.includes('html') || sections.html === '')
    return {
      css: sections.css,
      html: sections.html,
      js: sections.js,
      stages,
      partial,
      cssComplete: stages.includes('css') || sections.css !== '',
      htmlComplete: !partial && stages.includes('html'),
      jsComplete: !partial,
    }
  }

  return {
    css: '',
    html: sanitizeSandboxMarkup(trimmed),
    js: '',
    stages: ['html'],
    partial: false,
    cssComplete: true,
    htmlComplete: true,
    jsComplete: true,
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ))
}

function tokensToCss(tokens: Readonly<Record<string, string>> | undefined): string {
  if (!tokens) return ''
  const lines: string[] = []
  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith('--')) continue
    if (typeof value !== 'string' || value.includes(';') || value.includes('}')) continue
    lines.push(`  ${key}: ${value};`)
  }
  if (lines.length === 0) return ''
  return `:root{\n${lines.join('\n')}\n}\n`
}

/**
 * Shared-density base CSS for ```iui-html — values come from IUI_TOKEN_CATALOG
 * (and optional pack brand accent). No hard-coded px islands at call sites.
 */
export function buildSandboxBaseCss(
  brandId: string = 'sandbox',
): string {
  const d = IUI_TOKEN_CATALOG.density
  const e = IUI_TOKEN_CATALOG.elevation
  const m = IUI_TOKEN_CATALOG.motion
  const vars = sandboxBrandCssVars(brandId)
  const accent = vars['--iui-pack-accent'] ?? '#18181b'
  // Surfaces are seeded by sandboxBrandCssVars (derived from accent) — CSS only references vars.
  return `
:root{${cssVarsToInline(vars)}}
html,body{margin:0;padding:4px;font:${d.fontSize}/${d.lineHeight} ${vars['--iui-pack-font-family'] ?? 'system-ui,sans-serif'};color:var(--iui-pack-fg,var(--dsl-g-fg));background:transparent;letter-spacing:${d.letterSpacing};-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
button,input,select,textarea{font:inherit}
button{cursor:pointer;border-radius:var(--iui-pack-radius-control,${d.radiusControl});border:1px solid color-mix(in srgb,var(--iui-pack-accent,${accent}) 35%,var(--iui-pack-border));background:var(--iui-pack-accent,${accent});color:var(--iui-pack-on-accent,#fff);padding:8px 12px;min-height:var(--iui-pack-control-h,${d.controlHeight});font-weight:600;transition:transform var(--iui-pack-hover-ms,${m.hoverMs}ms) var(--iui-pack-ease,${m.ease}),box-shadow var(--iui-pack-hover-ms,${m.hoverMs}ms) ease}
button:hover{transform:translateY(-1px);box-shadow:var(--iui-pack-elev-2,${e[2]})}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
button.secondary{background:var(--iui-pack-surface);color:var(--iui-pack-accent,${accent});border-color:var(--iui-pack-border)}
input,select,textarea{border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius-control,${d.radiusControl});padding:8px 10px;min-height:var(--iui-pack-control-h,${d.controlHeight});width:100%;background:var(--iui-pack-surface);color:var(--iui-pack-fg);outline:none}
input:focus,select:focus,textarea:focus{border-color:color-mix(in srgb,var(--iui-pack-accent,${accent}) 55%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--iui-pack-accent,${accent}) 28%,transparent)}
a{color:var(--iui-pack-accent,${accent})}
.iui-sandbox-card{border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius,${d.radius});padding:var(--iui-pack-pad,${d.pad});background:var(--iui-pack-surface);box-shadow:var(--iui-pack-elev,${e[1]})}
.iui-sandbox-muted{color:var(--iui-pack-muted-fg);font-size:var(--iui-pack-font-sm,${d.fontSizeSm})}
.iui-sandbox-toolbar{display:flex;gap:var(--iui-pack-gap-sm,${d.gapSm});flex-wrap:wrap;margin-bottom:var(--iui-pack-gap,${d.gap});align-items:center}
.iui-sandbox-grid{display:grid;gap:var(--iui-pack-gap,${d.gap});grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.iui-sandbox-kpi{padding:var(--iui-pack-pad,${d.pad});border-radius:var(--iui-pack-radius-sm,${d.radiusSm});border:1px solid var(--iui-pack-border);background:var(--iui-pack-surface);box-shadow:var(--iui-pack-elev,${e[1]})}
.iui-sandbox-kpi .label{font-size:var(--iui-pack-font-sm,${d.fontSizeSm});color:var(--iui-pack-muted-fg)}
.iui-sandbox-kpi .value{font-size:var(--iui-pack-font-stat,${d.fontStat});font-weight:700;letter-spacing:-0.02em;color:var(--iui-pack-fg)}
.iui-sandbox-compare{display:grid;gap:var(--iui-pack-gap,${d.gap});grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.iui-sandbox-tabs{display:flex;flex-direction:column;gap:var(--iui-pack-gap,${d.gap})}
.iui-sandbox-tabbar{display:inline-flex;gap:var(--iui-pack-gap-xs,${d.gapXs});padding:var(--iui-pack-gap-xs,${d.gapXs});border-radius:var(--iui-pack-segment-radius,999px);background:var(--iui-pack-surface-muted);align-self:flex-start}
.iui-sandbox-tab{appearance:none;border:none;background:transparent;padding:6px 12px;border-radius:var(--iui-pack-segment-radius,999px);font:inherit;font-size:var(--iui-pack-font,${d.fontSize});cursor:pointer;color:var(--iui-pack-muted-fg);min-height:auto}
.iui-sandbox-tab[aria-selected="true"]{background:var(--iui-pack-surface);color:var(--iui-pack-accent,${accent});box-shadow:var(--iui-pack-elev,${e[1]});font-weight:600}
.iui-sandbox-stage{display:none}
.iui-sandbox-stage[data-active="1"]{display:block}
/* Polished defaults for raw elements so un-styled model markup never looks like a default browser page */
:root{--iui-chart-1:#3b82f6;--iui-chart-2:#10b981;--iui-chart-3:#f59e0b;--iui-chart-4:#ef4444;--iui-chart-5:#8b5cf6;--iui-chart-6:#06b6d4}
h1,h2,h3,h4{margin:0 0 8px;line-height:1.25;letter-spacing:-0.015em;color:var(--iui-pack-fg)}
h1{font-size:22px;font-weight:750}h2{font-size:18px;font-weight:700}h3{font-size:15px;font-weight:650}h4{font-size:13px;font-weight:650;color:var(--iui-pack-muted-fg)}
p{margin:0 0 8px}small{color:var(--iui-pack-muted-fg)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;border:1px solid var(--iui-pack-border);border-radius:12px;overflow:hidden}
th{text-align:left;font-weight:600;color:var(--iui-pack-muted-fg);background:var(--iui-pack-surface-muted);padding:8px 12px}
td{padding:8px 12px;border-top:1px solid var(--iui-pack-border)}
canvas,svg,img{max-width:100%}
.iui-sandbox-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px}
button.ghost,.iui-sandbox-btn.ghost{background:transparent;color:var(--iui-pack-fg);border-color:var(--iui-pack-border)}
button.ghost:hover{background:var(--iui-pack-surface-muted)}
.iui-sandbox-stack{display:flex;flex-direction:column;gap:var(--iui-pack-gap,${d.gap})}
.iui-sandbox-row{display:flex;gap:var(--iui-pack-gap-sm,${d.gapSm});align-items:center;flex-wrap:wrap}
.iui-sandbox-title{font-size:18px;font-weight:700;letter-spacing:-0.015em;margin:0}
.iui-sandbox-sub{font-size:13px;color:var(--iui-pack-muted-fg);margin:2px 0 0}
/* Design-system kit (token-driven primitives for iui-html authors) */
.iui-sandbox-field{display:flex;flex-direction:column;gap:var(--iui-pack-gap-xs,${d.gapXs})}
.iui-sandbox-label{font-size:var(--iui-pack-font-sm,${d.fontSizeSm});color:var(--iui-pack-muted-fg);font-weight:500}
.iui-sandbox-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--iui-pack-segment-radius,999px);font-size:11px;font-weight:650;background:var(--iui-pack-tint);color:var(--iui-pack-accent,${accent});border:1px solid color-mix(in srgb,var(--iui-pack-accent,${accent}) 22%,transparent)}
.iui-sandbox-badge.warn{background:color-mix(in srgb,var(--iui-pack-warn) 16%,transparent);color:var(--iui-pack-warn);border-color:color-mix(in srgb,var(--iui-pack-warn) 28%,transparent)}
.iui-sandbox-badge.danger{background:color-mix(in srgb,var(--iui-pack-danger) 14%,transparent);color:var(--iui-pack-danger);border-color:color-mix(in srgb,var(--iui-pack-danger) 28%,transparent)}
.iui-sandbox-alert{padding:var(--iui-pack-pad-sm,${d.padSm});border-radius:var(--iui-pack-radius-sm,${d.radiusSm});border:1px solid var(--iui-pack-border);background:var(--iui-pack-surface-muted);color:var(--iui-pack-fg);font-size:var(--iui-pack-font,${d.fontSize})}
.iui-sandbox-alert.ok{border-color:color-mix(in srgb,var(--iui-pack-ok) 35%,transparent);background:color-mix(in srgb,var(--iui-pack-ok) 10%,transparent)}
.iui-sandbox-alert.warn{border-color:color-mix(in srgb,var(--iui-pack-warn) 35%,transparent);background:color-mix(in srgb,var(--iui-pack-warn) 12%,transparent)}
.iui-sandbox-alert.danger{border-color:color-mix(in srgb,var(--iui-pack-danger) 35%,transparent);background:color-mix(in srgb,var(--iui-pack-danger) 10%,transparent)}
.iui-sandbox-divider{height:1px;background:var(--iui-pack-border);border:0;margin:var(--iui-pack-gap,${d.gap}) 0}
.iui-sandbox-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--iui-pack-gap-sm,${d.gapSm})}
.iui-sandbox-list li{display:flex;gap:var(--iui-pack-gap-sm,${d.gapSm});align-items:flex-start;padding:var(--iui-pack-pad-sm,${d.padSm});border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius-sm,${d.radiusSm});background:var(--iui-pack-surface)}
.iui-sandbox-hero{padding:var(--iui-pack-pad,${d.pad});border-radius:var(--iui-pack-radius,${d.radius});background:linear-gradient(135deg,var(--iui-pack-hero-from),var(--iui-pack-hero-to));border:1px solid var(--iui-pack-border);box-shadow:var(--iui-pack-elev,${e[1]})}
.iui-sandbox-hero .title{font-size:var(--iui-pack-font-stat,${d.fontStat});font-weight:750;letter-spacing:-0.02em;margin:0}
.iui-sandbox-hero .sub{color:var(--iui-pack-muted-fg);font-size:var(--iui-pack-font-sm,${d.fontSizeSm});margin:4px 0 0}
[data-iui-error]{color:var(--iui-pack-danger);white-space:pre-wrap;background:color-mix(in srgb,var(--iui-pack-danger) 8%,transparent);border:1px solid color-mix(in srgb,var(--iui-pack-danger) 28%,transparent);border-radius:var(--iui-pack-radius-control,${d.radiusControl});padding:8px 10px}
.iui-sandbox-skeleton{display:flex;flex-direction:column;gap:var(--iui-pack-gap-sm,${d.gapSm});padding:var(--iui-pack-pad,${d.pad})}
.iui-sandbox-skeleton .bar{height:10px;border-radius:999px;background:linear-gradient(90deg,var(--iui-pack-surface-muted),var(--iui-pack-border),var(--iui-pack-surface-muted));background-size:200% 100%;animation:iuiSandSk 1.2s ease infinite}
@keyframes iuiSandSk{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.iui-sandbox-skeleton .bar{animation:none}}
@media (prefers-color-scheme:dark){
  :root{
    --iui-pack-surface:var(--iui-pack-surface-dark);
    --iui-pack-surface-muted:var(--iui-pack-surface-muted-dark);
    --iui-pack-fg:var(--iui-pack-fg-dark);
    --iui-pack-muted-fg:var(--iui-pack-muted-fg-dark);
    --iui-pack-border:var(--iui-pack-border-dark);
    --dsl-g-fg:var(--iui-pack-fg-dark);
    --dsl-g-bg:var(--iui-pack-surface-dark);
    --dsl-g-surface:var(--iui-pack-surface-dark);
  }
}
`.trim()
}


/** Merge host theme tokens with shared pack brand density (host wins on conflict). */
export function mergeSandboxDesignTokens(
  hostTokens?: Readonly<Record<string, string>>,
  brandId: string = 'sandbox',
): Record<string, string> {
  const base = sandboxBrandCssVars(brandId)
  const catalog = tokenCatalogToCssVars(IUI_TOKEN_CATALOG)
  return { ...catalog, ...base, ...(hostTokens ?? {}) }
}

/** Bridge: resize + action postMessage (no allow-same-origin). */
export function buildSandboxBridgeScript(frameId: string): string {
  const idLiteral = JSON.stringify(frameId)
  return `<script>
(function () {
  var FRAME_ID = ${idLiteral};
  window.__iuiFrameId = FRAME_ID;
` + buildAuthorJsRuntimeSource() + `
  function post(msg) {
    try { parent.postMessage(Object.assign({ source: 'iui-html', frameId: FRAME_ID }, msg), '*'); } catch (e) {}
  }
  function measure() {
    var doc = document.documentElement;
    var body = document.body;
    // Content height (not viewport): bottom of the lowest rendered child + body padding,
    // so frames shrink to fit and 100vh layouts cannot feed back into growth.
    var bottom = 0;
    if (body) {
      for (var i = 0; i < body.children.length; i++) {
        var ch = body.children[i];
        if (ch.tagName === 'SCRIPT' || ch.tagName === 'STYLE') continue;
        var rect = ch.getBoundingClientRect();
        var mb = parseFloat(getComputedStyle(ch).marginBottom) || 0;
        if (rect.height > 0) bottom = Math.max(bottom, rect.bottom + window.scrollY + mb);
      }
      bottom += parseFloat(getComputedStyle(body).paddingBottom) || 0;
    }
    var h = Math.max(bottom || (body ? body.scrollHeight : 0), 120);
    post({ type: 'resize', height: Math.min(2400, Math.ceil(h)) });
  }
  // Opaque-origin sandbox: Web Storage throws. Give author code an in-memory shim.
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var ok = false;
    try { ok = !!window[name]; } catch (e) { ok = false; }
    if (ok) return;
    var store = {};
    var mem = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = {}; },
      key: function (i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
    try { Object.defineProperty(window, name, { value: mem, configurable: true }); } catch (e) {}
  });
  window.__iuiBindings = window.__iuiBindings || {};
  window.__iuiAppData = window.__iuiAppData || {};
  window.iuiSandbox = {
    resize: measure,
    get bindings() { return window.__iuiBindings || {}; },
    get appData() { return window.__iuiAppData || {}; },
    action: function (name, payload) {
      var data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      post({ type: 'action', action: String(name || ''), payload: data });
    },
    sendPrompt: function (text) {
      var t = String(text || '').trim();
      if (!t) return;
      post({ type: 'sendPrompt', text: t.slice(0, 8000) });
    },
    openLink: function (url) {
      var u = String(url || '').trim();
      if (!u) return;
      post({ type: 'openLink', url: u.slice(0, 2000) });
    },
    reportError: function (err, kind) {
      post({ type: 'error', message: String(err && err.message ? err.message : err), kind: kind === 'host' ? 'host' : 'author' });
    },
    rerunAuthorJs: function () {
      var pipe = window.__iuiAuthorPipeline;
      if (pipe && typeof pipe.rerunAuthorJs === 'function') return pipe.rerunAuthorJs();
      post({ type: 'error', message: 'author pipeline missing', kind: 'host' });
      return false;
    },
    /** After author JS rebuilds DOM (filter/tab/innerHTML): refill photos, remap pins, resize charts/maps. */
    afterDomChange: function (reason) {
      try { if (typeof window.iuiSandbox.fillPhotos === 'function') window.iuiSandbox.fillPhotos(); } catch (e0) {}
      try { if (typeof L !== 'undefined' && L.iuiRefreshMaps) L.iuiRefreshMaps(reason || 'after-dom'); } catch (e1) {}
      try { if (typeof L !== 'undefined' && L.iuiRebindMarkers) L.iuiRebindMarkers(reason || 'after-dom'); } catch (e2) {}
      try {
        document.querySelectorAll('canvas').forEach(function (cv) {
          var ch = window.Chart && window.Chart.getChart && window.Chart.getChart(cv);
          if (ch && ch.resize) ch.resize();
        });
      } catch (e3) {}
      measure();
    },
    /** Serialize [data-iui-form] fields and post as action. */
    submitForm: function (formEl, actionName) {
      var root = formEl || document.querySelector('[data-iui-form]');
      if (!root) return;
      var data = {};
      root.querySelectorAll('[name]').forEach(function (el) {
        var key = el.getAttribute('name');
        if (!key) return;
        if (el.type === 'checkbox') data[key] = !!el.checked;
        else if (el.type === 'radio') { if (el.checked) data[key] = el.value; }
        else data[key] = el.value;
      });
      window.iuiSandbox.action(actionName || root.getAttribute('data-iui-form') || 'submit_form', data);
    },
    /** Snapshot interactive DOM for host remount restore (P1-STATE). */
    captureLocalState: function () {
      var state = { fields: {}, checks: {}, aria: {}, text: {} };
      try {
        document.querySelectorAll('input, select, textarea').forEach(function (el, i) {
          var key = el.getAttribute('id') || el.getAttribute('name') || ('i' + i);
          if (el.type === 'checkbox' || el.type === 'radio') state.checks[key] = !!el.checked;
          else state.fields[key] = el.value;
        });
        document.querySelectorAll('[aria-current], [aria-pressed], [data-iui-state]').forEach(function (el, i) {
          var key = el.getAttribute('id') || el.getAttribute('data-iui-state') || ('a' + i);
          state.aria[key] = {
            current: el.getAttribute('aria-current'),
            pressed: el.getAttribute('aria-pressed'),
            state: el.getAttribute('data-iui-state'),
            text: (el.textContent || '').slice(0, 80)
          };
        });
        ['#pause', '#status', '#replay'].forEach(function (sel) {
          var el = document.querySelector(sel);
          if (el) state.text[sel] = (el.textContent || '').slice(0, 80);
        });
      } catch (e) {}
      return state;
    },
    restoreLocalState: function (state) {
      if (!state || typeof state !== 'object') return;
      try {
        var fields = state.fields || {};
        Object.keys(fields).forEach(function (key) {
          var el = document.getElementById(key) || document.querySelector('[name="' + key + '"]');
          if (el && 'value' in el) el.value = fields[key];
        });
        var checks = state.checks || {};
        Object.keys(checks).forEach(function (key) {
          var el = document.getElementById(key) || document.querySelector('[name="' + key + '"]');
          if (el && 'checked' in el) el.checked = !!checks[key];
        });
        var text = state.text || {};
        Object.keys(text).forEach(function (sel) {
          var el = document.querySelector(sel);
          if (el) el.textContent = text[sel];
        });
        var aria = state.aria || {};
        Object.keys(aria).forEach(function (key) {
          var el = document.getElementById(key) || document.querySelector('[data-iui-state="' + key + '"]');
          if (!el) return;
          var v = aria[key] || {};
          if (v.current != null) el.setAttribute('aria-current', v.current);
          if (v.pressed != null) el.setAttribute('aria-pressed', v.pressed);
          if (v.state != null) el.setAttribute('data-iui-state', v.state);
        });
      } catch (e) {}
    },
    persistLocalState: function () {
      try { post({ type: 'localState', state: window.iuiSandbox.captureLocalState() }); } catch (e) {}
    }
  };
  document.addEventListener('change', function () {
    try { window.iuiSandbox.persistLocalState(); } catch (e) {}
  }, true);
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t) return;
    if (t.id === 'pause' || t.id === 'replay' || (t.getAttribute && t.getAttribute('data-iui-state') != null)) {
      setTimeout(function () { try { window.iuiSandbox.persistLocalState(); } catch (e) {} }, 0);
    }
  }, true);
  window.addEventListener('error', function (ev) {
    try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) {}
    post({ type: 'error', message: String(ev && ev.message ? ev.message : 'script error') });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev && ev.reason;
    post({ type: 'error', message: String(reason && reason.message ? reason.message : reason) });
  });
  function invokeDataHandler(el, attr, ev) {
    if (!el || !el.getAttribute) return false;
    var name = el.getAttribute(attr);
    if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false;
    var fn = window[name];
    if (typeof fn !== 'function') return false;
    try { fn.call(el, ev); } catch (err) {
      console.error('[iui-html] handler', name, err);
      try { window.iuiSandbox && window.iuiSandbox.reportError(err); } catch (e) {}
    }
    return true;
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== document && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-iui-send-prompt')) {
        ev.preventDefault();
        window.iuiSandbox.sendPrompt(el.getAttribute('data-iui-send-prompt') || el.textContent || '');
        break;
      }
      if (el.getAttribute && el.getAttribute('data-iui-open-link')) {
        ev.preventDefault();
        window.iuiSandbox.openLink(el.getAttribute('data-iui-open-link') || '');
        break;
      }
      if (el.getAttribute && el.getAttribute('data-iui-action')) {
        ev.preventDefault();
        var action = el.getAttribute('data-iui-action') || '';
        var raw = el.getAttribute('data-iui-payload');
        var payload = {};
        if (raw) {
          try { payload = JSON.parse(raw); }
          catch (err) { payload = { raw: raw }; }
        }
        window.iuiSandbox.action(action, payload);
        break;
      }
      if (invokeDataHandler(el, 'data-iui-on-click', ev)) break;
      el = el.parentElement;
    }
  }, true);
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el) invokeDataHandler(el, 'data-iui-on-change', ev);
  }, true);
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el) invokeDataHandler(el, 'data-iui-on-input', ev);
  }, true);
  document.addEventListener('submit', function (ev) {
    var el = ev.target;
    if (el && invokeDataHandler(el, 'data-iui-on-submit', ev)) ev.preventDefault();
  }, true);
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || !form.getAttribute) return;
    if (!form.getAttribute('data-iui-form')) return;
    ev.preventDefault();
    window.iuiSandbox.submitForm(form);
  }, true);
  window.addEventListener('load', measure);
  if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
    try { new ResizeObserver(function () { measure(); }).observe(document.documentElement); } catch (e) {}
  }
  if (typeof MutationObserver !== 'undefined' && document.body) {
    try {
      new MutationObserver(function () { requestAnimationFrame(measure); })
        .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    } catch (e) {}
  }
  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || data.source !== 'iui-html-host' || data.frameId !== FRAME_ID) return;
    if (data.type === 'measure' || data.type === 'ping') measure();
    if (data.type === 'theme' && data.tokens && typeof data.tokens === 'object') {
      var root = document.documentElement;
      Object.keys(data.tokens).forEach(function (key) {
        if (key.indexOf('--') !== 0) return;
        var val = data.tokens[key];
        if (typeof val === 'string' && val.indexOf(';') === -1 && val.indexOf('}') === -1) {
          root.style.setProperty(key, val);
        }
      });
      measure();
    }
    if (data.type === 'bindings' && data.values && typeof data.values === 'object') {
      window.__iuiBindings = Object.assign({}, window.__iuiBindings || {}, data.values);
      try {
        window.dispatchEvent(new CustomEvent('iui-bindings', { detail: window.__iuiBindings }));
      } catch (e) {}
      document.querySelectorAll('[data-iui-bind]').forEach(function (el) {
        var id = el.getAttribute('data-iui-bind');
        if (!id) return;
        var next = window.__iuiBindings[id];
        if (next === undefined || next === null) return;
        if ('value' in el) el.value = String(next);
        else el.textContent = String(next);
      });
      measure();
    }
    if (data.type === 'appData' && data.data && typeof data.data === 'object') {
      window.__iuiAppData = Object.assign({}, window.__iuiAppData || {}, data.data);
      var flat = {};
      Object.keys(window.__iuiAppData).forEach(function (k) {
        var v = window.__iuiAppData[k];
        if (v === null || v === undefined) return;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') flat[k] = String(v);
        else { try { flat[k] = JSON.stringify(v); } catch (e) {} }
      });
      window.__iuiBindings = Object.assign({}, window.__iuiBindings || {}, flat);
      try {
        window.dispatchEvent(new CustomEvent('iui-appdata', { detail: window.__iuiAppData }));
        window.dispatchEvent(new CustomEvent('iui-bindings', { detail: window.__iuiBindings }));
      } catch (e) {}
      document.querySelectorAll('[data-iui-bind]').forEach(function (el) {
        var id = el.getAttribute('data-iui-bind');
        if (!id) return;
        var next = window.__iuiBindings[id];
        if (next === undefined || next === null) return;
        if ('value' in el) el.value = String(next);
        else el.textContent = String(next);
      });
      measure();
    }
    // P1-N6: html-only preview updates without rebuilding srcdoc (opaque iframe).
    if (data.type === 'previewHtml' && typeof data.html === 'string') {
      var root = document.getElementById('iui-preview-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'iui-preview-root';
        document.body.appendChild(root);
      }
      root.innerHTML = data.html;
      measure();
      try { if (window.iuiSandbox && window.iuiSandbox.afterDomChange) window.iuiSandbox.afterDomChange('previewHtml'); } catch (eH) {}
    }
    if (data.type === 'previewCss' && typeof data.css === 'string') {
      var style = document.getElementById('iui-author-css');
      if (!style) {
        style = document.createElement('style');
        style.id = 'iui-author-css';
        document.head.appendChild(style);
      }
      style.textContent = data.css;
      measure();
    }
    if (data.type === 'restoreLocalState' && data.state && typeof data.state === 'object') {
      try { window.iuiSandbox.restoreLocalState(data.state); measure(); } catch (e) {}
    }
    // P0: single readiness gate — libs → DOM → chunked author JS (shared pipeline).
    // ready/bridgeReady above only mean the bridge is listening — NOT author-runnable.
    if (data.type === 'rerunAuthorJs') {
      var pipeR = window.__iuiAuthorPipeline;
      if (!pipeR || typeof pipeR.rerunAuthorJs !== 'function') {
        post({ type: 'error', message: 'author pipeline missing', kind: 'host' });
        return;
      }
      try { pipeR.rerunAuthorJs(); } catch (eR) {
        post({ type: 'error', message: String(eR && eR.message ? eR.message : eR), kind: 'host' });
      }
      return;
    }
    if (data.type === 'runAuthorJs' && typeof data.js === 'string' && (data.force === true || !window.__iuiAuthorJsRan)) {
      var pipe = window.__iuiAuthorPipeline;
      if (!pipe || typeof pipe.ensureLibsThenRun !== 'function') {
        post({ type: 'error', message: 'author pipeline missing', kind: 'host' });
        return;
      }
      pipe.ensureLibsThenRun({
        force: data.force === true,
        js: data.js,
        jsFunctions: data.jsFunctions,
        jsExpressions: data.jsExpressions,
        jsChunks: data.jsChunks
      });
    }
  });
  setTimeout(measure, 0);
  setTimeout(measure, 120);
  // Handshake only — host may push previewHtml/theme. Author JS waits for libsReady inside pipeline.
  post({ type: 'bridgeReady' });
  post({ type: 'ready' });
})();
<\/script>`
}


function cdnCspOrigins(): string {
  return HTML_SANDBOX_CDN_ALLOWLIST.map((h) => `https://${h}`).join(' ')
}

/** Map tiles + Nominatim geocode (Leaflet / ```iui-html maps). */
function mapConnectOrigins(): string {
  return [
    'https://nominatim.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
    'https://tile.openstreetmap.org',
    'https://*.tile.openstreetmap.fr',
    'https://tile.openstreetmap.fr',
    'https://*.basemaps.cartocdn.com',
    'https://basemaps.cartocdn.com',
    'https://server.arcgisonline.com',
    'https://services.arcgisonline.com',
    'https://basemap.nationalmap.gov',
    // Trip photo runtime: Wikipedia REST + Commons API (generic place lookup)
    'https://en.wikipedia.org',
    'https://zh.wikipedia.org',
    'https://*.wikipedia.org',
    'https://commons.wikimedia.org',
    'https://upload.wikimedia.org',
    'https://thumb.wikimedia.org',
  ].join(' ')
}

function mapImgOrigins(): string {
  return [
    'https:',
    'data:',
    'blob:',
    'https://*.basemaps.cartocdn.com',
    'https://basemaps.cartocdn.com',
    'https://*.tile.openstreetmap.fr',
    'https://tile.openstreetmap.fr',
    'https://server.arcgisonline.com',
    'https://services.arcgisonline.com',
    'https://upload.wikimedia.org',
    'https://thumb.wikimedia.org',
    'https://commons.wikimedia.org',
    'https://basemap.nationalmap.gov',
  ].join(' ')
}

/** Runtime: rewrite blocked OSM/Carto tiles + fallback chain on tileerror.
 * Also registers maps and refreshes tiles on Replay / moveend blank-outs.
 */
function buildLeafletTileGuardScript(): string {
  const primaryUrl = JSON.stringify(IUI_DEFAULT_MAP_TILE_URL)
  const primaryAttr = JSON.stringify(IUI_DEFAULT_MAP_TILE_ATTR)
  const fallbacks = JSON.stringify(IUI_MAP_TILE_FALLBACKS)
  // IMPORTANT: this returns a template literal embedded in srcdoc. Avoid `\b` / `\.`
  // inside the template — in JS template strings those become control chars / literals
  // and break the iframe with "Invalid or unexpected token".
  return `<script>
(function () {
  var PRIMARY_URL = ${primaryUrl};
  var PRIMARY_ATTR = ${primaryAttr};
  var FALLBACKS = ${fallbacks};
  var chain = [{ url: PRIMARY_URL, attribution: PRIMARY_ATTR }].concat(FALLBACKS);
  var activeIndex = 0;
  var tileFails = 0;
  var swapped = false;
  var maps = [];
  function opts(extra, idx) {
    var entry = chain[idx != null ? idx : activeIndex] || chain[0];
    var o = { attribution: entry.attribution, maxZoom: 19, crossOrigin: true };
    if (extra && typeof extra === 'object') {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    }
    return o;
  }
  function isBlockedTileUrl(url) {
    if (typeof url !== 'string') return false;
    return url.indexOf('tile.openstreetmap.org') !== -1
      || url.indexOf('basemaps.cartocdn.com') !== -1;
  }
  function currentUrl() {
    return (chain[activeIndex] || chain[0]).url;
  }
  function isEastAsia(lat, lng) {
    return lat >= 5 && lat <= 55 && lng >= 70 && lng <= 150;
  }
  function findOsmFrIndex() {
    for (var i = 0; i < chain.length; i++) {
      if (String(chain[i].url).indexOf('openstreetmap.fr') !== -1) return i;
    }
    return 1;
  }
  function trackMap(map) {
    if (!map || maps.indexOf(map) !== -1) return;
    maps.push(map);
    try {
      map.on('unload', function () {
        var i = maps.indexOf(map);
        if (i >= 0) maps.splice(i, 1);
      });
    } catch (e) {}
  }
  function refreshOne(map, reason) {
    if (!map) return;
    try { map.invalidateSize({ animate: false }); } catch (e1) {
      try { map.invalidateSize(); } catch (e2) {}
    }
    var hasTile = false;
    try {
      map.eachLayer(function (layer) {
        if (!layer) return;
        var isTile = (typeof L !== 'undefined' && L.TileLayer && layer instanceof L.TileLayer)
          || (layer && typeof layer.setUrl === 'function' && typeof layer._url === 'string')
          || (layer && layer._url && /arcgisonline|openstreetmap|cartocdn|nationalmap/i.test(String(layer._url)));
        if (!isTile) return;
        hasTile = true;
        try {
          if (typeof layer.redraw === 'function') layer.redraw();
        } catch (e) {}
      });
    } catch (e) {}
    if (!hasTile && origTile) {
      try { origTile(currentUrl(), opts(null, activeIndex)).addTo(map); hasTile = true; } catch (e) {}
    }
    // If DOM tiles are empty after pan/replay, force a soft re-add of the active basemap.
    try {
      var stats = countTiles(map);
      if (stats.ok < 1 && origTile) {
        map.eachLayer(function (layer) {
          if (layer && typeof layer.setUrl === 'function' && typeof layer._url === 'string') {
            try { map.removeLayer(layer); } catch (e) {}
          }
        });
        origTile(currentUrl(), opts(null, activeIndex)).addTo(map);
        try { map.invalidateSize({ animate: false }); } catch (e) {}
      }
    } catch (e) {}
    if (reason) {
      try { console.warn('[iui-html] map refresh', reason); } catch (e) {}
    }
  }
  function refreshAll(reason) {
    for (var i = 0; i < maps.length; i++) {
      try { refreshOne(maps[i], reason); } catch (e) {}
    }
  }
  function swapLayer(map, reason) {
    if (activeIndex >= chain.length - 1) return false;
    activeIndex++;
    tileFails = 0;
    swapped = true;
    try {
      map.eachLayer(function (layer) {
        if (layer && typeof layer.setUrl === 'function' && typeof layer._url === 'string') {
          try { map.removeLayer(layer); } catch (e) {}
        } else if (layer && layer._url && /arcgisonline|openstreetmap|cartocdn|nationalmap/i.test(String(layer._url))) {
          try { map.removeLayer(layer); } catch (e) {}
        }
      });
    } catch (e) {}
    try {
      origTile(currentUrl(), opts(null, activeIndex)).addTo(map);
      console.warn('[iui-html] map tile fallback →', currentUrl(), reason || '');
      setTimeout(function () { refreshOne(map, 'post-swap'); }, 40);
      setTimeout(function () { refreshOne(map, 'post-swap-late'); }, 280);
    } catch (e) {}
    return true;
  }
  function jumpToIndex(map, idx, reason) {
    if (idx <= activeIndex || idx >= chain.length) return false;
    activeIndex = idx - 1;
    return swapLayer(map, reason || 'jump');
  }
  function countTiles(map) {
    var imgs = map.getContainer().querySelectorAll('img.leaflet-tile, .leaflet-tile-loaded');
    var ok = 0, tiny = 0, total = 0, gapish = 0;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (!im) continue;
      total++;
      var w = im.naturalWidth || 0, h = im.naturalHeight || 0;
      if (w <= 0 || h <= 0) continue;
      if (w <= 16 || h <= 16) { tiny++; continue; }
      if (w >= 64 && h >= 64) ok++;
      else gapish++;
    }
    var bodyText = '';
    try { bodyText = String(map.getContainer().innerText || ''); } catch (e) {}
    var gapText = /Map data not yet available/i.test(bodyText);
    return { ok: ok, tiny: tiny, total: total, gapish: gapish, gapText: gapText };
  }
  var origTile = null;
  function patch() {
    if (typeof L === 'undefined' || !L.tileLayer || L.tileLayer.__iuiTileGuard) return false;
    origTile = L.tileLayer.bind(L);
    L.tileLayer = function (url, options) {
      if (isBlockedTileUrl(url) || !url) {
        url = currentUrl();
        options = opts(options, activeIndex);
      }
      return origTile(url, options);
    };
    L.tileLayer.__iuiTileGuard = true;
    L.iuiDefaultTileLayer = function (map) {
      return origTile(currentUrl(), opts(null, activeIndex)).addTo(map);
    };
    L.iuiRefreshMaps = function (reason) { refreshAll(reason || 'api'); };
    L.iuiRebindMarkers = function (reason) {
      if (typeof L === 'undefined' || !L.marker) return;
      function readCoord(el, names) {
        for (var ni = 0; ni < names.length; ni++) {
          var raw = el.getAttribute(names[ni]);
          if (raw == null || raw === '') continue;
          var n = parseFloat(raw);
          if (isFinite(n)) return n;
        }
        return NaN;
      }
      function isVisibleCard(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
        var st = el.style;
        if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
        return true;
      }
      var nodes = document.querySelectorAll(
        '[data-iui-lat],[data-lat],[data-latitude],[data-iui-lng],[data-lng],[data-longitude]'
      );
      var points = [];
      var seen = Object.create(null);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!isVisibleCard(el)) continue;
        var lat = readCoord(el, ['data-iui-lat', 'data-lat', 'data-latitude']);
        var lng = readCoord(el, ['data-iui-lng', 'data-lng', 'data-longitude']);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
        var key = lat.toFixed(5) + ',' + lng.toFixed(5);
        if (seen[key]) continue;
        seen[key] = 1;
        var label = el.getAttribute('data-iui-place') || el.getAttribute('data-name') || el.getAttribute('data-title') || '';
        if (!label) {
          var nameEl = el.querySelector && el.querySelector('.name, h3, h4, strong');
          label = (nameEl && nameEl.textContent) || el.getAttribute('aria-label') || '';
        }
        points.push({ lat: lat, lng: lng, label: String(label || '').trim().slice(0, 160), n: points.length + 1 });
      }
      if (!points.length && window.__iuiKnownCoords && window.__iuiKnownCoords.length) {
        for (var ki = 0; ki < window.__iuiKnownCoords.length; ki++) {
          var kp = window.__iuiKnownCoords[ki];
          if (!kp || seen[kp.key]) continue;
          seen[kp.key] = 1;
          points.push({ lat: kp.lat, lng: kp.lng, label: kp.label || '', n: points.length + 1 });
        }
      }
      if (!points.length || !maps.length) return;
      var itinerary = !!document.querySelector('.iui-itinerary');
      maps.forEach(function (map) {
        if (!map) return;
        var layer = map.__iuiMarkerLayer;
        if (layer && map.removeLayer) {
          try { map.removeLayer(layer); } catch (e) {}
        }
        try { layer = L.layerGroup(); } catch (e2) { layer = null; }
        if (!layer) return;
        map.__iuiMarkerLayer = layer;
        for (var pi = 0; pi < points.length; pi++) {
          var p = points[pi];
          try {
            var icon = L.divIcon({
              className: 'iui-host-pin',
              html: '<span class="iui-pin-dot' + (itinerary ? '' : ' active') + '">' + p.n + '</span>',
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            });
            var mk = L.marker([p.lat, p.lng], { icon: icon });
            if (p.label) mk.bindPopup(p.label);
            layer.addLayer(mk);
          } catch (e3) {
            try { layer.addLayer(L.marker([p.lat, p.lng])); } catch (e4) {}
          }
        }
        try { layer.addTo(map); } catch (e5) {}
        refreshOne(map, reason || 'rebind-markers');
      });
    };
    var origMarker = L.marker && L.marker.bind(L);
    if (origMarker && !L.marker.__iuiCoordTap) {
      L.marker = function (latlng, options) {
        var mk = origMarker.call(this, latlng, options);
        try {
          var ll = mk.getLatLng && mk.getLatLng();
          if (ll && isFinite(ll.lat) && isFinite(ll.lng)) {
            window.__iuiKnownCoords = window.__iuiKnownCoords || [];
            var key = Number(ll.lat).toFixed(5) + ',' + Number(ll.lng).toFixed(5);
            var exists = window.__iuiKnownCoords.some(function (p) { return p.key === key; });
            if (!exists) {
              var popup = '';
              try { popup = (mk.getPopup && mk.getPopup() && mk.getPopup().getContent && mk.getPopup().getContent()) || ''; } catch (eP) {}
              window.__iuiKnownCoords.push({ key: key, lat: ll.lat, lng: ll.lng, label: String(popup || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 160) });
            }
          }
        } catch (e) {}
        return mk;
      };
      L.marker.__iuiCoordTap = true;
    }
    var origMap = L.map.bind(L);
    L.map = function () {
      var map = origMap.apply(this, arguments);
      trackMap(map);
      try {
        map.on('tileerror', function () {
          tileFails++;
          if (tileFails >= 2) {
            if (!swapLayer(map, 'tileerror')) {
              if (tileFails === 4) {
                try {
                  window.iuiSandbox && window.iuiSandbox.reportError(
                    new Error('Map tiles failed to load. Check network or try Reload.')
                  );
                } catch (e) {}
              }
            }
          }
        });
      } catch (e) {}
      function preferAsiaBasemap() {
        try {
          if (swapped || activeIndex > 0) return;
          var c = map.getCenter && map.getCenter();
          if (!c) return;
          if (isEastAsia(c.lat, c.lng)) {
            jumpToIndex(map, findOsmFrIndex(), 'east-asia');
          }
        } catch (e) {}
      }
      try {
        map.whenReady(function () { setTimeout(preferAsiaBasemap, 40); });
      } catch (e) {
        setTimeout(preferAsiaBasemap, 200);
      }
      setTimeout(function () {
        try {
          var hasTile = false;
          map.eachLayer(function (layer) {
            if (typeof L !== 'undefined' && L.TileLayer && layer instanceof L.TileLayer) hasTile = true;
            else if (layer && typeof layer._url === 'string') hasTile = true;
          });
          if (!hasTile) origTile(currentUrl(), opts(null, activeIndex)).addTo(map);
        } catch (e) {}
      }, 120);
      function settleCheck(reason) {
        try {
          if (activeIndex >= chain.length - 1) return;
          var stats = countTiles(map);
          if (stats.gapText) { swapLayer(map, 'gap-text'); return; }
          if (stats.total === 0) { swapLayer(map, reason || 'no-tiles'); return; }
          if (stats.ok < 2 && (stats.tiny + stats.gapish) >= 2) {
            swapLayer(map, reason || 'stub-tiles');
          }
        } catch (e) {}
      }
      setTimeout(function () { settleCheck('settle-1.2s'); }, 1200);
      setTimeout(function () { settleCheck('settle-2.8s'); }, 2800);
      // After pan/zoom (Replay animation calls panTo repeatedly) tiles can blank — recover.
      var moveTimer = null;
      function onViewChange() {
        if (moveTimer) clearTimeout(moveTimer);
        moveTimer = setTimeout(function () {
          try {
            var stats = countTiles(map);
            if (stats.ok < 1) refreshOne(map, 'view-empty');
            else {
              try { map.invalidateSize({ animate: false }); } catch (e) {}
            }
          } catch (e) {}
        }, 180);
      }
      try {
        map.on('moveend', onViewChange);
        map.on('zoomend', onViewChange);
      } catch (e) {}
      setTimeout(function () {
        try { if (L.iuiRebindMarkers) L.iuiRebindMarkers('map-create'); } catch (eR) {}
      }, 0);
      setTimeout(function () {
        try { if (L.iuiRebindMarkers) L.iuiRebindMarkers('map-create-late'); } catch (eR2) {}
      }, 240);
      return map;
    };
    // Replay chrome: models use #replay, #bReplay, or button label "Replay"/"重播".
    if (!window.__iuiReplayTileHook) {
      window.__iuiReplayTileHook = true;
      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        var el = t;
        try {
          if (t.closest) el = t.closest('button, [role="button"], a, .iui-sandbox-btn') || t;
        } catch (e) {}
        var id = String((el && el.id) || '').toLowerCase();
        var label = String((el && (el.textContent || el.getAttribute && el.getAttribute('aria-label'))) || '').toLowerCase();
        var isReplay = id === 'replay' || id === 'breplay'
          || id.indexOf('replay') !== -1
          || label.indexOf('replay') !== -1
          || label.indexOf('重播') !== -1
          || label.indexOf('再播') !== -1;
        if (!isReplay) return;
        setTimeout(function () { refreshAll('replay-click'); }, 0);
        setTimeout(function () { refreshAll('replay-click'); }, 120);
        setTimeout(function () { refreshAll('replay-click'); }, 400);
        setTimeout(function () { refreshAll('replay-click'); }, 900);
      }, true);
    }
    if (!window.__iuiAfterDomHook) {
      window.__iuiAfterDomHook = true;
      var afterTimer = null;
      document.addEventListener('click', function () {
        if (afterTimer) clearTimeout(afterTimer);
        afterTimer = setTimeout(function () {
          try { if (window.iuiSandbox && window.iuiSandbox.afterDomChange) window.iuiSandbox.afterDomChange('click'); } catch (e) {}
        }, 40);
      }, true);
    }
    return true;
  }
  if (!patch()) {
    window.addEventListener('load', patch);
    var n = 0, t = setInterval(function () { if (patch() || ++n > 80) clearInterval(t); }, 40);
  }
})();
<\/script>`
}

/**
 * Models often call Chart / echarts / L / d3 globals without adding the CDN
 * <script>. Inject the allowlisted UMD build when a global is used but missing.
 */
/** Runtime Chart.js helpers — UMD global + blank-canvas recovery for weather. */
function buildChartGuardScript(): string {
  return `<script>
(function () {
  function buildMod() {
    var C = window.Chart;
    window.__iuiChartMod = { Chart: C, default: C, registerables: [] };
    return window.__iuiChartMod;
  }
  function waitChart(cb) {
    if (window.Chart) { cb(window.Chart); return; }
    var n = 0, t = setInterval(function () {
      if (window.Chart) { clearInterval(t); cb(window.Chart); }
      else if (++n > 100) clearInterval(t);
    }, 40);
  }
  window.iuiCreateChart = function (canvas, config) {
    var C = window.__iuiChartOrig || window.Chart;
    if (!C || !canvas) return null;
    var cfg = config && typeof config === 'object' ? config : { type: 'line', data: { labels: [], datasets: [] } };
    if (!cfg.options) cfg.options = {};
    cfg.options.maintainAspectRatio = false;
    cfg.options.responsive = cfg.options.responsive !== false;
    try {
      var ds = cfg.data && cfg.data.datasets;
      if (Array.isArray(ds)) {
        ds.forEach(function (d) {
          if (!d || !Array.isArray(d.data)) return;
          d.data = d.data.map(function (v) { return (typeof v === 'number' && isFinite(v)) ? v : null; });
        });
      }
    } catch (e) {}
    try {
      var parent = canvas.parentElement;
      if (parent && (!parent.style.height || parent.style.height === 'auto')) {
        if (!parent.classList.contains('iui-weather-chart') && getComputedStyle(parent).height === '0px') {
          parent.style.minHeight = '200px';
        }
      }
    } catch (e) {}
    try { return new C(canvas, cfg); } catch (err) {
      console.error('[iui-html] chart', err);
      try { window.iuiSandbox && window.iuiSandbox.reportError(err); } catch (e) {}
      return null;
    }
  };
  waitChart(function (C) {
    window.__iuiChartOrig = C;
    buildMod();
    // Soft-patch new Chart(...) to force maintainAspectRatio:false when omitted.
    if (C && !C.__iuiPatched) {
      var Orig = C;
      var Wrapped = function (ctx, cfg) {
        return window.iuiCreateChart(ctx, cfg);
      };
      Wrapped.prototype = Orig.prototype;
      for (var k in Orig) if (Object.prototype.hasOwnProperty.call(Orig, k)) Wrapped[k] = Orig[k];
      Wrapped.__iuiPatched = true;
      Wrapped.getChart = Orig.getChart;
      Wrapped.register = Orig.register;
      Wrapped.defaults = Orig.defaults;
      window.Chart = Wrapped;
      buildMod();
    }
    // Recovery: weather canvas still empty ~1.5s after load → paint a tiny demo line so chrome is not blank.
    setTimeout(function () {
      try {
        var nodes = document.querySelectorAll('.iui-weather-chart canvas, canvas#wxChart, canvas[id*="chart"], canvas[id*="Chart"], canvas[id*="wx"]');
        for (var i = 0; i < nodes.length; i++) {
          var cv = nodes[i];
          if (!cv || cv.__iuiChartOk) continue;
          var existing = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(cv) : null;
          if (existing) { cv.__iuiChartOk = true; continue; }
          // Only recover when wrapper looks like weather and author did not attach a chart.
          var wrap = cv.closest('.iui-weather-chart, .iui-weather');
          if (!wrap) continue;
          var labels = ['08','10','12','14','16','18','20','22'];
          var data = [18,19,21,23,25,24,22,20];
          window.iuiCreateChart(cv, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: '温度', data: data, borderColor: '#185FA5', backgroundColor: 'rgba(24,95,165,.12)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] },
            options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false } } }
          });
          cv.__iuiChartOk = true;
          var tip = document.createElement('div');
          tip.className = 'iui-sandbox-muted';
          tip.style.cssText = 'font-size:11px;margin-top:4px';
          tip.textContent = '示意折线（模型图表未挂载时的回退）';
          if (cv.parentElement) cv.parentElement.appendChild(tip);
        }
      } catch (e) {}
    }, 1600);
  });
})();
<\/script>`
}

function autoCdnTags(html: string, js: string): string {
  const all = html + '\n' + js
  const tags: string[] = []
  const need = (use: RegExp, present: RegExp): boolean => use.test(all) && !present.test(html)
  // Prefer UMD Chart.js (global Chart) — esm.sh importmap is flaky in null-origin srcdoc (blank weather canvases).
  const hasChartUmdScript = /<script[^>]+src=["'][^"']*chart(?:\.umd|\.min)?\.js/i.test(html)
  const wantsChart =
    /\bnew\s+Chart\s*\(/.test(all) ||
    /import\s*\(\s*['"]chart\.js/.test(all) ||
    /iui-weather-chart|wxChart|__iuiChartMod|iuiCreateChart/.test(all) ||
    (/\bChart\b/.test(all) && /(?:line|bar|doughnut|pie|radar|polarArea)/i.test(all)) ||
    /<canvas\b[^>]*(?:id|class)\s*=\s*["'][^"']*[Cc]hart/i.test(html) ||
    (/<canvas\b/i.test(html) && /(?:doughnut|pie|radar|polarArea|chart\.js)/i.test(all))
  if (wantsChart && !hasChartUmdScript) {
    tags.push('<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>')
  }
  if (wantsChart || hasChartUmdScript) {
    tags.push(buildChartGuardScript())
  }
  if (need(/\becharts\s*\.\s*init\s*\(/, /echarts/i)) tags.push('<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"><\/script>')
  // Prefer UMD Leaflet (global L) over ESM importmap — srcdoc + import("leaflet") often yields empty maps.
  // Inject whenever map APIs / itinerary chrome appear, unless a real leaflet.js <script src> is already present.
  const hasLeafletUmdScript = /<script[^>]+src=["'][^"']*leaflet(?:\.js|\.min\.js)/i.test(html)
  const wantsLeaflet =
    /\bL\s*\.\s*(?:map|tileLayer|marker|polyline|divIcon|circleMarker|latLngBounds|latLng)\s*\(/.test(all) ||
    /iui-map-wrap|createTripAnimator|openstreetmap\.org\/\{z\}/i.test(all) ||
    /\bid\s*=\s*["']map["']/i.test(all) ||
    /\bimport\s*(?:\*|\{?\s*L\s*\}?)\s*from\s*['"]leaflet['"]/.test(all) ||
    (/leaflet/i.test(all) && /(?:map|tile|marker|lat|lng)/i.test(all))
  if (wantsLeaflet && !hasLeafletUmdScript) {
    tags.push('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"/><script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"><\/script>')
  }
  if (wantsLeaflet || hasLeafletUmdScript) {
    tags.push(buildLeafletTileGuardScript())
  }
  if (need(/\bd3\s*\.\s*(?:select|scale|line|arc)/, /d3(?:@|\.min|\.v)/i)) tags.push('<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"><\/script>')
  return tags.join('')
}

/** Build iframe srcdoc (sandbox: allow-scripts; no allow-same-origin). */
export function buildHtmlSandboxSrcdoc(
  spec: HtmlSandboxSpec,
  options: HtmlSandboxBuildOptions = {},
): string {
  const title = spec.title ? escapeHtml(spec.title) : 'IUI sandbox'
  const truncatedParts: Array<'css' | 'js' | 'html'> = []
  const rawHtml = spec.html
  const htmlSan = sanitizeSandboxMarkup(enrichPlaceMediaHtml(rawHtml))
  const html = truncateAuthor(htmlSan, 'html')
  if (htmlSan.length > HTML_SANDBOX_MAX_HTML_BYTES) truncatedParts.push('html')
  const cssSan = sanitizeSandboxCss(spec.css)
  const authorCss = truncateAuthor(cssSan, 'css')
  if (cssSan.length > HTML_SANDBOX_MAX_AUTHOR_BYTES) truncatedParts.push('css')
  const jsRewritten = prepareAuthorJs(spec.js)
  const authorJs = truncateAuthor(jsRewritten, 'js')
  if (jsRewritten.length > HTML_SANDBOX_MAX_AUTHOR_BYTES) truncatedParts.push('js')
  const brandId = options.brandId ?? 'sandbox'
  const mergePack = options.mergePackTokens !== false
  const mergedTokens = mergePack
    ? mergeSandboxDesignTokens(options.designTokens, brandId)
    : (options.designTokens ?? sandboxBrandCssVars(brandId))
  const tokenCss = tokensToCss(mergedTokens)
  const baseCss = options.baseCss ?? buildSandboxBaseCss(brandId)
  const frameId = typeof options.frameId === 'string' && options.frameId.trim()
    ? options.frameId.trim().slice(0, 64)
    : 'iui-html'
  const fnRaw = typeof spec.jsFunctions === 'string' ? prepareAuthorJs(spec.jsFunctions) : ''
  const fnSrc = fnRaw ? truncateAuthor(fnRaw, 'js') : ''
  if (fnRaw.length > HTML_SANDBOX_MAX_AUTHOR_BYTES && !truncatedParts.includes('js')) truncatedParts.push('js')
  const exprList = Array.isArray(spec.jsExpressions) ? spec.jsExpressions : []
  // P1-5: defer author JS only when host asks OR parser marked js incomplete.
  // Legacy/complete specs without jsComplete keep running author JS.
  const deferJs = options.deferAuthorJs === true || spec.jsComplete === false
  // P0: host-side chunking so final path matches preview-shell isolation.
  const authorChunks = splitAuthorJsChunks(authorJs)
  const jsBlock = deferJs
    ? ''
    : `<script>
(function () {
  function go() {
    var pipe = window.__iuiAuthorPipeline;
    if (!pipe || typeof pipe.ensureLibsThenRun !== 'function') {
      console.error('[iui-html] author pipeline missing on final path');
      try {
        parent.postMessage({ source: 'iui-html', frameId: window.__iuiFrameId || 'iui-html', type: 'error', message: 'author pipeline missing', kind: 'host' }, '*');
      } catch (e) {}
      return;
    }
    pipe.ensureLibsThenRun({
      js: '',
      jsFunctions: ${jsonEmbed(fnSrc)},
      jsExpressions: ${JSON.stringify(exprList.slice(0, 64).map((x) => prepareAuthorJs(x)))},
      jsChunks: ${JSON.stringify(authorChunks)}
    });
  }
  // window.load waits for head CDN <script src>; pipeline still re-checks globals.
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
<\/script>`
  const cdnTags = autoCdnTags(html, authorJs + fnSrc)
  const bridge = buildSandboxBridgeScript(frameId)
  const oiuCss = buildOiuDesignSystemCss()
  const importMapTag = buildOiuImportmapScriptTag()
  const tripScript = buildTripAnimatorScriptTag()

  // P1-PREVIEW-PHOTO: always inject runtime fill (well-known map). Volume trade for
  // stability — itinerary markers may arrive only in late html chunks / author JS.
  const photoFill = buildTripPhotoFillScript()
  // CDN UMD tags go in <head> so Leaflet/Chart start fetching before the bridge posts
  // `ready` (host may immediately runAuthorJs on the preview-shell path).
  let doc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${mapImgOrigins()}; style-src 'unsafe-inline' ${cdnCspOrigins()}; script-src 'unsafe-inline' 'unsafe-eval' ${cdnCspOrigins()}; font-src https: data:; connect-src ${cdnCspOrigins()} ${mapConnectOrigins()}; base-uri 'none'; form-action 'none';"/><title>${title}</title>${importMapTag}${tripScript}${cdnTags}<style>
${tokenCss}${baseCss}
${oiuCss}
html,body{min-height:0!important;height:auto!important;background:transparent!important;margin:0!important}
.leaflet-container{min-height:280px;border-radius:var(--border-radius-lg,12px)}
body{padding:4px!important}
</style><style id="iui-author-css">${authorCss}</style></head><body>${bridge}${truncationBanner(truncatedParts)}<div id="iui-preview-root">${html}</div>${jsBlock}${photoFill}</body></html>`
  if (doc.length > HTML_SANDBOX_MAX_SRCDOC_BYTES) {
    doc = doc.slice(0, HTML_SANDBOX_MAX_SRCDOC_BYTES) + '\n<!-- srcdoc truncated -->'
  }
  return doc
}


/** True when the fence has no author content yet (streaming placeholder). */
export function isSandboxSpecEmpty(spec: HtmlSandboxSpec): boolean {
  return spec.html.trim() === '' && spec.css.trim() === '' && spec.js.trim() === ''
}

/** Build a downloadable standalone HTML document (same sanitization as iframe). */
export function buildSandboxDownloadHtml(
  spec: HtmlSandboxSpec,
  options: HtmlSandboxBuildOptions = {},
): string {
  // Reuse srcdoc builder; strip bridge postMessage noise for offline open.
  const doc = buildHtmlSandboxSrcdoc(spec, { ...options, frameId: options.frameId ?? 'download' })
  return doc
}

/** Human-readable stage chips for streaming chrome. */
export function sandboxStageLabels(spec: HtmlSandboxSpec): string[] {
  const order: Array<'placeholder' | 'css' | 'html' | 'js'> = ['placeholder', 'css', 'html', 'js']
  return order.filter((stage) => spec.stages.includes(stage))
}


/** Product starter templates for ```iui-html (neutral Chinese copy). */
export type HtmlSandboxStarter = {
  id: string
  title: string
  summary: string
  spec: HtmlSandboxSpec
}

const HTML_SANDBOX_STARTERS_CORE: HtmlSandboxStarter[] = [
  {
    id: 'counter',
    title: '计数器',
    summary: '本地加减，点击回传 action',
    spec: {
      title: '计数器',
      height: 220,
      css: '.wrap{display:flex;flex-direction:column;gap:12px}.row{display:flex;gap:8px;align-items:center}.val{font-size:28px;font-weight:700;letter-spacing:-.02em}',
      html: '<div class="iui-sandbox-card wrap"><div class="iui-sandbox-muted">本地交互示例</div><div class="row"><button type="button" id="dec" class="secondary">−</button><div class="val" id="n">0</div><button type="button" id="inc">+</button><button type="button" data-iui-action="sandbox_done" data-iui-payload="{&quot;kind&quot;:&quot;counter&quot;}">完成</button></div></div>',
      js: 'var n=0,el=document.getElementById("n");function render(){el.textContent=String(n)}document.getElementById("inc").onclick=function(){n++;render();window.iuiSandbox.action("count",{value:n})};document.getElementById("dec").onclick=function(){n--;render();window.iuiSandbox.action("count",{value:n})};',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },
  {
    id: 'kpi-grid',
    title: '指标网格',
    summary: 'bento KPI + 刷新按钮',
    spec: {
      title: '指标网格',
      height: 260,
      css: '',
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>本机概览</strong><button type="button" data-iui-action="refresh_metrics">刷新</button></div><div class="iui-sandbox-grid"><div class="iui-sandbox-kpi"><div class="label">CPU</div><div class="value" data-iui-bind="cpu">34%</div></div><div class="iui-sandbox-kpi"><div class="label">内存</div><div class="value" data-iui-bind="mem">62%</div></div><div class="iui-sandbox-kpi"><div class="label">磁盘</div><div class="value" data-iui-bind="disk">41%</div></div></div><p class="iui-sandbox-muted">可用 host bindings 推送 data-iui-bind</p></div>',
      js: '',
      stages: ['html'],
      partial: false,
    },
  },
  {
    id: 'mini-form',
    title: '迷你表单',
    summary: '本地校验后回传 submit',
    spec: {
      title: '迷你表单',
      height: 280,
      css: '.f{display:flex;flex-direction:column;gap:8px}label{font-size:12px;color:#6b7280}',
      html: '<div class="iui-sandbox-card f"><div><label>昵称</label><input id="name" placeholder="请输入"/></div><div><label>备注</label><textarea id="note" rows="3" placeholder="可选"></textarea></div><button type="button" id="go">提交</button><p class="iui-sandbox-muted" id="msg"></p></div>',
      js: 'document.getElementById("go").onclick=function(){var name=(document.getElementById("name").value||"").trim();var note=document.getElementById("note").value||"";var msg=document.getElementById("msg");if(!name){msg.textContent="请填写昵称";return;}msg.textContent="已提交";window.iuiSandbox.action("submit_form",{name:name,note:note});};',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },

  {
    id: 'todo',
    title: '待办清单',
    summary: '本地勾选 + action 回传',
    spec: {
      title: '待办清单',
      height: 280,
      css: '.todo{display:flex;flex-direction:column;gap:8px}.item{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid #e5e7eb;border-radius:10px}.item.done{opacity:.55;text-decoration:line-through}',
      html: '<div class="iui-sandbox-card todo"><div class="iui-sandbox-toolbar"><strong>今日待办</strong><button type="button" id="add">添加</button></div><div id="list"></div><p class="iui-sandbox-muted">勾选会回传 sandbox_todo</p></div>',
      js: 'var items=[{id:1,t:"写周报",d:false},{id:2,t:"代码评审",d:false}];function paint(){var el=document.getElementById("list");el.innerHTML="";items.forEach(function(it){var row=document.createElement("label");row.className="item"+(it.d?" done":"");row.innerHTML="<input type=checkbox "+(it.d?"checked":"")+"> <span>"+it.t+"</span>";row.querySelector("input").onchange=function(){it.d=!!this.checked;paint();window.iuiSandbox.action("sandbox_todo",{items:items})};el.appendChild(row)})}document.getElementById("add").onclick=function(){var t=prompt("待办");if(!t)return;items.push({id:Date.now(),t:t,d:false});paint();window.iuiSandbox.action("sandbox_todo",{items:items})};paint();',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },
  {
    id: 'spark',
    title: '迷你折线',
    summary: '纯 SVG 趋势示意',
    spec: {
      title: '迷你折线',
      height: 240,
      css: '.wrap{display:flex;flex-direction:column;gap:10px}svg{width:100%;height:96px}',
      html: '<div class="iui-sandbox-card wrap"><div class="iui-sandbox-toolbar"><strong>趋势</strong><span class="iui-sandbox-muted" data-iui-bind="label">示例</span></div><svg viewBox="0 0 200 60" preserveAspectRatio="none"><polyline id="line" fill="none" stroke="currentColor" stroke-width="2" points=""/></svg><button type="button" data-iui-action="refresh_spark">刷新</button></div>',
      js: 'function draw(vals){var pts=vals.map(function(v,i){var x=i*(200/(vals.length-1||1));var y=60-v*0.55;return x+","+y}).join(" ");document.getElementById("line").setAttribute("points",pts)}draw([12,18,15,28,22,36,30,42]);',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },
  {
    id: 'leaflet-map',
    title: 'Leaflet 地图',
    summary: 'OSM 瓦片 + 可选 Nominatim 定位',
    spec: {
      title: '地图',
      height: 340,
      css: '#map{height:280px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}#hint{font-size:12px;color:#6b7280;margin-top:8px}',
      html: '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><div id="map"></div><p id="hint" class="iui-sandbox-muted">Leaflet · OpenStreetMap</p>',
      js: 'var map=L.map("map");L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles © Esri"}).addTo(map);var q=(window.iuiSandbox&&window.iuiSandbox.bindings&&window.iuiSandbox.bindings.place)||"city park";document.getElementById("hint").textContent="定位中…";fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(q)).then(function(r){return r.json()}).then(function(rows){if(!rows[0]){map.setView([20,0],2);document.getElementById("hint").textContent="未能定位，请改 bindings.place";return;}var lat=parseFloat(rows[0].lat),lng=parseFloat(rows[0].lon);map.setView([lat,lng],15);L.marker([lat,lng]).addTo(map).bindPopup(rows[0].display_name||q).openPopup();document.getElementById("hint").textContent=rows[0].display_name||q;}).catch(function(){map.setView([20,0],2);document.getElementById("hint").textContent="定位服务暂不可用";});',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },

  {
    id: 'links',
    title: '外链卡片',
    summary: '打开地图 / 文档类 CTA',
    spec: {
      title: '外链卡片',
      height: 220,
      css: '.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}a.btn{display:inline-flex;padding:8px 12px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-size:13px;font-weight:600}a.btn.sec{background:#fff;color:#111;border:1px solid #e5e7eb}',
      html: '<div class="iui-sandbox-card"><strong>外链 CTA</strong><p class="iui-sandbox-muted">打开外部地图或文档</p><div class="row"><a class="btn" href="https://www.openstreetmap.org/search?query=park" target="_blank" rel="noopener">OpenStreetMap</a><a class="btn sec" href="https://uri.amap.com/search?keyword=park" target="_blank" rel="noopener">高德</a><button type="button" data-iui-action="copy_link" data-iui-payload="{&quot;href&quot;:&quot;https://www.openstreetmap.org&quot;}">复制链接</button></div></div>',
      js: '',
      stages: ['css', 'html'],
      partial: false,
    },
  },
  {
    id: 'compare-cards',
    title: '并排对比',
    summary: '非表对比卡 + action',
    spec: {
      title: '并排对比',
      height: 280,
      css: '.opt h3{margin:0 0 6px;font-size:14px}.metric{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f4f4f5}.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#f4f4f5;margin-left:6px}',
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>方案对比</strong><span class="iui-sandbox-muted">示例</span></div><div class="iui-sandbox-compare"><div class="iui-sandbox-kpi opt"><h3>方案 A<span class="pill">推荐</span></h3><div class="metric"><span>价格</span><strong>¥128</strong></div><div class="metric"><span>耗时</span><strong>2h</strong></div><button type="button" data-iui-action="pick" data-iui-payload="{&quot;id&quot;:&quot;a&quot;}">选择 A</button></div><div class="iui-sandbox-kpi opt"><h3>方案 B</h3><div class="metric"><span>价格</span><strong>¥96</strong></div><div class="metric"><span>耗时</span><strong>3.5h</strong></div><button type="button" class="secondary" data-iui-action="pick" data-iui-payload="{&quot;id&quot;:&quot;b&quot;}">选择 B</button></div></div></div>',
      js: '',
      stages: ['css', 'html'],
      partial: false,
    },
  },
  {
    id: 'tabs-panel',
    title: '分段面板',
    summary: '本地 tabs，无模型往返',
    spec: {
      title: '分段面板',
      height: 260,
      css: '',
      html: '<div class="iui-sandbox-card iui-sandbox-tabs"><div class="iui-sandbox-tabbar" role="tablist"><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="true" data-tab="概览">概览</button><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="false" data-tab="明细">明细</button><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="false" data-tab="备注">备注</button></div><div class="iui-sandbox-stage" data-stage="概览" data-active="1"><p>本机状态正常。</p><div class="iui-sandbox-grid"><div class="iui-sandbox-kpi"><div class="label">CPU</div><div class="value" data-iui-bind="cpu">34%</div></div><div class="iui-sandbox-kpi"><div class="label">内存</div><div class="value" data-iui-bind="mem">62%</div></div></div></div><div class="iui-sandbox-stage" data-stage="明细" data-active="0"><p class="iui-sandbox-muted">进程表可用 ```iui 表格卡；此处仅示意。</p><ul><li>node · 12%</li><li>chrome · 18%</li></ul></div><div class="iui-sandbox-stage" data-stage="备注" data-active="0"><p class="iui-sandbox-muted">本地切换，不调模型。</p></div></div>',
      js: 'document.querySelectorAll(".iui-sandbox-tab").forEach(function(btn){btn.onclick=function(){var id=btn.getAttribute("data-tab");document.querySelectorAll(".iui-sandbox-tab").forEach(function(b){b.setAttribute("aria-selected",b===btn?"true":"false")});document.querySelectorAll(".iui-sandbox-stage").forEach(function(s){s.setAttribute("data-active",s.getAttribute("data-stage")===id?"1":"0")});window.iuiSandbox.action("tab_change",{tab:id});window.iuiSandbox.resize()}});',
      stages: ['html', 'js'],
      partial: false,
    },
  },
  {
    id: 'echarts-mini',
    title: 'ECharts 迷你',
    summary: 'CDN 折线（allowlist）',
    spec: {
      title: 'ECharts 迷你',
      height: 320,
      css: '#chart{height:240px;width:100%}',
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>趋势</strong><span class="iui-sandbox-muted" data-iui-bind="label">示例</span></div><div id="chart"></div></div><script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"><\/script>',
      js: 'var el=document.getElementById("chart");if(!window.echarts||!el){document.body.insertAdjacentHTML("beforeend","<pre data-iui-error=1>echarts 未加载</pre>");}else{var chart=echarts.init(el);chart.setOption({animationDuration:400,grid:{left:28,right:12,top:24,bottom:28},xAxis:{type:"category",data:["10","12","14","16","18"],axisLabel:{fontSize:11}},yAxis:{type:"value",splitLine:{lineStyle:{type:"dashed"}},axisLabel:{fontSize:11}},series:[{type:"line",smooth:true,areaStyle:{opacity:0.12},data:[18,21,23,22,19],lineStyle:{width:2}}]});window.addEventListener("resize",function(){chart.resize()});window.iuiSandbox.resize()}',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },

  {
    id: 'ds-kit',
    title: '设计系统套件',
    summary: 'token 驱动的 badge / alert / field / hero',
    spec: {
      title: '设计系统套件',
      height: 420,
      css: '.stack{display:flex;flex-direction:column;gap:var(--iui-pack-gap)}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      html: '<div class="iui-sandbox-card stack"><div class="iui-sandbox-hero"><p class="title">沙箱设计系统</p><p class="sub">颜色 / 圆角 / 密度来自当前 pack token，无硬编码色值</p></div><div class="row"><span class="iui-sandbox-badge">默认</span><span class="iui-sandbox-badge warn">警告</span><span class="iui-sandbox-badge danger">危险</span></div><div class="iui-sandbox-alert ok">成功态提示：提交已接收。</div><div class="iui-sandbox-alert warn">注意：磁盘占用偏高。</div><hr class="iui-sandbox-divider"/><div class="iui-sandbox-field"><label class="iui-sandbox-label">昵称</label><input name="nick" placeholder="token 边框与焦点环" data-iui-bind="nick"/></div><ul class="iui-sandbox-list"><li><span class="iui-sandbox-badge">A</span><span>列表项使用 surface / border token</span></li><li><span class="iui-sandbox-badge warn">B</span><span>可与 host bindings 联动</span></li></ul><div class="iui-sandbox-toolbar"><button type="button" data-iui-action="ds_kit_ok">确认</button><button type="button" class="secondary" data-iui-action="ds_kit_cancel">取消</button></div></div>',
      js: '',
      stages: ['css', 'html'],
      partial: false,
    },
  },

  {
    id: 'sort-viz',
    title: '排序可视化',
    summary: '冒泡排序动画小工具',
    spec: {
      title: '排序可视化',
      height: 360,
      placeholder: '准备动画…',
      css: '.wrap{display:flex;flex-direction:column;gap:12px}.bars{display:flex;align-items:flex-end;gap:4px;height:160px}.bar{flex:1;background:var(--iui-pack-accent,#18181b);border-radius:6px 6px 0 0;transition:height .2s ease,background .2s ease}.bar.active{background:var(--iui-pack-warn,#d97706)}.bar.done{background:var(--iui-pack-ok,#16a34a)}',
      html: '<div class="iui-sandbox-card wrap"><div class="iui-sandbox-toolbar"><strong>冒泡排序</strong><button type="button" id="run">开始</button><button type="button" class="secondary" id="shuffle">打乱</button><button type="button" data-iui-send-prompt="再做一个选择排序可视化">继续问</button></div><div class="bars" id="bars"></div><p class="iui-sandbox-muted" id="hint">本地动画，不调模型</p></div>',
      js: 'var arr=[4,7,2,9,1,5,8,3],busy=false;function paint(active){var el=document.getElementById("bars");el.innerHTML="";var max=Math.max.apply(null,arr);arr.forEach(function(v,i){var d=document.createElement("div");d.className="bar"+(active===i?" active":"");d.style.height=Math.max(8,(v/max)*150)+"px";el.appendChild(d)})}function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}async function bubble(){if(busy)return;busy=true;var a=arr.slice();for(var i=0;i<a.length;i++){for(var j=0;j<a.length-i-1;j++){arr=a;paint(j);await sleep(120);if(a[j]>a[j+1]){var t=a[j];a[j]=a[j+1];a[j+1]=t}}}arr=a;paint(-1);document.querySelectorAll(".bar").forEach(function(b){b.classList.add("done")});busy=false;window.iuiSandbox.action("sort_done",{arr:arr})}document.getElementById("run").onclick=bubble;document.getElementById("shuffle").onclick=function(){if(busy)return;arr=arr.map(function(){return 1+Math.floor(Math.random()*9)});paint(-1)};paint(-1);',
      stages: ['placeholder','css','html','js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'bento-dash',
    title: 'Bento 看板',
    summary: 'KPI + 折线占位 + 外链',
    spec: {
      title: 'Bento 看板',
      height: 420,
      css: '.bento{display:grid;gap:12px;grid-template-columns:repeat(6,1fr)}.span2{grid-column:span 2}.span3{grid-column:span 3}.span6{grid-column:span 6}@media(max-width:640px){.bento{grid-template-columns:1fr}.span2,.span3,.span6{grid-column:span 1}}',
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>本周概览</strong><button type="button" data-iui-open-link="https://www.openstreetmap.org">打开 OSM</button><button type="button" class="secondary" data-iui-send-prompt="把这块看板改成暗色风格">改暗色</button></div><div class="bento"><div class="iui-sandbox-kpi span2"><div class="label">活跃</div><div class="value" data-iui-bind="active">1,284</div></div><div class="iui-sandbox-kpi span2"><div class="label">转化</div><div class="value" data-iui-bind="conv">3.6%</div></div><div class="iui-sandbox-kpi span2"><div class="label">延迟</div><div class="value" data-iui-bind="p95">142ms</div></div><div class="iui-sandbox-kpi span3"><div class="label">趋势</div><svg viewBox="0 0 200 60" width="100%" height="72"><polyline fill="none" stroke="currentColor" stroke-width="2" points="0,40 40,28 80,32 120,18 160,22 200,10"/></svg></div><div class="iui-sandbox-kpi span3"><div class="label">备注</div><p class="iui-sandbox-muted">自由 HTML 沙箱 · token 驱动</p></div></div></div>',
      js: '',
      stages: ['css','html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'particle',
    title: '粒子仿真',
    summary: 'Canvas 轻量粒子',
    spec: {
      title: '粒子仿真',
      height: 380,
      css: 'canvas{width:100%;height:260px;border-radius:12px;border:1px solid var(--iui-pack-border,#e5e7eb);background:var(--iui-pack-surface-muted,#f4f4f5);display:block}',
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>粒子</strong><button type="button" id="burst">爆发</button></div><canvas id="c" width="640" height="260"></canvas></div>',
      js: 'var c=document.getElementById("c"),ctx=c.getContext("2d"),ps=[];function spawn(n){for(var i=0;i<n;i++)ps.push({x:c.width/2,y:c.height/2,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:60+Math.random()*40})}function tick(){ctx.clearRect(0,0,c.width,c.height);ps=ps.filter(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=0.04;p.life--;ctx.globalAlpha=Math.max(0,p.life/100);ctx.fillStyle="#18181b";ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();return p.life>0});ctx.globalAlpha=1;if(ps.length<160)spawn(3);requestAnimationFrame(tick)}document.getElementById("burst").onclick=function(){spawn(48);window.iuiSandbox.action("particle_burst",{n:48})};spawn(24);tick();',
      stages: ['css','html','js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },

  {
    id: 'form-bridge',
    title: '表单桥',
    summary: 'data-iui-form 本地提交',
    spec: {
      title: '表单桥',
      height: 300,
      css: '.f{display:flex;flex-direction:column;gap:8px}label{font-size:12px;color:#6b7280}',
      html: '<form class="iui-sandbox-card f" data-iui-form="intake_submit"><div><label>目的地</label><input name="dest" placeholder="城市 / 地标" data-iui-bind="dest"/></div><div><label>日期</label><input name="date" type="date"/></div><div><label><input name="round" type="checkbox"/> 往返</label></div><button type="submit">提交</button><p class="iui-sandbox-muted" id="msg">提交后回传 action，不离开沙箱</p></form>',
      js: 'document.querySelector("[data-iui-form]").addEventListener("iui-after-submit",function(){});window.addEventListener("message",function(){});',
      stages: ['css', 'html', 'js'],
      partial: false,
    },
  },
]

export const HTML_SANDBOX_STARTERS: readonly HtmlSandboxStarter[] = [
  ...HTML_SANDBOX_STARTERS_CORE,
  ...OIU_PATTERN_STARTERS,
]

export function listHtmlSandboxStarters(): readonly HtmlSandboxStarter[] {
  return HTML_SANDBOX_STARTERS
}

export function getHtmlSandboxStarter(id: string): HtmlSandboxStarter | undefined {
  return HTML_SANDBOX_STARTERS.find((item) => item.id === id)
}

/** Serialize a starter as a closed ```iui-html fence body (JSON). */
export function starterToFenceBody(starter: HtmlSandboxStarter): string {
  return JSON.stringify({
    title: starter.spec.title,
    height: starter.spec.height,
    css: starter.spec.css,
    html: starter.spec.html,
    js: starter.spec.js,
  }, null, 2)
}
