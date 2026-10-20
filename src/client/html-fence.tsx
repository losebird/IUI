/**
 * ```iui-html fence renderer — open sandbox iframe (css → html → js).
 * Productized chrome: streaming stages, reload, download, dismissible errors,
 * empty/partial placeholders, auto-height + action loop.
 */
import {
  useEffect,
  useId,
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
import { useT } from './i18n/index.ts'
import {
  getActiveTheme,
  getCustomTokens,
  isHostDarkTheme,
  subscribeActiveTheme,
  themeToStyle,
} from './theme/apply-theme.ts'
import { getActivePackId } from './theme/apply-pack.ts'
import { EmptyState, ErrorState } from './ui/StatusBlock.tsx'
import { SandboxSkeleton, sandboxStreamProgress } from './sandbox-skeleton.tsx'
import { acquireBindingWatch, getAppDataSnapshot, subscribeBindings } from './binding-store.ts'
import { getRuntimeConfigSnapshot, subscribeRuntimeConfig } from './runtime-config.ts'
import { insertIntoComposer } from './composer-bridge.ts'
import { loadPageState, pageStateKey, PAGE_STATE_QUOTA_BYTES, peekPageState, sanitizeStorageItems, updatePageState, type PageStateRecord } from './page-storage.ts'
import { capActionPayload, createFrameActionGate, type ActionVerdict, type FrameActionGate } from './action-gate.ts'

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

/** F6: silence longer than this marks the frame「无响应」. */
const SANDBOX_HUNG_MS = 5000

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

function clampHeight(height: number, fallback: number): number {
  if (!Number.isFinite(height)) return fallback
  return Math.min(2400, Math.max(120, Math.round(height)))
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
    URL.revokeObjectURL(url)
  } catch { /* ignore */ }
}

