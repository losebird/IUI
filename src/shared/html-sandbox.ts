/**
 * Open ```iui-html sandbox: parse fence body into css/html/js and build a
 * sandboxed iframe srcdoc. CDN hosts live in HTML_SANDBOX_CDN_ALLOWLIST
 * (single source of truth). Design tokens inject via build options.
 */

import { DESIGN_ENHANCE_JS } from './design-enhance.ts'
import { IUI_TOKEN_CATALOG, tokenCatalogToCssVars, cssVarsToInline } from '../themes/tokens.ts'
import { sandboxBrandCssVars } from '../themes/sandbox-brand.ts'
import { buildHostKitCss } from '../themes/host-kit.ts'
import { buildTripAnimatorScriptTag } from './trip-animator.ts'
import { PATTERN_STARTERS } from './pattern-starters.ts'
import { CSS_COLOR_RESOLVER_SRC, DEFAULT_IUI_THEME, buildIuiDaisyCss, legacyElementLayer, normalizeIuiTheme, type IuiThemeId } from '../themes/iui-daisy.ts'
import { buildTripPhotoFillScript, enrichPlaceMediaHtml } from './trip-images.ts'
import { AMAP_TILE, AMAP_TILE_ORIGINS, GCJ_CRS_JS, GCJ_JS, getNetContext, withNetContext, type NetContext } from './net-context.ts'
import { buildAuthorJsRuntimeSource, splitAuthorJsChunks, jsonEmbed } from './author-js-runtime.ts'
import { VENDOR_CDN_HOSTS, buildSriLookupSource, buildVendorImportmapScriptTag, customCdnOrigin, getVendorSource, normalizeDeclaredLibs, rewriteKnownCdnUrl, vendorBaseOrigin, vendorCdnUrl, vendorCssUrls, vendorJsUrls, vendorSriAttrs, withVendorSource, type VendorId, type VendorSource } from './vendor-registry.ts'
import { normalizeAccent, pageAccentCss } from './page-accent.ts'
import { buildIconRuntimeScript, pageWantsIcons } from './icon-runtime.ts'
import { buildStage3dRuntimeScript, MODEL_CONNECT_ORIGINS, pageWants3d } from './stage3d-runtime.ts'
import { buildMotionRuntimeScript } from './motion-runtime.ts'
import { buildTailwindCss, installTailwindHost } from '../themes/tailwind-jit.ts'
export { splitAuthorJsChunks } from './author-js-runtime.ts'

// visual(③): answer Tailwind top-up requests from sandbox frames (browser hosts only).
installTailwindHost()

/**
 * Chrome/Safari reject video.play() with AbortError when pause()/src change
 * interrupts it (https://goo.gl/LdLk22). Not an author crash — do not paint
 * the sandbox failure strip.
 */
export function isBenignMediaAbort(reason: unknown): boolean {
  if (reason == null) return false
  const name = typeof reason === 'object' && reason && 'name' in reason
    ? String((reason as { name?: unknown }).name || '')
    : ''
  const msg = typeof reason === 'object' && reason && 'message' in reason
    ? String((reason as { message?: unknown }).message || '')
    : String(reason)
  if (name === 'AbortError') return true
  const lower = msg.toLowerCase()
  return lower.includes('play() request was interrupted')
    || (lower.includes('the play() request was interrupted') && lower.includes('pause()'))
    || lower.includes('goo.gl/ldlk22')
}

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
 * Esri World_Street_Map is allowlisted and reliable in sandboxes (CartoCDN
 * now serves API-key watermark tiles, so carto URLs are rewritten to this).
 */
export const IUI_DEFAULT_MAP_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
export const IUI_DEFAULT_MAP_TILE_ATTR =
  'Tiles &copy; Esri'
/**
 * Fallback raster chain when Esri returns tileerror or regional gaps
 * ("Map data not yet available"). OSM FR HOT first (China/JP coverage),
 * then Esri Light Gray. Never World_Topo_Map — that colorful terrain looks
 * like "the map is wrong" next to the muted street basemap.
 * East-Asia centers skip Esri Street and start on OSM FR HOT immediately.
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
]

export type HtmlSandboxSpec = {
  title?: string
  /** F24: stable page identity across versions (`id:` header); falls back to the title. */
  id?: string
  /** G2: optional page accent (`accent: #E4572E`); host derives a contrast-safe token set. */
  accent?: string
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
  /**
   * C9: libraries the fence declares (`libs: leaflet, chart` header or JSON
   * `libs`). Declared libs always load; undeclared ones only on real API calls.
   */
  libs?: readonly VendorId[]
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
  /** F19: library source preset (Settings → IUI → 资源源); default `local`. */
  cdnSource?: VendorSource
  /** Batch F: probe-derived basemap (AMap on mainland networks) + photo strategy. */
  net?: Partial<NetContext>
  /**
   * F17: plugin UI language (`<html lang>`). The in-frame failure strip, code
   * tools and photo credits follow it instead of `navigator.language`.
   */
  uiLang?: string
  /** F10: persisted localStorage items seeded before the bridge / author JS. */
  storageSeed?: Readonly<Record<string, string>>
  /** G10: appearance CSS (accent / density / size / radius) baked in for first paint. */
  appearanceCss?: string
  /** G10: forced colour scheme (the bridge rewrites prefers-color-scheme rules). */
  appearanceScheme?: 'auto' | 'light' | 'dark'
  /** F4: strict image policy — img-src/font-src drop the `https:` wildcard. */
  strictImages?: boolean
  /** visual(①): built-in theme (`iui` follows light/dark; `corporate` / `dim` are fixed). */
  theme?: IuiThemeId
  /** CSS custom properties injected as :root (active IUI theme). */
  designTokens?: Readonly<Record<string, string>>
  /** Extra base CSS after design tokens, before author css. */
  baseCss?: string
  /**
   * Live `#iui-preview-root` innerHTML from the running iframe (share snapshot).
   * When set, download/srcdoc uses this instead of the fence html.
   */
  liveHtml?: string
  /** Live `#iui-author-css` text from the running iframe. */
  liveCss?: string
  /** Captured localState to restore after author JS in a downloaded snapshot. */
  liveState?: Record<string, unknown>
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
  /**
   * C6: absolute URL of the plugin asset route (e.g.
   * `http://127.0.0.1:1234/plugins/@losebird/iui/assets`). When set, sandbox
   * libraries load from `<assetBase>/vendor/...` first, CDNs are fallbacks.
   */
  assetBase?: string
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
  | { source: 'iui-html'; type: 'sendPrompt'; frameId: string; text: string; summary?: boolean }
  | { source: 'iui-html'; type: 'openLink'; frameId: string; url: string }
  /** D8: copy from an opaque-origin frame (host writes the clipboard on the same click). */
  | { source: 'iui-html'; type: 'copyText'; frameId: string; text: string; reqId?: string }
  /** F18: host-delegated file download (the frame has no allow-downloads). */
  | { source: 'iui-html'; type: 'download'; frameId: string; filename: string; mime: string; data: string | ArrayBuffer; reqId?: string }
  /** @deprecated Prefer bridgeReady — kept as handshake alias. Does NOT mean libs/author ready. */
  | { source: 'iui-html'; type: 'ready'; frameId: string }
  | { source: 'iui-html'; type: 'bridgeReady'; frameId: string }
  | { source: 'iui-html'; type: 'libsReady'; frameId: string }
  /** F6: 1s watchdog heartbeat from the bridge. */
  | { source: 'iui-html'; type: 'heartbeat'; frameId: string }
  /** F11: Escape pressed inside the page (host exits overlay fullscreen). */
  | { source: 'iui-html'; type: 'escape'; frameId: string }
  | { source: 'iui-html'; type: 'authorSettled'; frameId: string; ok: boolean; failedChunks?: number }
  | { source: 'iui-html'; type: 'error'; frameId: string; message: string; kind?: 'author' | 'host'; chunkIndex?: number; chunkTotal?: number; strip?: boolean }
  | { source: 'iui-html'; type: 'stripAction'; frameId: string; action: 'reload' | 'reask' | 'switchCdn'; detail?: string }
  | { source: 'iui-html'; type: 'localState'; frameId: string; state: Record<string, unknown> }
  | { source: 'iui-html'; type: 'snapshot'; frameId: string; html: string; css: string; state: Record<string, unknown>; resources?: Array<{ url: string; type: string }> }
  /** G9: static page copy for a frozen card (`html` empty + `reason` when refused). */
  | { source: 'iui-html'; type: 'frozen'; frameId: string; html: string; reason?: string }
  /** G12: PNG of the page (`dataUrl` empty + `reason` when it failed; `failed` = resources not inlined). */
  | { source: 'iui-html'; type: 'image'; frameId: string; dataUrl: string; width?: number; height?: number; failed?: number; reason?: string }
  /** G12: during a capture, an image / stylesheet the frame cannot fetch itself (reply: hostResult.data). */
  | { source: 'iui-html'; type: 'fetchResource'; frameId: string; url: string; as: 'dataUrl' | 'text'; reqId: string }
  | { source: 'iui-html'; type: 'selfCheck'; frameId: string; issues: SandboxSelfCheckIssue[]; serious: number }
  /** F10: debounced full snapshot of the page's persistent storage items. */
  | { source: 'iui-html'; type: 'storageSet'; frameId: string; items: Record<string, string> }


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
  | { source: 'iui-html-host'; type: 'requestSnapshot'; frameId: string }
  /** G9: the card scrolled out of / into view (pause rAF, intervals, animations, video). */
  | { source: 'iui-html-host'; type: 'visibility'; frameId: string; visible: boolean }
  /** G10: zero-token appearance (accent / density / size / radius CSS + forced scheme). */
  | { source: 'iui-html-host'; type: 'appearance'; frameId: string; css: string; scheme: 'auto' | 'light' | 'dark' }
  /** G9: ask for a static copy of the page (reply: `frozen`). */
  | { source: 'iui-html-host'; type: 'requestFreeze'; frameId: string }
  /** G12: render the page to PNG (reply: `image`). */
  | { source: 'iui-html-host'; type: 'requestImage'; frameId: string; background?: string }
  /** F10: late-loaded persistent items (merged under writes made since boot). */
  | { source: 'iui-html-host'; type: 'storageInit'; frameId: string; items: Record<string, string> }
  /** F10: the last storageSet exceeded the per-page quota and was not saved. */
  | { source: 'iui-html-host'; type: 'storageQuota'; frameId: string; limit: number }
  /** F18: reply to a delegated download / copy (`reason`: gesture | blocked | tooLarge | rate | failed). */
  | { source: 'iui-html-host'; type: 'hostResult'; frameId: string; reqId: string; ok: boolean; reason?: string; data?: string }

/** G9: frozen-card static copy cap (the frame refuses larger pages). */
export const SANDBOX_FREEZE_MAX_CHARS = 3_000_064

/** G12: page image cap (PNG data URL) and per-resource cap for capture fetches. */
/** G15: self-check findings posted once after the page settles. */
export const SELF_CHECK_KINDS = ['smallText', 'lowContrast', 'overflowX', 'blankCanvas', 'brokenImage', 'consoleError', 'blankArea'] as const
export type SandboxSelfCheckKind = (typeof SELF_CHECK_KINDS)[number]
/** One low-contrast element as measured in the frame (computed colors, composited backdrop). */
export interface SandboxContrastSample { text: string; sel: string; ratio: number; fg: string; bg: string }
export interface SandboxSelfCheckIssue { kind: SandboxSelfCheckKind; count: number; serious: boolean; detail?: string; minRatio?: number; samples?: SandboxContrastSample[] }

function isSelfCheckSamples(v: unknown): v is SandboxContrastSample[] {
  return Array.isArray(v) && v.length <= 5 && v.every((x) => x !== null && typeof x === 'object'
    && typeof (x as SandboxContrastSample).text === 'string' && (x as SandboxContrastSample).text.length <= 80
    && typeof (x as SandboxContrastSample).sel === 'string' && (x as SandboxContrastSample).sel.length <= 80
    && typeof (x as SandboxContrastSample).ratio === 'number' && Number.isFinite((x as SandboxContrastSample).ratio)
    && typeof (x as SandboxContrastSample).fg === 'string' && /^#[0-9a-f]{6}$/i.test((x as SandboxContrastSample).fg)
    && typeof (x as SandboxContrastSample).bg === 'string' && /^#[0-9a-f]{6}$/i.test((x as SandboxContrastSample).bg))
}

export const SANDBOX_IMAGE_MAX_CHARS = 48 * 1024 * 1024
export const SANDBOX_RESOURCE_MAX_CHARS = 12 * 1024 * 1024

/** F18: delegated download cap (10 MB; strings are checked by length first). */
export const SANDBOX_DOWNLOAD_MAX_CHARS = 10 * 1024 * 1024

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
  if (record.type === 'requestSnapshot') return true
  if (record.type === 'visibility') return typeof record.visible === 'boolean'
  if (record.type === 'requestFreeze') return true
  if (record.type === 'requestImage') return record.background === undefined || (typeof record.background === 'string' && record.background.length <= 100)
  if (record.type === 'appearance') {
    return typeof record.css === 'string' && record.css.length <= 20_000
      && (record.scheme === 'auto' || record.scheme === 'light' || record.scheme === 'dark')
  }
  if (record.type === 'storageInit') {
    return typeof record.items === 'object' && record.items !== null && !Array.isArray(record.items)
  }
  if (record.type === 'storageQuota') return typeof record.limit === 'number'
  if (record.type === 'hostResult') {
    return typeof record.reqId === 'string' && record.reqId.length <= 40 && typeof record.ok === 'boolean'
      && (record.reason === undefined || (typeof record.reason === 'string' && record.reason.length <= 40))
      && (record.data === undefined || (typeof record.data === 'string' && record.data.length <= SANDBOX_RESOURCE_MAX_CHARS))
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
  if (record.reqId !== undefined && (typeof record.reqId !== 'string' || record.reqId.length > 40)) return false
  if (record.type === 'copyText') {
    return typeof record.text === 'string' && record.text.length <= 200_064
  }
  if (record.type === 'download') {
    if (typeof record.filename !== 'string' || record.filename.length > 300) return false
    if (typeof record.mime !== 'string' || record.mime.length > 200) return false
    if (typeof record.data === 'string') return record.data.length <= SANDBOX_DOWNLOAD_MAX_CHARS
    return record.data instanceof ArrayBuffer && record.data.byteLength <= SANDBOX_DOWNLOAD_MAX_CHARS
  }
  if (record.type === 'ready' || record.type === 'bridgeReady' || record.type === 'libsReady' || record.type === 'heartbeat' || record.type === 'escape') return true
  if (record.type === 'authorSettled') {
    return typeof record.ok === 'boolean'
  }
  if (record.type === 'error') {
    if (typeof record.message !== 'string') return false
    if (record.kind !== undefined && record.kind !== 'author' && record.kind !== 'host') return false
    if (record.chunkIndex !== undefined && typeof record.chunkIndex !== 'number') return false
    if (record.chunkTotal !== undefined && typeof record.chunkTotal !== 'number') return false
    if (record.strip !== undefined && typeof record.strip !== 'boolean') return false
    return true
  }
  if (record.type === 'stripAction') {
    return (record.action === 'reload' || record.action === 'reask' || record.action === 'switchCdn')
      && (record.detail === undefined || (typeof record.detail === 'string' && record.detail.length <= 2000))
  }
  if (record.type === 'localState') {
    return typeof record.state === 'object' && record.state !== null && !Array.isArray(record.state)
  }
  if (record.type === 'storageSet') {
    return typeof record.items === 'object' && record.items !== null && !Array.isArray(record.items)
  }
  if (record.type === 'frozen') {
    return typeof record.html === 'string' && record.html.length <= SANDBOX_FREEZE_MAX_CHARS
      && (record.reason === undefined || (typeof record.reason === 'string' && record.reason.length <= 40))
  }
  if (record.type === 'image') {
    return typeof record.dataUrl === 'string' && record.dataUrl.length <= SANDBOX_IMAGE_MAX_CHARS
      && (record.dataUrl === '' || record.dataUrl.startsWith('data:image/png'))
      && (record.reason === undefined || (typeof record.reason === 'string' && record.reason.length <= 40))
  }
  if (record.type === 'selfCheck') {
    return Array.isArray(record.issues) && record.issues.length <= 10
      && record.issues.every((x) => x !== null && typeof x === 'object'
        && SELF_CHECK_KINDS.includes((x as { kind?: unknown }).kind as SandboxSelfCheckKind)
        && typeof (x as { count?: unknown }).count === 'number' && Number.isFinite((x as { count: number }).count)
        && typeof (x as { serious?: unknown }).serious === 'boolean'
        && ((x as { detail?: unknown }).detail === undefined || (typeof (x as { detail?: unknown }).detail === 'string' && ((x as { detail: string }).detail.length <= 160)))
        && ((x as { minRatio?: unknown }).minRatio === undefined || (typeof (x as { minRatio?: unknown }).minRatio === 'number' && Number.isFinite((x as { minRatio: number }).minRatio)))
        && ((x as { samples?: unknown }).samples === undefined || isSelfCheckSamples((x as { samples?: unknown }).samples)))
      && typeof record.serious === 'number' && Number.isFinite(record.serious)
  }
  if (record.type === 'fetchResource') {
    return typeof record.url === 'string' && /^(https?:|blob:)/i.test(record.url) && record.url.length <= 2000
      && (record.as === 'dataUrl' || record.as === 'text')
      && typeof record.reqId === 'string' && record.reqId.length <= 40
  }
  if (record.type === 'snapshot') {
    return typeof record.html === 'string' && record.html.length <= 200_064
      && typeof record.css === 'string' && record.css.length <= 200_064
      && typeof record.state === 'object' && record.state !== null && !Array.isArray(record.state)
      && (record.resources === undefined || (Array.isArray(record.resources) && record.resources.length <= 800
        && record.resources.every((r) => r !== null && typeof r === 'object'
          && typeof (r as { url?: unknown }).url === 'string' && ((r as { url: string }).url).length <= 2000
          && typeof (r as { type?: unknown }).type === 'string' && ((r as { type: string }).type).length <= 40)))
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

/**
 * Author JS often calls `action('sandbox_open_link', {url})` for an
 * outbound official site. That must open the URL locally — never
 * `[genui-action]` a new generation. Returns the allowed URL, or null.
 */
export function sandboxOpenLinkUrl(action: string, payload: Record<string, unknown> | undefined): string | null {
  if (!/open[_-]?link/i.test(String(action || ''))) return null
  const raw = payload && typeof payload.url === 'string' ? payload.url.trim() : ''
  return isAllowedSandboxOpenUrl(raw) ? raw : null
}

/** Max author CSS / JS bytes kept in srcdoc (defence in depth). */
export const HTML_SANDBOX_MAX_AUTHOR_BYTES = 48_000
/** Max author HTML bytes kept in srcdoc. */
export const HTML_SANDBOX_MAX_HTML_BYTES = 200_000
/** Soft ceiling for entire srcdoc (warn/truncate author assets earlier). visual(①): +160 kB for the inlined daisyUI theme base. */
export const HTML_SANDBOX_MAX_SRCDOC_BYTES = 660_000

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

const SINGLE_SMART = new Set(['\u2018', '\u2019', '\u2032'])
const DOUBLE_SMART = new Set(['\u201C', '\u201D', '\u2033'])

/** Keywords after which `/` starts a regex, not division. */
const REGEX_PREFIX_KW = new Set([
  'return', 'throw', 'case', 'typeof', 'void', 'delete', 'new', 'await', 'yield',
  'in', 'of', 'instanceof', 'else', 'do',
])

function skipJsString(source: string, start: number): number {
  const q = source[start]!
  let escape = false
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i]!
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === q) return i + 1
    if (q !== '`' && ch === '\n') return i
  }
  return source.length
}

/** Skip a regex literal starting at `start` (`/`). Handles `[...]` so quotes in a class stay in the regex. */
function skipJsRegex(source: string, start: number): number {
  let inClass = false
  let escape = false
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i]!
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') { inClass = true; continue }
    if (ch === '\n') return i
    if (ch === '/') {
      i++
      while (i < source.length && /[gimsuy]/.test(source[i]!)) i++
      return i
    }
  }
  return source.length
}

/**
 * Call `fn` for each character that participates in brace/paren matching.
 * Strings, comments, and regex literals (including `/\"/g` and `/['\"]/g`) are skipped.
 */
export function forEachJsCodeChar(source: string, fn: (i: number, ch: string) => void): void {
  if (!source) return
  let i = 0
  let lastWasValue = false
  const n = source.length
  while (i < n) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipJsString(source, i)
      lastWasValue = true
      continue
    }
    if (ch === '/') {
      if (!lastWasValue) {
        i = skipJsRegex(source, i)
        lastWasValue = true
        continue
      }
      fn(i, ch)
      lastWasValue = false
      i++
      continue
    }
    if ((ch === '+' || ch === '-') && next === ch) {
      fn(i, ch)
      fn(i + 1, next)
      lastWasValue = true
      i += 2
      continue
    }
    if (ch === ')' || ch === ']') {
      fn(i, ch)
      lastWasValue = true
      i++
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1
      while (j < n && /[\w$]/.test(source[j]!)) j++
      const ident = source.slice(i, j)
      for (let k = i; k < j; k++) fn(k, source[k]!)
      lastWasValue = !REGEX_PREFIX_KW.has(ident)
      i = j
      continue
    }
    if (ch >= '0' && ch <= '9') {
      fn(i, ch)
      lastWasValue = true
      i++
      while (i < n && /[\w.$]/.test(source[i]!)) {
        fn(i, source[i]!)
        i++
      }
      continue
    }
    fn(i, ch)
    lastWasValue = false
    i++
  }
}

/**
 * Convert smart quotes used as JS delimiters, but leave apostrophes inside
 * already-opened ASCII strings alone (`'s’aider'` must stay valid).
 */
export function rewriteSmartQuotesStringAware(source: string): string {
  if (!source) return source
  let out = ''
  let mode: 'out' | "'" | '"' | '`' | 'smart-single' | 'smart-double' = 'out'
  let escape = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    const next = source[i + 1]
    if (inLineComment) {
      out += ch
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      out += ch
      if (ch === '*' && next === '/') {
        out += next
        i++
        inBlockComment = false
      }
      continue
    }
    if (mode !== 'out') {
      if (escape) { out += ch; escape = false; continue }
      if (ch === '\\') { out += ch; escape = true; continue }
      if (mode === "'" && ch === "'") { out += ch; mode = 'out'; continue }
      if (mode === '"' && ch === '"') { out += ch; mode = 'out'; continue }
      if (mode === '`' && ch === '`') { out += ch; mode = 'out'; continue }
      if (mode === 'smart-single' && (ch === "'" || SINGLE_SMART.has(ch))) {
        out += "'"
        mode = 'out'
        continue
      }
      if (mode === 'smart-double' && (ch === '"' || DOUBLE_SMART.has(ch))) {
        out += '"'
        mode = 'out'
        continue
      }
      out += ch
      continue
    }
    if (ch === '/' && next === '/') { out += ch; inLineComment = true; continue }
    if (ch === '/' && next === '*') { out += ch; inBlockComment = true; continue }
    if (ch === "'") { out += ch; mode = "'"; continue }
    if (ch === '"') { out += ch; mode = '"'; continue }
    if (ch === '`') { out += ch; mode = '`'; continue }
    if (SINGLE_SMART.has(ch)) { out += "'"; mode = 'smart-single'; continue }
    if (DOUBLE_SMART.has(ch)) { out += '"'; mode = 'smart-double'; continue }
    out += ch
  }
  return out
}

/**
 * Soft-harden model-authored JS before eval in the sandbox.
 * Fixes the long-tail SyntaxErrors we can heal without a full parser:
 * smart quotes used as delimiters, BOM/control chars, `</script>` breakout,
 * lightly unbalanced braces.
 * Does NOT claim to fix arbitrary broken model JS, and must not break a
 * legal curly apostrophe inside an ASCII-quoted string.
 */
/**
 * `true` = parses as a classic script body, `false` = SyntaxError, `null` = cannot tell
 * (no Function constructor, e.g. a host page CSP without 'unsafe-eval').
 */
export function authorJsParses(source: string): boolean | null {
  try {
    // Compile only — never executed.
    // eslint-disable-next-line no-new-func
    new Function(source)
    return true
  } catch (error) {
    return error instanceof SyntaxError ? false : null
  }
}

