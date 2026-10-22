/**
 * ```iui-html fence renderer — open sandbox iframe (css → html → js).
 * Productized chrome: streaming stages, reload, download, dismissible errors,
 * empty/partial placeholders, auto-height + action loop.
 */
import { createDownloadLimiter, hostCopy, hostDownload, type DelegateVerdict } from './sandbox-delegate.ts'
import { buildOfflineExport, OFFLINE_EXPORT_MAX_BYTES, type SandboxResource } from './offline-export.ts'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Key,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  buildHtmlSandboxSrcdoc,
  buildSandboxDownloadHtml,
  HTML_SANDBOX_MAX_HTML_BYTES,
  isAllowedSandboxOpenUrl,
  sandboxOpenLinkUrl,
  isIuiSandboxHostMessage,
  isSandboxSpecEmpty,
  listHtmlSandboxStarters,
  mergeSandboxDesignTokens,
  parseHtmlSandboxFence,
  htmlSandboxSrcdocRebuildKey,
  sandboxStageLabels,
  type SandboxSelfCheckIssue,
  sanitizeSandboxCss,
  sanitizeSandboxMarkup,
  starterToFenceBody,
  prepareAuthorJs,
  splitAuthorJsChunks,
  type HtmlSandboxSpec,
} from '../shared/html-sandbox.ts'
import { enrichPlaceMediaHtml } from '../shared/trip-images.ts'
import { useGenuiAction } from './action-context.ts'
import type { GenuiFenceContext } from './fence-render.tsx'
import { sandboxAssetBase } from './asset-loader.ts'
import { currentLocale, useT } from './i18n/index.ts'
import {
  getActiveTheme,
  getCustomTokens,
  hostColorScheme,
  isHostDarkTheme,
  subscribeActiveTheme,
  subscribeHostScheme,
  themeToStyle,
} from './theme/apply-theme.ts'
import { getActivePackId } from './theme/apply-pack.ts'
import { EmptyState, ErrorState } from './ui/StatusBlock.tsx'
import { SandboxSkeleton, SandboxStreamingPill, sandboxStreamProgress, streamedLineCount } from './sandbox-skeleton.tsx'
import { acquireBindingWatch, getAppDataSnapshot, subscribeBindings } from './binding-store.ts'
import { getCdnSource, getNetContextForBuild, getRuntimeConfigSnapshot, setCdnPresetOverride, subscribeRuntimeConfig } from './runtime-config.ts'
import { normalizeCdnOrder, normalizeCdnPreset, type VendorSource } from '../shared/vendor-registry.ts'
import type { NetContext } from '../shared/net-context.ts'
import { insertIntoComposer } from './composer-bridge.ts'
import { loadPageState, pageStateKey, PAGE_STATE_QUOTA_BYTES, peekPageState, sanitizeStorageItems, updatePageState, type PageStateRecord } from './page-storage.ts'
import { capActionPayload, createFrameActionGate, type ActionVerdict, type FrameActionGate } from './action-gate.ts'
import { AppearancePanel } from './appearance-panel.tsx'
import { getDefaultPageAppearance, saveDefaultPageAppearance, subscribeDefaultPageAppearance } from './page-appearance-store.ts'
import { writeIuiConfigField } from './settings/index.ts'
import { saveUserTemplateFromPage } from './user-template-store.ts'
import { pushTipToast } from './tip-toast.tsx'
import { NextStepChips, pageIntentOf } from './next-steps-ui.tsx'
import { FEEDBACK_REASONS, getPageFeedback, pageFeedbackKey, recordSelfCheck, recordVote, type FeedbackReason, type FeedbackVote } from './feedback-store.ts'
import {
  chargeCaptureBytes,
  downloadDataUrl,
  effectiveBackground,
  fetchCaptureResource,
  imageFileName,
  openCaptureBudget,
  takeCaptureFetch,
  type CaptureBudget,
} from './image-export.ts'
import { isDefaultPageAppearance, normalizePageAppearance, pageAppearanceCss, serializePageAppearance, type PageAppearance } from '../shared/page-appearance.ts'
import { registerFrameActivity, scheduleFrameActivityCheck, type FrameActivityHandle } from './frame-activity.ts'
import { applySandboxPatch, pageFromSpec, parseSandboxPatch, sandboxPageId, serializeSandboxPage } from '../shared/sandbox-patch.ts'
import { listPageVersions, pageVersionsRevision, registerPageVersion, resolvePatchBase, subscribePageVersions, type PageVersion } from './page-versions.ts'

/** Memory-only state key when the page has no stable session identity. */
function fenceStateKey(raw: string): string {
  const body = raw.trim()
  if (body.length <= 160) return body
  return `${body.slice(0, 80)}|${body.length}|${body.slice(-80)}`
}

/** F4: does this page read host bindings / appData at all? */
export function usesHostData(raw: string): boolean {
  return /\$bind|\$appData|data-iui-bind|__iuiBindings|__iuiAppData|iui-bindings|iui-appdata|\bappData\b|\bbindings\b/.test(raw)
}

const readStrictImages = (): boolean => getRuntimeConfigSnapshot().strictImagePolicy === true
/** F19: `preset|template` (stable string for useSyncExternalStore). */
// Batch F: preset | template | probe-ranked mirrors | basemap | wiki photos — one string so
// useSyncExternalStore only rebuilds frames when an effective choice changes.
const readCdnKey = (): string => {
  const s = getCdnSource()
  const net = getNetContextForBuild()
  return `${s.preset}|${s.template ?? ''}|${(s.order ?? []).join(',')}|${net.tiles}|${net.wiki ? 1 : 0}`
}
function parseCdnKey(key: string): { cdnSource: VendorSource; net: NetContext } {
  const [preset, template, order, tiles, wiki] = key.split('|')
  return {
    cdnSource: { preset: normalizeCdnPreset(preset), ...(template ? { template } : {}), ...(order ? { order: normalizeCdnOrder(order) } : {}) },
    net: { tiles: tiles === 'amap' ? 'amap' : 'default', wiki: wiki !== '0' },
  }
}

/** F6: silence longer than this marks the frame「无响应」. */
const SANDBOX_HUNG_MS = 5000
/** G9: pause a settled page this long after it leaves the viewport. */
const OFFSCREEN_PAUSE_DELAY_MS = 1500
/** G9: "visible" includes a margin so pages resume just before they scroll in. */
const OFFSCREEN_ROOT_MARGIN = '200px 0px'
/** G9: only freeze pages that have been settled and ready this long. */
const FREEZE_MIN_SETTLED_MS = 3000

/** F6:「停止」swaps in an inert document, which tears down the old one's scripts. */
function stoppedSrcdoc(message: string): string {
  const text = message.replace(/[&<>]/g, ch => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'))
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font:13px system-ui,sans-serif;color:#77756f">${text}</body>`
}

const FRAME_STYLE: CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  display: 'block',
  colorScheme: 'normal',
}

const SHELL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: '100%',
  boxSizing: 'border-box',
}

const STAGE_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  fontSize: 11,
  color: 'var(--dsw-alias-label-tertiary, #6b7280)',
}

const CHIP: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '0.5px solid var(--dsl-g-border-surface, #e5e7eb)',
  background: 'color-mix(in srgb, var(--dsl-g-accent, #6366f1) 10%, transparent)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

type FullscreenMode = 'off' | 'native' | 'overlay' | 'portal'

/**
 * F11: `position: fixed` is trapped by an ancestor that forms a containing
 * block (transform / filter / perspective / contain / container-type …).
 */
export function needsBodyPortal(el: Element): boolean {
  const view = el.ownerDocument.defaultView
  if (!view) return false
  for (let node = el.parentElement; node !== null && node !== el.ownerDocument.body; node = node.parentElement) {
    const cs = view.getComputedStyle(node)
    if ((cs.transform && cs.transform !== 'none')
      || (cs.filter && cs.filter !== 'none')
      || (cs.perspective && cs.perspective !== 'none')
      || (cs.backdropFilter && cs.backdropFilter !== 'none')
      || /paint|layout|strict|content/.test(cs.contain || '')
      || /transform|filter|perspective/.test(cs.willChange || '')
      || (cs.containerType && cs.containerType !== 'normal')) return true
  }
  return false
}

/** G10: srcdoc options for an appearance (nothing for the defaults). */
function appearanceBuildOptions(a: PageAppearance): { appearanceCss?: string; appearanceScheme?: PageAppearance['scheme'] } {
  if (isDefaultPageAppearance(a)) return {}
  return { appearanceCss: pageAppearanceCss(a), appearanceScheme: a.scheme }
}

const MENU_STYLE: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 4px)',
  zIndex: 10,
  minWidth: 132,
  display: 'flex',
  flexDirection: 'column',
  padding: 4,
  borderRadius: 10,
  border: '1px solid var(--dsl-g-border-surface, hsl(240 6% 90%))',
  background: 'var(--dsw-alias-bg-base, #fff)',
  boxShadow: '0 8px 24px rgba(15,23,42,.12)',
}

const SELF_CHECK_PILL_STYLE: CSSProperties = {
  position: 'absolute', right: 10, bottom: 10, zIndex: 3, display: 'flex', alignItems: 'stretch',
  borderRadius: 999, overflow: 'hidden', background: 'rgba(32,31,28,.86)', color: '#fff',
  boxShadow: '0 2px 10px rgba(0,0,0,.18)', fontSize: 12, backdropFilter: 'blur(4px)',
}
const SELF_CHECK_PILL_BTN: CSSProperties = {
  border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 12,
  minHeight: 32, padding: '0 12px', cursor: 'pointer',
}

const MENU_ITEM: CSSProperties = {
  textAlign: 'left',
  fontSize: 13,
  padding: '7px 10px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, #1f2937)',
  cursor: 'pointer',
}

/** G9: the frozen card is one big resume button over the static copy. */
const FROZEN_OVERLAY_STYLE: CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '10px 0 0', margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit',
}
const FROZEN_PILL_STYLE: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
  background: 'rgba(24,24,27,.72)', color: '#fff', backdropFilter: 'blur(6px)', boxShadow: '0 2px 10px rgba(0,0,0,.18)',
}
/** G14: below this card width the toolbar collapses to ⋯. */
const SANDBOX_NARROW_PX = 480

const TOOLBAR_BTN: CSSProperties = {
  fontSize: 12,
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid var(--dsl-g-border-surface, hsl(240 6% 90%))',
  background: 'var(--dsw-alias-bg-layer-1, #f9fafb)',
  color: 'var(--dsw-alias-label-secondary, #374151)',
  cursor: 'pointer',
  fontWeight: 500,
}

let cachedTokenKey = ''
let cachedTokens: Record<string, string> = {}