type ShareSnapshot = { html: string; css: string; state: Record<string, unknown> }

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
      finish({ html: data.html, css: data.css, state })
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
  const reactId = useId().replace(/:/g, '')
  const frameId = useMemo(() => `iui-html-${reactId}`, [reactId])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const onAction = useGenuiAction()
  /** F3: every outbound action/sendPrompt from this frame passes the gate. */
  const actionGateRef = useRef<FrameActionGate | null>(null)
  if (actionGateRef.current === null) actionGateRef.current = createFrameActionGate()
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
        return
      }
      done = true
      window.clearTimeout(timer)
      seedRef.current = record
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
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<SandboxFailKind | null>(null)
  const [copied, setCopied] = useState(false)
  /** F11: native = Fullscreen API; overlay = fixed in place; portal = fixed under body (transformed ancestor). */
  const [fsMode, setFsMode] = useState<FullscreenMode>('off')
  const fullscreen = fsMode !== 'off'
  const fsButtonRef = useRef<HTMLButtonElement | null>(null)
  const prevFsModeRef = useRef<FullscreenMode>('off')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [starterOverride, setStarterOverride] = useState<string | null>(null)
  /** P1-STATE: prefer injecting author JS into frozen preview (no srcdoc rebuild). */
  const authorJsRanRef = useRef(false)
  const usedPreviewShellRef = useRef(false)
  const lockedFinalRef = useRef(false)
  const [forceFinalSrcdoc, setForceFinalSrcdoc] = useState(false)
  const effectiveRaw = starterOverride ?? raw
  const parsed = useMemo(() => parseHtmlSandboxFence(effectiveRaw), [effectiveRaw])
  const cssComplete = parsed?.cssComplete === true
  // Section-format bodies (`---css/---html/---js`) cannot tell a finished js
  // section from one still streaming — only JSON closes its strings. Hold the
  // author JS until the host message settles so half-written JS never runs.
  const sectionFormat = parsed !== null && !effectiveRaw.trimStart().startsWith('{')
  const shellRef = useRef<HTMLDivElement | null>(null)
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
      brandId: getActivePackId(),
      mergePackTokens: false, // already merged above
      // F4: opt-in strict image policy (Settings → IUI).
      strictImages,
      ...(seedRef.current?.items ? { storageSeed: seedRef.current.items } : {}),
      // Final keys embed author JS; preview-shell always defers (inject via runAuthorJs).
      deferAuthorJs: !srcdocRebuildKey.startsWith('final'),
      // C6: libraries from the plugin's own asset route first, CDNs as fallback.
      ...((): { assetBase?: string } => { const assetBase = sandboxAssetBase(); return assetBase ? { assetBase } : {} })(),
    }) : null),
    // keyed by srcdocRebuildKey (not every html/css chunk)
    [srcdocRebuildKey, designTokens, frameId, strictImages, storageReady],
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
    let html = sanitizeSandboxMarkup(enrichPlaceMediaHtml(parsed.html))
    if (html.length > HTML_SANDBOX_MAX_HTML_BYTES) {
      html = `${html.slice(0, HTML_SANDBOX_MAX_HTML_BYTES)}\n<!-- html truncated -->`
    }
    const css = sanitizeSandboxCss(parsed.css)
    try {
      win.postMessage({ source: 'iui-html-host', type: 'previewCss', frameId, css }, '*')
      win.postMessage({ source: 'iui-html-host', type: 'previewHtml', frameId, html }, '*')
    } catch { /* ignore */ }
  }, [ready, parsed, frameId, srcdocRebuildKey])

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
      let html = sanitizeSandboxMarkup(enrichPlaceMediaHtml(parsed.html))
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
  }, [ready, parsed, cssComplete, jsComplete, frameId, forceFinalSrcdoc, starterOverride, srcdocRebuildKey])

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
        setAutoHeight(clampHeight(event.data.height, baseHeight))
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
      if (event.data.type === 'error') {
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
      if (event.data.type === 'authorSettled') {
        // Chunk failures already posted as error; if settled with failures and no strip yet, surface a host chrome tip.
        if (event.data.ok === false && event.data.failedChunks && event.data.failedChunks > 0) {
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
        void insertIntoComposer(prompt.slice(0, 2000))
        return
      }
      if (event.data.type === 'copyText') {
        // D8: only on a real click inside the frame (user activation propagates to the host).
        const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
        if (activation !== undefined && !activation.isActive) return
        try { void navigator.clipboard?.writeText(event.data.text).catch(() => {}) } catch { /* ignore */ }
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
  }, [srcdocRebuildKey])
  useEffect(() => {
    if (stopped) return
    const timer = window.setInterval(() => {
      if (lastBeatRef.current === 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        lastBeatRef.current = Date.now()
        return
      }
      if (Date.now() - lastBeatRef.current > SANDBOX_HUNG_MS) setHung(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stopped])

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
        <SandboxSkeleton label={t(`sandbox.skeleton.${prog.phase}`)} pct={prog.pct} height={clampHeight(baseHeight, 220)} />
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

  const height = autoHeight ?? clampHeight(baseHeight, 360)
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
      {/* D9: only 全屏 + ⋯ ; 重跑页面脚本 lives in the error strip. */}
      <button
        ref={fsButtonRef}
        type="button"
        style={TOOLBAR_BTN}
        data-iui-fullscreen-toggle="1"
        aria-pressed={fullscreen}
        onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
      >
        {fullscreen ? t('sandbox.exitFullscreen') : t('sandbox.fullscreen')}
      </button>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          style={{ ...TOOLBAR_BTN, padding: '5px 9px', letterSpacing: 1 }}
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
            <button
              type="button"
              role="menuitem"
              style={MENU_ITEM}
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
              style={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                void (async () => {
                  const snap = await requestSandboxSnapshot(iframeRef.current, frameId)
                  const html = buildSandboxDownloadHtml(parsed, {
                    designTokens: mergeSandboxDesignTokens(designTokens, getActivePackId()),
                    frameId: 'download',
                    brandId: getActivePackId(),
                    mergePackTokens: false,
                    ...(snap && snap.html.trim() ? { liveHtml: snap.html, liveCss: snap.css, liveState: snap.state } : {}),
                  })
                  const name = `${(parsed.title ?? 'iui-sandbox').replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 48) || 'iui-sandbox'}.html`
                  downloadText(name, html)
                })()
              }}
            >
              {t('sandbox.download')}
            </button>
            <button
              type="button"
              role="menuitem"
              style={MENU_ITEM}
              onClick={async () => {
                const ok = await copyText(effectiveRaw)
                setCopied(ok)
                if (ok) setTimeout(() => { setCopied(false); setMenuOpen(false) }, 900)
                else setMenuOpen(false)
              }}
            >
              {copied ? t('sandbox.copied') : t('sandbox.copy')}
            </button>
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
      {error !== null && (
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
          key={stopped ? `${srcdocRebuildKey}:stopped` : srcdocRebuildKey}
          title={parsed.title ?? 'IUI sandbox'}
          // F6: no allow-modals — the bridge turns alert/confirm/prompt into an in-page toast.
          srcDoc={stopped ? stoppedSrcdoc(t('sandbox.stopped')) : srcdoc}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{ ...FRAME_STYLE, height: fullscreen ? '100%' : height }}
          onLoad={() => {
            if (stopped) return
            requestMeasure()
            // Handshake fallback: complete fences should not stay on 加载中 if ready postMessage is lost.
            if (!parsed.partial) setReady(true)
          }}
        />}
        {!storageReady && <SandboxSkeleton label={t('sandbox.skeleton.loading')} height={fullscreen ? '100%' : height} showProgress={false} />}
        {storageReady && parsed.partial && !stopped && parsed.html.trim() === '' && (() => {
          const prog = sandboxStreamProgress(parsed)
          return <SandboxSkeleton overlay label={t(`sandbox.skeleton.${prog.phase}`)} pct={prog.pct} />
        })()}
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

/** Registry-channel fence renderer for language `iui-html`. */
export function renderHtmlFence(raw: string, key: Key, _context?: GenuiFenceContext): ReactNode {
  return (
    <HtmlSandboxFrame
      key={key}
      raw={raw}
      streaming={_context?.streaming === true && _context.source === undefined}
      storageKey={pageStateKey(_context?.sessionId, typeof key === 'string' ? key : String(key))}
    />
  )
}