export function hardenAuthorJs(source: string): string {
  if (!source) return source
  const cleaned = source
    .replace(/^\uFEFF/, '')
    // Keep \t \n \r; strip other C0 controls that break parsers.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/script/gi, '<\\/script')
  // F28: valid JS is never "repaired". The heuristics below (bracket balancing,
  // dash/quote rewrites…) exist for broken model output only; on valid code they
  // have appended stray `)}}` after template literals and rewritten visible text.
  if (authorJsParses(cleaned) === true) return sanitizeAuthorRegexFlags(cleaned)
  let out = rewriteSmartQuotesStringAware(cleaned)
  out = out.replace(/[\u2013\u2014]/g, '-')
  out = rewriteIllegalImportKeywords(out)
  // Soft-fix model typos BEFORE paren/brace balancing so we don't insert an extra `)`.
  out = out.replace(
    /\b(var|let|const)\s+([A-Za-z_$][\w$]*)\s+([A-Za-z_$][\w$]*)\s*(=)/g,
    '$1 $3 $4',
  )
  out = softFixArrayCallbackParens(out)
  // Chart `var cfg={…};` often misses the object closer *before* the semicolon.
  // Must run BEFORE trailing EOF `}` — a closer at end-of-file cannot heal
  // `Unexpected token ';'` inside the statement.
  out = softCloseObjectBeforeSemicolon(out)
  out = softCloseObjectBeforeCallParen(out)
  // Soft-close truncated objects/arrays/parens (common when model cuts mid-fence).
  // Skip strings AND regex literals — `/\"/g` is not an unclosed string.
  const opens = { '{': 0, '[': 0, '(': 0 }
  const excess = { '{': 0, '[': 0, '(': 0 }
  forEachJsCodeChar(out, (_i, ch) => {
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
  })
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

/**
 * Insert missing `}` immediately before a statement-ending `;` when an object
 * literal assigned after `=` is still open (Suzhou weather:
 * `var cfg={…options:{scales:{y1:{…}}}};` — four closers, five needed).
 * Function-body `{` (wx(c){c=Number(c);}) and `for (...)` parens are ignored.
 * Cap at 4. No-op if the file already parses.
 */
export function softCloseObjectBeforeSemicolon(source: string): string {
  if (!source) return source
  const ok = (src: string): boolean => {
    try {
      new Function(src)
      return true
    } catch {
      return false
    }
  }
  if (ok(source)) return source

  type Frame = { kind: 'fn' | 'obj' | 'arr' | 'paren'; objDepth: number }
  const stack: Frame[] = []
  let lastWasEq = false
  let lastWasKwFn = false
  const sites: Array<{ i: number; missing: number }> = []

  forEachJsCodeChar(source, (i, ch) => {
    const top = stack[stack.length - 1]
    if (ch === '{') {
      if (top?.kind === 'obj') {
        top.objDepth++
      } else {
        const asObj = lastWasEq && !lastWasKwFn
        stack.push({ kind: asObj ? 'obj' : 'fn', objDepth: asObj ? 1 : 0 })
      }
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === '}') {
      if (top) {
        if (top.kind === 'obj' && top.objDepth > 1) top.objDepth--
        else stack.pop()
      }
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === '[') {
      stack.push({ kind: 'arr', objDepth: 0 })
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === ']') {
      if (top?.kind === 'arr') stack.pop()
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === '(') {
      stack.push({ kind: 'paren', objDepth: 0 })
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === ')') {
      if (top?.kind === 'paren') stack.pop()
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (ch === '=') {
      lastWasEq = true
      lastWasKwFn = false
      return
    }
    if (ch === ';') {
      const obj = [...stack].reverse().find((f) => f.kind === 'obj')
      if (obj && obj.objDepth > 0) sites.push({ i, missing: obj.objDepth })
      lastWasEq = false
      lastWasKwFn = false
      return
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i
      while (j < source.length && /[\w$]/.test(source[j]!)) j++
      const ident = source.slice(i, j)
      lastWasKwFn = ident === 'function' || ident === 'catch' || ident === 'else' || ident === 'do' || ident === 'try' || ident === 'finally'
      if (ident !== 'function' && ident !== 'catch' && ident !== 'else') lastWasEq = false
      return
    }
    if (ch !== ':' && ch !== ',') {
      lastWasEq = false
      lastWasKwFn = false
    }
  })

  for (let s = sites.length - 1; s >= 0; s--) {
    const site = sites[s]!
    const max = Math.min(4, site.missing)
    for (let n = 1; n <= max; n++) {
      const candidate = `${source.slice(0, site.i)}${'}'.repeat(n)}${source.slice(site.i)}`
      if (ok(candidate)) return candidate
    }
  }
  return source
}

/**
 * `makeChart({…options:{scales:{y:{title:{…}}}}} )` — model closed the
 * object with `)` instead of `}`. Insert the fewest `}` immediately before
 * that `)` when an object argument is still open. Cap at 4. No-op if the
 * file already parses. Does not rewrite a balanced `drawHourly` call.
 */
export function softCloseObjectBeforeCallParen(source: string): string {
  if (!source) return source
  const ok = (src: string): boolean => {
    try {
      new Function(src)
      return true
    } catch {
      return false
    }
  }
  if (ok(source)) return source

  type Frame = { kind: 'fn' | 'obj' | 'arr' | 'paren'; objDepth: number }
  const collect = (src: string): Array<{ i: number; missing: number }> => {
    const stack: Frame[] = []
    let lastWasEq = false
    // Survives `function (cfg)` / `(function ()` parameter lists until `{`.
    let awaitingFnBrace = false
    const found: Array<{ i: number; missing: number }> = []
    forEachJsCodeChar(src, (i, ch) => {
      const top = stack[stack.length - 1]
      if (ch === '{') {
        if (awaitingFnBrace) {
          stack.push({ kind: 'fn', objDepth: 0 })
        } else if (top?.kind === 'obj') {
          top.objDepth++
        } else if (top?.kind === 'paren') {
          stack.push({ kind: 'obj', objDepth: 1 })
        } else {
          stack.push({ kind: lastWasEq ? 'obj' : 'fn', objDepth: lastWasEq ? 1 : 0 })
        }
        lastWasEq = false
        awaitingFnBrace = false
        return
      }
      if (ch === '}') {
        if (top) {
          if (top.kind === 'obj' && top.objDepth > 1) top.objDepth--
          else stack.pop()
        }
        lastWasEq = false
        awaitingFnBrace = false
        return
      }
      if (ch === '[') { stack.push({ kind: 'arr', objDepth: 0 }); lastWasEq = false; return }
      if (ch === ']') { if (top?.kind === 'arr') stack.pop(); lastWasEq = false; return }
      if (ch === '(') { stack.push({ kind: 'paren', objDepth: 0 }); lastWasEq = false; return }
      if (ch === ')') {
        if (top?.kind === 'obj' && top.objDepth > 0) found.push({ i, missing: top.objDepth })
        if (top?.kind === 'paren') stack.pop()
        lastWasEq = false
        return
      }
      if (ch === '=') { lastWasEq = true; return }
      if (ch === ';') { lastWasEq = false; awaitingFnBrace = false; return }
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i
        while (j < src.length && /[\w$]/.test(src[j]!)) j++
        const ident = src.slice(i, j)
        awaitingFnBrace = ident === 'function' || ident === 'catch' || ident === 'else'
          || ident === 'do' || ident === 'try' || ident === 'finally'
        if (!awaitingFnBrace) lastWasEq = false
        return
      }
      if (ch !== ':' && ch !== ',') lastWasEq = false
    })
    return found
  }
  const sites = collect(source)

  const insertAt = (src: string, i: number, n: number): string =>
    `${src.slice(0, i)}${'}'.repeat(n)}${src.slice(i)}`

  // drawDaily + drawHourly can both miss a `}`. Heal the earliest still-open
  // call-object `)` first (later `catch(function(){…})` would be the wrong site).
  const objectCallSites = (src: string, list: Array<{ i: number; missing: number }>) =>
    list.filter((s) => {
      let k = s.i - 1
      while (k >= 0 && (src[k] === ' ' || src[k] === '\n' || src[k] === '\r' || src[k] === '\t')) k--
      return k >= 0 && src[k] === '}'
    })

  let cur = source
  let found = objectCallSites(cur, sites)
  for (let step = 0; step < 6; step++) {
    if (ok(cur)) return cur
    if (!found.length) return source
    let healed: string | null = null
    for (let s = 0; s < found.length && !healed; s++) {
      const site = found[s]!
      const max = Math.min(4, site.missing)
      for (let n = 1; n <= max; n++) {
        const candidate = insertAt(cur, site.i, n)
        if (ok(candidate)) { healed = candidate; break }
      }
    }
    if (healed) return healed
    cur = insertAt(cur, found[0]!.i, 1)
    if (ok(cur)) return cur
    found = objectCallSites(cur, collect(cur))
  }
  return source
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
  const drop = new Set<number>()
  let depthB = 0, depthK = 0, depthP = 0
  forEachJsCodeChar(source, (i, ch) => {
    if (ch === '{') { depthB++; return }
    if (ch === '}') {
      if (depthB === 0) { if (skipBrace > 0) { skipBrace--; drop.add(i) } return }
      depthB--
      return
    }
    if (ch === '[') { depthK++; return }
    if (ch === ']') {
      if (depthK === 0) { if (skipBracket > 0) { skipBracket--; drop.add(i) } return }
      depthK--
      return
    }
    if (ch === '(') { depthP++; return }
    if (ch === ')') {
      if (depthP === 0) { if (skipParen > 0) { skipParen--; drop.add(i) } return }
      depthP--
    }
  })
  if (drop.size === 0) return source
  let out = ''
  for (let i = 0; i < source.length; i++) {
    if (!drop.has(i)) out += source[i]
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

/**
 * Classic-script eval cannot parse `typeof import` or static `import … from`.
 * Feature-detecting the import keyword is itself a SyntaxError; drop it so
 * a following `import('three')` (legal dynamic import) can run.
 * Does not rewrite arbitrary ESM modules.
 */
export function rewriteIllegalImportKeywords(source: string): string {
  if (!source) return source
  let out = source
  out = out.replace(/\btypeof\s+import\s*===?\s*(['"])function\1/g, 'true')
  out = out.replace(/\btypeof\s+import\s*!==?\s*(['"])function\1/g, 'false')
  out = out.replace(/\btypeof\s+import\b/g, "'function'")
  // `import X from 'three'` at statement start → dynamic import assigned later.
  // Keep the rest of the file; callers that use X immediately may still race.
  out = out.replace(
    /(?:^|[\n;])[ \t]*import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s*(['"])three\2\s*;?/g,
    '\nimport("three").then(function(m){ var $1 = m.default || m; });',
  )
  return out
}

export function prepareAuthorJs(source: string): string {
  return hardenAuthorJs(rewriteChartEsmImports(rewriteBlockedMapTileUrls(source)))
}


/** data: images that are safe in <img src> and CSS url(): raster + SVG (no script runs in image context). */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i
/** Per-URL cap for inline data images (F8). */
export const SANDBOX_MAX_DATA_IMAGE_BYTES = 1024 * 1024

export function isSafeDataImageUrl(value: string): boolean {
  const v = value.trim()
  return SAFE_DATA_IMAGE.test(v) && v.length <= SANDBOX_MAX_DATA_IMAGE_BYTES
}

/**
 * Strip dangerous CSS constructs (@import, expression, javascript urls).
 * F8: a blocked url(...) is replaced WHOLE by url(about:invalid) so no stray
 * quote is left behind (the old `url(blocked:` rewrite broke every later rule).
 * Safe data: images (≤1MB) are kept.
 */
export function sanitizeSandboxCss(css: string): string {
  return css
    .replace(/@import\b[^;\n]*/gi, '/* blocked import */')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi,
      (full, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
        const value = (dq ?? sq ?? bare ?? '').trim()
        if (/^(?:javascript|vbscript):/i.test(value)) return 'url(about:invalid)'
        if (/^data:/i.test(value)) return isSafeDataImageUrl(value) ? full : 'url(about:invalid)'
        return full
      },
    )
    .replace(/-moz-binding\s*:/gi, '/* blocked binding */:')
    .replace(/behavior\s*:/gi, '/* blocked behavior */:')
}

/** Raw-text regions where author whitespace / backslashes are content, not junk. */
const RAW_TEXT_REGION = /<(pre|code|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/** Apply `fn` to HTML outside <pre>/<code>/<textarea>/<script>/<style> (F8). */
export function mapOutsideRawText(html: string, fn: (chunk: string) => string): string {
  let out = ''
  let last = 0
  RAW_TEXT_REGION.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RAW_TEXT_REGION.exec(html)) !== null) {
    out += fn(html.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + fn(html.slice(last))
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
  // Model JSON-escape junk cleanup only outside raw-text regions: inside
  // <pre>/<code> a literal `\n` is real content (F8: "a\n b" became "a b").
  return mapOutsideRawText(html, (chunk) => chunk
    .replace(/\\p>/g, '<p>')
    .replace(/(?<=[>\n])\\(?=\s)/g, '') // stray model backslash junk
    .replace(/\\n(?=\s|[\u4e00-\u9fff])/g, '')) // visible '\\n' leaked into text
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
    .replace(/\b(href|src)\s*=\s*(["'])\s*((?:javascript|data|vbscript):(?:(?!\2)[\s\S])*)\2/gi, (full, attr: string, _q: string, value: string) => {
      // F8: <img src="data:image/png…"> is a normal inline image; keep safe ones.
      if (attr.toLowerCase() === 'src' && isSafeDataImageUrl(value)) return full
      return 'data-blocked=""'
    })
}

const SECTION_META = /^(title|height|placeholder|id|page|accent|libs)\s*[:：]\s*(.+)$/iu

function parseSections(raw: string): {
  sections: Record<'css' | 'html' | 'js', string>
  stages: Array<'css' | 'html' | 'js'>
  sawHeader: boolean
  meta: { title?: string; height?: number; placeholder?: string; id?: string; accent?: string; libs?: VendorId[] }
} {
  const meta: { title?: string; height?: number; placeholder?: string; id?: string; accent?: string; libs?: VendorId[] } = {}
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
    if (current !== null) { buf.push(line); continue }
    // Preamble before the first section header: `title: …` / `height: 420` / `placeholder: …`.
    const m = SECTION_META.exec(line.trim())
    if (m) {
      const key = m[1]!.toLowerCase()
      const value = m[2]!.trim()
      if (key === 'height') {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n)) meta.height = Math.min(1200, Math.max(120, n))
      } else if (key === 'title') meta.title = value
      else if (key === 'id' || key === 'page') meta.id = value.slice(0, 80)
      else if (key === 'accent') { const a = normalizeAccent(value); if (a) meta.accent = a }
      else if (key === 'libs') { const l = normalizeDeclaredLibs(value); if (l.length) meta.libs = l }
      else meta.placeholder = value
    }
  }
  flush()
  return { sections, stages, sawHeader, meta }
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

function extractPartialJsonFields(raw: string): Partial<Record<'css' | 'html' | 'js' | 'title' | 'placeholder' | 'jsFunctions', string>> & { height?: number; jsExpressions?: string[]; closed?: string[] } {
  const out: Partial<Record<'css' | 'html' | 'js' | 'title' | 'placeholder' | 'jsFunctions', string>> & { height?: number; jsExpressions?: string[]; closed?: string[] } = {}
  for (const key of ['css', 'html', 'js', 'title', 'placeholder', 'jsFunctions'] as const) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'u')
    const match = re.exec(raw)
    if (match) {
      // F26: remember whether the string literal actually terminated.
      if (raw[match.index + match[0].length] === '"') (out.closed ??= []).push(key)
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
    // F26: never "trim" real fields away (a stray `}` after css used to drop html+js).
    if (/"(?:html|js|css|jsFunctions)"\s*:/.test(repaired.slice(end + 1))) break
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
      // F26: invalid-but-finished JSON (stray `}`, trailing junk, bad escape
      // elsewhere) used to stay "partial" forever → author JS never ran and no
      // error was shown. If both html and js string literals are terminated,
      // the payload is complete; treat it as such.
      const closed = new Set(partial.closed ?? [])
      const looksDone = js !== '' && closed.has('js') && (html === '' || closed.has('html')) && (css === '' || closed.has('css'))
      return {
        css,
        html,
        js,
        stages,
        partial: !looksDone,
        cssComplete: css.length > 0,
        htmlComplete: looksDone,
        jsComplete: looksDone,
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
        ...(typeof parsed.id === 'string' && parsed.id.trim() ? { id: parsed.id.trim().slice(0, 80) } : {}),
        ...(normalizeAccent(parsed.accent) ? { accent: normalizeAccent(parsed.accent)! } : {}),
        ...(normalizeDeclaredLibs(parsed.libs).length ? { libs: normalizeDeclaredLibs(parsed.libs) } : {}),
        ...(height !== undefined ? { height } : {}),
      }
    } catch {
      // fall through
    }
  }

  const { sections, stages, sawHeader, meta } = parseSections(trimmed)
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
      ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.id ? { id: meta.id } : {}),
      ...(meta.accent ? { accent: meta.accent } : {}),
      ...(meta.libs ? { libs: meta.libs } : {}),
      ...(meta.height !== undefined ? { height: meta.height } : {}),
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
${legacyElementLayer(`html,body{margin:0;padding:4px;font:${d.fontSize}/${d.lineHeight} ${vars['--iui-pack-font-family'] ?? 'system-ui,sans-serif'};color:var(--iui-pack-fg,var(--dsl-g-fg));background:transparent;letter-spacing:${d.letterSpacing};-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
button,input,select,textarea{font:inherit}
button{cursor:pointer;border-radius:var(--iui-pack-radius-control,${d.radiusControl});border:1px solid color-mix(in srgb,var(--iui-pack-accent,${accent}) 35%,var(--iui-pack-border));background:var(--iui-pack-accent,${accent});color:var(--iui-pack-on-accent,#fff);padding:8px 12px;min-height:var(--iui-pack-control-h,${d.controlHeight});font-weight:600;transition:transform var(--iui-pack-hover-ms,${m.hoverMs}ms) var(--iui-pack-ease,${m.ease}),box-shadow var(--iui-pack-hover-ms,${m.hoverMs}ms) ease}
button:hover{transform:translateY(-1px);box-shadow:var(--iui-pack-elev-2,${e[2]})}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
button.secondary{background:var(--iui-pack-surface);color:var(--iui-pack-accent,${accent});border-color:var(--iui-pack-border)}
input,select,textarea{border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius-control,${d.radiusControl});padding:8px 10px;min-height:var(--iui-pack-control-h,${d.controlHeight});width:100%;background:var(--iui-pack-surface);color:var(--iui-pack-fg);outline:none}
input:focus,select:focus,textarea:focus{border-color:color-mix(in srgb,var(--iui-pack-accent,${accent}) 55%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--iui-pack-accent,${accent}) 28%,transparent)}
a{color:var(--iui-pack-accent,${accent})}
`)}
.iui-sandbox-card{border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius,${d.radius});padding:var(--iui-pack-pad,${d.pad});background:var(--iui-pack-surface);box-shadow:var(--iui-pack-elev,${e[1]});min-width:0;max-width:100%}
.iui-sandbox-muted{color:var(--iui-pack-muted-fg);font-size:var(--iui-pack-font-sm,${d.fontSizeSm})}
.iui-sandbox-toolbar{display:flex;gap:var(--iui-pack-gap-sm,${d.gapSm});flex-wrap:wrap;margin-bottom:var(--iui-pack-gap,${d.gap});align-items:center}
.iui-sandbox-grid{display:grid;gap:var(--iui-pack-gap,${d.gap});grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))}
.iui-sandbox-kpi{padding:var(--iui-pack-pad,${d.pad});border-radius:var(--iui-pack-radius-sm,${d.radiusSm});border:1px solid var(--iui-pack-border);background:var(--iui-pack-surface);box-shadow:var(--iui-pack-elev,${e[1]})}
.iui-sandbox-kpi .label{font-size:var(--iui-pack-font-sm,${d.fontSizeSm});color:var(--iui-pack-muted-fg)}
.iui-sandbox-kpi .value{font-size:var(--iui-pack-font-stat,${d.fontStat});font-weight:700;letter-spacing:-0.02em;color:var(--iui-pack-fg)}
.iui-sandbox-compare{display:grid;gap:var(--iui-pack-gap,${d.gap});grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))}
.iui-sandbox-tabs{display:flex;flex-direction:column;gap:var(--iui-pack-gap,${d.gap})}
.iui-sandbox-tabbar{display:inline-flex;gap:var(--iui-pack-gap-xs,${d.gapXs});padding:var(--iui-pack-gap-xs,${d.gapXs});border-radius:var(--iui-pack-segment-radius,999px);background:var(--iui-pack-surface-muted);align-self:flex-start}
.iui-sandbox-tab{appearance:none;border:none;background:transparent;padding:6px 12px;border-radius:var(--iui-pack-segment-radius,999px);font:inherit;font-size:var(--iui-pack-font,${d.fontSize});cursor:pointer;color:var(--iui-pack-muted-fg);min-height:auto}
.iui-sandbox-tab[aria-selected="true"]{background:var(--iui-pack-surface);color:var(--iui-pack-accent,${accent});box-shadow:var(--iui-pack-elev,${e[1]});font-weight:600}
.iui-sandbox-stage{display:none}
.iui-sandbox-stage[data-active="1"]{display:block}
/* F22 responsive defaults: grids use minmax(0,1fr); ≤560px dense (4+ col) grids → 2 cols; ≤480px → 1 col. Chat bubbles are ~680px, so 3-col stays until phone width. */
.iui-cols-2,.iui-cols-3,.iui-cols-4{display:grid;gap:var(--iui-pack-gap,${d.gap})}
.iui-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.iui-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.iui-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
video,iframe{max-width:100%}
pre{max-width:100%;overflow-x:auto}
p,li,dd,dt,h1,h2,h3,h4,blockquote,figcaption{overflow-wrap:anywhere}
.iui-scroll-x{display:block;max-width:100%;overflow-x:auto}
@media (max-width:560px){
.iui-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}
[style*="repeat(4"],[style*="repeat(5"],[style*="repeat(6"],[style*="repeat(7"],[style*="repeat(8"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
[style*="repeat(4"]>*,[style*="repeat(5"]>*,[style*="repeat(6"]>*,[style*="repeat(7"]>*,[style*="repeat(8"]>*{grid-column:auto!important}
}
@media (max-width:480px){
.iui-cols-2,.iui-cols-3,.iui-sandbox-compare{grid-template-columns:minmax(0,1fr)}
[style*="repeat(2"],[style*="repeat(3"],[style*="1fr 1fr"]{grid-template-columns:minmax(0,1fr)!important}
[style*="repeat(2"]>*,[style*="repeat(3"]>*,[style*="1fr 1fr"]>*{grid-column:auto!important}
}
/* G14: touch screens get ≥32px tap targets */
@media (pointer:coarse){button,.iui-sandbox-btn,[role="button"],[role="tab"],select,input:not([type=checkbox]):not([type=radio]):not([type=range]){min-height:32px}input[type=checkbox],input[type=radio]{min-width:18px;min-height:18px}}
/* Polished defaults for raw elements so un-styled model markup never looks like a default browser page */
${legacyElementLayer(`h1,h2,h3,h4{margin:0 0 8px;line-height:1.25;letter-spacing:-0.015em;color:var(--iui-pack-fg)}
h1{font-size:22px;font-weight:750}h2{font-size:18px;font-weight:700}h3{font-size:15px;font-weight:650}h4{font-size:13px;font-weight:650;color:var(--iui-pack-muted-fg)}
p{margin:0 0 8px}small{color:var(--iui-pack-muted-fg)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;border:1px solid var(--iui-pack-border);border-radius:12px;overflow:hidden}
th{text-align:left;font-weight:600;color:var(--iui-pack-muted-fg);background:var(--iui-pack-surface-muted);padding:8px 12px}
td{padding:8px 12px;border-top:1px solid var(--iui-pack-border)}
`)}
canvas,svg,img{max-width:100%}
.iui-sandbox-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px}
${legacyElementLayer(`button.ghost,.iui-sandbox-btn.ghost{background:transparent;color:var(--iui-pack-fg);border-color:var(--iui-pack-border)}
button.ghost:hover{background:var(--iui-pack-surface-muted)}
`)}
.iui-sandbox-stack{display:flex;flex-direction:column;gap:var(--iui-pack-gap,${d.gap})}
.iui-sandbox-row{display:flex;gap:var(--iui-pack-gap-sm,${d.gapSm});align-items:center;flex-wrap:wrap}
.iui-sandbox-title{font-size:18px;font-weight:700;letter-spacing:-0.015em;margin:0}
.iui-sandbox-sub{font-size:13px;color:var(--iui-pack-muted-fg);margin:2px 0 0}
/* Design-system kit (token-driven primitives for iui-html authors) */
.iui-sandbox-field{display:flex;flex-direction:column;gap:var(--iui-pack-gap-xs,${d.gapXs})}
.iui-sandbox-label{font-size:var(--iui-pack-font-sm,${d.fontSizeSm});color:var(--iui-pack-muted-fg);font-weight:500}
.iui-sandbox-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--iui-pack-segment-radius,999px);font-size:12px;font-weight:650;background:var(--iui-pack-tint);color:var(--iui-pack-accent,${accent});border:1px solid color-mix(in srgb,var(--iui-pack-accent,${accent}) 22%,transparent)}
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
  // F6: no allow-modals — native dialogs become a non-blocking in-page toast
  // (an alert() loop can no longer lock the host behind system dialogs).
  (function () {
    var toastEl = null, toastTimer = 0, warned = false;
    function toast(text) {
      try {
        if (!warned) { warned = true; try { console.warn('[iui] alert/confirm/prompt are disabled in the sandbox; use in-page UI instead.'); } catch (e) {} }
        var root = document.body || document.documentElement;
        if (!root) return;
        if (!toastEl || !toastEl.isConnected) {
          toastEl = document.createElement('div');
          toastEl.setAttribute('data-iui-toast', '');
          toastEl.setAttribute('role', 'status');
          toastEl.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);max-width:min(92vw,480px);padding:8px 14px;border-radius:8px;background:rgba(30,30,34,.92);color:#fff;font:13px/1.45 system-ui,sans-serif;z-index:2147483647;box-shadow:0 6px 24px rgba(0,0,0,.25);white-space:pre-wrap;word-break:break-word;pointer-events:none';
          root.appendChild(toastEl);
        }
        toastEl.textContent = String(text == null ? '' : text).slice(0, 400);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { try { toastEl && toastEl.remove(); } catch (e) {} }, 3200);
      } catch (e) {}
    }
    window.__iuiToast = function (m) { var w = warned; warned = true; toast(m); warned = w; };
    try {
      window.alert = function (m) { toast(m); };
      window.confirm = function (m) { toast(m); return false; };
      window.prompt = function (m) { toast(m); return null; };
      window.print = function () {};
    } catch (e) {}
  })();
  // F18: host-delegated work (download / copy) as request → hostResult reply.
  var __iuiReqSeq = 0;
  var __iuiPendingReq = {};
  function __iuiZh() {
    try { return /^zh/i.test(String((document.documentElement && document.documentElement.lang) || navigator.language || '')); } catch (e) { return true; }
  }
  function __iuiHostCall(msg, timeoutMs) {
    return new Promise(function (resolve) {
      var id = 'q' + (++__iuiReqSeq);
      var timer = setTimeout(function () { delete __iuiPendingReq[id]; resolve({ ok: false, reason: 'timeout' }); }, timeoutMs || 5000);
      __iuiPendingReq[id] = function (res) { clearTimeout(timer); delete __iuiPendingReq[id]; resolve(res); };
      post(Object.assign({ reqId: id }, msg));
    });
  }
  var __IUI_DOWNLOAD_MAX = 10 * 1024 * 1024;
  function __iuiDelegateFail(kind, reason) {
    var zh = __iuiZh();
    var msg;
    if (reason === 'gesture') msg = zh ? '请点击按钮后再' + (kind === 'copy' ? '复制' : '下载') : 'Click a button to ' + (kind === 'copy' ? 'copy' : 'download');
    else if (reason === 'tooLarge') msg = zh ? '文件超过 10MB，无法下载' : 'File is larger than 10 MB';
    else if (reason === 'blocked') msg = zh ? '这种文件类型不允许下载' : 'This file type cannot be downloaded';
    else if (reason === 'rate') msg = zh ? '下载太频繁，请稍后再试' : 'Too many downloads — try again shortly';
    else msg = kind === 'copy' ? (zh ? '复制失败，请手动选中文字复制' : 'Copy failed — select the text and copy it manually') : (zh ? '下载失败' : 'Download failed');
    try { window.__iuiToast(msg); } catch (e) {}
  }
  function __iuiDownload(filename, content, mime) {
    var name = String(filename == null || filename === '' ? 'download' : filename).slice(0, 300);
    var type = String(mime || (content && typeof content === 'object' && content.type) || '').slice(0, 200);
    var job;
    try {
      if (typeof Blob !== 'undefined' && content instanceof Blob) {
        job = content.arrayBuffer ? content.arrayBuffer() : new Response(content).arrayBuffer();
      } else if (content instanceof ArrayBuffer) {
        job = Promise.resolve(content);
      } else if (content && ArrayBuffer.isView(content)) {
        job = Promise.resolve(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
      } else if (content !== null && typeof content === 'object') {
        if (!type) type = 'application/json';
        job = Promise.resolve(JSON.stringify(content, null, 2));
      } else {
        job = Promise.resolve(String(content == null ? '' : content));
      }
    } catch (e) { job = Promise.reject(e); }
    if (!type) type = /\\.json$/i.test(name) ? 'application/json' : /\\.csv$/i.test(name) ? 'text/csv;charset=utf-8' : /\\.(txt|md)$/i.test(name) ? 'text/plain;charset=utf-8' : /\\.html?$/i.test(name) ? 'text/html;charset=utf-8' : 'application/octet-stream';
    return job.then(function (data) {
      var size = typeof data === 'string' ? data.length : data.byteLength;
      if (size > __IUI_DOWNLOAD_MAX) { __iuiDelegateFail('download', 'tooLarge'); return false; }
      return __iuiHostCall({ type: 'download', filename: name, mime: type, data: data }, 5000).then(function (res) {
        if (!res || !res.ok) { __iuiDelegateFail('download', res && res.reason); return false; }
        return true;
      });
    }, function () { __iuiDelegateFail('download', 'failed'); return false; });
  }
  function __iuiCopy(text) {
    var s = String(text == null ? '' : text).slice(0, 200000);
    return __iuiHostCall({ type: 'copyText', text: s }, 3000).then(function (res) {
      if (res && res.ok) return true;
      __iuiDelegateFail('copy', res && res.reason);
      return false;
    });
  }
  // F20: keep enough resource entries for the offline export (default buffer is 250).
  try { performance.setResourceTimingBufferSize(1000); } catch (eRT) {}
  // F6: watchdog heartbeat — the host shows「页面无响应」after 5s of silence.
  try { setInterval(function () { post({ type: 'heartbeat' }); }, 1000); post({ type: 'heartbeat' }); } catch (e) {}
  // G9: offscreen pause. The host posts visibility; while hidden, page rAF callbacks queue,
  // setInterval ticks are skipped, CSS / WAAPI animations and playing videos pause.
  // The bridge keeps native timers (heartbeat above, measure below).
  var __iuiOff = { hidden: false, q: [], seq: 0, map: {}, anims: [], media: [] };
  var __iuiNativeRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  var __iuiNativeCaf = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
  try {
    if (__iuiNativeRaf && __iuiNativeCaf) {
      window.requestAnimationFrame = function (cb) {
        if (!__iuiOff.hidden) return __iuiNativeRaf(cb);
        var qid = -(++__iuiOff.seq);
        __iuiOff.q.push({ id: qid, cb: cb });
        return qid;
      };
      window.cancelAnimationFrame = function (id) {
        if (typeof id === 'number' && id < 0) {
          var mapped = __iuiOff.map[id];
          if (mapped) { delete __iuiOff.map[id]; __iuiNativeCaf(mapped); return; }
          for (var qi = 0; qi < __iuiOff.q.length; qi++) {
            if (__iuiOff.q[qi].id === id) { __iuiOff.q.splice(qi, 1); return; }
          }
          return;
        }
        __iuiNativeCaf(id);
      };
    }
    var __iuiNativeSetInterval = window.setInterval;
    window.setInterval = function (fn, ms) {
      if (typeof fn !== 'function') return __iuiNativeSetInterval.apply(window, arguments);
      var extra = Array.prototype.slice.call(arguments, 2);
      return __iuiNativeSetInterval.call(window, function () {
        if (__iuiOff.hidden) return;
        return fn.apply(this, extra);
      }, ms);
    };
  } catch (eOff) {}
  // G9: remember which canvases hold a non-2d context (WebGL pages are paused, never frozen).
  try {
    var __iuiGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      var ctx = __iuiGetContext.apply(this, arguments);
      try { if (ctx && !this.__iuiCtx) this.__iuiCtx = String(type); } catch (eT) {}
      return ctx;
    };
  } catch (eCtx) {}
  function __iuiSetOffscreen(hidden) {
    hidden = hidden === true;
    if (hidden === __iuiOff.hidden) return;
    __iuiOff.hidden = hidden;
    var docEl = document.documentElement;
    if (hidden) {
      docEl.setAttribute('data-iui-offscreen', '');
      if (!document.getElementById('iui-offscreen-css')) {
        var offCss = document.createElement('style');
        offCss.id = 'iui-offscreen-css';
        offCss.textContent = 'html[data-iui-offscreen] *, html[data-iui-offscreen] *::before, html[data-iui-offscreen] *::after { animation-play-state: paused !important; }';
        (document.head || docEl).appendChild(offCss);
      }
      try {
        if (document.getAnimations) document.getAnimations().forEach(function (a) {
          if (a.playState === 'running') { a.pause(); __iuiOff.anims.push(a); }
        });
      } catch (eA) {}
      try {
        document.querySelectorAll('video').forEach(function (v) {
          if (!v.paused && !v.ended) { v.pause(); __iuiOff.media.push(v); }
        });
      } catch (eV) {}
      return;
    }
    docEl.removeAttribute('data-iui-offscreen');
    var anims = __iuiOff.anims; __iuiOff.anims = [];
    anims.forEach(function (a) { try { if (a.playState === 'paused') a.play(); } catch (eP) {} });
    var media = __iuiOff.media; __iuiOff.media = [];
    media.forEach(function (v) { try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (eM) {} });
    var queued = __iuiOff.q; __iuiOff.q = [];
    if (__iuiNativeRaf) queued.forEach(function (item) {
      __iuiOff.map[item.id] = __iuiNativeRaf(function (ts) { delete __iuiOff.map[item.id]; item.cb(ts); });
    });
  }
  window.__iuiSetOffscreen = __iuiSetOffscreen;
  // G9: static copy of the page for a frozen card (no scripts; canvases become images).
  // G9/G12: a static copy of the live document — form values as attributes, canvases as
  // images, image sources resolved, running animations pinned to their current look.
  function __iuiCloneStatic(boxes) {
    var srcAll = document.documentElement.getElementsByTagName('*');
    var clone = document.documentElement.cloneNode(true);
    var dstAll = clone.getElementsByTagName('*');
    for (var ai = 0; ai < srcAll.length && ai < dstAll.length; ai++) {
      var se = srcAll[ai];
      try {
        if (!se.getAnimations || !se.getAnimations().length) continue;
        var cs = getComputedStyle(se);
        var de = dstAll[ai];
        de.style.setProperty('opacity', cs.opacity, 'important');
        de.style.setProperty('transform', cs.transform, 'important');
        de.style.setProperty('visibility', cs.visibility, 'important');
      } catch (eA) {}
    }
    clone.removeAttribute('data-iui-offscreen');
    var srcFields = document.querySelectorAll('input, textarea, select');
    var dstFields = clone.querySelectorAll('input, textarea, select');
    for (var fi = 0; fi < srcFields.length && fi < dstFields.length; fi++) {
      var sf = srcFields[fi], df = dstFields[fi];
      try {
        if (sf.tagName === 'TEXTAREA') df.textContent = sf.value;
        else if (sf.tagName === 'SELECT') {
          for (var oi = 0; oi < sf.options.length && oi < df.options.length; oi++) {
            if (sf.options[oi].selected) df.options[oi].setAttribute('selected', '');
            else df.options[oi].removeAttribute('selected');
          }
        } else if (sf.type === 'checkbox' || sf.type === 'radio') {
          if (sf.checked) df.setAttribute('checked', ''); else df.removeAttribute('checked');
        } else if (sf.type !== 'file' && sf.type !== 'password') df.setAttribute('value', sf.value);
      } catch (eF) {}
    }
    var srcImgs = document.querySelectorAll('img');
    var dstImgs = clone.querySelectorAll('img');
    for (var ii = 0; ii < srcImgs.length && ii < dstImgs.length; ii++) {
      try {
        var cur = srcImgs[ii].currentSrc || srcImgs[ii].src;
        if (cur) dstImgs[ii].setAttribute('src', cur);
        dstImgs[ii].removeAttribute('srcset');
        dstImgs[ii].removeAttribute('sizes');
        dstImgs[ii].removeAttribute('loading');
        if (boxes) {
          var ib = srcImgs[ii].getBoundingClientRect();
          dstImgs[ii].setAttribute('data-iui-box', Math.round(ib.width) + 'x' + Math.round(ib.height));
        }
      } catch (eI) {}
    }
    var srcCanvas = document.querySelectorAll('canvas');
    var dstCanvas = clone.querySelectorAll('canvas');
    for (var di = 0; di < srcCanvas.length && di < dstCanvas.length; di++) {
      var sc = srcCanvas[di], dc = dstCanvas[di];
      var img = document.createElement('img');
      try { img.src = sc.toDataURL('image/png'); } catch (eD) {}
      img.alt = '';
      if (sc.id) img.id = sc.id;
      if (sc.className && typeof sc.className === 'string') img.className = sc.className;
      img.style.cssText = sc.style.cssText;
      try {
        var rect = sc.getBoundingClientRect();
        var disp = getComputedStyle(sc).display;
        img.style.width = rect.width + 'px';
        img.style.height = rect.height + 'px';
        img.style.display = disp === 'inline' ? 'inline-block' : disp;
      } catch (eR) {}
      if (dc.parentNode) dc.parentNode.replaceChild(img, dc);
    }
    clone.querySelectorAll('script').forEach(function (el) { el.remove(); });
    clone.querySelectorAll('video').forEach(function (el) { el.removeAttribute('autoplay'); });
    var freezeCss = document.createElement('style');
    freezeCss.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    var cloneHead = clone.querySelector('head');
    if (cloneHead) cloneHead.appendChild(freezeCss);
    return clone;
  }
  function __iuiFreezeHtml() {
    try { window.iuiSandbox.persistLocalState(); } catch (eP) {}
    var srcCanvas = document.querySelectorAll('canvas');
    for (var ci = 0; ci < srcCanvas.length; ci++) {
      var kind = srcCanvas[ci].__iuiCtx || '';
      if (kind && kind !== '2d') return { html: '', reason: 'webgl' };
    }
    var clone = __iuiCloneStatic();
    var out = '<!doctype html>' + clone.outerHTML;
    if (out.length > 3000000) return { html: '', reason: 'tooLarge' };
    return { html: out };
  }
  // G12: 保存为图片 — the static copy with every image / stylesheet inlined (fetched by the
  // host: the frame's CSP has no general connect-src), drawn through SVG foreignObject.
  function __iuiCaptureFetch(url, as, cache) {
    var key = as + '|' + url;
    if (cache[key]) return cache[key];
    var job;
    if (/^data:/i.test(url)) job = Promise.resolve(as === 'text' ? '' : url);
    else if (!/^(https?:|blob:)/i.test(url)) job = Promise.resolve('');
    else job = __iuiHostCall({ type: 'fetchResource', url: String(url).slice(0, 2000), as: as }, 12000)
      .then(function (r) { return r && r.ok && typeof r.data === 'string' ? r.data : ''; });
    cache[key] = job;
    return job;
  }
  function __iuiAbsUrl(u, base) {
    try { return new URL(u, base || undefined).href; } catch (e) { return ''; }
  }
  function __iuiInlineCssUrls(text, base, cache, stats) {
    var re = /url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/g;
    var found = [], m;
    while ((m = re.exec(text))) {
      var raw = m[2].trim();
      if (/^(data:|#)/i.test(raw)) continue;
      // Fonts are skipped (system fallback); images are inlined.
      if (/\\.(woff2?|ttf|otf|eot)(\\?|#|$)/i.test(raw)) continue;
      var abs = __iuiAbsUrl(raw, base);
      if (abs && found.indexOf(abs) < 0) found.push(abs);
      if (found.length > 120) break;
    }
    return Promise.all(found.map(function (u) { return __iuiCaptureFetch(u, 'dataUrl', cache); })).then(function (datas) {
      var map = {};
      found.forEach(function (u, i) { map[u] = datas[i]; if (!datas[i]) stats.failed++; });
      return text.replace(re, function (all, q, raw) {
        var abs = __iuiAbsUrl(raw.trim(), base);
        return abs && map[abs] ? 'url("' + map[abs] + '")' : all;
      });
    });
  }
  function __iuiCaptureImage(opts) {
    var o = opts || {};
    var cache = {};
    var stats = { failed: 0 };
    try { window.iuiSandbox.persistLocalState(); } catch (eP) {}
    var root = document.documentElement;
    var width = Math.max(1, Math.ceil(root.clientWidth || window.innerWidth || 800));
    // Content height: the scroll height when the page scrolls, else the body's bottom edge
    // (the viewport can be taller than the page, e.g. in fullscreen).
    var height = 1;
    try {
      var body = document.body;
      var bodyBottom = 0;
      if (body) {
        var bcs = getComputedStyle(body);
        bodyBottom = body.getBoundingClientRect().bottom + (parseFloat(bcs.marginBottom) || 0) + window.scrollY;
      }
      height = root.scrollHeight > root.clientHeight + 1 ? root.scrollHeight : Math.max(bodyBottom, body ? body.scrollHeight : 0);
      height = Math.max(1, Math.ceil(height) + (root.scrollHeight > root.clientHeight + 1 ? 0 : 6));
    } catch (eH) { height = Math.max(1, Math.ceil(root.scrollHeight || 1)); }
    var bg = '';
    try {
      var hb = getComputedStyle(root).backgroundColor, bb = document.body ? getComputedStyle(document.body).backgroundColor : '';
      var clear = function (c) { return !c || c === 'transparent' || /rgba\\([^)]*,\\s*0\\)$/.test(c); };
      bg = !clear(bb) ? bb : !clear(hb) ? hb : (typeof o.background === 'string' ? o.background : '');
    } catch (eB) {}
    var clone = __iuiCloneStatic(true);
    clone.querySelectorAll('[data-iui-toast],[data-iui-fail-strip],.iui-fail-strip,[data-iui-capture-ignore],iframe,noscript').forEach(function (el) { el.remove(); });
    clone.querySelectorAll('link').forEach(function (el) { if (!/stylesheet/i.test(el.getAttribute('rel') || '')) el.remove(); });
    clone.querySelectorAll('video').forEach(function (el) {
      var poster = el.getAttribute('poster');
      var ph = document.createElement(poster ? 'img' : 'div');
      if (poster) ph.setAttribute('src', __iuiAbsUrl(poster));
      ph.setAttribute('style', (el.getAttribute('style') || '') + ';background:#0002;object-fit:cover');
      if (el.className && typeof el.className === 'string') ph.className = el.className;
      if (el.parentNode) el.parentNode.replaceChild(ph, el);
    });
    var jobs = [];
    // External stylesheets → <style> (cssRules when readable, else fetched text).
    var sheets = [].slice.call(document.styleSheets || []);
    var linkEls = [].slice.call(clone.querySelectorAll('link'));
    linkEls.forEach(function (ln) {
      var href = __iuiAbsUrl(ln.getAttribute('href') || '');
      var sheet = null;
      for (var si = 0; si < sheets.length; si++) if (sheets[si].href === href) { sheet = sheets[si]; break; }
      var textJob;
      try {
        var rules = sheet && sheet.cssRules;
        textJob = Promise.resolve([].map.call(rules, function (r) { return r.cssText; }).join('\\n'));
      } catch (eS) { textJob = href ? __iuiCaptureFetch(href, 'text', cache) : Promise.resolve(''); }
      jobs.push(textJob.then(function (text) { return __iuiInlineCssUrls(text || '', href, cache, stats); }).then(function (text) {
        var st = document.createElement('style');
        st.textContent = text;
        if (ln.parentNode) ln.parentNode.replaceChild(st, ln);
      }));
    });
    clone.querySelectorAll('style').forEach(function (st) {
      if (!/url\\(/i.test(st.textContent || '')) return;
      jobs.push(__iuiInlineCssUrls(st.textContent, document.baseURI, cache, stats).then(function (t) { st.textContent = t; }));
    });
    clone.querySelectorAll('[style*="url("]').forEach(function (el) {
      jobs.push(__iuiInlineCssUrls(el.getAttribute('style') || '', document.baseURI, cache, stats).then(function (t) { el.setAttribute('style', t); }));
    });
    var imgs = [].slice.call(clone.querySelectorAll('img')).slice(0, 400);
    imgs.forEach(function (im) {
      var src = im.getAttribute('src') || '';
      if (!src || /^data:/i.test(src)) return;
      jobs.push(__iuiCaptureFetch(__iuiAbsUrl(src), 'dataUrl', cache).then(function (d) {
        if (d) { im.setAttribute('src', d); return; }
        // Unexportable image → neutral box of the same size (no broken-image glyph).
        stats.failed++;
        var box = /^(\\d+)x(\\d+)$/.exec(im.getAttribute('data-iui-box') || '');
        var ph = document.createElement('span');
        if (im.className && typeof im.className === 'string') ph.className = im.className;
        ph.setAttribute('style', (im.getAttribute('style') || '') + ';display:inline-block;vertical-align:middle;border-radius:4px;background:rgba(127,127,127,.15)' + (box ? ';width:' + box[1] + 'px;height:' + box[2] + 'px' : ''));
        if (im.parentNode) im.parentNode.replaceChild(ph, im);
      }));
    });
    clone.querySelectorAll('image').forEach(function (im) {
      var href = im.getAttribute('href') || im.getAttribute('xlink:href') || '';
      if (!href || /^data:/i.test(href)) return;
      jobs.push(__iuiCaptureFetch(__iuiAbsUrl(href), 'dataUrl', cache).then(function (d) { if (d) im.setAttribute('href', d); else stats.failed++; }));
    });
    return Promise.all(jobs).then(function () {
      clone.querySelectorAll('[data-iui-box]').forEach(function (el) { el.removeAttribute('data-iui-box'); });
      clone.style.setProperty('width', width + 'px');
      clone.style.setProperty('height', height + 'px');
      clone.style.setProperty('overflow', 'hidden');
      if (bg) clone.style.setProperty('background', bg);
      var xhtml = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
      var scale = Math.max(0.5, Math.min(2, Math.sqrt(36000000 / (width * height)), 16000 / height));
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var cv = document.createElement('canvas');
            cv.width = Math.round(width * scale);
            cv.height = Math.round(height * scale);
            var ctx = cv.getContext('2d');
            if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            resolve({ dataUrl: cv.toDataURL('image/png'), width: cv.width, height: cv.height, failed: stats.failed });
          } catch (eC) { resolve({ dataUrl: '', reason: 'tainted', failed: stats.failed }); }
        };
        img.onerror = function () { resolve({ dataUrl: '', reason: 'render', failed: stats.failed }); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    });
  }
  // G15: one light self-check when the page has settled and the frame is idle:
  // small text, low contrast, sideways overflow, blank canvases, broken images,
  // console errors and large blank areas. The host shows「发现 N 处排版问题」.
  var __iuiConsoleErrors = 0;
  try {
    var __iuiOrigConsoleError = console.error;
    console.error = function () {
      __iuiConsoleErrors++;
      return __iuiOrigConsoleError.apply(console, arguments);
    };
  } catch (eCE) {}
  window.addEventListener('error', function () { __iuiConsoleErrors++; });
  // Computed colors arrive as rgb(), oklch(), oklab() or color(srgb …) (daisyUI
  // themes are oklch): normalize anything through a 1×1 canvas, cached.
  var __iuiColorCv = null, __iuiColorCache = {}, __iuiColorN = 0;
  function __iuiParseRgb(c) {
    c = String(c || '').trim();
    if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    var m = /^rgba?\\(([^)]+)\\)$/.exec(c);
    if (m) {
      var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(function (v) { return /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v); });
      if (p.length >= 3 && !isNaN(p[0])) return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    if (Object.prototype.hasOwnProperty.call(__iuiColorCache, c)) return __iuiColorCache[c];
    var out = null;
    try {
      if (!__iuiColorCv) { __iuiColorCv = document.createElement('canvas'); __iuiColorCv.width = 1; __iuiColorCv.height = 1; }
      var cx = __iuiColorCv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = '#010203';
      cx.fillStyle = c;
      if (cx.fillStyle !== '#010203' || /^#010203$/i.test(c)) {
        cx.clearRect(0, 0, 1, 1);
        cx.fillRect(0, 0, 1, 1);
        var d = cx.getImageData(0, 0, 1, 1).data;
        out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      }
    } catch (eCol) { out = null; }
    if (__iuiColorN++ < 400) __iuiColorCache[c] = out;
    return out;
  }
  function __iuiLum(c) {
    var f = function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function __iuiOver(top, under) {
    var a = top.a + under.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a,
      g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a,
      b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a,
      a: a,
    };
  }
  function __iuiCanvasBase() {
    var sch = String(getComputedStyle(document.documentElement).colorScheme || '');
    return /dark/.test(sch) && !/light/.test(sch) ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  }
  function __iuiImageish(n, cs) {
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|svg)$/i.test(n.tagName)) return true;
    return !!(cs.backgroundImage && cs.backgroundImage !== 'none');
  }
  // Composite translucent layers down to the first opaque one. Null = text over
  // an image / gradient / canvas, which a flat color cannot judge.
  function __iuiComposite(list) {
    var layers = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var cs = getComputedStyle(n);
      if (__iuiImageish(n, cs)) return null;
      var c = __iuiParseRgb(cs.backgroundColor);
      if (c && c.a > 0.01) { layers.push(c); if (c.a > 0.98) break; }
    }
    var acc = __iuiCanvasBase();
    for (var k = layers.length - 1; k >= 0; k--) acc = __iuiOver(layers[k], acc);
    return acc;
  }
  function __iuiBgOf(el) {
    var chain = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    return __iuiComposite(chain);
  }
  // What is actually painted under the text: the hit-test stack below the
  // element at its first text line (catches absolutely positioned backdrops and
  // photos that are siblings, not ancestors). Falls back to the ancestor walk.
  function __iuiBackdrop(el) {
    try {
      var tn = null;
      for (var i = 0; i < el.childNodes.length; i++) { var ch = el.childNodes[i]; if (ch.nodeType === 3 && /\\S/.test(ch.nodeValue || '')) { tn = ch; break; } }
      if (tn && document.elementsFromPoint) {
        var rg = document.createRange();
        rg.selectNodeContents(tn);
        var rc = rg.getClientRects()[0];
        if (rc && rc.width > 0) {
          var x = rc.left + Math.min(rc.width / 2, 12), y = rc.top + rc.height / 2;
          if (x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight) {
            var stack = document.elementsFromPoint(x, y);
            var at = stack.indexOf(el);
            if (at >= 0) {
              var below = [];
              for (var j = at + 1; j < stack.length; j++) { if (!el.contains(stack[j])) below.push(stack[j]); }
              var ownCs = getComputedStyle(el);
              var own = __iuiParseRgb(ownCs.backgroundColor);
              if (__iuiImageish(el, ownCs)) return null;
              var under = __iuiComposite(below);
              if (under === null) return null;
              return own && own.a > 0.01 ? __iuiOver(own, under) : under;
            }
          }
        }
      }
    } catch (eBd) {}
    return __iuiBgOf(el);
  }
  function __iuiOpacity(el) {
    var o = 1;
    for (var n = el; n && n.nodeType === 1 && o > 0.05; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 0;
    return o;
  }
  function __iuiHex(c) {
    var h = function (v) { var x = Math.max(0, Math.min(255, Math.round(v))).toString(16); return x.length < 2 ? '0' + x : x; };
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }
  function __iuiSel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(function (x) { return x && !/[:\\/\\[]/.test(x); }).slice(0, 3) : [];
    return s + (cls.length ? '.' + cls.join('.') : '');
  }
  function __iuiOwnText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var ch = el.childNodes[i];
      if (ch.nodeType === 3 && /\\S/.test(ch.nodeValue || '')) return true;
    }
    return false;
  }
  function __iuiShown(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.2) return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  function __iuiSkipCheck(el) {
    return !!(el.closest && el.closest('[data-iui-toast],[data-iui-fail-strip],.iui-fail-strip,.leaflet-control-attribution,.leaflet-container,.ag-root-wrapper,[aria-hidden="true"],[data-iui-check-ignore]'));
  }
  // Entrance fades (iuiEnter) and other finite animations paint text at a
  // fraction of its final opacity; sampling them mid-flight reports contrast
  // the user never sees once the page settles (CI: 2.9:1 on kanban avatars).
  function __iuiFiniteAnims() {
    var out = [];
    try {
      var list = document.getAnimations ? document.getAnimations() : [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i], t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        if ((a.playState === 'running' || a.playState === 'pending') && t && isFinite(t.endTime)) out.push(a);
      }
    } catch (eA) {}
    return out;
  }
  function __iuiAnimTargets() {
    var set = [], list = __iuiFiniteAnims();
    for (var i = 0; i < list.length; i++) { var tg = list[i].effect && list[i].effect.target; if (tg && tg.nodeType === 1) set.push(tg); }
    return set;
  }
  function __iuiAnimating(el, targets) {
    for (var i = 0; i < targets.length; i++) if (targets[i] === el || (targets[i].contains && targets[i].contains(el))) return true;
    return false;
  }
  function __iuiSelfCheck() {
    var issues = [];
    var body = document.body;
    if (!body) return issues;
    var animTargets = __iuiAnimTargets();
    var all = body.querySelectorAll('*');
    var small = 0, tiny = 0, smallSample = '', lowC = 0, sampled = 0, minRatio = 99, lowSamples = [];
    for (var i = 0; i < all.length && i < 2500; i++) {
      var el = all[i];
      if (!__iuiOwnText(el) || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|SUP|SUB)$/.test(el.tagName) || __iuiSkipCheck(el)) continue;
      var cs = getComputedStyle(el);
      if (!__iuiShown(el, cs)) continue;
      var fs = parseFloat(cs.fontSize) || 16;
      var inSvg = !!(el.closest && el.closest('svg'));
      if (fs < 11.5 && !inSvg) { small++; if (fs < 11) tiny++; if (!smallSample) smallSample = (el.textContent || '').trim().slice(0, 24) + ' · ' + Math.round(fs * 10) / 10 + 'px'; }
      // SVG text sits on shape fills the box walk cannot see (mermaid, d3);
      // disabled controls and gradient-clipped text are intentionally faint.
      if (sampled >= 600 || inSvg) continue;
      if (el.closest && el.closest(':disabled,[aria-disabled="true"],.btn-disabled,[inert]')) continue;
      if (animTargets.length && __iuiAnimating(el, animTargets)) continue;
      var fill = __iuiParseRgb(cs.webkitTextFillColor || '');
      if ((fill && fill.a < 0.05 && cs.webkitTextFillColor) || /text/.test(String(cs.backgroundClip || cs.webkitBackgroundClip || ''))) continue;
      sampled++;
      var fg = (fill && fill.a >= 0.05 && cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color) ? fill : __iuiParseRgb(cs.color);
      var bg = __iuiBackdrop(el);
      if (!fg || !bg) continue;
      var op = __iuiOpacity(el);
      var fgEff = __iuiOver({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * op }, bg);
      var l1 = __iuiLum(fgEff), l2 = __iuiLum(bg);
      var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 3) {
        lowC++;
        if (ratio < minRatio) minRatio = ratio;
        var txt = '';
        for (var t = 0; t < el.childNodes.length; t++) if (el.childNodes[t].nodeType === 3) txt += el.childNodes[t].nodeValue;
        lowSamples.push({ text: txt.replace(/\\s+/g, ' ').trim().slice(0, 24), sel: __iuiSel(el).slice(0, 60), ratio: Math.round(ratio * 10) / 10, fg: __iuiHex(fgEff), bg: __iuiHex(bg) });
      }
    }
    if (small > 0) issues.push({ kind: 'smallText', count: small, serious: tiny >= 3 || small >= 8, detail: smallSample });
    if (lowC > 0) {
      lowSamples.sort(function (x, y) { return x.ratio - y.ratio; });
      var seen = {}, top = [];
      for (var q = 0; q < lowSamples.length && top.length < 3; q++) { var sk = lowSamples[q].sel + '|' + lowSamples[q].fg + lowSamples[q].bg; if (!seen[sk]) { seen[sk] = 1; top.push(lowSamples[q]); } }
      // G15 / visual ⑤: < 3:1 is unreadable at any size — serious, and the host
      // may auto-request one iui-patch for it.
      issues.push({ kind: 'lowContrast', count: lowC, serious: true, minRatio: Math.round(minRatio * 100) / 100, samples: top, detail: top[0].text + ' · ' + top[0].ratio + ':1' });
    }
    var root = document.documentElement;
    // The host clips overflow-x on html/body/#iui-preview-root, so overflowing
    // content is silently cut: look for boxes past the edge clipped only there.
    var cw = root.clientWidth, over = 0, wide = '';
    var hostClip = function (n) { return n === root || n === body || n.id === 'iui-preview-root'; };
    for (var w = 0; w < all.length && w < 2500; w++) {
      var we = all[w];
      var rr = we.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0 || rr.right <= cw + 4 || __iuiSkipCheck(we)) continue;
      var clipper = we.parentElement;
      while (clipper && !hostClip(clipper) && getComputedStyle(clipper).overflowX === 'visible') clipper = clipper.parentElement;
      if (clipper && !hostClip(clipper)) continue;
      if (getComputedStyle(we).position === 'fixed') continue;
      if (rr.right - cw > over) { over = rr.right - cw; wide = we.tagName.toLowerCase() + (we.className && typeof we.className === 'string' ? '.' + we.className.split(' ')[0] : ''); }
    }
    if (over > 4) issues.push({ kind: 'overflowX', count: 1, serious: true, detail: Math.round(over) + 'px' + (wide ? ' · ' + wide : '') });
    var blankCanvas = 0;
    document.querySelectorAll('canvas').forEach(function (cv) {
      if (__iuiSkipCheck(cv) || (cv.__iuiCtx && cv.__iuiCtx !== '2d')) return;
      var cr = cv.getBoundingClientRect();
      if (cr.width < 40 || cr.height < 40 || !cv.width || !cv.height) return;
      try {
        var ctx = cv.getContext('2d');
        if (!ctx) return;
        var data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        var step = Math.max(4, Math.floor(data.length / 4 / 4000) * 4);
        var first = -1, varied = false;
        for (var k = 0; k < data.length; k += step) {
          var v = data[k + 3] === 0 ? -1 : (data[k] << 16) | (data[k + 1] << 8) | data[k + 2];
          if (first === -1 && k === 0) first = v;
          if (v !== first) { varied = true; break; }
        }
        if (!varied) blankCanvas++;
      } catch (eCv) {}
    });
    if (blankCanvas > 0) issues.push({ kind: 'blankCanvas', count: blankCanvas, serious: true });
    var broken = 0, brokenSample = '';
    document.querySelectorAll('img').forEach(function (im) {
      if (__iuiSkipCheck(im)) return;
      var src = im.getAttribute('src') || '';
      if (!src || !im.complete || im.naturalWidth > 0) return;
      broken++;
      if (!brokenSample) brokenSample = src.slice(0, 80);
    });
    if (broken > 0) issues.push({ kind: 'brokenImage', count: broken, serious: true, detail: brokenSample });
    if (__iuiConsoleErrors > 0) issues.push({ kind: 'consoleError', count: __iuiConsoleErrors, serious: false });
    // Large blank band: rows where every probe lands on an element with no own content.
    var H = Math.max(root.scrollHeight, body.scrollHeight), W = root.clientWidth;
    var contentRoot = document.getElementById('iui-preview-root') || body, cb = 0;
    for (var ci = 0; ci < contentRoot.children.length; ci++) {
      var cr0 = contentRoot.children[ci].getBoundingClientRect();
      if (cr0.height > 0) cb = Math.max(cb, cr0.bottom + window.scrollY);
    }
    if (cb > 0) H = Math.min(H, Math.ceil(cb));
    if (H > 480 && H <= window.innerHeight + 4 && W > 200) {
      var bodyBg = __iuiParseRgb(getComputedStyle(body).backgroundColor);
      var isContent = function (el) {
        if (!el || el === body || el === root) return false;
        if (/^(IMG|CANVAS|SVG|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON|PATH|RECT|CIRCLE|LINE|TEXT|G)$/i.test(el.tagName)) return true;
        if (el.closest && el.closest('svg,.leaflet-container,.ag-root-wrapper')) return true;
        if (__iuiOwnText(el)) return true;
        var cs = getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
        var bg = __iuiParseRgb(cs.backgroundColor);
        if (bg && bg.a > 0.3 && (!bodyBg || Math.abs(bg.r - bodyBg.r) + Math.abs(bg.g - bodyBg.g) + Math.abs(bg.b - bodyBg.b) > 24)) return true;
        return false;
      };
      var run = 0, maxRun = 0;
      for (var y = 8; y < H - 8; y += 24) {
        var hit = false;
        for (var x = 0.1; x < 1; x += 0.2) {
          if (isContent(document.elementFromPoint(W * x, y))) { hit = true; break; }
        }
        run = hit ? 0 : run + 24;
        if (run > maxRun) maxRun = run;
      }
      if (maxRun >= Math.max(240, H * 0.3)) issues.push({ kind: 'blankArea', count: 1, serious: true, detail: maxRun + 'px' });
    }
    return issues.slice(0, 10);
  }
  var __iuiSelfChecked = false;
  var __iuiLastCheck = '', __iuiRechecks = 0, __iuiRecheckTimer = 0;
  function __iuiRunSelfCheck(waited) {
    // Let finite animations land first (capped), so contrast is read at rest.
    var pending = waited ? [] : __iuiFiniteAnims();
    if (pending.length) {
      var done = false, go = function () { if (!done) { done = true; __iuiRunSelfCheck(true); } };
      try { Promise.all(pending.map(function (a) { return a.finished; })).then(go, go); } catch (eW) { go(); return; }
      setTimeout(go, 4000);
      return;
    }
    var issues = [];
    try { issues = __iuiSelfCheck(); } catch (eSC) { issues = []; }
    var sig = JSON.stringify(issues);
    if (sig === __iuiLastCheck) return;
    __iuiLastCheck = sig;
    var serious = issues.filter(function (x) { return x.serious; }).length;
    post({ type: 'selfCheck', issues: issues, serious: serious });
  }
  function __iuiScheduleSelfCheck() {
    if (__iuiSelfChecked) return;
    __iuiSelfChecked = true;
    setTimeout(function () {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(function () { __iuiRunSelfCheck(); }, { timeout: 3000 });
      else __iuiRunSelfCheck();
    }, 1500);
    // JS-toggled states (a selected tab painted orange-on-orange) only exist
    // after a click: re-check a few times, posting only when the result changes.
    document.addEventListener('click', function () {
      if (__iuiRechecks >= 6) return;
      clearTimeout(__iuiRecheckTimer);
      __iuiRecheckTimer = setTimeout(function () { __iuiRechecks++; __iuiRunSelfCheck(); }, 900);
    }, true);
  }
  window.__iuiSelfCheck = __iuiSelfCheck;
  window.__iuiScheduleSelfCheck = __iuiScheduleSelfCheck;
  window.__iuiCaptureImage = __iuiCaptureImage;
  window.__iuiFreezeHtml = __iuiFreezeHtml;
  // G10: forced light / dark. Media rules on prefers-color-scheme are rewritten in place
  // (host + author sheets), and matchMedia answers the forced scheme.
  var __iuiScheme = { mode: 'auto', orig: typeof WeakMap === 'function' ? new WeakMap() : null };
  var __iuiNativeMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  function __iuiSchemeQuery(text, mode) {
    return String(text).replace(/\\(\\s*prefers-color-scheme\\s*:\\s*(dark|light)\\s*\\)/gi, function (m, want) {
      return String(want).toLowerCase() === mode ? '(min-width: 0px)' : '(max-width: -1px)';
    });
  }
  function __iuiRewriteRules(rules) {
    for (var i = 0; rules && i < rules.length; i++) {
      var rule = rules[i];
      if (rule.media && typeof rule.media.mediaText === 'string' && __iuiScheme.orig) {
        var orig = __iuiScheme.orig.has(rule) ? __iuiScheme.orig.get(rule) : rule.media.mediaText;
        if (/prefers-color-scheme/i.test(orig)) {
          __iuiScheme.orig.set(rule, orig);
          var next = __iuiScheme.mode === 'auto' ? orig : __iuiSchemeQuery(orig, __iuiScheme.mode);
          if (rule.media.mediaText !== next) { try { rule.media.mediaText = next; } catch (eM) {} }
        }
      }
      if (rule.cssRules) __iuiRewriteRules(rule.cssRules);
    }
  }
  function __iuiApplyScheme() {
    var sheets = document.styleSheets;
    for (var si = 0; si < sheets.length; si++) {
      var rules = null;
      try { rules = sheets[si].cssRules; } catch (eS) { rules = null; }
      if (rules) __iuiRewriteRules(rules);
    }
  }
  // Scheme queries get a wrapper whose matches / change events follow the forced mode.
  var __iuiSchemeMqls = [];
  function __iuiSchemeMql(q, mql) {
    var listeners = [];
    var w = {
      media: mql.media, onchange: null,
      addEventListener: function (type, fn) { if (type === 'change' && typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); },
      removeEventListener: function (type, fn) { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      addListener: function (fn) { w.addEventListener('change', fn); },
      removeListener: function (fn) { w.removeEventListener('change', fn); },
      dispatchEvent: function () { return false; }
    };
    Object.defineProperty(w, 'matches', { enumerable: true, get: function () {
      return __iuiScheme.mode === 'auto' ? mql.matches : __iuiNativeMatchMedia(__iuiSchemeQuery(q, __iuiScheme.mode)).matches;
    } });
    var last = w.matches;
    w.__iuiCheck = function () {
      var now = w.matches;
      if (now === last) return;
      last = now;
      var ev = { type: 'change', matches: now, media: w.media };
      if (typeof w.onchange === 'function') { try { w.onchange(ev); } catch (eO) {} }
      listeners.slice().forEach(function (fn) { try { fn.call(w, ev); } catch (eL) {} });
    };
    try {
      var onNative = function () { if (__iuiScheme.mode === 'auto') w.__iuiCheck(); };
      if (mql.addEventListener) mql.addEventListener('change', onNative); else if (mql.addListener) mql.addListener(onNative);
    } catch (eN) {}
    __iuiSchemeMqls.push(w);
    if (__iuiSchemeMqls.length > 200) __iuiSchemeMqls.shift();
    return w;
  }
  if (__iuiNativeMatchMedia) {
    window.matchMedia = function (q) {
      var mql = __iuiNativeMatchMedia(q);
      return /prefers-color-scheme/i.test(String(q)) ? __iuiSchemeMql(q, mql) : mql;
    };
  }
  function __iuiSetAppearance(css, scheme) {
    var el = document.getElementById('iui-appearance');
    if (!el) {
      el = document.createElement('style');
      el.id = 'iui-appearance';
      (document.head || document.documentElement).appendChild(el);
    }
    if (typeof css === 'string' && el.textContent !== css) el.textContent = css;
    __iuiScheme.mode = scheme === 'light' || scheme === 'dark' ? scheme : 'auto';
    if (__iuiScheme.mode === 'auto') document.documentElement.removeAttribute('data-iui-scheme');
    else document.documentElement.setAttribute('data-iui-scheme', __iuiScheme.mode);
    __iuiApplyScheme();
    __iuiSchemeMqls.forEach(function (w) { w.__iuiCheck(); });
    try { if (window.__iuiRethemeCharts) window.__iuiRethemeCharts(); } catch (eC) {}
    try { if (window.__iuiRethemeEcharts) window.__iuiRethemeEcharts(); } catch (eE) {}
  }
  window.__iuiSetAppearance = __iuiSetAppearance;
  // visual(③): Tailwind classes the live DOM uses (JS-built markup, streamed
  // preview html) — the host compiles them and answers with one sorted sheet.
  (function () {
    var twSeen = {}, twCount = 0, twKey = '', twTimer = 0, twSeq = 0;
    function twCollect() {
      var els = document.querySelectorAll('[class]');
      for (var i = 0; i < els.length && twCount < 3000; i++) {
        var cl = els[i].getAttribute('class');
        if (!cl) continue;
        var parts = cl.split(/\s+/);
        for (var j = 0; j < parts.length; j++) {
          var c = parts[j];
          if (c && c.length <= 100 && !twSeen[c]) { twSeen[c] = 1; twCount++; }
        }
      }
    }
    function twFlush() {
      twTimer = 0;
      twCollect();
      var list = Object.keys(twSeen).sort();
      var key = list.join(' ');
      if (key === twKey || !list.length) return;
      twKey = key;
      try { parent.postMessage({ source: 'iui-tailwind', type: 'need', seq: ++twSeq, classes: list }, '*'); } catch (eT) {}
    }
    function twSchedule() { if (!twTimer) twTimer = setTimeout(twFlush, 40); }
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.source !== 'iui-tailwind-host' || d.type !== 'css' || typeof d.css !== 'string' || ev.source !== parent) return;
      if (d.seq !== twSeq || d.css.length > 400000) return;
      var st = document.getElementById('iui-tw');
      if (!st) {
        st = document.createElement('style');
        st.id = 'iui-tw';
        var author = document.getElementById('iui-author-css');
        if (author && author.parentNode) author.parentNode.insertBefore(st, author); else (document.head || document.documentElement).appendChild(st);
      }
      if (st.textContent !== d.css) {
        st.textContent = d.css;
        if (__iuiScheme.mode !== 'auto') __iuiApplyScheme();
        // Utility CSS lands in <head>: no body mutation, and in an off-screen (throttled) frame
        // ResizeObserver may not deliver — re-measure explicitly so the frame can shrink.
        if (window.__iuiSweep) window.__iuiSweep();
      }
    });
    try {
      new MutationObserver(twSchedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    } catch (eMO) {}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', twSchedule); else twSchedule();
  })();
  try {
    var __iuiInitScheme = document.documentElement.getAttribute('data-iui-scheme');
    if (__iuiInitScheme === 'light' || __iuiInitScheme === 'dark') {
      __iuiScheme.mode = __iuiInitScheme;
      __iuiApplyScheme();
      document.addEventListener('DOMContentLoaded', __iuiApplyScheme);
    }
  } catch (eIS) {}
  // F11: forward Escape so overlay fullscreen can close while the page has focus.
  try {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !e.defaultPrevented) post({ type: 'escape' });
    });
  } catch (e) {}
  // F23: keyboard reachability for click targets the author built from divs/cards/SVG.
  // Outermost cursor:pointer elements (and [data-iui-action] / [onclick]) that are not
  // natively focusable get tabindex=0 (+ role=button) and Enter/Space → click.
  var __iuiKbdTimer = 0;
  var __iuiNativeFocus = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION|IFRAME|CANVAS|VIDEO|AUDIO|DETAILS)$/;
  function __iuiKbdSchedule() {
    if (__iuiKbdTimer) return;
    __iuiKbdTimer = setTimeout(function () { __iuiKbdTimer = 0; __iuiKbdScan(); }, 300);
  }
  // Late clickable marking (motion runtime) changes cursor without a layout change → rescan.
  window.__iuiKbdSchedule = __iuiKbdSchedule;
  function __iuiKbdScan() {
    try {
      var root = document.getElementById('iui-preview-root') || document.body;
      if (!root) return;
      var all = root.getElementsByTagName('*');
      var n = Math.min(all.length, 4000);
      for (var i = 0; i < n; i++) {
        var el = all[i];
        if (el.hasAttribute('tabindex') || el.isContentEditable) continue;
        if (__iuiNativeFocus.test(el.tagName.toUpperCase())) continue;
        var explicit = el.hasAttribute('data-iui-action') || el.hasAttribute('onclick');
        var cs = getComputedStyle(el);
        if (!explicit) {
          if (cs.cursor !== 'pointer') continue;
          var par = el.parentElement;
          if (par && par !== root && getComputedStyle(par).cursor === 'pointer') continue;
        }
        if (cs.display === 'none' || cs.visibility === 'hidden' || el.getClientRects().length === 0) continue;
        if (el.closest('a[href],button,label,summary,select,[tabindex],.leaflet-container,[aria-hidden="true"],[inert],[role=grid],[role=treegrid],[role=listbox],[role=tree],[role=menu],[role=menubar]')) continue;
        el.setAttribute('tabindex', '0');
        el.setAttribute('data-iui-kbd', '1');
        if (!el.hasAttribute('role') && !el.querySelector('a[href],button,input,select,textarea')) el.setAttribute('role', 'button');
      }
    } catch (e) { /* best effort */ }
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute('data-iui-kbd') !== '1') return;
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    if (e.repeat) return;
    e.preventDefault();
    if (typeof t.click === 'function') t.click();
    else t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, true);
  // F23: reduced-motion preference (CSS collapses animations; charts skip their intro).
  var __iuiMotionMq = null;
  try { __iuiMotionMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { __iuiMotionMq = null; }
  window.__iuiReducedMotion = function () { return !!(__iuiMotionMq && __iuiMotionMq.matches); };
  // F22: a table / pre wider than its column scrolls sideways instead of widening the page.
  function __iuiFitWide() {
    try {
      // html/body clip overflow-x, so check the wide elements themselves.
      var els = document.querySelectorAll('table,pre');
      for (var i = 0; i < els.length && i < 200; i++) {
        var el = els[i];
        var parent = el.parentElement;
        if (!parent || el.classList.contains('iui-scroll-x')) continue;
        if (el.scrollWidth > parent.clientWidth + 1) el.classList.add('iui-scroll-x');
      }
    } catch (e) { /* best effort */ }
  }
  // F13: one measurement per animation frame; post only when height moves ≥2px.
  var __iuiLastHeight = -1;
  var __iuiMeasureQueued = false;
  var __iuiMeasureForce = false;
  var __iuiRaf = __iuiNativeRaf
    ? function (cb) { return __iuiNativeRaf(cb); }
    : function (cb) { return setTimeout(cb, 16); };
  function measureNow(force) {
    __iuiFitWide();
    __iuiKbdSchedule();
    var body = document.body;
    // Content height (not viewport): bottom of the lowest rendered child + body padding,
    // so frames shrink to fit and 100vh layouts cannot feed back into growth.
    var bottom = 0;
    if (body) {
      var lowest = null;
      for (var i = 0; i < body.children.length; i++) {
        var ch = body.children[i];
        if (ch.tagName === 'SCRIPT' || ch.tagName === 'STYLE') continue;
        var rect = ch.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom + window.scrollY > bottom) { bottom = rect.bottom + window.scrollY; lowest = ch; }
      }
      // Only the lowest child's margin matters — no per-child getComputedStyle.
      if (lowest) bottom += parseFloat(getComputedStyle(lowest).marginBottom) || 0;
      bottom += parseFloat(getComputedStyle(body).paddingBottom) || 0;
    }
    // F22: report the real content height (host scrolls past 2400 and offers 展开全部).
    var h = Math.min(20000, Math.ceil(Math.max(bottom || (body ? body.scrollHeight : 0), 120)));
    if (!force && __iuiLastHeight >= 0 && Math.abs(h - __iuiLastHeight) < 2) return;
    __iuiLastHeight = h;
    post({ type: 'resize', height: h });
  }
  function measure(force) {
    if (force === true) __iuiMeasureForce = true;
    if (__iuiMeasureQueued) return;
    __iuiMeasureQueued = true;
    // rAF is paused while the frame is scrolled out of view, which would leave the host at a
    // stale (often the tallest) height until the reader scrolls back; a timer backs it up.
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      __iuiMeasureQueued = false;
      var f = __iuiMeasureForce;
      __iuiMeasureForce = false;
      measureNow(f);
    };
    __iuiRaf(run);
    setTimeout(run, 120);
  }
  // Bounded re-measure sweep after late style / font / image changes (cheap: posts only on ≥2px moves).
  var __iuiSweepTimers = [];
  window.__iuiSweep = function () {
    for (var i = 0; i < __iuiSweepTimers.length; i++) clearTimeout(__iuiSweepTimers[i]);
    __iuiSweepTimers = [0, 300, 900, 2000, 4000].map(function (ms) { return setTimeout(function () { measure(); }, ms); });
  };
  // Opaque-origin sandbox: Web Storage throws. F10: localStorage is backed by
  // the host (seeded in srcdoc, debounced storageSet back); sessionStorage
  // stays in memory for this document.
  var __iuiStore = {};
  try {
    var seed = window.__iuiStorageSeed;
    if (seed && typeof seed === 'object') Object.keys(seed).forEach(function (k) { if (typeof seed[k] === 'string') __iuiStore[k] = seed[k]; });
  } catch (e) {}
  var __iuiTouched = {};
  var __iuiSaveTimer = 0;
  function scheduleStorageSave() {
    clearTimeout(__iuiSaveTimer);
    __iuiSaveTimer = setTimeout(function () { post({ type: 'storageSet', items: __iuiStore }); }, 300);
  }
  function makeStore(persist) {
    var store = persist ? null : {};
    function data() { return persist ? __iuiStore : store; }
    function changed(k) { if (persist) { if (k != null) __iuiTouched[k] = 1; scheduleStorageSave(); } }
    return {
      getItem: function (k) { var d = data(); k = String(k); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { k = String(k); data()[k] = String(v); changed(k); },
      removeItem: function (k) { k = String(k); delete data()[k]; changed(k); },
      clear: function () { if (persist) { Object.keys(__iuiStore).forEach(function (k) { __iuiTouched[k] = 1; delete __iuiStore[k]; }); } else { store = {}; } changed(null); },
      key: function (i) { return Object.keys(data())[i] || null; },
      get length() { return Object.keys(data()).length; }
    };
  }
  window.__iuiStorageApi = makeStore(true);
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var ok = false;
    try { ok = !!window[name]; } catch (e) { ok = false; }
    if (ok) return;
    var mem = name === 'localStorage' ? window.__iuiStorageApi : makeStore(false);
    try { Object.defineProperty(window, name, { value: mem, configurable: true }); } catch (e) {}
  });
  window.__iuiStorageInit = function (items) {
    if (!items || typeof items !== 'object') return;
    Object.keys(items).forEach(function (k) {
      if (typeof items[k] !== 'string' || __iuiTouched[k]) return;
      __iuiStore[k] = items[k];
    });
    try { window.dispatchEvent(new CustomEvent('iui-storage', { detail: { keys: Object.keys(items) } })); } catch (e) {}
  };
  window.__iuiBindings = window.__iuiBindings || {};
  window.__iuiAppData = window.__iuiAppData || {};
  window.iuiSandbox = {
    resize: measure,
    /** F23: true when the user prefers reduced motion — skip autoplay / loops / long tweens. */
    get reducedMotion() { return window.__iuiReducedMotion(); },
    /** F10/F18: persistent per-page storage (JSON values; survives reload / session switch). */
    storage: {
      get: function (k) { var v = window.__iuiStorageApi.getItem(k); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return v; } },
      set: function (k, v) { window.__iuiStorageApi.setItem(k, JSON.stringify(v === undefined ? null : v)); },
      remove: function (k) { window.__iuiStorageApi.removeItem(k); },
      keys: function () { return Object.keys(__iuiStore); },
      clear: function () { window.__iuiStorageApi.clear(); }
    },
    get bindings() { return window.__iuiBindings || {}; },
    get appData() { return window.__iuiAppData || {}; },
    action: function (name, payload) {
      var data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      var act = String(name || '');
      var url = typeof data.url === 'string' ? data.url.trim() : '';
      if (/open[_-]?link/i.test(act) && url) {
        post({ type: 'openLink', url: url.slice(0, 2000) });
        return;
      }
      post({ type: 'action', action: act, payload: data });
    },
    /** F18: save a file through the host (≤10 MB, needs a click). Resolves true when saved. */
    download: function (filename, content, mime) { return __iuiDownload(filename, content, mime); },
    /** F18: copy text through the host clipboard (needs a click). Resolves true when copied. */
    copy: function (text) { return __iuiCopy(text); },
    sendPrompt: function (text) {
      var t = String(text || '').trim();
      if (!t) return;
      post({ type: 'sendPrompt', text: t.slice(0, 8000) });
    },
    /** G11: fill the composer with a readable summary of the page's choices (on click). */
    sendSummary: function (opts) { return window.__iuiSendSummary ? window.__iuiSendSummary(null, opts) : ''; },
    /** G11: the summary text without sending (for previews). */
    summary: function (opts) { return window.__iuiBuildSummary ? window.__iuiBuildSummary(null, opts) : ''; },
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
    setCredit: function (el, href, label) {
      if (!el) return null;
      var box = el.classList && el.classList.contains('iui-photo-credit') ? el : (el.querySelector && el.querySelector('.iui-photo-credit'));
      if (!box) {
        box = document.createElement('div');
        box.className = 'iui-photo-credit';
        try { el.appendChild(box); } catch (e1) { return null; }
      }
      var a = box.querySelector('a');
      if (!a) {
        a = document.createElement('a');
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        box.insertBefore(a, box.firstChild);
      }
      a.href = href || '#';
      // F12: never show a Commons file name as the credit text.
      if (label && (/\\.(jpe?g|png|gif|webp|svg|tiff?)\\b/i.test(String(label)) || /^\\s*file:/i.test(String(label)))) {
        label = /[\\u3400-\\u9fff]/.test(String(label)) || /^zh/i.test(String((document.documentElement && document.documentElement.lang) || navigator.language || '')) ? 'ⓘ 图片来自 Wikimedia' : 'ⓘ Photo: Wikimedia';
      }
      if (label) a.textContent = String(label);
      return a;
    },
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
        // F10: fire input/change after restoring so author listeners resync
        // their own state (counters, totals, filtered lists).
        var touched = [];
        function find(key) {
          var el = document.getElementById(key);
          if (el) return el;
          try { return document.querySelector('[name="' + (window.CSS && CSS.escape ? CSS.escape(String(key)) : String(key)) + '"]'); } catch (e) { return null; }
        }
        Object.keys(fields).forEach(function (key) {
          var el = find(key);
          if (el && 'value' in el && el.type !== 'file' && el.value !== fields[key]) { el.value = fields[key]; touched.push(el); }
        });
        var checks = state.checks || {};
        Object.keys(checks).forEach(function (key) {
          var el = find(key);
          if (el && 'checked' in el && el.checked !== !!checks[key]) { el.checked = !!checks[key]; touched.push(el); }
        });
        window.__iuiRestoring = true;
        touched.forEach(function (el) {
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
          try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        });
        window.__iuiRestoring = false;
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
    },
    captureShareSnapshot: function () {
      var html = '';
      var css = '';
      try {
        var root = document.getElementById('iui-preview-root');
        html = root ? String(root.innerHTML || '') : '';
      } catch (e0) {}
      try {
        var style = document.getElementById('iui-author-css');
        css = style ? String(style.textContent || '') : '';
      } catch (e1) {}
      var state = {};
      try { state = window.iuiSandbox.captureLocalState() || {}; } catch (e2) {}
      if (html.length > 200000) html = html.slice(0, 200000);
      if (css.length > 200000) css = css.slice(0, 200000);
      return { html: html, css: css, state: state };
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
    var name = reason && reason.name ? String(reason.name) : '';
    var msg = String(reason && reason.message ? reason.message : reason);
    var lower = msg.toLowerCase();
    if (name === 'AbortError' || lower.indexOf('play() request was interrupted') !== -1 || lower.indexOf('goo.gl/ldlk22') !== -1) {
      try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e0) {}
      return;
    }
    post({ type: 'error', message: msg });
  });
  function invokeDataHandler(el, attr, ev) {
    if (!el || !el.getAttribute) return false;
    var name = el.getAttribute(attr);
    if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false;
    var fn = window[name];
    if (typeof fn !== 'function') return false;
    try {
      var zoneH = window.__iuiAuthorZone;
      if (zoneH && typeof zoneH.run === 'function') zoneH.run(fn, el, [ev]);
      else fn.call(el, ev);
    } catch (err) {
      console.error('[iui-html] handler', name, err);
      try { window.iuiSandbox && window.iuiSandbox.reportError(err); } catch (e) {}
    }
    return true;
  }
  // G11: <button data-iui-send="summary"> — the page's current choices as a readable
  // summary, filled into the composer (the user reviews and presses send).
  function __iuiSumClean(t) { return String(t == null ? '' : t).replace(/\\s+/g, ' ').trim().slice(0, 120); }
  function __iuiSumVisible(el) { try { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); } catch (e) { return true; } }
  function __iuiSumOwnLabel(el) {
    var t = '';
    try {
      if (el.id) {
        var esc = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id;
        var lf = document.querySelector('label[for="' + esc + '"]');
        if (lf) t = lf.textContent;
      }
      if (!__iuiSumClean(t)) {
        var wrap = el.closest('label');
        if (wrap) {
          var c = wrap.cloneNode(true);
          c.querySelectorAll('input,select,textarea,[aria-hidden="true"]').forEach(function (n) { n.remove(); });
          t = c.textContent;
        }
      }
      if (!__iuiSumClean(t)) t = el.getAttribute('data-iui-label') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
    } catch (e) {}
    return __iuiSumClean(t).replace(/[：:]\\s*$/, '');
  }
  function __iuiSumGroupLabel(el) {
    try {
      var g = el.closest('fieldset,[role="radiogroup"],[role="group"],[role="listbox"],[role="tablist"],[data-iui-label]');
      while (g) {
        var lg = g.tagName === 'FIELDSET' ? g.querySelector('legend') : null;
        var t = __iuiSumClean(lg ? lg.textContent : (g.getAttribute('data-iui-label') || g.getAttribute('aria-label') || ''));
        if (!t && g.getAttribute('aria-labelledby')) {
          var ref = document.getElementById(g.getAttribute('aria-labelledby'));
          if (ref) t = __iuiSumClean(ref.textContent);
        }
        if (t && g !== el) return t.replace(/[：:]\\s*$/, '');
        g = g.parentElement ? g.parentElement.closest('fieldset,[role="radiogroup"],[role="group"],[role="listbox"],[role="tablist"],[data-iui-label]') : null;
      }
    } catch (e) {}
    return '';
  }
  function __iuiBuildSummary(scope, opts) {
    var zh = __iuiZh();
    var picked = zh ? '已选' : 'Selected';
    var groups = {}, order = [], extra = [];
    function add(label, value) {
      var v = __iuiSumClean(value);
      if (!v) return;
      var l = __iuiSumClean(label) || picked;
      if (!groups[l]) { groups[l] = []; order.push(l); }
      if (groups[l].indexOf(v) < 0) groups[l].push(v);
    }
    var root = scope || document.body || document.documentElement;
    if (!root) return '';
    function skip(el) { return !!(el.closest && el.closest('[data-iui-send-ignore],[data-iui-toast],[data-iui-strip],[data-iui-chrome]')); }
    root.querySelectorAll('input,select,textarea').forEach(function (el) {
      if (el.disabled || skip(el)) return;
      var type = String(el.type || '').toLowerCase();
      if (/^(hidden|password|file|button|submit|reset|image)$/.test(type)) return;
      if (type === 'checkbox' || type === 'radio') {
        if (!el.checked) return;
        var own = __iuiSumOwnLabel(el) || __iuiSumClean(el.value !== 'on' ? el.value : '');
        add(__iuiSumGroupLabel(el), own || (zh ? '是' : 'yes'));
        return;
      }
      if (!__iuiSumVisible(el)) return;
      if (el.tagName === 'SELECT') {
        var vals = [].slice.call(el.selectedOptions || []).map(function (o) { return __iuiSumClean(o.textContent); }).filter(Boolean);
        if (vals.length) add(__iuiSumOwnLabel(el) || __iuiSumGroupLabel(el) || (zh ? '选择' : 'Choice'), vals.join(zh ? '、' : ', '));
        return;
      }
      var v = __iuiSumClean(el.value);
      if (!v) return;
      if (type === 'range' && el.getAttribute('data-iui-unit')) v += el.getAttribute('data-iui-unit');
      add(__iuiSumOwnLabel(el) || __iuiSumGroupLabel(el) || (zh ? '填写' : 'Input'), v);
    });
    var sel = '[aria-pressed="true"],[aria-checked="true"]:not(input),[aria-selected="true"]:not([role="tab"]),[aria-current="true"],[data-iui-selected="true"],[data-iui-selected=""],.is-selected,.selected';
    var marks = [].slice.call(root.querySelectorAll(sel)).filter(function (el) { return !skip(el) && !el.closest('label') && el.tagName !== 'OPTION'; });
    marks.forEach(function (el) {
      // Outermost marked element only (a selected card containing a pressed badge counts once).
      for (var p = el.parentElement; p && p !== root; p = p.parentElement) { if (marks.indexOf(p) >= 0) return; }
      var text = el.getAttribute('data-iui-label') || el.getAttribute('aria-label') || '';
      if (!text) {
        var heading = el.querySelector && el.querySelector('h1,h2,h3,h4,h5,strong,.title,[class*="name"],[class*="title"]');
        text = heading ? heading.textContent : el.textContent;
      }
      add(__iuiSumGroupLabel(el), String(text || '').slice(0, 60));
    });
    root.querySelectorAll('[data-iui-summary]').forEach(function (el) {
      if (skip(el)) return;
      var line = __iuiSumClean(el.getAttribute('data-iui-summary') || el.textContent);
      if (line && extra.indexOf(line) < 0) extra.push(line);
    });
    var custom = '';
    try { if (typeof window.iuiSummary === 'function') custom = String(window.iuiSummary() || '').trim(); } catch (e) {}
    var lines = [];
    if (custom) lines.push(custom.slice(0, 2000));
    else {
      order.forEach(function (l) { lines.push('- ' + l + (zh ? '：' : ': ') + groups[l].join(zh ? '、' : ', ')); });
      extra.forEach(function (l) { lines.push('- ' + l); });
    }
    if (!lines.length) return '';
    var title = __iuiSumClean((opts && opts.title) || document.title || '');
    var intro = __iuiSumClean(opts && opts.intro) || (zh
      ? (title ? '在「' + title + '」页面里，我的选择：' : '我在页面里的选择：')
      : (title ? 'My choices on “' + title + '”:' : 'My choices on the page:'));
    var ask = __iuiSumClean(opts && opts.ask);
    return (intro + '\\n' + lines.join('\\n') + (ask ? '\\n' + ask : '')).slice(0, 2000);
  }
  window.__iuiBuildSummary = __iuiBuildSummary;
  function __iuiSendSummary(trigger, opts) {
    var o = opts || {};
    var scope = null;
    try {
      scope = (trigger && trigger.closest && (trigger.closest('[data-iui-send-scope]') || trigger.closest('form'))) || null;
      if (trigger && trigger.getAttribute) {
        if (!o.intro && trigger.getAttribute('data-iui-send-intro')) o.intro = trigger.getAttribute('data-iui-send-intro');
        if (!o.ask && trigger.getAttribute('data-iui-send-ask')) o.ask = trigger.getAttribute('data-iui-send-ask');
      }
    } catch (e) {}
    var text = __iuiBuildSummary(scope, o);
    if (!text) {
      try { window.__iuiToast(__iuiZh() ? '还没有可以发送的选择' : 'Nothing selected yet'); } catch (e) {}
      return '';
    }
    post({ type: 'sendPrompt', text: text, summary: true });
    return text;
  }
  window.__iuiSendSummary = __iuiSendSummary;
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== document && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-iui-send') === 'summary') {
        ev.preventDefault();
        __iuiSendSummary(el);
        break;
      }
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
  // F18: without allow-forms Chromium never fires "submit" (Enter becomes a
  // click on the default button). Re-create the event so author handlers run,
  // then announce the form data as "iui:submit".
  function __iuiFormData(form, submitter) {
    var out = {};
    try {
      var fd;
      try { fd = submitter ? new FormData(form, submitter) : new FormData(form); } catch (e0) { fd = new FormData(form); }
      fd.forEach(function (v, k) {
        var val = typeof v === 'string' ? v : (v && v.name ? v.name : '');
        if (Object.prototype.hasOwnProperty.call(out, k)) {
          if (!Array.isArray(out[k])) out[k] = [out[k]];
          out[k].push(val);
        } else out[k] = val;
      });
    } catch (e) {}
    return out;
  }
  function __iuiSubmit(form, submitter, skipValidation) {
    if (!form || form.__iuiSubmitting) return;
    var novalidate = skipValidation || form.noValidate || (submitter && submitter.formNoValidate);
    if (!novalidate && typeof form.reportValidity === 'function' && !form.reportValidity()) return;
    var ev;
    try { ev = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: submitter || null }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent('submit', true, true); }
    form.__iuiSubmitting = true;
    var proceed = true;
    try { proceed = form.dispatchEvent(ev); } finally { form.__iuiSubmitting = false; }
    try {
      form.dispatchEvent(new CustomEvent('iui:submit', { bubbles: true, detail: {
        data: __iuiFormData(form, submitter),
        submitter: submitter ? (submitter.name || submitter.id || null) : null,
        handled: !proceed
      } }));
    } catch (e2) {}
    if (proceed) { try { console.info('[iui] form submit stays in the page (no navigation in the sandbox); listen for "submit" or "iui:submit".'); } catch (e3) {} }
  }
  function __iuiSubmitterOf(target) {
    var b = target && target.closest ? target.closest('button, input[type="submit"], input[type="image"]') : null;
    if (!b || !b.form || b.disabled) return null;
    if (b.tagName === 'BUTTON' && String(b.getAttribute('type') || 'submit').toLowerCase() !== 'submit') return null;
    return b;
  }
  var __iuiPendingSubmit = null;
  function __iuiFlushSubmit(ev) {
    var pend = __iuiPendingSubmit;
    if (!pend || pend.ev !== ev) return;
    __iuiPendingSubmit = null;
    if (ev.defaultPrevented) return;
    try { ev.preventDefault(); } catch (e) {}
    __iuiSubmit(pend.form, pend.submitter, false);
  }
  window.addEventListener('click', function (ev) {
    var b = __iuiSubmitterOf(ev.target);
    if (!b) return;
    __iuiPendingSubmit = { ev: ev, form: b.form, submitter: b };
    setTimeout(function () { __iuiFlushSubmit(ev); }, 0);
  }, true);
  window.addEventListener('click', function (ev) { __iuiFlushSubmit(ev); }, false);
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || ev.isComposing || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target;
    if (!t || t.tagName !== 'INPUT' || !t.form) return;
    if (/^(button|submit|reset|image|checkbox|radio|file|color|range)$/i.test(String(t.type || ''))) return;
    var form = t.form;
    if (form.querySelector('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]')) return; // the browser clicks the default button
    setTimeout(function () { if (!ev.defaultPrevented) __iuiSubmit(form, null, false); }, 0);
  }, true);
  try {
    var __iuiProtoForm = HTMLFormElement.prototype;
    __iuiProtoForm.requestSubmit = function (submitter) { __iuiSubmit(this, submitter || null, false); };
    var __iuiFormSubmit = __iuiProtoForm.submit;
    __iuiProtoForm.submit = function () {
      try { this.dispatchEvent(new CustomEvent('iui:submit', { bubbles: true, detail: { data: __iuiFormData(this, null), submitter: null, handled: false } })); } catch (e) {}
      void __iuiFormSubmit;
    };
  } catch (e) {}

  // F18: <a download> / blob: links cannot download in the sandbox — route
  // them through iuiSandbox.download. Blobs are looked up synchronously so a
  // revokeObjectURL right after a.click() still works.
  var __iuiBlobs = {};
  try {
    var __iuiCreateUrl = URL.createObjectURL;
    var __iuiRevokeUrl = URL.revokeObjectURL;
    URL.createObjectURL = function (obj) {
      var u = __iuiCreateUrl.call(URL, obj);
      try { if (typeof Blob !== 'undefined' && obj instanceof Blob) __iuiBlobs[u] = obj; } catch (e) {}
      return u;
    };
    URL.revokeObjectURL = function (u) {
      var key = String(u);
      setTimeout(function () { delete __iuiBlobs[key]; }, 15000);
      return __iuiRevokeUrl.call(URL, u);
    };
  } catch (e) {}
  function __iuiDataUrl(href) {
    var m = /^data:([^,]*),([\\s\\S]*)$/i.exec(href);
    if (!m) return null;
    var meta = m[1] || '';
    var b64 = /;base64$/i.test(meta);
    var type = meta.replace(/;base64$/i, '').split(';')[0] || 'text/plain';
    try {
      if (b64) {
        var bin = atob(m[2].replace(/\\s+/g, ''));
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return { content: u8, type: type };
      }
      return { content: decodeURIComponent(m[2]), type: type };
    } catch (e) { return null; }
  }
  function __iuiLinkName(a, href) {
    var n = a.getAttribute('download');
    if (n) return n;
    if (/^(blob|data):/i.test(href)) return 'download';
    try { return decodeURIComponent(new URL(href, location.href).pathname.split('/').pop() || 'download'); } catch (e) { return 'download'; }
  }
  function __iuiIsDownloadLink(a) {
    if (!a || a.tagName !== 'A') return false;
    var href = a.getAttribute('href') || '';
    if (!href) return false;
    return a.hasAttribute('download') || /^blob:/i.test(href);
  }
  function __iuiHandleDownloadLink(a) {
    var href = a.href || a.getAttribute('href') || '';
    var name = __iuiLinkName(a, href);
    if (/^blob:/i.test(href)) {
      var blob = __iuiBlobs[href];
      if (blob) { __iuiDownload(name, blob, blob.type); return true; }
      window.__iuiToast(__iuiZh() ? '这个下载链接已失效，请重新生成' : 'This download link expired — generate it again');
      return true;
    }
    if (/^data:/i.test(href)) {
      var d = __iuiDataUrl(href);
      if (d) { __iuiDownload(name, d.content, d.type); return true; }
      return true;
    }
    if (/^https:/i.test(href)) { post({ type: 'openLink', url: href.slice(0, 2000) }); return true; }
    return false;
  }
  window.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!__iuiIsDownloadLink(a) || ev.defaultPrevented) return;
    if (__iuiHandleDownloadLink(a)) ev.preventDefault();
  }, true);
  try {
    var __iuiAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      // Detached anchors never reach the window listener above.
      if (!this.isConnected && __iuiIsDownloadLink(this) && __iuiHandleDownloadLink(this)) return;
      return __iuiAnchorClick.call(this);
    };
  } catch (e) {}
  window.addEventListener('load', function () { measure(true); if (window.__iuiSweep) window.__iuiSweep(); });