function readDesignTokens(): Record<string, string> {
  const theme = getActiveTheme()
  const style = themeToStyle(theme, isHostDarkTheme())
  void getCustomTokens()
  const key = JSON.stringify(style)
  if (key === cachedTokenKey) return cachedTokens
  cachedTokenKey = key
  cachedTokens = style
  return cachedTokens
}

function useDesignTokens(): Record<string, string> {
  return useSyncExternalStore(subscribeActiveTheme, readDesignTokens, readDesignTokens)
}

/** F22: auto height up to this; taller pages scroll inside the frame until 展开全部. */
export const SANDBOX_AUTO_HEIGHT_MAX = 2400
/** F22: hard cap when expanded (bridge reports at most this). */
export const SANDBOX_EXPANDED_HEIGHT_MAX = 20000

function clampHeight(height: number, fallback: number, max: number = SANDBOX_AUTO_HEIGHT_MAX): number {
  if (!Number.isFinite(height)) return fallback
  return Math.min(max, Math.max(120, Math.round(height)))
}

/** F22: frame height for a reported content height; `expanded` lifts the 2400 cap. */
export function sandboxFrameHeight(contentHeight: number, expanded: boolean): number {
  return clampHeight(contentHeight, 360, expanded ? SANDBOX_EXPANDED_HEIGHT_MAX : SANDBOX_AUTO_HEIGHT_MAX)
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  return false
}

/** F17: random frame id; `crypto.randomUUID` with a getRandomValues fallback. */
export function newSandboxFrameId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  try {
    if (c && typeof c.randomUUID === 'function') return `iui-html-${c.randomUUID()}`
  } catch { /* insecure context */ }
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return `iui-html-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function shareFileName(title: string | undefined, suffix?: string): string {
  const stem = (title ?? 'iui-sandbox').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 48) || 'iui-sandbox'
  return `${stem}${suffix ? '-' + suffix : ''}.html`
}

function downloadText(filename: string, content: string): void {
  try {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // F17: revoke later — an immediate revoke can cancel the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { /* ignore */ }
}

type ShareSnapshot = { html: string; css: string; state: Record<string, unknown>; resources: SandboxResource[] }

/** G9: static copy of the page (`html` empty when the frame refuses or does not answer). */
function requestSandboxFreeze(iframe: HTMLIFrameElement | null, frameId: string, timeoutMs = 3000): Promise<{ html: string; reason: string }> {
  const win = iframe?.contentWindow
  if (!win) return Promise.resolve({ html: '', reason: 'noFrame' })
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: { html: string; reason: string }): void => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      resolve(value)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== win) return
      const data = event.data as unknown
      if (!isIuiSandboxHostMessage(data) || data.type !== 'frozen' || data.frameId !== frameId) return
      finish({ html: data.html, reason: data.reason ?? '' })
    }
    const timer = window.setTimeout(() => finish({ html: '', reason: 'timeout' }), timeoutMs)
    window.addEventListener('message', onMessage)
    try {
      win.postMessage({ source: 'iui-html-host', type: 'requestFreeze', frameId }, '*')
    } catch {
      finish({ html: '', reason: 'failed' })
    }
  })
}

type SandboxImage = { dataUrl: string; failed: number; reason: string }

/** G12: ask the frame to rasterise itself (PNG data URL, '' on failure). */
function requestSandboxImage(iframe: HTMLIFrameElement | null, frameId: string, background: string, timeoutMs = 32_000): Promise<SandboxImage> {
  const win = iframe?.contentWindow
  if (!win) return Promise.resolve({ dataUrl: '', failed: 0, reason: 'noFrame' })
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: SandboxImage): void => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      resolve(value)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== win) return
      const data = event.data as unknown
      if (!isIuiSandboxHostMessage(data) || data.type !== 'image' || data.frameId !== frameId) return
      finish({ dataUrl: data.dataUrl, failed: data.failed ?? 0, reason: data.reason ?? '' })
    }
    const timer = window.setTimeout(() => finish({ dataUrl: '', failed: 0, reason: 'timeout' }), timeoutMs)
    window.addEventListener('message', onMessage)
    try {
      win.postMessage({ source: 'iui-html-host', type: 'requestImage', frameId, background }, '*')
    } catch {
      finish({ dataUrl: '', failed: 0, reason: 'failed' })
    }
  })
}

function requestSandboxSnapshot(
  iframe: HTMLIFrameElement | null,
  frameId: string,
  timeoutMs = 400,
): Promise<ShareSnapshot | null> {
  const win = iframe?.contentWindow
  if (!win || !iframe) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: ShareSnapshot | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      resolve(value)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win) return
      const data = event.data
      if (!data || data.source !== 'iui-html' || data.type !== 'snapshot' || data.frameId !== frameId) return
      if (typeof data.html !== 'string' || typeof data.css !== 'string') {
        finish(null)
        return
      }
      const state = data.state && typeof data.state === 'object' && !Array.isArray(data.state)
        ? data.state as Record<string, unknown>
        : {}
      const resources: SandboxResource[] = Array.isArray(data.resources)
        ? (data.resources as unknown[]).filter((r): r is SandboxResource => !!r && typeof (r as SandboxResource).url === 'string' && typeof (r as SandboxResource).type === 'string').slice(0, 800)
        : []
      finish({ html: data.html, css: data.css, state, resources })
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    window.addEventListener('message', onMessage)
    try {
      win.postMessage({ source: 'iui-html-host', type: 'requestSnapshot', frameId }, '*')
    } catch {
      finish(null)
    }
  })
}


const REASK_PROMPT_FALLBACK =
  'Please regenerate the previous page in one closed ```iui-html fence. Keep the content and layout; only fix what stopped it from rendering.'

/**
 * F9: generic "regenerate" prompt — no page-type assumptions (it used to
 * demand itinerary cards with Wikimedia photos for every page). When the host
 * knows what failed, the first line of that error rides along so the model
 * can fix the cause instead of guessing.
 */
export function reaskPrompt(t: (key: string) => string, problem?: string | null): string {
  const custom = t('sandbox.reaskPrompt')
  const base = custom && custom !== 'sandbox.reaskPrompt' ? custom : REASK_PROMPT_FALLBACK
  const detail = (problem ?? '').split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
  if (detail === '') return base
  const label = t('sandbox.reaskProblem')
  return `${base}\n${label && label !== 'sandbox.reaskProblem' ? label : 'Problem: '}${detail.slice(0, 300)}`
}

type SandboxFailKind = 'author' | 'host' | 'unknown'

