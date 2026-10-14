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
import { getAppDataSnapshot, subscribeBindings } from './binding-store.ts'
import { insertIntoComposer } from './composer-bridge.ts'

/** Persist sandbox interactive state across host contentWiped remounts (same fence body). */
const localStateByFence = new Map<string, Record<string, unknown>>()

function fenceStateKey(raw: string): string {
  const body = raw.trim()
  if (body.length <= 160) return body
  return `${body.slice(0, 80)}|${body.length}|${body.slice(-80)}`
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
  'Please regenerate the UI with a closed ```iui-html fence; itinerary cards must include Wikimedia photos and credits.'

function reaskPrompt(t: (key: string) => string): string {
  const custom = t('sandbox.reaskPrompt')
  if (custom && custom !== 'sandbox.reaskPrompt') return custom
  return REASK_PROMPT_FALLBACK
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

export function HtmlSandboxFrame({ raw }: { raw: string }): ReactNode {
  const t = useT()
  const designTokens = useDesignTokens()
  const reactId = useId().replace(/:/g, '')
  const frameId = useMemo(() => `iui-html-${reactId}`, [reactId])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const onAction = useGenuiAction()
  const [reloadToken, setReloadToken] = useState(0)
  const [autoHeight, setAutoHeight] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<SandboxFailKind | null>(null)
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [starterOverride, setStarterOverride] = useState<string | null>(null)
  /** P1-STATE: prefer injecting author JS into frozen preview (no srcdoc rebuild). */
  const authorJsRanRef = useRef(false)
  const usedPreviewShellRef = useRef(false)
  const lockedFinalRef = useRef(false)
  const [forceFinalSrcdoc, setForceFinalSrcdoc] = useState(false)
  const effectiveRaw = starterOverride ?? raw
  const parsed = useMemo(() => parseHtmlSandboxFence(effectiveRaw), [effectiveRaw])
  const cssComplete = parsed?.cssComplete === true
  const jsComplete = parsed?.jsComplete === true
  // Freeze the iframe identity for the whole stream. Growing css/html/js
  // patches via postMessage — rewriting srcdoc blanks the document (flicker).
  const srcdocRebuildKey = htmlSandboxSrcdocRebuildKey({
    parsed,
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
      // Final keys embed author JS; preview-shell always defers (inject via runAuthorJs).
      deferAuthorJs: !srcdocRebuildKey.startsWith('final'),
    }) : null),
    // keyed by srcdocRebuildKey (not every html/css chunk)
    [srcdocRebuildKey, designTokens, frameId],
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
    setFullscreen(false)
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
  useEffect(() => {
    if (!ready) return
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
  }, [ready, frameId])

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
            const flat: Record<string, string> = {}
            for (const [k, v] of Object.entries(snap.bindings)) flat[k] = String(v)
            win.postMessage({ source: 'iui-html-host', type: 'bindings', frameId, values: flat }, '*')
            win.postMessage({ source: 'iui-html-host', type: 'appData', frameId, data: snap.appData }, '*')
            win.postMessage({ source: 'iui-html-host', type: 'theme', frameId, tokens: readDesignTokens() }, '*')
            const saved = localStateByFence.get(fenceStateKey(effectiveRaw))
            if (saved) {
              win.postMessage({ source: 'iui-html-host', type: 'restoreLocalState', frameId, state: saved }, '*')
            }
          }
        } catch { /* ignore */ }
        return
      }
      if (event.data.type === 'localState') {
        localStateByFence.set(fenceStateKey(effectiveRaw), event.data.state)
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
        onAction?.(action, payload)
        return
      }
      if (event.data.type === 'sendPrompt') {
        const prompt = event.data.text.trim()
        if (!prompt) return
        void insertIntoComposer(prompt).then((result) => {
          onAction?.('sandbox_send_prompt', { text: prompt, result })
        })
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

  if (parsed === null || srcdoc === null) {
    return (
      <EmptyState
        kind="sandbox"
        detail={raw.trim() === '' ? t('sandbox.parseFail') : `${t('sandbox.parseFail')}\n${raw.slice(0, 200)}`}
        actions={[
          {
            label: t('sandbox.reask'),
            onClick: () => {
              void insertIntoComposer(reaskPrompt(t)).then((result) => {
                onAction?.('sandbox_reask', { result })
              })
            },
          },
        ]}
      />
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
      onAction?.('sandbox_rerun_author_js', {})
    } catch {
      setErrorKind('host')
      setError(friendlyError('failed to post runAuthorJs(force)', t, 'host'))
    }
  }

  const shellStyle: CSSProperties = fullscreen
    ? {
        ...SHELL_STYLE,
        position: 'fixed',
        inset: 12,
        zIndex: 9999,
        maxHeight: 'calc(100vh - 24px)',
        overflow: 'auto',
        boxShadow: '0 16px 48px rgba(15,23,42,.18)',
      }
    : SHELL_STYLE

  return (
    <div style={shellStyle} data-iui-html-sandbox={parsed.partial ? 'partial' : ready ? 'ready' : 'loading'} data-iui-fullscreen={fullscreen ? '1' : '0'}>
      <div style={STAGE_ROW} aria-live="polite">
        {showStreamingStageChrome(parsed, ready) && stages.map((stage) => (
          <span key={stage} style={CHIP}>{stageLabel(stage, t)}</span>
        ))}
        {showStreamingStageChrome(parsed, ready) && <span>{statusLabel(parsed, ready, t)}</span>}
        {parsed.partial && !ready && <span>{t('sandbox.partialHint')}</span>}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={TOOLBAR_BTN}
          onClick={() => {
            setReloadToken((n) => n + 1)
            setError(null)
            setErrorKind(null)
          }}
        >
          {t('sandbox.reload')}
        </button>
        {jsComplete && (
          <button
            type="button"
            style={TOOLBAR_BTN}
            title={t('sandbox.authorFailHint')}
            onClick={() => rerunAuthorJsOnly()}
          >
            {t('sandbox.rerunAuthorJs')}
          </button>
        )}
        <button
          type="button"
          style={TOOLBAR_BTN}
          onClick={() => {
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
          style={TOOLBAR_BTN}
          onClick={async () => {
            const ok = await copyText(effectiveRaw)
            setCopied(ok)
            if (ok) setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? t('sandbox.copied') : t('sandbox.copy')}
        </button>
        <button
          type="button"
          style={TOOLBAR_BTN}
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? t('sandbox.exitFullscreen') : t('sandbox.fullscreen')}
        </button>
      </div>
      {error !== null && (
        <ErrorState
          kind={errorKind === 'host' ? 'sandbox-host-error' : 'sandbox-author-error'}
          detail={error}
          actions={[
            ...(jsComplete
              ? [{ label: t('sandbox.rerunAuthorJs'), onClick: () => rerunAuthorJsOnly() }]
              : []),
            { label: t('sandbox.reload'), onClick: () => { setReloadToken((n) => n + 1); setError(null); setErrorKind(null) } },
            {
              label: t('sandbox.reask'),
              onClick: () => {
                void insertIntoComposer(reaskPrompt(t)).then((result) => {
                  onAction?.('sandbox_reask', { result })
                })
              },
            },
            { label: t('sandbox.dismissError'), onClick: () => { setError(null); setErrorKind(null) } },
          ]}
        />
      )}
      <iframe
        ref={iframeRef}
        key={srcdocRebuildKey}
        title={parsed.title ?? 'IUI sandbox'}
        srcDoc={srcdoc}
        sandbox="allow-scripts allow-modals"
        referrerPolicy="no-referrer"
        style={{ ...FRAME_STYLE, height }}
        onLoad={() => {
          requestMeasure()
          // Handshake fallback: complete fences should not stay on 加载中 if ready postMessage is lost.
          if (!parsed.partial) setReady(true)
        }}
      />
    </div>
  )
}

/** Registry-channel fence renderer for language `iui-html`. */
export function renderHtmlFence(raw: string, key: Key, _context?: GenuiFenceContext): ReactNode {
  return <HtmlSandboxFrame key={key} raw={raw} />
}