` + DESIGN_ENHANCE_JS + `
  // F13: size changes come from ResizeObserver (html, body, page root); the
  // MutationObserver only watches structure/text, not every attribute tick.
  if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
    try {
      var __iuiRo = new ResizeObserver(function () { measure(); });
      __iuiRo.observe(document.documentElement);
      if (document.body) __iuiRo.observe(document.body);
      // Also every top-level body child: body/html often carry min-height:100vh, so when the
      // content shrinks (e.g. utility CSS arriving after a tall unstyled first layout) neither
      // resizes and the frame would stay at its tallest reported height.
      var __iuiRoSeen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      window.__iuiObserveKids = function () {
        if (!__iuiRoSeen || !document.body) return;
        var kids = document.body.children;
        for (var i = 0; i < kids.length && i < 200; i++) {
          var k = kids[i];
          if (k.tagName === 'SCRIPT' || k.tagName === 'STYLE' || __iuiRoSeen.has(k)) continue;
          __iuiRoSeen.add(k); __iuiRo.observe(k);
        }
      };
      var observeRoot = function () {
        var root = document.getElementById('iui-preview-root');
        if (root) __iuiRo.observe(root);
        window.__iuiObserveKids();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeRoot);
      else observeRoot();
    } catch (e) {}
  }
  if (typeof MutationObserver !== 'undefined' && document.body) {
    try {
      new MutationObserver(function () { measure(); if (window.__iuiObserveKids) window.__iuiObserveKids(); if (window.__iuiEnhance) window.__iuiEnhance(); })
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }
  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || data.source !== 'iui-html-host' || data.frameId !== FRAME_ID) return;
    if (data.type === 'hostResult') {
      var cb = typeof data.reqId === 'string' ? __iuiPendingReq[data.reqId] : null;
      if (cb) cb({ ok: data.ok === true, reason: data.reason, data: typeof data.data === 'string' ? data.data : undefined });
      return;
    }
    if (data.type === 'measure' || data.type === 'ping') measure(true);
    if (data.type === 'visibility') {
      try { __iuiSetOffscreen(data.visible === false); } catch (eVis) {}
      if (data.visible !== false) measure(true);
      return;
    }
    if (data.type === 'appearance' && typeof data.css === 'string') {
      try { __iuiSetAppearance(data.css, data.scheme); } catch (eAp) {}
      measure(true);
      return;
    }
    if (data.type === 'requestImage') {
      try {
        __iuiCaptureImage({ background: data.background }).then(function (r) {
          post({ type: 'image', dataUrl: r.dataUrl || '', width: r.width, height: r.height, failed: r.failed || 0, reason: r.reason || '' });
        }, function () { post({ type: 'image', dataUrl: '', reason: 'failed' }); });
      } catch (eImg) { post({ type: 'image', dataUrl: '', reason: 'failed' }); }
      return;
    }
    if (data.type === 'requestFreeze') {
      var frozen = { html: '', reason: 'failed' };
      try { frozen = __iuiFreezeHtml(); } catch (eFz) {}
      post({ type: 'frozen', html: frozen.html || '', reason: frozen.reason || '' });
      return;
    }
    if (data.type === 'theme' && data.tokens && typeof data.tokens === 'object') {
      var root = document.documentElement;
      Object.keys(data.tokens).forEach(function (key) {
        if (key.indexOf('--') !== 0) return;
        var val = data.tokens[key];
        if (typeof val === 'string' && val.indexOf(';') === -1 && val.indexOf('}') === -1) {
          root.style.setProperty(key, val);
        }
      });
      try { if (window.__iuiRethemeCharts) window.__iuiRethemeCharts(); } catch (eC) {}
      try { if (window.__iuiRethemeEcharts) window.__iuiRethemeEcharts(); } catch (eE) {}
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
      try { var pipeB = window.__iuiAuthorPipeline; if (pipeB && pipeB.setBaseHtml) pipeB.setBaseHtml(data.html); } catch (eB) {}
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
      if (__iuiScheme.mode !== 'auto') __iuiApplyScheme();
      measure();
    }
    if (data.type === 'storageInit' && data.items && typeof data.items === 'object') {
      try { window.__iuiStorageInit(data.items); } catch (e) {}
    }
    if (data.type === 'storageQuota') {
      try { console.warn('[iui] page storage is over its ' + Math.round(Number(data.limit) / 1024) + 'KB quota; latest changes were not saved.'); } catch (e) {}
    }
    if (data.type === 'restoreLocalState' && data.state && typeof data.state === 'object') {
      try { window.iuiSandbox.restoreLocalState(data.state); measure(); } catch (e) {}
    }
    if (data.type === 'requestSnapshot') {
      try {
        var snap = window.iuiSandbox && window.iuiSandbox.captureShareSnapshot
          ? window.iuiSandbox.captureShareSnapshot()
          : { html: '', css: '', state: {} };
        // F20: what the page actually fetched (libs, modules, images, tiles) for the offline export.
        var resources = [];
        try {
          var ents = performance.getEntriesByType('resource') || [];
          for (var ri = 0; ri < ents.length && resources.length < 800; ri++) {
            var rn = String(ents[ri].name || '');
            if (/^https?:/i.test(rn) && rn.length <= 2000) resources.push({ url: rn, type: String(ents[ri].initiatorType || '') });
          }
        } catch (eR) {}
        post({ type: 'snapshot', html: snap.html || '', css: snap.css || '', state: snap.state || {}, resources: resources });
      } catch (eS) {
        try { post({ type: 'snapshot', html: '', css: '', state: {} }); } catch (eS2) {}
      }
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


function cdnCspOrigins(assetBase?: string): string {
  const hosts = [...new Set<string>([...HTML_SANDBOX_CDN_ALLOWLIST, ...VENDOR_CDN_HOSTS])].map((h) => `https://${h}`)
  const local = vendorBaseOrigin(assetBase)
  if (local) hosts.push(local)
  const custom = customCdnOrigin()
  if (custom && !hosts.includes(custom)) hosts.push(custom)
  return hosts.join(' ')
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
    ...AMAP_TILE_ORIGINS,
    // Trip photo runtime: Wikipedia REST + Commons API (generic place lookup)
    'https://en.wikipedia.org',
    'https://zh.wikipedia.org',
    'https://*.wikipedia.org',
    'https://commons.wikimedia.org',
    'https://upload.wikimedia.org',
    'https://thumb.wikimedia.org',
  ].join(' ')
}