function classifySandboxError(
  message: string,
  kind?: string,
): SandboxFailKind {
  if (kind === 'author' || kind === 'host') return kind
  if (/^\[author\]/i.test(message) || /chunk \d+\//i.test(message)) return 'author'
  if (/^\[host\]/i.test(message) || /author pipeline missing|CDN failed|global L not ready|Chart global not ready/i.test(message)) {
    return 'host'
  }
  if (/tiles? failed|tileerror|Map tiles/i.test(message)) return 'host'
  return 'unknown'
}

function friendlyError(
  message: string,
  t: (key: string, params?: Record<string, unknown>) => string,
  kind?: SandboxFailKind,
  chunkIndex?: number,
  chunkTotal?: number,
): string {
  if (/tiles? failed|tileerror|Map tiles/i.test(message)) {
    const tip = t('sandbox.tileError')
    return tip && tip !== 'sandbox.tileError' ? tip : message
  }
  const cleaned = message.replace(/^\[(author|host)\]\s*/i, '')
  const failKind = kind ?? classifySandboxError(message)
  if (failKind === 'author') {
    const hint = t('sandbox.authorFailHint')
    if (typeof chunkIndex === 'number' && typeof chunkTotal === 'number' && chunkTotal > 0) {
      const head = t('sandbox.authorChunkFail', {
        n: chunkIndex + 1,
        total: chunkTotal,
        message: cleaned,
      })
      return `${head}\n${hint}`
    }
    return `${t('sandbox.authorFail', { message: cleaned })}\n${hint}`
  }
  if (failKind === 'host') {
    const hint = t('sandbox.hostFailHint')
    return `${t('sandbox.hostFail', { message: cleaned })}\n${hint}`
  }
  return cleaned
}

function stageLabel(stage: string, t: (key: string) => string): string {
  if (stage === 'placeholder') return t('sandbox.stage.placeholder') || 'placeholder'
  if (stage === 'css') return t('sandbox.stage.css')
  if (stage === 'html') return t('sandbox.stage.html')
  if (stage === 'js') return t('sandbox.stage.js')
  return stage
}

function statusLabel(parsed: HtmlSandboxSpec, ready: boolean, t: (key: string) => string): string {
  if (parsed.partial) return t('sandbox.streaming')
  if (ready) return t('sandbox.ready')
  return t('sandbox.loading')
}

/** Prod: stage chips + 加载中 only while the fence is still streaming. */
function showStreamingStageChrome(parsed: HtmlSandboxSpec, ready: boolean): boolean {
  if (ready) return false
  return parsed.partial === true
}

export function HtmlSandboxFrame({ raw, streaming = false, storageKey = null }: { raw: string; streaming?: boolean; storageKey?: string | null }): ReactNode {
  const t = useT()
  const designTokens = useDesignTokens()
  const strictImages = useSyncExternalStore(subscribeRuntimeConfig, readStrictImages, () => false)
  const cdnKey = useSyncExternalStore(subscribeRuntimeConfig, readCdnKey, () => 'auto||||1')
  // F17: unguessable per-mount id (React useId is predictable across frames).
  const [frameId] = useState(newSandboxFrameId)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const onAction = useGenuiAction()
  /** F3: every outbound action/sendPrompt from this frame passes the gate. */
  const actionGateRef = useRef<FrameActionGate | null>(null)
  if (actionGateRef.current === null) actionGateRef.current = createFrameActionGate()
  const downloadLimiterRef = useRef<(() => boolean) | null>(null)
  /** G12: open only while「保存为图片」runs; bounds what the frame may fetch. */
  const captureRef = useRef<CaptureBudget | null>(null)
  if (downloadLimiterRef.current === null) downloadLimiterRef.current = createDownloadLimiter()
  const [actionsPaused, setActionsPaused] = useState(false)
  const warnedBlockRef = useRef<Set<ActionVerdict>>(new Set())
  const gateOutbound = (name: string): boolean => {
    const verdict = actionGateRef.current!.check(name)
    if (verdict === 'ok') return true
    if (verdict === 'paused') setActionsPaused(true)
    if (!warnedBlockRef.current.has(verdict)) {
      warnedBlockRef.current.add(verdict)
      try { console.warn(`[iui] sandbox ${name} blocked: ${verdict}`) } catch { /* ignore */ }
    }
    return false
  }
  const [reloadToken, setReloadToken] = useState(0)
  // F10: persistent page state. The iframe waits ≤300ms for IndexedDB so the
  // seed is in the srcdoc before author JS runs; a later load is merged in.
  const stateKeyRef = useRef<{ key: string; persist: boolean }>({ key: '', persist: false })
  stateKeyRef.current = storageKey !== null
    ? { key: storageKey, persist: true }
    : { key: `iui:mem:${fenceStateKey(raw)}`, persist: false }
  const [storageReady, setStorageReady] = useState(() => storageKey === null || peekPageState(storageKey) !== undefined)
  const seedRef = useRef<PageStateRecord | undefined>(storageKey === null ? undefined : peekPageState(storageKey))
  const lateItemsRef = useRef<Record<string, string> | null>(null)
  // G10: this page's own appearance tweaks (null = follow the user's default).
  const [pageAppearance, setPageAppearance] = useState<PageAppearance | null>(
    () => (seedRef.current?.appearance ? normalizePageAppearance(seedRef.current.appearance) : null),
  )
  const defaultAppearance = useSyncExternalStore(subscribeDefaultPageAppearance, getDefaultPageAppearance, getDefaultPageAppearance)
  const appearance = pageAppearance ?? defaultAppearance
  // S2: "auto" follows the host's light/dark theme (not just the OS) when the host exposes one.
  const hostScheme = useSyncExternalStore(subscribeHostScheme, hostColorScheme, () => null)
  const frameAppearance = useMemo<PageAppearance>(
    () => (appearance.scheme === 'auto' && hostScheme !== null ? { ...appearance, scheme: hostScheme } : appearance),
    [appearance, hostScheme],
  )
  const appearanceKey = serializePageAppearance(frameAppearance)
  const appearanceRef = useRef(frameAppearance)
  appearanceRef.current = frameAppearance
  useEffect(() => {
    if (storageKey === null || storageReady) return
    let done = false
    const timer = window.setTimeout(() => { if (!done) { done = true; setStorageReady(true) } }, 300)
    void loadPageState(storageKey).then((record) => {
      if (done) {
        // Too late for the srcdoc seed: merge into the running page.
        if (record.items && Object.keys(record.items).length > 0) lateItemsRef.current = record.items
        const win = iframeRef.current?.contentWindow
        if (win && lateItemsRef.current) win.postMessage({ source: 'iui-html-host', type: 'storageInit', frameId, items: lateItemsRef.current }, '*')
        if (win && record.dom) win.postMessage({ source: 'iui-html-host', type: 'restoreLocalState', frameId, state: record.dom }, '*')
        if (record.appearance) setPageAppearance(normalizePageAppearance(record.appearance))
        return
      }
      done = true
      window.clearTimeout(timer)
      seedRef.current = record
      if (record.appearance) setPageAppearance(normalizePageAppearance(record.appearance))
      setStorageReady(true)
    })
    return () => { done = true; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  /** F6 watchdog: last bridge message time (0 = none yet for this frame). */
  const lastBeatRef = useRef(0)
  const [hung, setHung] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [autoHeight, setAutoHeight] = useState<number | null>(null)
  // F22: raw content height from the bridge + 展开全部 toggle for pages taller than 2400px.
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [heightExpanded, setHeightExpanded] = useState(false)
  const [ready, setReady] = useState(false)
  /** G13: the author pipeline settled without failures (next-step chips may show). */
  const [settledOk, setSettledOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<SandboxFailKind | null>(null)
  // F17: an in-frame failure strip is already showing → host ErrorState stays hidden.
  const [errorInFrame, setErrorInFrame] = useState(false)
  useEffect(() => { if (error === null) setErrorInFrame(false) }, [error])
  const [copied, setCopied] = useState(false)
  /** F20: offline export progress / result shown on the menu item. */
  const [offlineNote, setOfflineNote] = useState<string | null>(null)
  const [imageNote, setImageNote] = useState<string | null>(null)
  const [templateNote, setTemplateNote] = useState<string | null>(null)
  /** F11: native = Fullscreen API; overlay = fixed in place; portal = fixed under body (transformed ancestor). */
  const [fsMode, setFsMode] = useState<FullscreenMode>('off')
  const fullscreen = fsMode !== 'off'
  // G14: narrow cards keep only ⋯ (全屏打开 moves into the menu); touch gets ≥32px targets.
  const [narrow, setNarrow] = useState(false)
  const coarse = useMemo(() => {
    try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches } catch { return false }
  }, [])
  const compactToolbar = narrow && !fullscreen
  const toolbarBtn: CSSProperties = narrow || coarse ? { ...TOOLBAR_BTN, minHeight: 32, minWidth: 32 } : TOOLBAR_BTN
  const menuItem: CSSProperties = narrow || coarse ? { ...MENU_ITEM, minHeight: 36 } : MENU_ITEM
  const fsButtonRef = useRef<HTMLButtonElement | null>(null)
  const prevFsModeRef = useRef<FullscreenMode>('off')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState<'main' | 'appearance' | 'feedback'>('main')
  /** G15: in-frame layout self-check result (serious issues raise the pill). */
  const [selfCheck, setSelfCheck] = useState<{ issues: SandboxSelfCheckIssue[] } | null>(null)
  const [selfCheckDismissed, setSelfCheckDismissed] = useState(false)
  useEffect(() => { if (!menuOpen) setMenuView('main') }, [menuOpen])
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [starterOverride, setStarterOverride] = useState<string | null>(null)
  /** G9: static copy shown while the page is frozen (null = live). */
  const [frozenHtml, setFrozenHtml] = useState<string | null>(null)
  /** P1-STATE: prefer injecting author JS into frozen preview (no srcdoc rebuild). */
  const authorJsRanRef = useRef(false)
  const usedPreviewShellRef = useRef(false)
  const lockedFinalRef = useRef(false)
  const [forceFinalSrcdoc, setForceFinalSrcdoc] = useState(false)
  const effectiveRaw = starterOverride ?? raw
  /** F21:「正在生成 · 已写 N 行」. */
  const streamLabel = (phase: string, body: string): string =>
    `${phase} · ${t('sandbox.stream.lines').replace('{n}', String(streamedLineCount(body)))}`
  const parsed = useMemo(() => parseHtmlSandboxFence(effectiveRaw), [effectiveRaw])
  const cssComplete = parsed?.cssComplete === true
  // Section-format bodies (`---css/---html/---js`) cannot tell a finished js
  // section from one still streaming — only JSON closes its strings. Hold the
  // author JS until the host message settles so half-written JS never runs.
  const sectionFormat = parsed !== null && !effectiveRaw.trimStart().startsWith('{')
  const shellRef = useRef<HTMLDivElement | null>(null)
  /** G16: this browser's 👍/👎 for the page (keyed by a hash of the source). */
  const feedbackKey = useMemo(() => pageFeedbackKey(effectiveRaw), [effectiveRaw])
  const [vote, setVote] = useState<FeedbackVote | null>(null)
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null)
  useEffect(() => { setVote(getPageFeedback(feedbackKey)?.vote ?? null) }, [feedbackKey])
  const castVote = (next: FeedbackVote | null, reason?: FeedbackReason): void => {
    recordVote(feedbackKey, pageIntentOf(shellRef.current, parsed?.title), next, reason)
    setVote(next)
    if (next !== null) {
      setFeedbackNote(t('sandbox.feedback.thanks'))
      window.setTimeout(() => { setFeedbackNote(null); setMenuOpen(false) }, 1200)
    }
  }
  // G14: watch the card width (re-attached only when the shell element changes).
  const widthWatchRef = useRef<{ el: Element; ro: ResizeObserver } | null>(null)
  useEffect(() => {
    const el = shellRef.current
    if (widthWatchRef.current?.el === el) return
    widthWatchRef.current?.ro.disconnect()
    widthWatchRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setNarrow(w < SANDBOX_NARROW_PX)
    })
    ro.observe(el)
    widthWatchRef.current = { el, ro }
  })
  useEffect(() => () => { widthWatchRef.current?.ro.disconnect(); widthWatchRef.current = null }, [])
  const [domStreaming, setDomStreaming] = useState(streaming)
  useEffect(() => {
    if (!sectionFormat) return
    const check = () => {
      const node = shellRef.current
      const live = node ? node.closest('[data-streaming]') !== null : streaming
      setDomStreaming(live)
      return live
    }
    if (!check()) return
    const timer = window.setInterval(() => { if (!check()) window.clearInterval(timer) }, 400)
    return () => window.clearInterval(timer)
  }, [sectionFormat, streaming, effectiveRaw])
  const holdSectionJs = sectionFormat && starterOverride === null && (streaming || domStreaming)
  const jsComplete = parsed?.jsComplete === true && !holdSectionJs
  // Freeze the iframe identity for the whole stream. Growing css/html/js
  // patches via postMessage — rewriting srcdoc blanks the document (flicker).
  const srcdocRebuildKey = htmlSandboxSrcdocRebuildKey({
    parsed: holdSectionJs && parsed ? { ...parsed, jsComplete: false, partial: true } : parsed,
    reloadToken,
    starterOverride,
    forceFinalSrcdoc,
    usedPreviewShell: usedPreviewShellRef.current,
    lockedFinal: lockedFinalRef.current,
  })
  if (srcdocRebuildKey.startsWith('final')) lockedFinalRef.current = true
  else if (srcdocRebuildKey.startsWith('preview-shell')) usedPreviewShellRef.current = true
  const srcdoc = useMemo(
    () => (parsed ? buildHtmlSandboxSrcdoc(parsed, {
      designTokens: mergeSandboxDesignTokens(designTokens, getActivePackId()),
      frameId,
      // F17: in-frame strip / tools / credits speak the plugin language.
      uiLang: currentLocale() === 'zh' ? 'zh-CN' : 'en',
      brandId: getActivePackId(),
      mergePackTokens: false, // already merged above
      // F4: opt-in strict image policy (Settings → IUI).
      strictImages,
      // F19: library source preset (Settings → IUI, or a strip's switch-and-retry).
      // Batch F: + probe-ranked mirrors, basemap (AMap on mainland networks) and photo strategy.
      ...parseCdnKey(cdnKey),
      ...(seedRef.current?.items ? { storageSeed: seedRef.current.items } : {}),
      // G10: bake the current appearance (later tweaks are posted live).
      ...appearanceBuildOptions(appearanceRef.current),
      // Final keys embed author JS; preview-shell always defers (inject via runAuthorJs).
      deferAuthorJs: !srcdocRebuildKey.startsWith('final'),
      // C6: libraries from the plugin's own asset route first, CDNs as fallback.
      ...((): { assetBase?: string } => { const assetBase = sandboxAssetBase(); return assetBase ? { assetBase } : {} })(),
    }) : null),
    // keyed by srcdocRebuildKey (not every html/css chunk)
    [srcdocRebuildKey, designTokens, frameId, strictImages, storageReady, cdnKey],
  )
  const baseHeight = parsed?.height ?? (parsed?.partial ? 280 : 360)

  useEffect(() => {
    // Only the iframe identity (rebuild key) may blank chrome. Growing
    // html/css inside a frozen preview-shell must not flip ready→loading.
    setAutoHeight(null)
    setReady(false)
    setError(null)
    setErrorKind(null)
    setCopied(false)
  }, [srcdocRebuildKey])

  useEffect(() => {
    // Same React instance streams one fence (`raw` grows). Do NOT reset
    // preview-shell / author-js locks here — that switches to a final
    // srcdoc on the last token and flashes the iframe.
    setStarterOverride(null)
  }, [raw])

  useEffect(() => {
    // Explicit reload chrome bumps reloadToken — allow final srcdoc with JS.
    if (reloadToken === 0) return
    authorJsRanRef.current = false
    usedPreviewShellRef.current = false
    lockedFinalRef.current = false
    setForceFinalSrcdoc(true)
  }, [reloadToken])

  // Prod: never leave complete fences stuck on 加载中 / stage chrome if ready postMessage is lost.
  useEffect(() => {
    if (!parsed || parsed.partial || ready) return
    const timer = window.setTimeout(() => setReady(true), 2500)
    return () => window.clearTimeout(timer)
  }, [parsed, ready, srcdocRebuildKey])

  // P1-N6 + P1-PREVIEW-PHOTO: push enriched+sanitized html/css into frozen preview iframe.
  useEffect(() => {
    if (!ready || !parsed) return
    if (srcdocRebuildKey.startsWith('final')) return
    if (authorJsRanRef.current) return
    const win = iframeRef.current?.contentWindow
    if (!win) return
    let html = sanitizeSandboxMarkup(enrichPlaceMediaHtml(parsed.html, parseCdnKey(cdnKey).net))
    if (html.length > HTML_SANDBOX_MAX_HTML_BYTES) {
      html = `${html.slice(0, HTML_SANDBOX_MAX_HTML_BYTES)}\n<!-- html truncated -->`
    }
    const css = sanitizeSandboxCss(parsed.css)
    try {
      win.postMessage({ source: 'iui-html-host', type: 'previewCss', frameId, css }, '*')
      win.postMessage({ source: 'iui-html-host', type: 'previewHtml', frameId, html }, '*')
    } catch { /* ignore */ }
  }, [ready, parsed, frameId, srcdocRebuildKey, cdnKey])

  // P1-STATE: when js completes on a live preview shell, inject author JS in-place.
  useEffect(() => {
    if (!ready || !parsed || !cssComplete || !jsComplete) return
    if (authorJsRanRef.current || forceFinalSrcdoc || starterOverride) return
    // If this mount already used a final srcdoc, author JS is in the document — mark ran.
    if (srcdocRebuildKey.startsWith('final')) {
      authorJsRanRef.current = true
      return
    }
    const win = iframeRef.current?.contentWindow
    if (!win) {
      const timer = window.setTimeout(() => setForceFinalSrcdoc(true), 1500)
      return () => window.clearTimeout(timer)
    }
    authorJsRanRef.current = true
    try {
      // Last enriched html patch before JS mutates the DOM.
      let html = sanitizeSandboxMarkup(enrichPlaceMediaHtml(parsed.html, parseCdnKey(cdnKey).net))
      if (html.length > HTML_SANDBOX_MAX_HTML_BYTES) {
        html = `${html.slice(0, HTML_SANDBOX_MAX_HTML_BYTES)}\n<!-- html truncated -->`
      }
      win.postMessage({ source: 'iui-html-host', type: 'previewHtml', frameId, html }, '*')
      const preparedJs = prepareAuthorJs(parsed.js)
      win.postMessage({
        source: 'iui-html-host',
        type: 'runAuthorJs',
        frameId,
        js: preparedJs,
        jsFunctions: prepareAuthorJs(parsed.jsFunctions ?? ''),
        jsExpressions: (parsed.jsExpressions ?? []).map((x) => prepareAuthorJs(x)),
        jsChunks: splitAuthorJsChunks(preparedJs),
      }, '*')
    } catch {
      authorJsRanRef.current = false
      setForceFinalSrcdoc(true)
    }
  }, [ready, parsed, cssComplete, jsComplete, frameId, forceFinalSrcdoc, starterOverride, srcdocRebuildKey, cdnKey])

  // Keep sandbox in sync when host bindings / appData change.
  // F4: only frames whose source actually reads host data get it.
  const wantsHostData = usesHostData(effectiveRaw)
  // F13: the SSE / poll watcher runs only while some page reads host data.
  useEffect(() => (wantsHostData ? acquireBindingWatch() : undefined), [wantsHostData])
  useEffect(() => {
    if (!ready || !wantsHostData) return
    const push = () => {
      try {
        const snap = getAppDataSnapshot()
        const win = iframeRef.current?.contentWindow
        if (!win) return
        const flat: Record<string, string> = {}
        for (const [k, v] of Object.entries(snap.bindings)) flat[k] = String(v)
        win.postMessage({ source: 'iui-html-host', type: 'bindings', frameId, values: flat }, '*')
        win.postMessage({ source: 'iui-html-host', type: 'appData', frameId, data: snap.appData }, '*')
      } catch { /* ignore */ }
    }
    push()
    return subscribeBindings(push)
  }, [ready, frameId, wantsHostData])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // P1-4: never accept host-bridge messages before the iframe is bound —
      // frameId alone is guessable during the mount window.
      const frame = iframeRef.current
      if (frame === null) return
      // P1-N3: reject null source (strict equality with contentWindow only).
      if (event.source !== frame.contentWindow) return
      if (!isIuiSandboxHostMessage(event.data)) return
      if (event.data.frameId !== frameId) return
      // F6: any bridge message is proof of life.
      lastBeatRef.current = Date.now()
      setHung(prev => (prev ? false : prev))
      if (event.data.type === 'heartbeat') return
      if (event.data.type === 'escape') {
        setMenuOpen(false)
        setFsMode((m) => {
          if (m === 'native') {
            const doc = frame.ownerDocument
            if (doc.fullscreenElement !== null && typeof doc.exitFullscreen === 'function') void doc.exitFullscreen().catch(() => {})
          }
          return m === 'off' ? m : 'off'
        })
        return
      }
      if (event.data.type === 'resize') {
        setAutoHeight(clampHeight(event.data.height, baseHeight, SANDBOX_EXPANDED_HEIGHT_MAX))
        setContentHeight(Number.isFinite(event.data.height) ? Math.round(event.data.height) : null)
        return
      }
      if (event.data.type === 'ready' || event.data.type === 'bridgeReady') {
        // Handshake only — libs/author readiness is gated inside the iframe pipeline.
        setReady(true)
        // Push current bindings + typed appData into the sandbox frame.
        try {
          const snap = getAppDataSnapshot()
          const win = iframeRef.current?.contentWindow
          if (win) {
            if (usesHostData(effectiveRaw)) {
              const flat: Record<string, string> = {}
              for (const [k, v] of Object.entries(snap.bindings)) flat[k] = String(v)
              win.postMessage({ source: 'iui-html-host', type: 'bindings', frameId, values: flat }, '*')
              win.postMessage({ source: 'iui-html-host', type: 'appData', frameId, data: snap.appData }, '*')
            }
            win.postMessage({ source: 'iui-html-host', type: 'theme', frameId, tokens: readDesignTokens() }, '*')
            const saved = peekPageState(stateKeyRef.current.key)?.dom
            if (saved) {
              win.postMessage({ source: 'iui-html-host', type: 'restoreLocalState', frameId, state: saved }, '*')
            }
          }
        } catch { /* ignore */ }
        return
      }
      if (event.data.type === 'localState') {
        const { key: stateKey, persist } = stateKeyRef.current
        updatePageState(stateKey, { dom: event.data.state }, { persist })
        return
      }
      if (event.data.type === 'storageSet') {
        const items = sanitizeStorageItems(event.data.items)
        if (items === null) return
        const { key: stateKey, persist } = stateKeyRef.current
        if (!updatePageState(stateKey, { items }, { persist })) {
          frame.contentWindow?.postMessage({ source: 'iui-html-host', type: 'storageQuota', frameId, limit: PAGE_STATE_QUOTA_BYTES }, '*')
        }
        return
      }
      if (event.data.type === 'stripAction') {
        if (event.data.action === 'reload') {
          setStopped(false); setHung(false); setReloadToken((n) => n + 1); setError(null); setErrorKind(null)
        } else if (event.data.action === 'switchCdn') {
          // F19: remember the next source for this browser, then rebuild.
          setCdnPresetOverride(normalizeCdnPreset(event.data.detail))
          setStopped(false); setHung(false); setReloadToken((n) => n + 1); setError(null); setErrorKind(null)
        } else {
          void insertIntoComposer(reaskPrompt(t, event.data.detail ?? null))
        }
        return
      }
      if (event.data.type === 'error') {
        if (event.data.strip === true) setErrorInFrame(true)
        const kind = classifySandboxError(event.data.message, event.data.kind)
        setErrorKind(kind)
        setError(friendlyError(
          event.data.message,
          t,
          kind,
          event.data.chunkIndex,
          event.data.chunkTotal,
        ))
        return
      }
      if (event.data.type === 'selfCheck') {
        const issues = event.data.issues.slice(0, 10)
        setSelfCheck({ issues })
        try { recordSelfCheck(pageFeedbackKey(effectiveRaw), pageIntentOf(shellRef.current, parsed?.title), issues) } catch { /* storage */ }
        return
      }
      if (event.data.type === 'authorSettled') {
        if (event.data.ok !== false) setSettledOk(true)
        // Chunk failures already posted as error; if settled with failures and no strip yet, surface a host chrome tip.
        if (event.data.ok === false && event.data.failedChunks && event.data.failedChunks > 0) {
          // Chunk failures always paint the in-frame strip.
          setErrorInFrame(true)
          setErrorKind((prev) => prev ?? 'author')
          setError((prev) => prev ?? friendlyError(
            `chunk failures: ${event.data.failedChunks}`,
            t,
            'author',
          ))
        }
        return
      }
      if (event.data.type === 'action') {
        const action = event.data.action.trim()
        if (!action) return
        const payload = event.data.payload ?? {}
        const openUrl = sandboxOpenLinkUrl(action, payload)
        if (openUrl) {
          try { window.open(openUrl, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
          return
        }
        if (!gateOutbound(action)) return
        onAction?.(action, capActionPayload(payload))
        return
      }
      if (event.data.type === 'sendPrompt') {
        const prompt = event.data.text.trim()
        if (!prompt) return
        // Fill the composer only; the user presses send. Still gated so a
        // timer cannot keep overwriting the draft.
        if (!gateOutbound('prompt')) return
        const summary = event.data.summary === true
        void insertIntoComposer(prompt.slice(0, 2000)).then((result) => {
          // G11: the composer is the preview — say so, the user decides to send.
          if (!summary || result === 'failed') return
          pushTipToast(result === 'inserted'
            ? { title: t('sandbox.summaryFilled'), description: t('sandbox.summaryFilledDesc') }
            : { title: t('sandbox.summaryCopied') })
        })
        return
      }
      if (event.data.type === 'fetchResource') {
        // G12: resource fetches for image export, only inside the capture window.
        const { reqId, url, as } = event.data
        const answer = (data: string | null): void => {
          try {
            frame.contentWindow?.postMessage({
              source: 'iui-html-host', type: 'hostResult', frameId, reqId,
              ok: data !== null, ...(data !== null ? { data } : { reason: 'unavailable' }),
            }, '*')
          } catch { /* frame gone */ }
        }
        const budget = captureRef.current
        if (!takeCaptureFetch(budget)) { answer(null); return }
        const proxyBase = sandboxAssetBase()
        void fetchCaptureResource(url, as, proxyBase ? { proxyBase } : {}).then((got) => {
          answer(got && chargeCaptureBytes(budget, got.bytes) ? got.data : null)
        }, () => answer(null))
        return
      }
      if (event.data.type === 'copyText' || event.data.type === 'download') {
        // D8/F18: only right after a real click inside the frame (user
        // activation propagates to the host); the frame gets a hostResult.
        const reqId = event.data.reqId
        const reply = (verdict: DelegateVerdict): void => {
          if (!reqId) return
          try {
            frame.contentWindow?.postMessage({
              source: 'iui-html-host', type: 'hostResult', frameId, reqId,
              ok: verdict === 'ok', ...(verdict === 'ok' ? {} : { reason: verdict }),
            }, '*')
          } catch { /* frame gone */ }
        }
        if (event.data.type === 'download') {
          reply(hostDownload(event.data.filename, event.data.data, event.data.mime, downloadLimiterRef.current!))
        } else {
          void hostCopy(event.data.text).then(reply)
        }
        return
      }
      if (event.data.type === 'openLink') {
        const url = event.data.url.trim()
        if (!isAllowedSandboxOpenUrl(url)) {
          setError(`Blocked openLink: ${url.slice(0, 120)}`)
          return
        }
        try {
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'openLink failed')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameId, baseHeight, onAction, t, effectiveRaw])

  // F6 watchdog: a frame that stops beating for 5s gets a「页面无响应」overlay.
  // Hidden tabs throttle timers in both documents, so they never count.
  useEffect(() => {
    lastBeatRef.current = 0
    setHung(false)
    setSettledOk(false)
    setSelfCheck(null)
    setSelfCheckDismissed(false)
  }, [srcdocRebuildKey])
  useEffect(() => {
    if (stopped || frozenHtml !== null) return
    const timer = window.setInterval(() => {
      if (lastBeatRef.current === 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        lastBeatRef.current = Date.now()
        return
      }
      if (Date.now() - lastBeatRef.current > SANDBOX_HUNG_MS) setHung(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stopped, frozenHtml])

  // F11: leave native mode when the browser exits it (Esc / F11 / tab switch).
  useEffect(() => {
    if (fsMode !== 'native') return
    const doc = shellRef.current?.ownerDocument ?? document
    const onChange = (): void => {
      if (doc.fullscreenElement !== shellRef.current) setFsMode('off')
    }
    doc.addEventListener('fullscreenchange', onChange)
    return () => doc.removeEventListener('fullscreenchange', onChange)
  }, [fsMode])

  // F11: overlay modes lock background scroll and close on Escape.
  useEffect(() => {
    if (fsMode !== 'overlay' && fsMode !== 'portal') return
    const doc = shellRef.current?.ownerDocument ?? document
    const root = doc.documentElement
    const prevRoot = root.style.overflow
    const prevBody = doc.body.style.overflow
    root.style.overflow = 'hidden'
    doc.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); setFsMode('off') }
    }
    doc.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = prevRoot
      doc.body.style.overflow = prevBody
      doc.removeEventListener('keydown', onKey)
    }
  }, [fsMode])

  // F11: focus returns to the toggle after exit; portal exit rebuilds in place.
  useEffect(() => {
    const prev = prevFsModeRef.current
    prevFsModeRef.current = fsMode
    if (prev !== 'off' && fsMode === 'off') {
      const id = setTimeout(() => fsButtonRef.current?.focus({ preventScroll: true }), 0)
      return () => clearTimeout(id)
    }
    return undefined
  }, [fsMode])

  // D9: ⋯ menu closes on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return
    const doc = menuRef.current?.ownerDocument ?? document
    const onDown = (e: Event): void => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false) }
    }
    doc.addEventListener('pointerdown', onDown, true)
    doc.addEventListener('keydown', onKey, true)
    return () => {
      doc.removeEventListener('pointerdown', onDown, true)
      doc.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  // G10: live appearance changes (the srcdoc bakes the value at build time).
  useEffect(() => {
    if (!ready) return
    const a = appearanceRef.current
    const css = isDefaultPageAppearance(a) ? '' : pageAppearanceCss(a)
    try { iframeRef.current?.contentWindow?.postMessage({ source: 'iui-html-host', type: 'appearance', frameId, css, scheme: a.scheme }, '*') } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, appearanceKey, frameId])
  const choosePageAppearance = (next: PageAppearance | null): void => {
    setPageAppearance(next)
    const { key, persist } = stateKeyRef.current
    // '{}' = explicit built-in look for this page (even when the user default differs).
    updatePageState(key, { appearance: next === null ? '' : serializePageAppearance(next) || '{}' }, { persist })
  }
  const saveAppearanceAsDefault = (): void => {
    void saveDefaultPageAppearance(appearance, writeIuiConfigField).then((result) => {
      choosePageAppearance(null) // the page now simply follows the (identical) default
      const synced = result === 'synced'
      pushTipToast({
        title: t(synced ? 'appearance.savedSynced' : 'appearance.savedLocal'),
        description: t(synced ? 'appearance.savedSyncedDesc' : 'appearance.savedLocalDesc'),
      })
    })
  }

  // G9: pause while offscreen; freeze the oldest offscreen cards past MAX_LIVE_FRAMES.
  const settledLive = parsed !== null && !parsed.partial && !holdSectionJs && ready && !stopped && frozenHtml === null
  const freezeGateRef = useRef({ settledLive, since: settledLive ? Date.now() : 0, busy: false })
  if (settledLive && !freezeGateRef.current.settledLive) freezeGateRef.current.since = Date.now()
  freezeGateRef.current.settledLive = settledLive
  freezeGateRef.current.busy = fullscreen || menuOpen || hung || error !== null
  const activityRef = useRef<FrameActivityHandle | null>(null)
  const visibleRef = useRef(true)
  const offscreenSentRef = useRef(false)
  const offscreenTimerRef = useRef<number | null>(null)
  const syncOffscreen = useCallback((): void => {
    if (offscreenTimerRef.current !== null) { window.clearTimeout(offscreenTimerRef.current); offscreenTimerRef.current = null }
    const post = (visible: boolean): void => {
      try { iframeRef.current?.contentWindow?.postMessage({ source: 'iui-html-host', type: 'visibility', frameId, visible }, '*') } catch { /* ignore */ }
    }
    if (visibleRef.current) {
      if (offscreenSentRef.current) { offscreenSentRef.current = false; post(true) }
      return
    }
    if (offscreenSentRef.current) return
    offscreenTimerRef.current = window.setTimeout(() => {
      offscreenTimerRef.current = null
      if (visibleRef.current || !freezeGateRef.current.settledLive || freezeGateRef.current.busy) return
      offscreenSentRef.current = true
      post(false)
    }, OFFSCREEN_PAUSE_DELAY_MS)
  }, [frameId])
  const freezeNow = useCallback((): void => {
    void requestSandboxFreeze(iframeRef.current, frameId).then((res) => {
      const gate = freezeGateRef.current
      if (res.html === '' || visibleRef.current || !gate.settledLive || gate.busy) {
        activityRef.current?.setFrozen(false, res.html === '' ? { refused: true } : undefined)
        return
      }
      lastBeatRef.current = 0
      offscreenSentRef.current = false
      setFrozenHtml(res.html)
      activityRef.current?.setFrozen(true)
    })
  }, [frameId])
  const resumeFrozen = useCallback((): void => {
    const latest = peekPageState(stateKeyRef.current.key)
    if (latest) seedRef.current = latest
    setFrozenHtml(null)
    activityRef.current?.setFrozen(false)
    setReloadToken((n) => n + 1)
  }, [])
  useEffect(() => {
    const handle = registerFrameActivity(frameId, {
      canFreeze: () => {
        const gate = freezeGateRef.current
        return gate.settledLive && !gate.busy && gate.since > 0 && Date.now() - gate.since >= FREEZE_MIN_SETTLED_MS
      },
      freeze: freezeNow,
    })
    activityRef.current = handle
    return () => {
      handle.dispose()
      activityRef.current = null
      if (offscreenTimerRef.current !== null) window.clearTimeout(offscreenTimerRef.current)
    }
  }, [frameId, freezeNow])
  useEffect(() => {
    // A new iframe document starts unpaused.
    offscreenSentRef.current = false
    if (!settledLive) return
    syncOffscreen()
    const id = window.setTimeout(() => scheduleFrameActivityCheck(0), FREEZE_MIN_SETTLED_MS + 50)
    return () => window.clearTimeout(id)
  }, [settledLive, srcdocRebuildKey, syncOffscreen])
  const observedRef = useRef<{ el: Element; io: IntersectionObserver } | null>(null)
  useEffect(() => {
    const el = shellRef.current
    if (observedRef.current?.el === el) return
    observedRef.current?.io.disconnect()
    observedRef.current = null
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (!last) return
      visibleRef.current = last.isIntersecting
      activityRef.current?.setVisible(last.isIntersecting)
      syncOffscreen()
    }, { rootMargin: OFFSCREEN_ROOT_MARGIN })
    io.observe(el)
    observedRef.current = { el, io }
  })
  useEffect(() => () => { observedRef.current?.io.disconnect(); observedRef.current = null }, [])
  // A new version / patch of a frozen page resumes it.
  const frozenRawRef = useRef(effectiveRaw)
  useEffect(() => {
    if (frozenHtml !== null && frozenRawRef.current !== effectiveRaw) resumeFrozen()
    frozenRawRef.current = effectiveRaw
  }, [effectiveRaw, frozenHtml, resumeFrozen])

  if (parsed === null || srcdoc === null) {
    return (
      <EmptyState
        kind="sandbox"
        detail={raw.trim() === '' ? t('sandbox.parseFail') : `${t('sandbox.parseFail')}\n${raw.slice(0, 200)}`}
        actions={[
          {
            label: t('sandbox.reask'),
            onClick: () => {
              void insertIntoComposer(reaskPrompt(t, t('sandbox.reaskParseFail')))
            },
          },
        ]}
      />
    )
  }

  // D10: a fence that is still streaming shows a skeleton + stage progress, never a blank box.
  if (isSandboxSpecEmpty(parsed) && starterOverride === null && parsed.partial) {
    const prog = sandboxStreamProgress(parsed)
    return (
      <div style={SHELL_STYLE} data-iui-html-sandbox="empty">
        <SandboxSkeleton
          label={streamLabel(t(`sandbox.skeleton.${prog.phase}`), raw)}
          pct={prog.pct}
          height={clampHeight(baseHeight, 220)}
          {...(parsed.title ? { title: parsed.title } : {})}
        />
      </div>
    )
  }

  if (isSandboxSpecEmpty(parsed) && starterOverride === null) {
    return (
      <div style={SHELL_STYLE} data-iui-html-sandbox="empty">
        <EmptyState
          kind="sandbox"
          {...(parsed.partial ? { detail: t('sandbox.partialHint') } : {})}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #6b7280)', alignSelf: 'center' }}>{t('sandbox.starters')}</span>
          {listHtmlSandboxStarters().map((starter) => (
            <button
              key={starter.id}
              type="button"
              style={TOOLBAR_BTN}
              title={starter.summary}
              onClick={() => {
                setStarterOverride(starterToFenceBody(starter))
                setError(null)
                setErrorKind(null)
                setReloadToken((n) => n + 1)
              }}
            >
              {starter.title}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const tallPage = contentHeight !== null && contentHeight > SANDBOX_AUTO_HEIGHT_MAX
  const height = autoHeight !== null
    ? sandboxFrameHeight(autoHeight, heightExpanded)
    : clampHeight(baseHeight, 360)
  const stages = sandboxStageLabels(parsed)
  const requestMeasure = (): void => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'iui-html-host', type: 'measure', frameId },
        '*',
      )
    } catch { /* ignore */ }
  }

  /** Re-run author JS only — no srcdoc rebuild / full iframe reload. */
  const rerunAuthorJsOnly = (): void => {
    const win = iframeRef.current?.contentWindow
    if (!win || !parsed) return
    setError(null)
    setErrorKind(null)
    try {
      const preparedJs = prepareAuthorJs(parsed.js)
      win.postMessage({
        source: 'iui-html-host',
        type: 'runAuthorJs',
        frameId,
        force: true,
        js: preparedJs,
        jsFunctions: prepareAuthorJs(parsed.jsFunctions ?? ''),
        jsExpressions: (parsed.jsExpressions ?? []).map((x) => prepareAuthorJs(x)),
        jsChunks: splitAuthorJsChunks(preparedJs),
      }, '*')
      authorJsRanRef.current = true
    } catch {
      setErrorKind('host')
      setError(friendlyError('failed to post runAuthorJs(force)', t, 'host'))
    }
  }

  const enterFullscreen = () => {
    const shell = shellRef.current
    if (shell === null) return
    const fallback = (): void => {
      if (needsBodyPortal(shell)) {
        // Re-parenting reloads the iframe: rebuild with author JS; F10 restores state.
        setReloadToken((n) => n + 1)
        setFsMode('portal')
      } else {
        setFsMode('overlay')
      }
    }
    const doc = shell.ownerDocument
    if (typeof shell.requestFullscreen === 'function' && doc.fullscreenEnabled !== false) {
      shell.requestFullscreen({ navigationUI: 'hide' }).then(() => setFsMode('native'), fallback)
      return
    }
    fallback()
  }

  const exitFullscreen = () => {
    const doc = shellRef.current?.ownerDocument ?? document
    if (fsMode === 'native' && doc.fullscreenElement !== null && typeof doc.exitFullscreen === 'function') {
      void doc.exitFullscreen().catch(() => {})
    }
    setFsMode('off')
  }

  const toolbar = (
    <div style={STAGE_ROW} aria-live="polite">
      {showStreamingStageChrome(parsed, ready) && stages.map((stage) => (
        <span key={stage} style={CHIP}>{stageLabel(stage, t)}</span>
      ))}
      {showStreamingStageChrome(parsed, ready) && <span>{statusLabel(parsed, ready, t)}</span>}
      {parsed.partial && !ready && <span>{t('sandbox.partialHint')}</span>}
      <span style={{ flex: 1 }} />
      {/* D9: only 全屏 + ⋯ ; 重跑页面脚本 lives in the error strip. G14: narrow → only ⋯. */}
      {!compactToolbar && <button
        ref={fsButtonRef}
        type="button"
        style={toolbarBtn}
        data-iui-fullscreen-toggle="1"
        aria-pressed={fullscreen}
        onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
      >
        {fullscreen ? t('sandbox.exitFullscreen') : t('sandbox.fullscreen')}
      </button>}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          ref={compactToolbar ? fsButtonRef : undefined}
          type="button"
          style={{ ...toolbarBtn, padding: '5px 9px', letterSpacing: 1 }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('sandbox.more')}
          title={t('sandbox.more')}
          data-iui-sandbox-menu="1"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
        {menuOpen && (
          <div role="menu" style={MENU_STYLE}>
            {menuView === 'appearance' ? (
              <AppearancePanel
                value={appearance}
                customized={pageAppearance !== null}
                onChange={(next) => choosePageAppearance(next)}
                onReset={() => choosePageAppearance(null)}
                onSaveDefault={saveAppearanceAsDefault}
                onBack={() => setMenuView('main')}
              />
            ) : menuView === 'feedback' ? (
              <div data-iui-feedback-reasons="1" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...menuItem, cursor: 'default', opacity: 0.7, fontSize: 12 }}>{feedbackNote ?? t('sandbox.feedback.reasonTitle')}</div>
                {FEEDBACK_REASONS.map((reason) => (
                  <button key={reason} type="button" role="menuitem" style={menuItem} data-iui-feedback-reason={reason}
                    disabled={feedbackNote !== null}
                    onClick={() => castVote('down', reason)}
                  >
                    {t(`sandbox.feedback.reason.${reason}`)}
                  </button>
                ))}
                <button type="button" role="menuitem" style={{ ...menuItem, opacity: 0.7 }} disabled={feedbackNote !== null} onClick={() => castVote('down')}>
                  {t('sandbox.feedback.skip')}
                </button>
              </div>
            ) : (<>
            {compactToolbar && (
              <button
                type="button"
                role="menuitem"
                style={{ ...menuItem, fontWeight: 600 }}
                data-iui-menu-fullscreen="1"
                onClick={() => { setMenuOpen(false); enterFullscreen() }}
              >
                {t('sandbox.openFullscreen')}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              onClick={() => {
                setMenuOpen(false)
                setStopped(false)
                setHung(false)
                setReloadToken((n) => n + 1)
                setError(null)
                setErrorKind(null)
              }}
            >
              {t('sandbox.reload')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              data-iui-sandbox-appearance="1"
              onClick={() => setMenuView('appearance')}
            >
              {t('sandbox.appearance')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              onClick={() => {
                setMenuOpen(false)
                void (async () => {
                  const snap = await requestSandboxSnapshot(iframeRef.current, frameId)
                  const html = buildSandboxDownloadHtml(parsed, {
                    designTokens: mergeSandboxDesignTokens(designTokens, getActivePackId()),
                    frameId: 'download',
                    brandId: getActivePackId(),
                    mergePackTokens: false,
                    ...appearanceBuildOptions(frameAppearance),
                    ...(snap && snap.html.trim() ? { liveHtml: snap.html, liveCss: snap.css, liveState: snap.state } : {}),
                  })
                  downloadText(shareFileName(parsed.title), html)
                })()
              }}
            >
              {t('sandbox.download')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              disabled={offlineNote === t('sandbox.offlinePacking')}
              onClick={() => {
                if (offlineNote) return
                setOfflineNote(t('sandbox.offlinePacking'))
                void (async () => {
                  // F20: bake the live page, then inline what it fetched.
                  const snap = await requestSandboxSnapshot(iframeRef.current, frameId)
                  const assetBase = sandboxAssetBase()
                  const cdnSource = getCdnSource()
                  const live = snap && snap.html.trim() ? { liveHtml: snap.html, liveCss: snap.css, liveState: snap.state } : {}
                  const common = {
                    designTokens: mergeSandboxDesignTokens(designTokens, getActivePackId()),
                    frameId: 'download',
                    uiLang: currentLocale() === 'zh' ? 'zh-CN' : 'en',
                    brandId: getActivePackId(),
                    mergePackTokens: false,
                    cdnSource,
                    ...appearanceBuildOptions(frameAppearance),
                    ...live,
                  }
                  const doc = buildHtmlSandboxSrcdoc(parsed, { ...common, ...(assetBase ? { assetBase } : {}) })
                  let note: string
                  try {
                    const out = await buildOfflineExport(doc, snap?.resources ?? [], {
                      ...(assetBase ? { assetBase } : {}), cdnSource, lang: currentLocale(),
                    })
                    if (out.tooLarge) {
                      downloadText(shareFileName(parsed.title), buildSandboxDownloadHtml(parsed, common))
                      note = t('sandbox.offlineTooLarge').replace('{max}', String(Math.round(OFFLINE_EXPORT_MAX_BYTES / 1048576)))
                    } else {
                      downloadText(shareFileName(parsed.title, 'offline'), out.html)
                      note = t(out.failed.length ? 'sandbox.offlineDonePartial' : 'sandbox.offlineDone')
                        .replace('{size}', (out.bytes / 1048576).toFixed(1))
                        .replace('{n}', String(out.failed.length))
                    }
                  } catch {
                    downloadText(shareFileName(parsed.title), buildSandboxDownloadHtml(parsed, common))
                    note = t('sandbox.offlineFailed')
                  }
                  setOfflineNote(note)
                  window.setTimeout(() => { setOfflineNote(null); setMenuOpen(false) }, 2600)
                })()
              }}
            >
              {offlineNote ?? t('sandbox.downloadOffline')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              data-iui-sandbox-save-image="1"
              disabled={imageNote === t('sandbox.saveImageProgress')}
              onClick={() => {
                if (imageNote) return
                setImageNote(t('sandbox.saveImageProgress'))
                void (async () => {
                  // G12: the frame rasterises itself; the host fetches what it cannot.
                  captureRef.current = openCaptureBudget()
                  let note: string
                  try {
                    const shot = await requestSandboxImage(iframeRef.current, frameId, effectiveBackground(shellRef.current))
                    if (shot.dataUrl && downloadDataUrl(imageFileName(parsed.title), shot.dataUrl)) {
                      note = shot.failed > 0
                        ? t('sandbox.saveImagePartial').replace('{n}', String(shot.failed))
                        : t('sandbox.saveImageDone')
                    } else {
                      note = t('sandbox.saveImageFailed')
                    }
                  } finally {
                    captureRef.current = null
                  }
                  setImageNote(note)
                  window.setTimeout(() => { setImageNote(null); setMenuOpen(false) }, 2600)
                })()
              }}
            >
              {imageNote ?? t('sandbox.saveImage')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              onClick={async () => {
                const ok = await copyText(effectiveRaw)
                setCopied(ok)
                if (ok) setTimeout(() => { setCopied(false); setMenuOpen(false) }, 900)
                else setMenuOpen(false)
              }}
            >
              {copied ? t('sandbox.copied') : t('sandbox.copy')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={menuItem}
              data-iui-sandbox-save-template="1"
              disabled={templateNote !== null || parsed === null || parsed.partial === true}
              onClick={() => {
                // S6: save this page's source to 「我的模板」 (drawer + Settings → IUI → 模板).
                void saveUserTemplateFromPage({ source: effectiveRaw, ...(parsed?.title ? { name: parsed.title } : {}) }, writeIuiConfigField)
                  .then(({ result }) => setTemplateNote(t(result === 'synced' ? 'sandbox.templateSaved' : 'sandbox.templateSavedLocal')))
                  .catch(() => setTemplateNote(t('sandbox.templateFailed')))
                  .finally(() => { window.setTimeout(() => { setTemplateNote(null); setMenuOpen(false) }, 1600) })
              }}
            >
              {templateNote ?? t('sandbox.saveTemplate')}
            </button>
            <div data-iui-feedback={vote ?? 'none'} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 2px', borderTop: '1px solid rgba(127,127,127,.18)', marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 12, opacity: 0.65 }}>{feedbackNote ?? t('sandbox.feedback.label')}</span>
              <button type="button" role="menuitemradio" aria-checked={vote === 'up'} aria-label={t('sandbox.feedback.up')} title={t('sandbox.feedback.up')}
                data-iui-feedback-vote="up"
                style={{ ...toolbarBtn, padding: '3px 8px', ...(vote === 'up' ? { background: 'rgba(127,127,127,.16)' } : {}) }}
                onClick={() => castVote(vote === 'up' ? null : 'up')}
              >👍</button>
              <button type="button" role="menuitemradio" aria-checked={vote === 'down'} aria-label={t('sandbox.feedback.down')} title={t('sandbox.feedback.down')}
                data-iui-feedback-vote="down"
                style={{ ...toolbarBtn, padding: '3px 8px', ...(vote === 'down' ? { background: 'rgba(127,127,127,.16)' } : {}) }}
                onClick={() => { if (vote === 'down') castVote(null); else setMenuView('feedback') }}
              >👎</button>
            </div>
            </>)}
          </div>
        )}
      </div>
    </div>
  )

  const shellStyle: CSSProperties = fsMode === 'native'
    ? {
        ...SHELL_STYLE,
        height: '100vh',
        padding: 12,
        background: 'var(--dsw-alias-bg-base, #fff)',
        overflow: 'hidden',
      }
    : fsMode === 'overlay' || fsMode === 'portal'
      ? {
          ...SHELL_STYLE,
          position: 'fixed',
          inset: 12,
          width: 'auto',
          height: 'calc(100vh - 24px)',
          zIndex: fsMode === 'portal' ? 2147483000 : 9999,
          padding: 12,
          borderRadius: 12,
          background: 'var(--dsw-alias-bg-base, #fff)',
          overflow: 'hidden',
          boxShadow: '0 0 0 100vmax rgba(15,23,42,.42), 0 16px 48px rgba(15,23,42,.18)',
        }
      : SHELL_STYLE

  const content = (
    <div
      ref={shellRef}
      style={shellStyle}
      data-iui-html-sandbox={parsed.partial ? 'partial' : ready ? 'ready' : 'loading'}
      data-iui-fullscreen={fullscreen ? fsMode : '0'}
      {...(fsMode === 'overlay' || fsMode === 'portal' ? { role: 'dialog', 'aria-modal': true, 'aria-label': parsed.title ?? 'IUI sandbox' } : {})}
    >
      {toolbar}
      {actionsPaused && (
        <div data-iui-actions-paused="1" role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', fontSize: 13, color: 'var(--color-text-secondary, #5f5e58)' }}>
          <span>{t('sandbox.actionsPaused')}</span>
          <button
            type="button"
            style={TOOLBAR_BTN}
            onClick={() => { actionGateRef.current?.resume(); setActionsPaused(false) }}
          >
            {t('sandbox.actionsResume')}
          </button>
        </div>
      )}
      {error !== null && !errorInFrame && (
        <ErrorState
          kind={errorKind === 'host' ? 'sandbox-host-error' : 'sandbox-author-error'}
          detail={error}
          actions={[
            ...(jsComplete
              ? [{ label: t('sandbox.rerunAuthorJs'), onClick: () => rerunAuthorJsOnly() }]
              : []),
            { label: t('sandbox.reload'), onClick: () => { setStopped(false); setHung(false); setReloadToken((n) => n + 1); setError(null); setErrorKind(null) } },
            {
              label: t('sandbox.reask'),
              onClick: () => {
                void insertIntoComposer(reaskPrompt(t, error))
              },
            },
            { label: t('sandbox.dismissError'), onClick: () => { setError(null); setErrorKind(null) } },
          ]}
        />
      )}
      <div style={fullscreen ? { position: 'relative', flex: 1, minHeight: 0 } : { position: 'relative' }}>
        {storageReady && <iframe
          ref={iframeRef}
          key={stopped ? `${srcdocRebuildKey}:stopped` : frozenHtml !== null ? `${srcdocRebuildKey}:frozen` : srcdocRebuildKey}
          title={parsed.title ?? 'IUI sandbox'}
          // F6: no allow-modals — the bridge turns alert/confirm/prompt into an in-page toast.
          // G9: a frozen card is a static copy with scripts disabled.
          srcDoc={stopped ? stoppedSrcdoc(t('sandbox.stopped')) : frozenHtml !== null ? frozenHtml : srcdoc}
          sandbox={frozenHtml !== null && !stopped ? '' : 'allow-scripts'}
          referrerPolicy="no-referrer"
          style={{ ...FRAME_STYLE, height: fullscreen ? '100%' : height }}
          onLoad={() => {
            if (stopped || frozenHtml !== null) return
            requestMeasure()
            // Handshake fallback: complete fences should not stay on 加载中 if ready postMessage is lost.
            if (!parsed.partial) setReady(true)
          }}
        />}
        {storageReady && frozenHtml !== null && !stopped && (
          <button
            type="button"
            data-iui-sandbox-frozen="1"
            aria-label={t('sandbox.frozenResume')}
            title={t('sandbox.frozenResume')}
            onClick={resumeFrozen}
            style={FROZEN_OVERLAY_STYLE}
          >
            <span style={FROZEN_PILL_STYLE}>{t('sandbox.frozen')}</span>
          </button>
        )}
        {storageReady && selfCheck !== null && !selfCheckDismissed && settledOk && !stopped && frozenHtml === null && error === null && (() => {
          const serious = selfCheck.issues.filter((x) => x.serious)
          if (serious.length === 0) return null
          return (
            <div data-iui-selfcheck-pill={serious.length} role="status" style={SELF_CHECK_PILL_STYLE}>
              <button type="button" style={SELF_CHECK_PILL_BTN} data-iui-selfcheck-fix="1"
                title={serious.map((x) => t(`sandbox.selfCheck.${x.kind}`)).join(' · ')}
                onClick={() => {
                  setSelfCheckDismissed(true)
                  void insertIntoComposer(selfCheckPrompt(t, selfCheck.issues)).then((result) => {
                    if (result === 'failed') return
                    pushTipToast({ title: t('sandbox.selfCheckFilled'), description: t(result === 'inserted' ? 'offer.inserted' : 'offer.copied'), durationMs: 3000 })
                  })
                }}
              >
                {t('sandbox.selfCheckPill').replace('{n}', String(serious.length))}
              </button>
              <button type="button" style={{ ...SELF_CHECK_PILL_BTN, padding: '0 8px', opacity: 0.7 }} aria-label={t('sandbox.selfCheckDismiss')} title={t('sandbox.selfCheckDismiss')}
                data-iui-selfcheck-dismiss="1" onClick={() => setSelfCheckDismissed(true)}
              >×</button>
            </div>
          )
        })()}
        {!storageReady && <SandboxSkeleton label={t('sandbox.skeleton.loading')} height={fullscreen ? '100%' : height} showProgress={false} />}
        {storageReady && (parsed.partial || holdSectionJs) && !stopped && parsed.html.trim() === '' && (() => {
          const prog = sandboxStreamProgress(parsed)
          return <SandboxSkeleton overlay label={streamLabel(t(`sandbox.skeleton.${prog.phase}`), raw)} pct={prog.pct} {...(parsed.title ? { title: parsed.title } : {})} />
        })()}
        {storageReady && (parsed.partial || holdSectionJs) && !stopped && parsed.html.trim() !== '' && (
          <SandboxStreamingPill label={streamLabel(t('sandbox.stream.static'), raw)} />
        )}
        {hung && !stopped && (
          <div
            data-iui-sandbox-hung="1"
            role="alert"
            style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'rgba(250,250,249,.88)', color: 'var(--color-text-primary, #1f1e1b)', fontSize: 13, borderRadius: 8, backdropFilter: 'blur(2px)',
            }}
          >
            <span>{t('sandbox.hung')}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={TOOLBAR_BTN} data-iui-sandbox-stop="1" onClick={() => { setStopped(true); setHung(false); lastBeatRef.current = 0 }}>
                {t('sandbox.stop')}
              </button>
              <button type="button" style={TOOLBAR_BTN} onClick={() => { setHung(false); setStopped(false); lastBeatRef.current = 0; setReloadToken((n) => n + 1) }}>
                {t('sandbox.reload')}
              </button>
            </span>
          </div>
        )}
      </div>
      <NextStepChips
        shellRef={shellRef}
        enabled={settledOk && !parsed.partial && !fullscreen && error === null && frozenHtml === null && !stopped}
        title={parsed.title}
        source={effectiveRaw}
      />
      {tallPage && !fullscreen && contentHeight !== null && (
        <div data-iui-sandbox-expand={heightExpanded ? 'expanded' : 'collapsed'} style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <button
            type="button"
            style={TOOLBAR_BTN}
            aria-expanded={heightExpanded}
            onClick={() => setHeightExpanded((v) => !v)}
          >
            {heightExpanded
              ? t('sandbox.collapseHeight')
              : t('sandbox.expandHeight', { height: String(Math.min(contentHeight, SANDBOX_EXPANDED_HEIGHT_MAX)) })}
          </button>
        </div>
      )}
    </div>
  )

  if (fsMode === 'portal' && typeof document !== 'undefined') {
    // Keep the chat layout still while the page lives under <body>.
    return (
      <>
        <div aria-hidden="true" style={{ ...SHELL_STYLE, height: height + 36 }} />
        {createPortal(content, document.body)}
      </>
    )
  }
  return content
}

// ── F24: page versions + ```iui-patch ─────────────────────────────────────

const VERSION_BAR: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
  margin: '0 0 4px',
  fontSize: 12,
  opacity: 0.85,
}

const VERSION_CHIP: CSSProperties = {
  ...CHIP,
  minHeight: 24,
  padding: '0 8px',
  cursor: 'pointer',
}

function fenceOrder(context: GenuiFenceContext | undefined): readonly number[] | undefined {
  return context?.source?.order
}

/** Storage key for a page: explicit `id:` pages share state across versions. */
function lineageStorageKey(sessionId: string | undefined, fenceKey: string, explicitId: string | undefined): string | null {
  const id = explicitId ? sandboxPageId({ id: explicitId }) : null
  return pageStateKey(sessionId, id ? `page:${id}` : fenceKey)
}

function usePageVersionsRevision(): number {
  return useSyncExternalStore(subscribePageVersions, pageVersionsRevision, () => 0)
}

/** 「v1 · v2 · v3」 — switch which version this frame shows. */
function VersionBar({ versions, current, active, onPick }: {
  versions: readonly PageVersion[]
  current: string
  active: string
  onPick: (fenceKey: string) => void
}): ReactNode {
  const t = useT()
  if (versions.length < 2) return null
  return (
    <div style={VERSION_BAR} data-iui-page-versions={versions.length} role="group" aria-label={t('sandbox.versions')}>
      {versions.map((v, i) => {
        const on = v.fenceKey === active
        return (
          <button
            key={v.fenceKey}
            type="button"
            style={{ ...VERSION_CHIP, ...(on ? { fontWeight: 600, outline: '1px solid currentColor' } : {}) }}
            aria-pressed={on}
            data-iui-version={i + 1}
            title={v.fenceKey === current ? t('sandbox.versionThis') : undefined}
            onClick={() => onPick(v.fenceKey)}
          >
            v{i + 1}
          </button>
        )
      })}
    </div>
  )
}

/** Shows `raw` (or a picked sibling version) with the version strip. */
function VersionedFrame({ raw, streaming, storageKey, scope, fenceKey, pageId }: {
  raw: string
  streaming: boolean
  storageKey: string | null
  scope: string | undefined
  fenceKey: string
  pageId: string | null
}): ReactNode {
  usePageVersionsRevision()
  const [picked, setPicked] = useState<string | null>(null)
  const versions = streaming ? [] : listPageVersions(scope, pageId, fenceKey)
  const shown = picked === null ? null : versions.find((v) => v.fenceKey === picked) ?? null
  const showRaw = shown && shown.fenceKey !== fenceKey ? shown.raw : raw
  return (
    <div data-iui-page={pageId ?? undefined}>
      <VersionBar versions={versions} current={fenceKey} active={shown?.fenceKey ?? fenceKey} onPick={(k) => setPicked(k === fenceKey ? null : k)} />
      <HtmlSandboxFrame key={shown && shown.fenceKey !== fenceKey ? `v:${shown.fenceKey}` : 'self'} raw={showRaw} streaming={streaming} storageKey={storageKey} />
    </div>
  )
}

/** ```iui-html with version registration. */
function SandboxPageFence({ raw, fenceKey, context }: { raw: string; fenceKey: string; context: GenuiFenceContext | undefined }): ReactNode {
  const streaming = context?.streaming === true && context.source === undefined
  const scope = context?.sessionId
  const spec = useMemo(() => (streaming ? null : parseHtmlSandboxFence(raw)), [raw, streaming])
  const pageId = spec ? sandboxPageId(spec) : null
  const storageKey = spec ? lineageStorageKey(scope, fenceKey, spec.id) : pageStateKey(scope, fenceKey)
  const order = fenceOrder(context)
  useEffect(() => {
    if (spec === null || isSandboxSpecEmpty(spec)) return
    registerPageVersion(scope, { fenceKey, pageId, raw, page: pageFromSpec(spec), storageKey, ...(order ? { order } : {}) })
  }, [scope, fenceKey, pageId, raw, spec, storageKey, order?.join(',')])
  return <VersionedFrame raw={raw} streaming={streaming} storageKey={storageKey} scope={scope} fenceKey={fenceKey} pageId={pageId} />
}

/** Prompt asking the model to rewrite the whole page after a failed patch. */
/** G15: composer text asking to fix what the in-frame self-check found (never auto-sent). */
export function selfCheckPrompt(t: (key: string) => string, issues: readonly SandboxSelfCheckIssue[]): string {
  const ranked = [...issues].sort((a, b) => Number(b.serious) - Number(a.serious)).slice(0, 6)
  const lines = ranked.map((x) => {
    const label = t(`sandbox.selfCheck.${x.kind}`)
    const detail = x.detail ? `（${x.detail.slice(0, 80)}）` : ''
    return `- ${label}${x.count > 1 ? ` ×${x.count}` : ''}${detail}`
  })
  return `${t('sandbox.selfCheckPrompt')}\n${lines.join('\n')}`.slice(0, 1800)
}

export function patchRewritePrompt(t: (key: string) => string, reason: string | null): string {
  return `${t('sandbox.patchRewritePrompt')}${reason ? `\n${t('sandbox.reaskProblem')}${reason}` : ''}`
}

export type PatchMerge =
  | { kind: 'ok'; raw: string; base: PageVersion; pageId: string | null; storageKey: string | null; applied: number }
  | { kind: 'no-base'; reason: string }
  | { kind: 'failed'; reason: string; base: PageVersion | null }

/** Resolve + apply a patch fence against the registry (pure apart from the registry read). */
export function mergePatchFence(raw: string, scope: string | undefined, fenceKey: string, order?: readonly number[]): PatchMerge {
  const patch = parseSandboxPatch(raw)
  if (patch === null) return { kind: 'failed', reason: 'empty patch (no ---css / ---replace / ---find … edits)', base: null }
  const wanted = patch.page ? sandboxPageId({ id: patch.page }) : null
  const base = resolvePatchBase(scope, wanted, { fenceKey, ...(order ? { order } : {}) })
  if (base === null) {
    return { kind: 'no-base', reason: wanted ? `no earlier page named "${patch.page}"` : 'no earlier iui-html page in this conversation' }
  }
  const result = applySandboxPatch(base.page, patch)
  if (!result.ok) return { kind: 'failed', reason: result.errors.join('; ') || 'patch changed nothing', base }
  const merged = { ...result.page, ...(base.page.id ? { id: base.page.id } : {}) }
  return { kind: 'ok', raw: serializeSandboxPage(merged), base, pageId: base.pageId, storageKey: base.storageKey, applied: result.applied }
}

/** ```iui-patch: merge into the previous page and render the new version. */
function SandboxPatchFence({ raw, fenceKey, context }: { raw: string; fenceKey: string; context: GenuiFenceContext | undefined }): ReactNode {
  const t = useT()
  const revision = usePageVersionsRevision()
  const [showSource, setShowSource] = useState(false)
  const streaming = context?.streaming === true && context.source === undefined
  const scope = context?.sessionId
  const order = fenceOrder(context)
  const merge = useMemo(
    () => (streaming ? null : mergePatchFence(raw, scope, fenceKey, order)),
    // The registry revision re-resolves when the base page registers late.
    [raw, streaming, scope, fenceKey, order?.join(','), revision],
  )
  const okRaw = merge?.kind === 'ok' ? merge.raw : null
  useEffect(() => {
    if (merge === null || merge.kind !== 'ok') return
    const spec = parseHtmlSandboxFence(merge.raw)
    if (spec === null) return
    registerPageVersion(scope, { fenceKey, pageId: merge.pageId, raw: merge.raw, page: pageFromSpec(spec), storageKey: merge.storageKey, ...(order ? { order } : {}) })
  }, [scope, fenceKey, okRaw, order?.join(',')])
  if (streaming || merge === null) {
    return <div data-iui-patch="streaming"><SandboxSkeleton label={t('sandbox.patchStreaming')} showProgress={false} height={120} /></div>
  }
  if (merge.kind === 'ok') {
    return (
      <div data-iui-patch="ok" data-iui-patch-applied={merge.applied}>
        <VersionedFrame raw={merge.raw} streaming={false} storageKey={merge.storageKey} scope={scope} fenceKey={fenceKey} pageId={merge.pageId} />
      </div>
    )
  }
  return (
    <div data-iui-patch={merge.kind}>
      <ErrorState
        kind="sandbox-patch-error"
        title={merge.kind === 'no-base' ? t('sandbox.patchNoBase') : t('sandbox.patchFailed')}
        detail={merge.reason}
        actions={[
          { label: t('sandbox.patchRewrite'), onClick: () => { void insertIntoComposer(patchRewritePrompt(t, merge.reason)) } },
          { label: showSource ? t('sandbox.patchHideSource') : t('sandbox.patchShowSource'), onClick: () => setShowSource((v) => !v) },
        ]}
      />
      {showSource ? <pre data-iui-patch-source="" style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>{raw}</pre> : null}
    </div>
  )
}

function keyString(key: Key): string {
  return typeof key === 'string' ? key : String(key)
}

/** Registry-channel fence renderer for language `iui-html`. */
export function renderHtmlFence(raw: string, key: Key, _context?: GenuiFenceContext): ReactNode {
  return <SandboxPageFence key={key} raw={raw} fenceKey={keyString(key)} context={_context} />
}

/** F24: registry-channel fence renderer for language `iui-patch`. */
export function renderPatchFence(raw: string, key: Key, context?: GenuiFenceContext): ReactNode {
  return <SandboxPatchFence key={key} raw={raw} fenceKey={keyString(key)} context={context} />
}