function mapImgOrigins(strict = false): string {
  return [
    ...(strict ? [] : ['https:']),
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
    ...AMAP_TILE_ORIGINS,
  ].join(' ')
}

/** Runtime: rewrite blocked OSM/Carto tiles + fallback chain on tileerror.
 * Also registers maps and refreshes tiles on Replay / moveend blank-outs.
 */
function buildLeafletTileGuardScript(): string {
  // F4 (Batch F): AMap first on mainland-China networks (GCJ-02 tiles; WGS-84 data is
  // shifted by a custom CRS so markers/routes line up).
  const amap = getNetContext().tiles === 'amap'
  const primaryUrl = JSON.stringify(IUI_DEFAULT_MAP_TILE_URL)
  const primaryAttr = JSON.stringify(IUI_DEFAULT_MAP_TILE_ATTR)
  const fallbacks = JSON.stringify(IUI_MAP_TILE_FALLBACKS)
  // IMPORTANT: this returns a template literal embedded in srcdoc. Avoid `\b` / `\.`
  // inside the template — in JS template strings those become control chars / literals
  // and break the iframe with "Invalid or unexpected token".
  return `<script>
${amap ? GCJ_JS : ''}
(function () {
  var PRIMARY_URL = ${primaryUrl};
  var PRIMARY_ATTR = ${primaryAttr};
  var FALLBACKS = ${fallbacks};
  var AMAP = ${amap ? JSON.stringify(AMAP_TILE) : 'null'};
  var chain = (AMAP ? [AMAP] : []).concat([{ url: PRIMARY_URL, attribution: PRIMARY_ATTR }], FALLBACKS);
  window.__iuiMapTiles = AMAP ? 'amap' : 'default';
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
    // provider-owned: subdomains + native zoom (AMap stops at 18 → upscale beyond)
    if (entry.subdomains) o.subdomains = entry.subdomains;
    if (entry.maxZoom) o.maxNativeZoom = entry.maxZoom;
    if (entry.gcj) o.attribution = entry.attribution;
    return o;
  }
  function isBlockedTileUrl(url) {
    if (typeof url !== 'string') return false;
    if (AMAP && activeIndex === 0 && /arcgisonline|openstreetmap|cartocdn|nationalmap|stadiamaps|thunderforest/i.test(url)) return true;
    return url.indexOf('tile.openstreetmap.org') !== -1
      || url.indexOf('basemaps.cartocdn.com') !== -1;
  }
  function isGcj(idx) {
    var e = chain[idx != null ? idx : activeIndex];
    return !!(e && e.gcj);
  }
  function setCrs(map, gcj) {
    try {
      var want = gcj && L.CRS.IuiGcj ? L.CRS.IuiGcj : L.CRS.EPSG3857;
      if (!map || map.options.crs === want) return;
      var c = map._loaded ? map.getCenter() : null, z = map._loaded ? map.getZoom() : null;
      map.options.crs = want;
      if (c) map._resetView(c, z, true);
    } catch (e) {}
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
          || (layer && layer._url && /arcgisonline|openstreetmap|cartocdn|nationalmap|autonavi/i.test(String(layer._url)));
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
        // visual(⑧): re-add the page's own basemap (e.g. Esri Light / Dark Gray) instead of
        // swapping in the default street map; host fallbacks (tileerror → swapLayer) unchanged.
        var own = null;
        map.eachLayer(function (layer) {
          if (layer && typeof layer.setUrl === 'function' && typeof layer._url === 'string') {
            if (!own && !swapped && !isBlockedTileUrl(layer._url)) own = { url: layer._url, options: layer.options };
            try { map.removeLayer(layer); } catch (e) {}
          }
        });
        if (own) origTile(own.url, own.options).addTo(map);
        else origTile(currentUrl(), opts(null, activeIndex)).addTo(map);
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
    var wasGcj = isGcj();
    activeIndex++;
    tileFails = 0;
    swapped = true;
    try {
      map.eachLayer(function (layer) {
        if (layer && typeof layer.setUrl === 'function' && typeof layer._url === 'string') {
          try { map.removeLayer(layer); } catch (e) {}
        } else if (layer && layer._url && /arcgisonline|openstreetmap|cartocdn|nationalmap|autonavi/i.test(String(layer._url))) {
          try { map.removeLayer(layer); } catch (e) {}
        }
      });
    } catch (e) {}
    try {
      if (wasGcj !== isGcj()) setCrs(map, isGcj());
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
    // F4: WGS-84 in, GCJ-02 on screen — markers / routes / fitBounds line up with AMap tiles.
    if (AMAP) ${GCJ_CRS_JS}
    if (AMAP && L.Map && L.Map.addInitHook && !L.Map.__iuiGcjHook) {
      L.Map.__iuiGcjHook = true;
      L.Map.addInitHook(function () {
        var map = this;
        try { if (isGcj() && map.options.crs === L.CRS.EPSG3857) setCrs(map, true); } catch (e) {}
      });
    }
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
        // D6: never stack a host pin on a marker the author already shows (visible twice once pins are spread).
        var authorKeys = Object.create(null);
        try {
          map.eachLayer(function (lyr) {
            if (!lyr || !lyr._icon || typeof lyr.getLatLng !== 'function') return;
            var all = lyr.getLatLng();
            authorKeys[Number(all.lat).toFixed(5) + ',' + Number(all.lng).toFixed(5)] = 1;
          });
        } catch (eK) {}
        for (var pi = 0; pi < points.length; pi++) {
          var p = points[pi];
          if (authorKeys[Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5)]) continue;
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
        try {
          map.getContainer().querySelectorAll('.iui-pin-dot').forEach(function (dot) {
            if (dot && dot.style) dot.style.opacity = '1';
          });
        } catch (ePin) {}
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
    // G8: cooperative gestures — a map never captures the chat's scroll wheel or one-finger swipe.
    // Wheel zoom needs Ctrl/⌘ (or a click on the map first, until the pointer leaves); on touch
    // screens one finger scrolls the page and two fingers move / zoom the map.
    if (L.Map && L.Map.addInitHook && !L.Map.__iuiCoop) {
      L.Map.__iuiCoop = true;
      L.Map.addInitHook(function () {
        var map = this;
        try {
          var el = map.getContainer();
          if (!el || el.__iuiCoop) return;
          el.__iuiCoop = 1;
          var zh = /^zh/i.test(String((document.documentElement && document.documentElement.lang) || navigator.language || ''));
          var mac = /Mac|iP(hone|ad|od)/.test(String(navigator.platform || navigator.userAgent || ''));
          var coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
          if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
          if (coarse && map.dragging && map.options.iuiOneFingerDrag !== true) map.dragging.disable();
          var hint = document.createElement('div');
          hint.className = 'iui-map-hint';
          hint.setAttribute('aria-hidden', 'true');
          el.appendChild(hint);
          var hideT = 0;
          function show(text) {
            hint.textContent = text;
            hint.setAttribute('data-on', '1');
            clearTimeout(hideT);
            hideT = setTimeout(function () { hint.removeAttribute('data-on'); }, 1400);
          }
          var active = false;
          el.addEventListener('click', function () {
            if (active) return;
            active = true;
            if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
          });
          el.addEventListener('mouseleave', function () {
            if (!active) return;
            active = false;
            if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
          });
          var lastZoom = 0;
          el.addEventListener('wheel', function (ev) {
            if (active) return;
            if (ev.ctrlKey || ev.metaKey) {
              ev.preventDefault();
              var now = Date.now();
              if (now - lastZoom < 160) return;
              lastZoom = now;
              try {
                var pt = map.mouseEventToContainerPoint(ev);
                var z = map.getZoom() + (ev.deltaY < 0 ? 1 : -1);
                map.setZoomAround(pt, Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z)));
              } catch (eZ) {}
              return;
            }
            show(zh ? (mac ? '按住 ⌘ 滚动可缩放地图，或先点击地图' : '按住 Ctrl 滚动可缩放地图，或先点击地图') : (mac ? 'Hold ⌘ and scroll to zoom, or click the map first' : 'Hold Ctrl and scroll to zoom, or click the map first'));
          }, { passive: false });
          if (coarse) {
            el.addEventListener('touchmove', function (ev) {
              if (ev.touches && ev.touches.length === 1 && !(map.dragging && map.dragging.enabled())) show(zh ? '用两根手指移动地图' : 'Use two fingers to move the map');
            }, { passive: true });
          }
        } catch (e) {}
      });
    }
    var origMap = L.map.bind(L);
    L.map = function () {
      var map = origMap.apply(this, arguments);
      trackMap(map);
      try { if (window.__iuiTrackDeclutter) window.__iuiTrackDeclutter(map); } catch (eD) {}
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
          if (AMAP) {
            // AMap only draws mainland China well; elsewhere start on the regular chain.
            if (window.__iuiInChina && !window.__iuiInChina(c.lat, c.lng)) jumpToIndex(map, 1, 'amap-outside-china');
            return;
          }
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
        try {
          document.querySelectorAll('img[data-iui-photo-wired="1"]').forEach(function (im) {
            var marked = im.getAttribute('data-iui-photo-wired-src') || '';
            var now = im.getAttribute('src') || '';
            if (marked && now && marked !== now) {
              im.removeAttribute('data-iui-photo-wired');
              im.removeAttribute('data-iui-photo-host');
            }
          });
          document.querySelectorAll('.iui-photo-credit').forEach(function (box) {
            if (box.querySelector('a')) return;
            try {
              if (window.iuiSandbox && window.iuiSandbox.setCredit) window.iuiSandbox.setCredit(box, '#', '');
            } catch (eA) {}
          });
        } catch (eClr) {}
        if (afterTimer) clearTimeout(afterTimer);
        afterTimer = setTimeout(function () {
          try { if (window.iuiSandbox && window.iuiSandbox.afterDomChange) window.iuiSandbox.afterDomChange('click'); } catch (e) {}
        }, 40);
      }, true);
    }
    // visual(③): theme defaults — routes / shapes draw in the page ink (currentColor follows the
    // scheme live), and the stock blue PNG pin becomes an ink dot with a surface ring.
    try {
      var PO = L.Path && L.Path.prototype && L.Path.prototype.options;
      if (PO && PO.color === '#3388ff') { PO.color = 'currentColor'; PO.weight = 3; PO.opacity = 0.9; PO.fillOpacity = 0.12; }
      var MO = L.Marker && L.Marker.prototype && L.Marker.prototype.options;
      if (MO && L.divIcon && L.Icon && L.Icon.Default && MO.icon instanceof L.Icon.Default) {
        MO.icon = L.divIcon({ className: 'iui-leaflet-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10], tooltipAnchor: [10, 0] });
      }
    } catch (eDef) {}
    return true;
  }
  if (!patch()) {
    // Leaflet's UMD build assigns window.L once fully built: patch right there, before author JS.
    var curL = window.L;
    try {
      Object.defineProperty(window, 'L', {
        configurable: true,
        get: function () { return curL; },
        set: function (v) { curL = v; try { patch(); } catch (eP) {} }
      });
    } catch (eT) {}
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
      else if (++n > 250) clearInterval(t);
    }, 40);
  }
  // G3 / visual(③ ①②): Chart.js follows the page tokens — muted axis ink, hairline solid grid,
  // ink tooltip, 8-colour series (ink main + light grey comparison first).
  ${CSS_COLOR_RESOLVER_SRC}
  function tok(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v ? __iuiCssColor(v) : fb; } catch (e) { return fb; }
  }
  function palette() {
    return [
      tok('--iui-chart-1', '#185FA5'), tok('--iui-chart-2', '#3B6D11'), tok('--iui-chart-3', '#854F0B'), tok('--iui-chart-4', '#A32D2D'),
      tok('--iui-chart-5', '#534AB7'), tok('--iui-chart-6', '#0F6E56'), tok('--iui-chart-7', '#B4457A'), tok('--iui-chart-8', '#5F5E58')
    ];
  }
  window.iuiChartPalette = palette;
  function alpha(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return c;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function applyChartTheme(C) {
    var d = C && C.defaults;
    if (!d) return;
    try {
      d.font = d.font || {};
      d.font.family = tok('--font-sans', 'system-ui, sans-serif');
      d.font.size = 12;
      d.color = tok('--iui-chart-axis', '#71717a');
      d.borderColor = tok('--iui-chart-grid', '#ececee');
      if (d.scale && d.scale.grid) d.scale.grid.color = tok('--iui-chart-grid', '#ececee');
      var p = d.plugins || {};
      if (p.tooltip) {
        p.tooltip.backgroundColor = tok('--color-base-content', '#0a0a0a');
        p.tooltip.titleColor = tok('--color-base-100', '#ffffff');
        p.tooltip.bodyColor = tok('--color-base-100', '#ffffff');
        p.tooltip.padding = { x: 10, y: 8 }; p.tooltip.cornerRadius = 8; p.tooltip.boxPadding = 4;
        p.tooltip.titleFont = { weight: '600' }; p.tooltip.usePointStyle = true;
      }
      if (p.legend && p.legend.labels) { p.legend.labels.usePointStyle = true; p.legend.labels.boxWidth = 8; p.legend.labels.boxHeight = 8; }
      if (p.colors) p.colors.enabled = false;
      // R5-1: quieter axes — no vertical grid, no value-axis rail, ≤6 value ticks, softer motion.
      var sc = d.scales || {};
      ['category', 'time', 'timeseries'].forEach(function (k) {
        var a = sc[k]; if (!a) return;
        a.grid = a.grid || {}; a.grid.display = false;
        a.ticks = a.ticks || {}; if (a.ticks.padding == null) a.ticks.padding = 6;
      });
      ['linear', 'logarithmic'].forEach(function (k) {
        var a = sc[k]; if (!a) return;
        a.border = a.border || {}; a.border.display = false;
        a.grid = a.grid || {}; a.grid.drawBorder = false; // Chart.js 3 spelling
        a.ticks = a.ticks || {}; if (a.ticks.maxTicksLimit == null) a.ticks.maxTicksLimit = 5; if (a.ticks.padding == null) a.ticks.padding = 8;
      });
      if (d.animation && typeof d.animation === 'object') { d.animation.duration = 700; }
      if (d.elements && d.elements.line && d.elements.line.tension === 0) d.elements.line.tension = 0.3;
      if (d.elements && d.elements.arc) { d.elements.arc.borderColor = tok('--color-base-100', '#ffffff'); }
    } catch (e) {}
  }
  // G10: datasets the host coloured are re-coloured when the accent / scheme changes.
  var painted = typeof WeakMap === 'function' ? new WeakMap() : null;
  function paintDatasets(cfg) {
    try {
      var ds = cfg.data && cfg.data.datasets;
      if (!Array.isArray(ds)) return;
      var pal = palette();
      var type = String(cfg.type || 'line');
      ds.forEach(function (d, i) {
        if (!d) return;
        var mark = painted ? painted.get(d) : null;
        if (mark) { delete d.borderColor; delete d.backgroundColor; if (mark.pb) delete d.pointBackgroundColor; if (mark.pbc) delete d.pointBorderColor; }
        else if (d.borderColor || d.backgroundColor) return;
        if (painted) painted.set(d, { pb: d.pointBackgroundColor == null, pbc: d.pointBorderColor == null });
        var t = String(d.type || type);
        var c = pal[i % pal.length];
        if (t === 'pie' || t === 'doughnut' || t === 'polarArea') {
          var n = Array.isArray(d.data) ? d.data.length : 0;
          d.backgroundColor = []; for (var k = 0; k < n; k++) d.backgroundColor.push(pal[k % pal.length]);
          d.borderColor = tok('--color-base-100', '#ffffff');
          d.borderWidth = d.borderWidth == null ? 2 : d.borderWidth;
          if (t === 'doughnut' && d.cutout == null) d.cutout = '66%';
          if (t !== 'polarArea' && d.borderRadius == null) d.borderRadius = 4;
        } else if (t === 'line' || t === 'radar') {
          d.borderColor = c;
          // R5-1: area fades out toward the axis instead of a flat tint.
          d.backgroundColor = t === 'line' ? function (ctx) {
            var ch = ctx && ctx.chart, a = ch && ch.chartArea;
            if (!a || !ch.ctx || !ch.ctx.createLinearGradient) return alpha(c, 0.08);
            var g = ch.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, alpha(c, 0.10)); g.addColorStop(1, alpha(c, 0));
            return g;
          } : alpha(c, 0.12);
          // R5-2: single series fills to the floor; points only at the latest value (hover shows the rest).
          if (t === 'line' && d.fill == null && ds.length === 1) d.fill = 'start';
          if (d.pointRadius == null) d.pointRadius = t === 'line' ? function (ctx) { var n = ctx && ctx.dataset && ctx.dataset.data ? ctx.dataset.data.length : 0; return ctx && ctx.dataIndex === n - 1 ? 4 : 0; } : 3;
          if (d.pointHoverRadius == null) d.pointHoverRadius = 5;
          if (d.pointBackgroundColor == null) d.pointBackgroundColor = c;
          if (d.pointBorderColor == null) d.pointBorderColor = tok('--color-base-100', '#ffffff');
          if (d.pointBorderWidth == null) d.pointBorderWidth = t === 'line' ? 0 : 2;
          if (d.borderWidth == null) d.borderWidth = 2;
          if (t === 'line' && d.tension == null) d.tension = 0.3;
        } else {
          d.backgroundColor = c; d.borderColor = c;
          if (d.borderRadius == null && t === 'bar') d.borderRadius = 5;
          if (d.maxBarThickness == null && t === 'bar') d.maxBarThickness = 36;
          if (t === 'bar' && ds.length > 1) {
            if (d.categoryPercentage == null) d.categoryPercentage = 0.62;
            if (d.barPercentage == null) d.barPercentage = 0.8;
          }
        }
      });
    } catch (e) {}
  }
  // Chart.js bakes resolved default colours into each chart's options at creation, so a
  // scheme switch swaps the old theme colours for the new ones (author colours stay).
  function themeColors(C) {
    var d = C.defaults || {};
    var tt = (d.plugins && d.plugins.tooltip) || {};
    return { ink: d.color, grid: d.scale && d.scale.grid && d.scale.grid.color, border: d.borderColor, tipBg: tt.backgroundColor, tipFg: tt.titleColor };
  }
  function swapColor(obj, key, from, to) {
    try { if (obj && from !== to && obj[key] === from) obj[key] = to; } catch (e) {}
  }
  function recolorChart(ch, prev, next) {
    var opts = ch.options || {};
    var scales = opts.scales || {};
    Object.keys(scales).forEach(function (id) {
      var sc = scales[id];
      if (!sc) return;
      swapColor(sc.ticks, 'color', prev.ink, next.ink);
      swapColor(sc.title, 'color', prev.ink, next.ink);
      swapColor(sc.pointLabels, 'color', prev.ink, next.ink);
      swapColor(sc.grid, 'color', prev.grid, next.grid);
      swapColor(sc.angleLines, 'color', prev.grid, next.grid);
      swapColor(sc.border, 'color', prev.border, next.border);
    });
    var pl = opts.plugins || {};
    if (pl.legend) swapColor(pl.legend.labels, 'color', prev.ink, next.ink);
    swapColor(pl.title, 'color', prev.ink, next.ink);
    swapColor(pl.tooltip, 'backgroundColor', prev.tipBg, next.tipBg);
    swapColor(pl.tooltip, 'titleColor', prev.tipFg, next.tipFg);
    swapColor(pl.tooltip, 'bodyColor', prev.tipFg, next.tipFg);
  }
  function retheme() {
    var C = window.__iuiChartOrig || window.Chart;
    if (!C) return;
    var prev = themeColors(C);
    applyChartTheme(C);
    var next = themeColors(C);
    try {
      var all = C.instances ? Object.keys(C.instances).map(function (k) { return C.instances[k]; }) : [];
      all.forEach(function (ch) {
        try { recolorChart(ch, prev, next); } catch (eR) {}
        try { if (ch.data) paintDatasets({ type: ch.config && ch.config.type, data: ch.data }); } catch (eP) {}
        try { ch.update('none'); } catch (e) {}
      });
    } catch (e) {}
  }
  window.__iuiRethemeCharts = retheme;
  try {
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', function () { setTimeout(retheme, 0); });
    }
  } catch (e) {}
  window.iuiCreateChart = function (canvas, config) {
    var C = window.__iuiChartOrig || window.Chart;
    if (!C || !canvas) return null;
    var cfg = config && typeof config === 'object' ? config : { type: 'line', data: { labels: [], datasets: [] } };
    if (!cfg.options) cfg.options = {};
    applyChartTheme(C);
    paintDatasets(cfg);
    // R5-1: line/bar tooltips follow the x position (no pixel hunting for a dot).
    try {
      var ty = String(cfg.type || '');
      if ((ty === 'line' || ty === 'bar') && !cfg.options.interaction) cfg.options.interaction = { mode: 'index', intersect: false };
    } catch (e) {}
    cfg.options.maintainAspectRatio = false;
    cfg.options.responsive = cfg.options.responsive !== false;
    try { if (window.__iuiReducedMotion && window.__iuiReducedMotion()) cfg.options.animation = false; } catch (e) {}
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
  function install(C) {
    if (!C || C.__iuiPatched) return C;
    window.__iuiChartOrig = C;
    applyChartTheme(C);
    // Soft-patch new Chart(...) to force maintainAspectRatio:false when omitted.
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
    Wrapped.instances = Orig.instances;
    return Wrapped;
  }
  // G3: trap the UMD assignment (window.Chart = factory()) so the theme + wrapper are in place
  // before any author code can construct a chart.
  if (!window.Chart) {
    var curChart;
    try {
      Object.defineProperty(window, 'Chart', {
        configurable: true,
        get: function () { return curChart; },
        set: function (v) { curChart = install(v); buildMod(); }
      });
    } catch (eT) {}
  }
  waitChart(function (C) {
    if (!C.__iuiPatched) window.Chart = install(C);
    retheme();
    buildMod();
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
            data: { labels: labels, datasets: [{ label: '温度', data: data, fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] },
            options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false } } }
          });
          cv.__iuiChartOk = true;
          var tip = document.createElement('div');
          tip.className = 'iui-sandbox-muted';
          tip.style.cssText = 'font-size:12px;margin-top:4px';
          tip.textContent = '示意折线（模型图表未挂载时的回退）';
          if (cv.parentElement) cv.parentElement.appendChild(tip);
        }
      } catch (e) {}
    }, 1600);
  });
})();
<\/script>`
}

/** G3: ECharts follows the page tokens via a registered `iui` theme (default for echarts.init). */
function buildEchartsGuardScript(): string {
  return `<script>
(function () {
  ${CSS_COLOR_RESOLVER_SRC}
  function tok(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v ? __iuiCssColor(v) : fb; } catch (e) { return fb; }
  }
  function rgba(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return c;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function palette() {
    var pal = [];
    for (var i = 1; i <= 8; i++) pal.push(tok('--iui-chart-' + i, ['#0a0a0a', '#d4d4d8', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#71717a', '#7c3aed'][i - 1]));
    return pal;
  }
  // visual(③ ①②④): muted axis labels, no axis rails / ticks, hairline solid value grid,
  // rounded bars, 2px lines with only the latest point, ink tooltip text on the page surface,
  // tree (mind map) defaults; charts.html / mind.html.
  function theme() {
    var ink = tok('--iui-chart-axis', '#71717a');
    var grid = tok('--iui-chart-grid', '#ececee');
    var text = tok('--color-base-content', '#0a0a0a');
    var bg = tok('--color-base-100', '#ffffff');
    var axis = { axisLine: { show: false, lineStyle: { color: grid } }, axisTick: { show: false, lineStyle: { color: grid } }, axisLabel: { color: ink, margin: 10 }, splitLine: { lineStyle: { color: grid, type: 'solid' } }, nameTextStyle: { color: ink } };
    return {
      color: palette(),
      backgroundColor: 'transparent',
      textStyle: { fontFamily: tok('--font-sans', 'system-ui, sans-serif'), color: ink, fontSize: 12 },
      title: { textStyle: { color: text, fontWeight: 600, fontSize: 14 }, subtextStyle: { color: ink } },
      legend: { textStyle: { color: ink }, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 14 },
      grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
      tooltip: { backgroundColor: bg, borderColor: tok('--color-base-300', '#e7e7e9'), borderWidth: 1, padding: [8, 10], textStyle: { color: text, fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.08)' },
      categoryAxis: Object.assign({}, axis, { splitLine: { show: false, lineStyle: { color: grid } } }),
      valueAxis: Object.assign({}, axis, { splitNumber: 4 }),
      timeAxis: Object.assign({}, axis, { splitLine: { show: false, lineStyle: { color: grid } } }),
      logAxis: axis,
      line: { smooth: 0.3, symbol: 'circle', symbolSize: 7, showSymbol: false, lineStyle: { width: 2 } },
      bar: { barMaxWidth: 28, barGap: '25%', itemStyle: { borderRadius: [5, 5, 0, 0] } },
      pie: { itemStyle: { borderColor: bg, borderWidth: 2, borderRadius: 4 }, label: { color: text } },
      scatter: { symbolSize: 8 },
      tree: {
        top: '4%', bottom: '4%', left: '18%', right: '18%', symbol: 'circle', symbolSize: 9, edgeShape: 'curve', initialTreeDepth: -1,
        itemStyle: { color: text, borderColor: text, borderWidth: 2 }, lineStyle: { color: tok('--iui-chart-line', '#a1a1aa'), width: 1.5, curveness: 0.5 },
        label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 13, color: text, distance: 8 },
        leaves: { label: { position: 'right', align: 'left', color: tok('--color-text-secondary', '#3f3f46') } },
        emphasis: { focus: 'descendant' }, expandAndCollapse: true
      }
    };
  }
  // Per-series polish the theme cannot express (only where the author left it unset).
  function decorate(opt) {
    if (!opt || typeof opt !== 'object') return;
    var list = Array.isArray(opt.series) ? opt.series : (opt.series && typeof opt.series === 'object' ? [opt.series] : []);
    if (!list.length) return;
    var pal = palette();
    var lines = list.filter(function (x) { return x && x.type === 'line'; });
    list.forEach(function (sr, idx) {
      if (!sr || typeof sr !== 'object') return;
      var c = (sr.itemStyle && typeof sr.itemStyle.color === 'string' && sr.itemStyle.color) || (sr.lineStyle && typeof sr.lineStyle.color === 'string' && sr.lineStyle.color) || (typeof sr.color === 'string' && sr.color) || pal[idx % pal.length];
      if (sr.type === 'line') {
        // area: soft fade to the axis (10% → 0) instead of a flat 70% fill.
        if (sr.areaStyle && typeof sr.areaStyle === 'object' && sr.areaStyle.color == null && sr.areaStyle.opacity == null && /^#/.test(c)) {
          sr.areaStyle.color = { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: rgba(c, 0.10) }, { offset: 1, color: rgba(c, 0) }] };
        }
        // a single trend line marks its latest value (ink label, like the demo).
        if (lines.length === 1 && list.length === 1 && sr.markPoint == null && sr.showSymbol == null && sr.symbolSize == null && Array.isArray(sr.data) && sr.data.length > 1) {
          var last = sr.data.length - 1, v = sr.data[last];
          var num = typeof v === 'number' ? v : (v && typeof v === 'object' && typeof v.value === 'number' ? v.value : null);
          if (num != null) {
            sr.showSymbol = true;
            sr.symbolSize = function (val, p) { return p && p.dataIndex === last ? 8 : 0; };
            sr.markPoint = { symbol: 'roundRect', symbolSize: [Math.max(40, String(num).length * 8 + 16), 22], symbolOffset: [0, -20], silent: true,
              data: [{ coord: [last, num], value: num }], itemStyle: { color: c }, label: { color: tok('--color-base-100', '#ffffff'), fontSize: 11, fontWeight: 600 } };
          }
        }
      } else if (sr.type === 'tree') {
        decorateTree(sr, pal);
      }
    });
  }
  // ④ mind map: each first-level branch takes a hue; the root is an ink pill.
  function decorateTree(sr, pal) {
    var roots = Array.isArray(sr.data) ? sr.data : [];
    var root = roots[0];
    if (!root || typeof root !== 'object' || !Array.isArray(root.children)) return;
    // Margins sized to the root / leaf labels so narrow (390px) frames don't clip them.
    var orient = sr.orient || 'LR';
    if ((sr.layout || 'orthogonal') === 'orthogonal' && (orient === 'LR' || orient === 'RL')) {
      var w = function (t, px) { var n = 0; String(t == null ? '' : t).split('').forEach(function (ch) { n += ch.charCodeAt(0) > 255 ? 1 : 0.6; }); return Math.ceil(n * px); };
      var leafW = 0;
      (function walk(nodes) { (nodes || []).forEach(function (n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n.children) && n.children.length) walk(n.children); else leafW = Math.max(leafW, w(n.name, 12)); }); })(root.children);
      var rootW = w(root.name, 14) + 28;
      var near = orient === 'LR' ? 'left' : 'right', far = orient === 'LR' ? 'right' : 'left';
      if (sr[near] == null) sr[near] = Math.min(rootW, 180);
      if (sr[far] == null) sr[far] = Math.min(leafW + 18, 200);
      if (sr.top == null) sr.top = 16;
      if (sr.bottom == null) sr.bottom = 16;
    }
    var hues = [pal[2], pal[3], pal[4], pal[7], pal[5], pal[6]];
    var text = tok('--color-base-content', '#0a0a0a'), bg = tok('--color-base-100', '#ffffff');
    if (root.label == null && root.itemStyle == null) {
      root.label = { position: 'inside', fontSize: 14, fontWeight: 700, backgroundColor: text, color: bg, padding: [6, 10], borderRadius: 999 };
      root.symbolSize = 1;
    }
    root.children.forEach(function (ch, i) {
      if (!ch || typeof ch !== 'object' || ch.itemStyle != null || ch.lineStyle != null) return;
      var h = hues[i % hues.length];
      ch.itemStyle = { color: h, borderColor: h };
      ch.lineStyle = { color: rgba(h, 0.4) };
      if (ch.label == null) ch.label = { fontWeight: 600 };
      (function paint(nodes) {
        (nodes || []).forEach(function (n) {
          if (!n || typeof n !== 'object') return;
          if (n.itemStyle == null) n.itemStyle = { color: bg, borderColor: h };
          if (n.lineStyle == null) n.lineStyle = { color: rgba(h, 0.33) };
          paint(n.children);
        });
      })(ch.children);
    });
  }
  function wrapInstance(inst) {
    if (!inst || inst.__iuiWrapped || typeof inst.setOption !== 'function') return inst;
    var so = inst.setOption;
    inst.setOption = function (opt) {
      try { decorate(opt); } catch (eD) {}
      return so.apply(this, arguments);
    };
    inst.__iuiWrapped = true;
    return inst;
  }
  function patch(e) {
    if (!e || e.__iuiPatched || typeof e.init !== 'function' || typeof e.registerTheme !== 'function') return false;
    try { e.registerTheme('iui', theme()); lastInks = inks(); } catch (err) {}
    var orig = e.init;
    e.init = function (el, th, opts) { return wrapInstance(orig.call(e, el, th == null ? 'iui' : th, opts)); };
    e.__iuiPatched = true;
    return true;
  }
  function inks() {
    return {
      ink: tok('--iui-chart-axis', '#71717a'), grid: tok('--iui-chart-grid', '#ececee'),
      line: tok('--iui-chart-grid', '#ececee'), text: tok('--color-base-content', '#0a0a0a'),
      bg: tok('--color-base-100', '#ffffff')
    };
  }
  var lastInks = inks();
  function lineColor(o, k) { return o && o[k] && o[k].lineStyle && o[k].lineStyle.color; }
  function textColor(o, k) { return o && o[k] && o[k].color; }
  function axisPatch(ax, prev, next) {
    var p = {};
    if (textColor(ax, 'axisLabel') === prev.ink) p.axisLabel = { color: next.ink };
    if (textColor(ax, 'nameTextStyle') === prev.ink) p.nameTextStyle = { color: next.ink };
    if (lineColor(ax, 'splitLine') === prev.grid) p.splitLine = { lineStyle: { color: next.grid } };
    if (lineColor(ax, 'axisTick') === prev.grid) p.axisTick = { lineStyle: { color: next.grid } };
    if (lineColor(ax, 'axisLine') === prev.line) p.axisLine = { lineStyle: { color: next.line } };
    return p;
  }
  window.__iuiRethemeEcharts = function () {
    var prev = lastInks;
    try { if (window.echarts) window.echarts.registerTheme('iui', theme()); } catch (e) {}
    // G10: live charts take the new palette; theme-derived ink / grid colours are swapped
    // (theme values are baked into each instance at init; author colours stay).
    var next = inks();
    lastInks = next;
    try {
      var pal = theme().color;
      if (window.echarts && pal) document.querySelectorAll('[_echarts_instance_]').forEach(function (el) {
        var inst = window.echarts.getInstanceByDom(el);
        if (!inst) return;
        var patchOpt = { color: pal };
        try {
          var o = inst.getOption() || {};
          ['xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'singleAxis'].forEach(function (k) {
            if (Array.isArray(o[k])) patchOpt[k] = o[k].map(function (ax) { return axisPatch(ax, prev, next); });
          });
          if (Array.isArray(o.legend)) patchOpt.legend = o.legend.map(function (l) { return textColor(l, 'textStyle') === prev.ink ? { textStyle: { color: next.ink } } : {}; });
          if (Array.isArray(o.title)) patchOpt.title = o.title.map(function (t) {
            var tp = {};
            if (textColor(t, 'textStyle') === prev.text) tp.textStyle = { color: next.text };
            if (textColor(t, 'subtextStyle') === prev.ink) tp.subtextStyle = { color: next.ink };
            return tp;
          });
          if (o.textStyle && o.textStyle.color === prev.ink) patchOpt.textStyle = { color: next.ink };
          if (Array.isArray(o.tooltip)) patchOpt.tooltip = o.tooltip.map(function (t) {
            var tp = {};
            if (t && t.backgroundColor === prev.bg) tp.backgroundColor = next.bg;
            if (textColor(t, 'textStyle') === prev.text) tp.textStyle = { color: next.text };
            return tp;
          });
        } catch (eO) {}
        inst.setOption(patchOpt);
      });
    } catch (e2) {}
  };
  if (patch(window.echarts)) return;
  // UMD assigns window.echarts = {} and fills it synchronously: patch on the next microtask.
  var cur = window.echarts;
  try {
    Object.defineProperty(window, 'echarts', {
      configurable: true,
      get: function () { return cur; },
      set: function (v) { cur = v; Promise.resolve().then(function () { patch(cur); }); }
    });
  } catch (e) {}
  var n = 0, t = setInterval(function () { if (patch(window.echarts) || ++n > 250) clearInterval(t); }, 40);
})();
<\/script>`
}

/**
 * visual(③): d3 starts on the page palette — the categorical schemes models reach for
 * (schemeCategory10 / schemeTableau10 / schemeObservable10) become the theme series;
 * axes pick up the chart chrome from the host CSS (.tick / .domain).
 */
function buildD3DefaultsScript(): string {
  return `<script>
(function () {
  ${CSS_COLOR_RESOLVER_SRC}
  function tok(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v ? __iuiCssColor(v) : fb; } catch (e) { return fb; }
  }
  function patch(d) {
    if (!d || d.__iuiThemed || typeof d.scaleOrdinal !== 'function') return false;
    var pal = [];
    for (var i = 1; i <= 8; i++) pal.push(tok('--iui-chart-' + i, ['#0a0a0a', '#d4d4d8', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#71717a', '#7c3aed'][i - 1]));
    var ten = pal.concat([tok('--iui-chart-axis', '#71717a'), tok('--iui-chart-line', '#a1a1aa')]);
    ['schemeCategory10', 'schemeTableau10', 'schemeObservable10'].forEach(function (k) { try { if (k in d) d[k] = ten.slice(); } catch (e) {} });
    d.__iuiThemed = true;
    return true;
  }
  if (patch(window.d3)) return;
  var cur = window.d3;
  try {
    Object.defineProperty(window, 'd3', {
      configurable: true,
      get: function () { return cur; },
      set: function (v) { cur = v; Promise.resolve().then(function () { patch(cur); }); }
    });
  } catch (e) {}
  var n = 0, t = setInterval(function () { if (patch(window.d3) || ++n > 250) clearInterval(t); }, 40);
})();
<\/script>`
}

/** visual(③ motion): GSAP defaults from the motion spec (250–400ms, ease-out) for ESM or UMD gsap. */
function buildGsapDefaultsScript(): string {
  return `<script type="module">
var apply = function (g) {
  if (!g || g.__iuiDefaults || typeof g.defaults !== 'function') return;
  g.__iuiDefaults = true;
  try { g.defaults({ duration: 0.4, ease: 'power3.out' }); } catch (e) {}
};
try { if (window.gsap) apply(window.gsap); } catch (e) {}
import('gsap').then(function (m) { apply(m.gsap || m.default); }, function () {});
<\/script>`
}

function buildAgGridGuardScript(): string {
  return `<script>
(function () {
  function paintHost(el) {
    if (!el || !el.classList) return;
    if (!el.classList.contains('ag-theme-quartz') && !el.classList.contains('ag-theme-alpine') && !el.classList.contains('ag-theme-balham')) {
      el.classList.add('ag-theme-quartz');
    }
    el.classList.add('ag-theme-iui');
  }
  function wrapCreate() {
    var g = window.agGrid;
    if (!g || g.__iuiPatched) return;
    var orig = g.createGrid;
    if (typeof orig !== 'function') return;
    // The UMD namespace exposes getters only (assignment is a silent no-op): wrap it.
    var api = g;
    try { api = Object.create(g); } catch (eC) { api = g; }
    var patched = function (el, opts) {
      paintHost(el);
      var o = opts && typeof opts === 'object' ? opts : {};
      if (!o.domLayout && el && (!el.style || !el.style.height || el.style.height === 'auto')) o.domLayout = 'autoHeight';
      // visual(③): columns share the width (no ragged right edge), no header menu buttons.
      if (!o.defaultColDef) o.defaultColDef = { flex: 1, minWidth: 90, suppressHeaderMenuButton: true };
      if (o.rowHeight == null && o.domLayout === 'autoHeight' && Array.isArray(o.rowData) && o.rowData.length > 12 && o.pagination == null) { o.pagination = true; o.paginationPageSize = 10; o.paginationPageSizeSelector = false; }
      try { return orig.call(g, el, o); } catch (err) {
        try { window.iuiSandbox && window.iuiSandbox.reportError(err); } catch (e) {}
        throw err;
      }
    };
    try { Object.defineProperty(api, 'createGrid', { value: patched, writable: true, configurable: true }); } catch (eD) {}
    try { Object.defineProperty(api, '__iuiPatched', { value: true }); } catch (eP) {}
    if (api !== g) { try { window.agGrid = api; } catch (eW) {} }
    try { g.__iuiPatched = true; } catch (eG) {}
  }
  function wait(cb) {
    if (window.agGrid) { cb(); return; }
    var n = 0, t = setInterval(function () {
      if (window.agGrid) { clearInterval(t); cb(); }
      else if (++n > 250) clearInterval(t);
    }, 40);
  }
  // visual(③): patch in the capture phase of the vendor script's load event, before the
  // pipeline (which watches the same load) can run author code against the raw API.
  try { document.addEventListener('load', function (ev) { if (ev.target && ev.target.tagName === 'SCRIPT' && window.agGrid) wrapCreate(); }, true); } catch (e) {}
  wait(function () {
    wrapCreate();
    document.querySelectorAll('[class*="ag-theme"]').forEach(paintHost);
  });
})();
<\/script>`
}

function buildMermaidGuardScript(): string {
  return `<script>
(function () {
  ${CSS_COLOR_RESOLVER_SRC}
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (v && String(v).trim()) return __iuiCssColor(String(v).trim());
    } catch (e) {}
    return fallback;
  }
  function rgba(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return c;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // visual(③ ⑨): greyscale Mermaid — page-surface nodes with hairline borders, 35% ink edges,
  // rounded boxes; classes :::focal (ink, key step) / :::muted / :::ext (dashed) / :::input.
  function mermaidConfig() {
    var ink = cssVar('--color-base-content', '#0a0a0a'), bg = cssVar('--color-base-100', '#ffffff');
    var b2 = cssVar('--color-base-200', '#f4f4f5'), b3 = cssVar('--color-base-300', '#e7e7e9');
    var line = cssVar('--iui-chart-line', '#a1a1aa'), mut = cssVar('--iui-chart-axis', '#71717a');
    var err = cssVar('--color-error', '#dc2626');
    var css = '.node rect,.node polygon,.node circle,.node path{stroke-width:1px}.node rect{rx:10px;ry:10px}'
      + '.focal rect,.focal path,.focal polygon,.focal circle{fill:' + ink + '!important;stroke:' + ink + '!important}.focal .nodeLabel,.focal text{color:' + bg + '!important;fill:' + bg + '!important;font-weight:600}'
      + '.ext rect,.ext path,.ext polygon{stroke-dasharray:4 3!important}'
      + '.muted rect,.muted path,.muted polygon,.input rect,.input path,.input polygon{fill:' + b2 + '!important;stroke:transparent!important}.muted .nodeLabel,.muted text{color:' + mut + '!important;fill:' + mut + '!important}'
      + '.edgeLabel,.edgeLabel p{font-size:12px;color:' + mut + '}.edgeLabel rect,.labelBkg{fill:' + bg + ';background:' + bg + '}'
      + 'rect.actor{rx:10px;ry:10px;stroke:' + b3 + '!important}.messageText{fill:' + mut + '!important}'
      + '.grid .tick line{stroke:' + rgba(ink, 0.07) + '!important}.grid .tick text{fill:' + mut + '!important;font-size:11px!important}.grid path{stroke:none!important}rect.task{rx:6px;ry:6px}.sectionTitle{fill:' + mut + '!important}';
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: cssVar('--font-sans', 'system-ui,sans-serif'),
      flowchart: { curve: 'basis', padding: 14, nodeSpacing: 36, rankSpacing: 46, htmlLabels: true },
      sequence: { mirrorActors: false, actorMargin: 80, boxMargin: 6, messageFontSize: 13 },
      gantt: { barHeight: 22, barGap: 8, topPadding: 40, fontSize: 12, sectionFontSize: 12 },
      themeCSS: css,
      themeVariables: {
        fontFamily: cssVar('--font-sans', 'system-ui,sans-serif'), fontSize: '13px',
        background: bg, primaryColor: bg, primaryBorderColor: b3, primaryTextColor: ink,
        secondaryColor: b2, secondaryBorderColor: b3, secondaryTextColor: ink,
        tertiaryColor: b2, tertiaryBorderColor: b3, tertiaryTextColor: ink,
        mainBkg: bg, nodeBorder: b3, nodeTextColor: ink, textColor: ink, titleColor: ink,
        lineColor: line, defaultLinkColor: line, edgeLabelBackground: bg, clusterBkg: b2, clusterBorder: b3,
        actorBkg: bg, actorBorder: b3, actorTextColor: ink, actorLineColor: b3, signalColor: line, signalTextColor: ink,
        labelBoxBkgColor: bg, labelBoxBorderColor: b3, labelTextColor: ink, noteBkgColor: b2, noteBorderColor: b3, noteTextColor: ink, activationBkgColor: b2, activationBorderColor: b3,
        sectionBkgColor: rgba(ink, 0.03), altSectionBkgColor: bg, sectionBkgColor2: rgba(ink, 0.03),
        taskBkgColor: rgba(ink, 0.14), taskBorderColor: 'transparent', taskTextColor: ink, taskTextDarkColor: ink, taskTextOutsideColor: ink, taskTextLightColor: bg,
        activeTaskBkgColor: ink, activeTaskBorderColor: ink, doneTaskBkgColor: rgba(ink, 0.35), doneTaskBorderColor: 'transparent',
        critBkgColor: err, critBorderColor: err, gridColor: rgba(ink, 0.08), todayLineColor: err,
        pie1: ink, pie2: cssVar('--iui-chart-2', '#d4d4d8'), pie3: cssVar('--iui-chart-3', '#2563eb'), pie4: cssVar('--iui-chart-4', '#16a34a'), pie5: cssVar('--iui-chart-5', '#d97706'), pie6: cssVar('--iui-chart-6', '#dc2626'),
        pieStrokeColor: bg, pieOuterStrokeColor: b3, pieTitleTextColor: ink, pieSectionTextColor: bg, pieLegendTextColor: ink
      }
    };
  }
  window.__iuiMermaidConfig = mermaidConfig;
  function boot(m) {
    if (!m || m.__iuiBooted) return;
    try {
      var init = m.initialize;
      // Author initialize() keeps the host look unless it picks a named theme (dark / forest …).
      m.initialize = function (cfg) {
        var base = mermaidConfig(), c = cfg && typeof cfg === 'object' ? cfg : {};
        var named = c.theme && c.theme !== 'default' && c.theme !== 'neutral' && c.theme !== 'base';
        var out = named ? Object.assign({}, c) : Object.assign(base, c, { theme: 'base', themeVariables: Object.assign(base.themeVariables, c.themeVariables || {}), themeCSS: (base.themeCSS || '') + (c.themeCSS || '') });
        out.securityLevel = 'strict';
        return init.call(m, out);
      };
      init.call(m, mermaidConfig());
      m.__iuiBooted = true;
    } catch (e) {}
  }
  function runAll() {
    var m = window.mermaid;
    if (!m || typeof m.run !== 'function') return;
    boot(m);
    document.querySelectorAll('.mermaid, .iui-mindmap, pre.mermaid').forEach(function (el) {
      if (!el.classList.contains('iui-mindmap')) el.classList.add('iui-mindmap');
    });
    try { m.run({ querySelector: '.mermaid, .iui-mindmap' }); } catch (e) {}
  }
  function wait(cb) {
    if (window.mermaid) { cb(window.mermaid); return; }
    var n = 0, t = setInterval(function () {
      if (window.mermaid) { clearInterval(t); cb(window.mermaid); }
      else if (++n > 250) clearInterval(t);
    }, 40);
  }
  try { document.addEventListener('load', function (ev) { if (ev.target && ev.target.tagName === 'SCRIPT' && window.mermaid) boot(window.mermaid); }, true); } catch (e) {}
  wait(function (m) {
    boot(m);
    setTimeout(runAll, 0);
    setTimeout(runAll, 240);
  });
})();
<\/script>`
}

/**
 * C1: host-injected CDN tags must not block first paint. Scripts become
 * `async` + tracked via data-iui-done (pipeline waits with a timeout, C4);
 * stylesheets load as print → all.
 */
export function makeCdnTagsNonBlocking(tags: string): string {
  return tags
    .replace(/<script src=("[^"]+")((?: [a-z-]+="[^"]*")*)><\/script>/g, (_m, src: string, fb: string) =>
      `<script async data-iui-cdn${fb} onload="this.setAttribute('data-iui-done','1')" onerror="window.__iuiCdnNext?__iuiCdnNext(this):this.setAttribute('data-iui-done','0')" src=${src}><\/script>`)
    .replace(/<link rel="stylesheet" href=("[^"]+")((?: [a-z-]+="[^"]*")*)\/>/g, (_m, href: string, fb: string) =>
      `<link rel="stylesheet"${fb} media="print" onload="this.media='all';this.setAttribute('data-iui-done','1')" onerror="window.__iuiCdnNext&&__iuiCdnNext(this)" href=${href}/>`)
}

// C7: CDN candidates carry SRI (the fallback swapper re-applies it per URL).
function vendorScriptTag(id: VendorId, base?: string): string {
  const [first, ...rest] = vendorJsUrls(id, base)
  return `<script src="${first}" data-iui-fallback="${rest.join(' ')}"${vendorSriAttrs(first!)}><\/script>`
}
function vendorCssTags(id: VendorId, base?: string): string {
  return vendorCssUrls(id, base).map(([first, ...rest]) => `<link rel="stylesheet" href="${first}" data-iui-fallback="${rest.join(' ')}"${vendorSriAttrs(first!)}/>`).join('')
}

/**
 * C5: fallback loader + C6 vendor map for the runtime. Emitted before CDN tags;
 * `__iuiCdnNext(el)` swaps a failed/slow <script>/<link> to its next candidate.
 */
function buildVendorBootScript(base?: string, libs: readonly VendorId[] = []): string {
  const map: Record<string, string> = {
    leafletJs: vendorJsUrls('leaflet', base)[0]!,
    leafletCss: vendorCssUrls('leaflet', base)[0]![0]!,
    chartJs: vendorJsUrls('chart', base)[0]!,
    agGridJs: vendorJsUrls('agGrid', base)[0]!,
    agGridCss: vendorCssUrls('agGrid', base)[0]![0]!,
    agGridTheme: vendorCssUrls('agGrid', base)[1]![0]!,
    mermaidJs: vendorJsUrls('mermaid', base)[0]!,
  }
  // F19: full candidate lists so the runtime loader can fall back too, plus
  // the active preset for the "switch source and retry" strip.
  const lists: Record<string, string[]> = {
    leafletJsList: vendorJsUrls('leaflet', base),
    chartJsList: vendorJsUrls('chart', base),
    agGridJsList: vendorJsUrls('agGrid', base),
    mermaidJsList: vendorJsUrls('mermaid', base),
  }
  return `<script>
window.__iuiVendor = ${JSON.stringify({ ...map, ...lists, preset: getVendorSource().preset, ...(libs.length ? { libs } : {}) })};
${buildSriLookupSource()}
window.__iuiCdnNext = function (el) {
  if (!el || el.getAttribute('data-iui-done') === '1') return;
  var rest = String(el.getAttribute('data-iui-fallback') || '').split(' ').filter(Boolean);
  if (!rest.length) { el.setAttribute('data-iui-done', '0'); return; }
  el.setAttribute('data-iui-done', 'replaced');
  var isLink = el.tagName === 'LINK';
  var n = document.createElement(isLink ? 'link' : 'script');
  n.setAttribute('data-iui-fallback', rest.slice(1).join(' '));
  n.setAttribute('data-iui-t0', String(Date.now()));
  var sri = window.__iuiSriFor ? window.__iuiSriFor(rest[0]) : '';
  if (sri) { n.integrity = sri; n.crossOrigin = 'anonymous'; }
  if (isLink) {
    n.rel = 'stylesheet';
    n.onload = function () { n.setAttribute('data-iui-done', '1'); };
    n.onerror = function () { window.__iuiCdnNext(n); };
    n.href = rest[0];
  } else {
    n.async = true;
    n.setAttribute('data-iui-cdn', '');
    n.onload = function () { n.setAttribute('data-iui-done', '1'); };
    n.onerror = function () { window.__iuiCdnNext(n); };
    n.src = rest[0];
  }
  (el.parentNode || document.head).insertBefore(n, el.nextSibling);
};
<\/script>`
}

/** C8: rewrite model-authored CDN <script src>/<link href> for registry libs. */
export function rewriteAuthorCdnTags(html: string, base?: string): string {
  return html.replace(/<(script|link)\b[^>]*>/gi, (tag) => {
    let changed: string | null = null
    let out = tag.replace(/\b(src|href)=(["'])(https:\/\/[^"']+)\2/i, (m, attr: string, q: string, url: string) => {
      const next = rewriteKnownCdnUrl(url, base)
      if (next === url) return m
      changed = next
      return `${attr}=${q}${next}${q}`
    })
    // C7: the author's integrity hash belonged to the old URL / version —
    // drop it (and its crossorigin) and attach the registry's own for CDN copies.
    if (changed !== null) {
      out = out.replace(/\s+(?:integrity|crossorigin)(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
      out = out.replace(/\s*(\/?)>$/, (_m, slash: string) => `${vendorSriAttrs(changed!)}${slash ? '/' : ''}>`)
    }
    return out
  })
}

/**
 * C9: which registry libraries a page needs. Declared `libs` always win;
 * otherwise only real API usage counts (`L.map(`, `new Chart(`,
 * `echarts.init(`, `agGrid.createGrid(`, `mermaid.run(`, host components) —
 * no more `id="map"` / "Chart + the word line" guesses that pulled 200 KB
 * of Chart.js into a canvas game. `markupHints` (streaming shell: the JS has
 * not arrived yet) still preloads for `<div id="map">` / `<canvas id="…Chart">`.
 */
export function detectSandboxLibs(html: string, js: string, libs: readonly VendorId[] = [], opts: { markupHints?: boolean } = {}): Set<VendorId> {
  const all = html + '\n' + js
  const out = new Set<VendorId>(libs)
  if (opts.markupHints) {
    if (/\bid\s*=\s*["']map["']/i.test(html)) out.add('leaflet')
    if (/<canvas\b[^>]*(?:id|class)\s*=\s*["'][^"']*[Cc]hart/i.test(html)) out.add('chart')
  }
  if (
    /\bnew\s+Chart\s*\(/.test(all) ||
    /\bChart\s*\.\s*(?:register|defaults|getChart)\b/.test(all) ||
    /import\s*\(\s*['"]chart\.js/.test(all) ||
    /iui-weather-chart|wxChart|__iuiChartMod|iuiCreateChart/.test(all)
  ) out.add('chart')
  if (/\becharts\s*\.\s*init\s*\(/.test(all)) out.add('echarts')
  if (
    /\bL\s*\.\s*(?:map|tileLayer|marker|polyline|polygon|divIcon|circleMarker|circle|geoJSON|latLngBounds|latLng)\s*\(/.test(all) ||
    /iui-map-wrap|createTripAnimator|openstreetmap\.org\/\{z\}/i.test(all) ||
    /\bimport\s*(?:\*|\{?\s*L\s*\}?)\s*from\s*['"]leaflet['"]/.test(all)
  ) out.add('leaflet')
  if (/\bd3\s*\.\s*(?:select|selectAll|scale\w*|line|arc|pie|geo\w*|forceSimulation)\s*\(/.test(all)) out.add('d3')
  if (
    /\bagGrid\s*\.\s*(?:createGrid|Grid)\s*\(/.test(all) ||
    /ag-theme-(?:quartz|alpine|balham|iui)/.test(all)
  ) out.add('agGrid')
  if (
    /\bmermaid\s*\.\s*(?:run|initialize|render)\s*\(/.test(all) ||
    /class\s*=\s*["'][^"']*\bmermaid\b/.test(all) ||
    /iui-mindmap/.test(all)
  ) out.add('mermaid')
  return out
}

function autoCdnTags(html: string, js: string, base?: string, libs: readonly VendorId[] = [], markupHints = false): string {
  const want = detectSandboxLibs(html, js, libs, { markupHints })
  const tags: string[] = []
  const firstUrls: string[] = []
  const inject = (id: VendorId): void => {
    for (const css of vendorCssUrls(id, base)) if (css[0]) firstUrls.push(css[0])
    const first = vendorJsUrls(id, base)[0]
    if (first) firstUrls.push(first)
  }
  const scriptOf = (re: RegExp): boolean => new RegExp(`<script[^>]+src=["'][^"']*${re.source}`, 'i').test(html)
  // Prefer UMD Chart.js (global Chart) — esm.sh importmap is flaky in null-origin srcdoc (blank weather canvases).
  const hasChartUmdScript = scriptOf(/chart(?:\.umd|\.min)?\.js/)
  const wantsChart = want.has('chart')
  // Guard first: it traps the window.Chart assignment so theming + wrapping never race author JS.
  if (wantsChart || hasChartUmdScript) {
    tags.push(buildChartGuardScript())
  }
  if (wantsChart && !hasChartUmdScript) {
    tags.push(vendorScriptTag('chart', base)); inject('chart')
  }
  if (want.has('echarts') && !scriptOf(/echarts/)) { tags.push(vendorScriptTag('echarts', base)); inject('echarts') }
  if (want.has('echarts')) tags.unshift(buildEchartsGuardScript())
  // Prefer UMD Leaflet (global L) over ESM importmap — srcdoc + import("leaflet") often yields empty maps.
  const hasLeafletUmdScript = scriptOf(/leaflet(?:\.js|\.min\.js)/)
  const wantsLeaflet = want.has('leaflet')
  if (wantsLeaflet || hasLeafletUmdScript) {
    tags.push(buildLeafletTileGuardScript())
  }
  if (wantsLeaflet && !hasLeafletUmdScript) {
    tags.push(vendorCssTags('leaflet', base) + vendorScriptTag('leaflet', base)); inject('leaflet')
  }
  if (want.has('d3') || scriptOf(/d3(?:@|\.min|\.v)/)) tags.push(buildD3DefaultsScript())
  if (want.has('d3') && !scriptOf(/d3(?:@|\.min|\.v)/)) { tags.push(vendorScriptTag('d3', base)); inject('d3') }
  const hasAgGridScript = scriptOf(/ag-grid/)
  const wantsAgGrid = want.has('agGrid')
  if (wantsAgGrid && !hasAgGridScript) {
    tags.push(vendorCssTags('agGrid', base))
    tags.push(vendorScriptTag('agGrid', base)); inject('agGrid')
  }
  if (wantsAgGrid || hasAgGridScript) tags.push(buildAgGridGuardScript())
  const hasMermaidScript = scriptOf(/mermaid/)
  const wantsMermaid = want.has('mermaid')
  if (wantsMermaid && !hasMermaidScript) {
    tags.push(vendorScriptTag('mermaid', base)); inject('mermaid')
  }
  if (wantsMermaid || hasMermaidScript) tags.push(buildMermaidGuardScript())
  if (/\bgsap\b/.test(html) || /\bgsap\b/.test(js)) tags.push(buildGsapDefaultsScript())
  return buildCdnPreconnect(firstUrls, base) + buildVendorBootScript(base, [...want]) + tags.join('')
}

/**
 * C11: warm the TLS connection to the CDN the first injected library comes
 * from (skipped when it is the plugin's own asset route). `crossorigin` so
 * the SRI (CORS) fetch reuses the socket.
 */
function buildCdnPreconnect(urls: readonly string[], base?: string): string {
  const local = vendorBaseOrigin(base)
  const seen = new Set<string>()
  let out = ''
  for (const u of urls) {
    let origin: string
    try { origin = new URL(u).origin } catch { continue }
    if (origin === local || seen.has(origin) || seen.size >= 2) continue
    seen.add(origin)
    out += `<link rel="preconnect" href="${origin}"${vendorSriAttrs(u) ? ' crossorigin' : ''}/>`
  }
  return out
}

/** Build iframe srcdoc (sandbox: allow-scripts; no allow-same-origin). */
export function buildHtmlSandboxSrcdoc(
  spec: HtmlSandboxSpec,
  options: HtmlSandboxBuildOptions = {},
): string {
  return withNetContext(options.net, () => withVendorSource(options.cdnSource, () => buildHtmlSandboxSrcdocInner(spec, options)))
}

function buildHtmlSandboxSrcdocInner(
  spec: HtmlSandboxSpec,
  options: HtmlSandboxBuildOptions,
): string {
  const title = spec.title ? escapeHtml(spec.title) : 'IUI sandbox'
  const truncatedParts: Array<'css' | 'js' | 'html'> = []
  const rawHtml = typeof options.liveHtml === 'string' && options.liveHtml.trim()
    ? options.liveHtml
    : spec.html
  const htmlSan = sanitizeSandboxMarkup(
    typeof options.liveHtml === 'string' && options.liveHtml.trim()
      ? rawHtml
      : enrichPlaceMediaHtml(rawHtml),
  )
  const html = rewriteAuthorCdnTags(truncateAuthor(htmlSan, 'html'), options.assetBase)
  if (htmlSan.length > HTML_SANDBOX_MAX_HTML_BYTES) truncatedParts.push('html')
  const cssSan = sanitizeSandboxCss(
    typeof options.liveCss === 'string' && options.liveCss.trim() ? options.liveCss : spec.css,
  )
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
    ${options.liveState ? `setTimeout(function () { try { if (window.iuiSandbox && window.iuiSandbox.restoreLocalState) window.iuiSandbox.restoreLocalState(${JSON.stringify(options.liveState)}); } catch (eR) {} }, 80);` : ''}
  }
  // window.load waits for head CDN <script src>; pipeline still re-checks globals.
  // C1: CDN libs are async now; don't wait for window.load (a hung CDN would
  // hold it for 10s+). The pipeline waits for data-iui-cdn scripts with a timeout.
  if (document.readyState !== 'loading') go(); else document.addEventListener('DOMContentLoaded', go);
})();
<\/script>`
  const cdnTags = makeCdnTagsNonBlocking(autoCdnTags(html, authorJs + fnSrc, options.assetBase, spec.libs, deferJs))
  const bridge = buildSandboxBridgeScript(frameId) + buildMotionRuntimeScript({ streaming: deferJs }) +
    // G4: Lucide icons — streaming shells always carry them (markup still arriving); complete pages only when used.
    (pageWantsIcons(html + authorJs + fnSrc, deferJs) ? buildIconRuntimeScript() : '') +
    // R5-3: host 3D stage — same rule as icons.
    (pageWants3d(html + authorJs + fnSrc, deferJs) ? buildStage3dRuntimeScript({ assetBase: options.assetBase }) : '')
  const hostKitCss = buildHostKitCss()
  // visual(③): Tailwind utilities for the classes this page mentions (the live frame tops up via the host).
  const twCss = buildTailwindCss(`${html}\n${authorCss}\n${authorJs}\n${fnSrc}`).replace(/<\/style/gi, '<\\/style')
  const importMapTag = buildVendorImportmapScriptTag(options.assetBase)
  const tripScript = buildTripAnimatorScriptTag()

  // P1-PREVIEW-PHOTO: always inject runtime fill (well-known map). Volume trade for
  // stability — itinerary markers may arrive only in late html chunks / author JS.
  const photoFill = buildTripPhotoFillScript(getNetContext())
  // CDN UMD tags go in <head> so Leaflet/Chart start fetching before the bridge posts
  // `ready` (host may immediately runAuthorJs on the preview-shell path).
  const langAttr = typeof options.uiLang === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u.test(options.uiLang) ? ` lang="${options.uiLang}"` : ''
  const schemeAttr = options.appearanceScheme === 'light' || options.appearanceScheme === 'dark' ? ` data-iui-scheme="${options.appearanceScheme}"` : ''
  const theme = normalizeIuiTheme(options.theme)
  const themeAttr = theme === DEFAULT_IUI_THEME ? '' : ` data-theme="${theme}"`
  const appearanceCss = typeof options.appearanceCss === 'string' ? options.appearanceCss.replace(/<\/style/gi, '<\\/style').slice(0, 20_000) : ''
  let doc = `<!DOCTYPE html><html${langAttr}${schemeAttr}${themeAttr}><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${mapImgOrigins(options.strictImages === true)}${vendorBaseOrigin(options.assetBase) ? ' ' + vendorBaseOrigin(options.assetBase) : ''}; style-src 'unsafe-inline' ${cdnCspOrigins(options.assetBase)}; script-src 'unsafe-inline' 'unsafe-eval' ${cdnCspOrigins(options.assetBase)}; font-src ${options.strictImages === true ? cdnCspOrigins(options.assetBase) : 'https:'} data:${vendorBaseOrigin(options.assetBase) ? ' ' + vendorBaseOrigin(options.assetBase) : ''}; connect-src ${cdnCspOrigins(options.assetBase)} ${mapConnectOrigins()} ${MODEL_CONNECT_ORIGINS.join(' ')} blob: data:; worker-src blob:; base-uri 'none'; form-action 'none';"/><title>${title}</title>${importMapTag}${tripScript}${cdnTags}<style>
${buildIuiDaisyCss(options.assetBase)}
${tokenCss}${baseCss}
${hostKitCss}
${pageAccentCss(spec.accent)}
html,body{min-height:0!important;height:auto!important;background:transparent!important;margin:0!important;max-width:100%!important;overflow-x:clip}
#iui-preview-root{min-width:0;max-width:100%;overflow-x:clip}
.leaflet-container{min-height:280px;border-radius:var(--border-radius-lg,12px)}
body{padding:4px!important}
</style>${twCss ? `<style id="iui-tw-static">${twCss}</style>` : ''}<style id="iui-author-css">${authorCss}</style>${appearanceCss || schemeAttr ? `<style id="iui-appearance">${appearanceCss}</style>` : ''}</head><body>${bridge}${truncationBanner(truncatedParts)}<div id="iui-preview-root">${html}</div>${jsBlock}${photoFill}</body></html>`
  if (doc.length > HTML_SANDBOX_MAX_SRCDOC_BYTES) {
    doc = doc.slice(0, HTML_SANDBOX_MAX_SRCDOC_BYTES) + '\n<!-- srcdoc truncated -->'
  }
  // F10: seed after the size cap so a large store never truncates the page.
  if (options.storageSeed !== undefined && Object.keys(options.storageSeed).length > 0) {
    const seedTag = buildStorageSeedScript(options.storageSeed)
    doc = doc.replace('<body>', () => `<body>${seedTag}`)
  }
  return doc
}

/** F10: inline `window.__iuiStorageSeed` (script-safe JSON). */
export function buildStorageSeedScript(items: Readonly<Record<string, string>>): string {
  const json = JSON.stringify(items).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `<script>window.__iuiStorageSeed=${json};<\/script>`
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
  // Reuse srcdoc builder. liveHtml/liveCss bake the running iframe (filled photos, current filter).
  // Downloaded files must not point at the local plugin route (C6) — CDN chain only.
  const { assetBase: _localOnly, ...portable } = options
  const doc = buildHtmlSandboxSrcdoc(spec, { ...portable, frameId: options.frameId ?? 'download' })
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
      height: 360,
      css: '.f{display:flex;flex-direction:column;gap:12px}.hero{padding:14px 16px;border-radius:var(--border-radius-lg);background:var(--color-background-info);color:var(--color-text-info)}.hero b{display:block;font-size:var(--fs-2xl);line-height:1.1;font-variant-numeric:tabular-nums}label{display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px}',
      html: '<div class="iui-sandbox-card f"><h3>周六读书会报名</h3><div class="hero"><b id="left">12</b>个名额剩余 · 周六 14:00 · 示例数据</div><div><label for="name">昵称</label><input id="name" placeholder="请输入"/></div><div><label for="note">备注</label><textarea id="note" rows="3" placeholder="可选"></textarea></div><div class="iui-actions"><button type="button" class="primary" id="go">提交报名</button></div><p class="iui-sandbox-muted" id="msg" aria-live="polite"></p></div>',
      js: 'var left=12;document.getElementById("go").onclick=function(){var name=(document.getElementById("name").value||"").trim();var note=document.getElementById("note").value||"";var msg=document.getElementById("msg");if(!name){msg.textContent="请填写昵称";return;}if(left>0)left--;document.getElementById("left").textContent=String(left);msg.textContent="已提交";window.iuiSandbox.action("submit_form",{name:name,note:note});};',
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
      height: 360,
      css: '.todo{display:flex;flex-direction:column;gap:10px}.hero{padding:14px 16px;border-radius:var(--border-radius-lg);background:var(--color-background-success);color:var(--color-text-success)}.hero b{font-size:var(--fs-2xl);line-height:1.1;font-variant-numeric:tabular-nums;margin-right:6px}.bar{height:6px;border-radius:3px;background:var(--color-background-primary);margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;background:currentColor}.add{display:flex;gap:8px}.add input{flex:1;min-width:0}.item{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--color-border-tertiary);border-radius:10px}.item.done span{color:var(--color-text-secondary);text-decoration:line-through}',
      html: '<div class="iui-sandbox-card todo"><h3>今日待办</h3><div class="hero"><b id="done">1/3</b>已完成<div class="bar"><i id="bar" style="width:33%"></i></div></div><form class="add" id="f"><input id="t" placeholder="添加一条待办" aria-label="新待办"/><button type="submit" class="primary">添加</button></form><div id="list"></div><p class="iui-sandbox-muted">勾选会回传 sandbox_todo</p></div>',
      js: 'var items=[{id:1,t:"写周报",d:true},{id:2,t:"代码评审",d:false},{id:3,t:"整理需求",d:false}];function paint(){var el=document.getElementById("list");el.innerHTML="";var n=0;items.forEach(function(it){if(it.d)n++;var row=document.createElement("label");row.className="item"+(it.d?" done":"");row.innerHTML="<input type=checkbox "+(it.d?"checked":"")+"> <span></span>";row.querySelector("span").textContent=it.t;row.querySelector("input").onchange=function(){it.d=!!this.checked;paint();window.iuiSandbox.action("sandbox_todo",{items:items})};el.appendChild(row)});document.getElementById("done").textContent=n+"/"+items.length;document.getElementById("bar").style.width=(items.length?Math.round(n*100/items.length):0)+"%"}document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();var inp=document.getElementById("t");var t=(inp.value||"").trim();if(!t)return;items.push({id:Date.now(),t:t,d:false});inp.value="";paint();window.iuiSandbox.action("sandbox_todo",{items:items})});paint();',
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
      html: `<link rel="stylesheet" href="${vendorCdnUrl('leaflet', 'dist/leaflet.css')}"/><script src="${vendorCdnUrl('leaflet', 'dist/leaflet.js')}"><\/script>` + '<div id="map"></div><p id="hint" class="iui-sandbox-muted">Leaflet · OpenStreetMap</p>',
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
      css: '.opt h3{margin:0 0 6px;font-size:14px}.metric{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f4f4f5}.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:#f4f4f5;margin-left:6px}',
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
      html: '<div class="iui-sandbox-card iui-sandbox-tabs"><div class="iui-sandbox-tabbar" role="tablist"><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="true" data-tab="概览">概览</button><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="false" data-tab="明细">明细</button><button type="button" class="iui-sandbox-tab" role="tab" aria-selected="false" data-tab="备注">备注</button></div><div class="iui-sandbox-stage" data-stage="概览" data-active="1"><div class="iui-stats"><div class="iui-stat lg"><span class="iui-stat-value" data-iui-bind="cpu">34%</span><span class="iui-stat-label">CPU</span></div><div class="iui-stat lg"><span class="iui-stat-value" data-iui-bind="mem">62%</span><span class="iui-stat-label">内存</span></div><div class="iui-stat lg"><span class="iui-stat-value">1.2<span class="unit">GB/s</span></span><span class="iui-stat-label">磁盘</span></div></div><p class="iui-sandbox-muted">本机状态正常 · 示例数据</p></div><div class="iui-sandbox-stage" data-stage="明细" data-active="0"><p class="iui-sandbox-muted">进程明细（示例数据）</p><ul><li>node · 12%</li><li>chrome · 18%</li></ul></div><div class="iui-sandbox-stage" data-stage="备注" data-active="0"><p class="iui-sandbox-muted">本地切换，不调模型。</p></div></div>',
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
      html: '<div class="iui-sandbox-card"><div class="iui-sandbox-toolbar"><strong>趋势</strong><span class="iui-sandbox-muted" data-iui-bind="label">示例</span></div><div id="chart"></div></div>' + `<script src="${vendorCdnUrl('echarts', 'dist/echarts.min.js')}"><\/script>`,
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
      css: '.wrap{display:flex;flex-direction:column;gap:12px}.bars{display:flex;align-items:flex-end;gap:6px;height:200px;padding:12px 12px 0;border-radius:var(--border-radius-lg);background:var(--color-background-secondary)}.bar{flex:1;display:flex;justify-content:center;align-items:flex-start;padding-top:6px;color:var(--on-accent,#fff);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;background:var(--accent-fill,var(--iui-pack-accent));border-radius:6px 6px 0 0;transition:height .2s ease,background .2s ease}.bar.active{background:var(--iui-pack-warn,#d97706)}.bar.done{background:var(--iui-pack-ok,#16a34a)}.stats{display:flex;gap:16px;flex-wrap:wrap;align-items:baseline}.stats b{font-size:20px;font-variant-numeric:tabular-nums;margin-right:4px}',
      html: '<div class="iui-sandbox-card wrap"><div class="iui-sandbox-toolbar"><strong>冒泡排序</strong><button type="button" class="primary" id="run">开始</button><button type="button" class="secondary" id="shuffle">打乱</button><button type="button" data-iui-send-prompt="再做一个选择排序可视化">继续问</button></div><div class="bars" id="bars" aria-label="待排序的柱子"></div><div class="stats"><span><b id="cmp">0</b>次比较</span><span><b id="swp">0</b>次交换</span><span class="iui-sandbox-muted" id="hint">本地动画，不调模型</span></div></div>',
      js: 'var arr=[4,7,2,9,1,5,8,3],busy=false,cmp=0,swp=0;function stat(){document.getElementById("cmp").textContent=cmp;document.getElementById("swp").textContent=swp}function paint(active){var el=document.getElementById("bars");el.innerHTML="";var max=Math.max.apply(null,arr);arr.forEach(function(v,i){var d=document.createElement("div");d.className="bar"+(active===i||active===i-1?" active":"");d.style.height=Math.max(24,(v/max)*180)+"px";d.textContent=v;el.appendChild(d)});stat()}function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}async function bubble(){if(busy)return;busy=true;cmp=0;swp=0;var a=arr.slice();var fast=window.iuiSandbox&&window.iuiSandbox.reducedMotion;for(var i=0;i<a.length;i++){for(var j=0;j<a.length-i-1;j++){arr=a;cmp++;paint(j+1);if(!fast)await sleep(120);if(a[j]>a[j+1]){var t=a[j];a[j]=a[j+1];a[j+1]=t;swp++}}}arr=a;paint(-9);document.querySelectorAll(".bar").forEach(function(b){b.classList.add("done")});busy=false;window.iuiSandbox.action("sort_done",{arr:arr})}document.getElementById("run").onclick=bubble;document.getElementById("shuffle").onclick=function(){if(busy)return;cmp=0;swp=0;arr=arr.map(function(){return 1+Math.floor(Math.random()*9)});paint(-9)};paint(-9);',
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
  ...PATTERN_STARTERS,
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
