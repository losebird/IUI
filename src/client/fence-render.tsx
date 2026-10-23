/**
 * The dsh-ui fence render pipeline, shared by both render channels:
 *
 * - **Registry channel** (contract hosts): the host's MarkdownText resolves
 *   ```dsh-ui fences through the fence-registry extension point and calls
 *   {@link renderGenuiFence} with a session-scoped context (sessionId + the
 *   settled source identity). An unrepairable body renders {@link FenceFallback}.
 * - **DOM channel** (pristine hosts, no extension point): the DOM observer
 *   (`dom-fence.ts`) finds stock code blocks labelled `dsh-ui` and mounts
 *   {@link renderResolvedFenceNode} into its own React root, wrapped in the
 *   plugin-owned action context. An unrepairable body returns `null` so the
 *   stock code block stays visible, with {@link FenceDiagnostic} mounted above
 *   it so the defect is never silent (issue #158).
 *
 * Structural types are declared locally on purpose: the context contract is
 * a data shape, and pristine hosts do not export the host-side type names.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type Key, type ReactNode } from 'react'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { codeBlockLabels } from './primitive-labels.ts'
import { t, useT } from './i18n/index.ts'
import { parseHtmlSandboxFence } from '../shared/html-sandbox.ts'
import { renderHtmlFence } from './html-fence.tsx'
import { isLegacyFencesEnabled, subscribeRuntimeConfig } from './runtime-config.ts'
import type { GenuiSpec } from './spec.ts'
import { describeJsonFailure } from '../shared/fence-repair.ts'
import { resolveFence, type FenceResolution } from '../shared/fence-resolve.ts'

/** Settled fence source identity (data shape, host-independent). */
export interface GenuiFenceSource {
  /** Stable structural id, e.g. `['assistant', seq, block, fence]` or `dom:<anchor>:<i>`. */
  readonly id: string
  /** Three-part order: [messageSeq, textBlockIndex, fenceIndex]. */
  readonly order: readonly [number, number, number]
}

/** Context a fence renderer receives beside the raw source and React key. */
export interface GenuiFenceContext {
  /** Owning session route; absent outside a session-scoped render. */
  readonly sessionId?: string
  /** Present only for settled/interrupted renders with a stable identity. */
  readonly source?: GenuiFenceSource
  /** True while the host message still carries [data-streaming]. */
  readonly streaming?: boolean
}

const FENCE_ERROR_STYLE: CSSProperties = {
  margin: '0 0 6px',
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(239, 68, 68, 0.14)',
  border: '1px solid rgba(239, 68, 68, 0.4)',
  color: '#f87171',
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

/** Format chart-specific process errors without maintaining a second validator. */
function formatChartProcessErrors(errors: string[]): string | null {
  const chartErrors = errors.filter(error => /(?:variant is unsupported|kind must be bars, line, or donut|requires data or series|(?:data|series) is required for|(?:\.data|\.series)(?:\[\d+\])?(?:\.(?:data|label|value|color))? must|series is only supported for bars)/.test(error))
  return chartErrors.length === 0 ? null : chartErrors.join('；')
}

/** Return a semantic/schema diagnostic from the unified fence resolution. */
function processSemanticFailure(resolution: FenceResolution): string | null {
  if (resolution.spec !== null || resolution.processed === null) return null
  const chartErrors = formatChartProcessErrors(resolution.processed.errors)
  return chartErrors === null
    ? t('err.fieldValidation', { errors: resolution.processed.errors.join('；') })
    : t('err.chartValidation', { errors: chartErrors })
}

/**
 * Fallback for a ```dsh-ui fence whose body has no finished component yet.
 * Two very different situations land here and they must not be conflated:
 *
 * 1. **Streaming partial** — the reply is still being written and the JSON
 *    simply is not complete. The host marks the streaming message with
 *    `[data-streaming]` on the AssistantMarkdown root, which is an ancestor
 *    of every fence. While that marker is present, a plain code block is the
 *    correct rendering (partial JSON must never look like an error).
 *
 * 2. **Settled defect** — the message is finished but the body still does
 *    not parse as JSON (a malformed fence like a missing `}`) or violates the
 *    native chart contract. This used to fail silently: the fence degraded to
 *    a code block with no hint, and the author had no way to know the UI never
 *    rendered. Once the streaming marker is gone, surface a compact diagnostic
 *    so the defect is visible instead of silent.
 */
/**
 * Explain why a ```dsh-ui body cannot render, as the one-line message both
 * channels show. Returns null when there is nothing to report (the body is
 * renderable, or it is an empty/streaming half).
 *
 * @param raw - the raw fence body.
 * @param options - whether settled-only structural repair may be used.
 * @returns the diagnostic text, or null.
 */
export function describeFenceFailure(raw: string, options: { settled?: boolean } = {}): string | null {
  const resolution = resolveFence(raw, { settled: options.settled ?? true })
  if (resolution.spec !== null) return null
  const processDiagnostic = processSemanticFailure(resolution)
  if (processDiagnostic !== null) {
    return t('err.fenceKeptAsCode', { diagnostic: processDiagnostic })
  }
  if (raw.trim() === '') return null
  const parseDiagnostic = describeJsonFailure(raw)
  if (parseDiagnostic === null) return null
  return t('err.fenceParse', { diagnostic: parseDiagnostic })
}

/**
 * The visible diagnostic for a settled, unrenderable ```dsh-ui body.
 *
 * Shared by both channels: the registry channel renders it above its own
 * fallback code block, the DOM channel above the host's stock code block. A
 * fence that keeps degrading to raw JSON must say why it degraded — the
 * console-only path left the defect invisible (issues #158/#172).
 *
 * @param raw - the raw fence body.
 * @returns the alert strip, or null when the body has nothing to report.
 */
export function FenceDiagnostic({ raw, settled = false }: { raw: string; settled?: boolean }): ReactNode {
  // Subscribe so a language switch re-renders an already-visible diagnostic.
  useT()
  const message = describeFenceFailure(raw, { settled })
  if (message === null) return null
  return <div style={FENCE_ERROR_STYLE} role="alert">{message}</div>
}

function FenceFallback({ raw, fenceKey }: { raw: string; fenceKey: Key }) {
  // Subscribed for the CodeBlock copy labels below.
  useT()
  const ref = useRef<HTMLDivElement | null>(null)
  const [settled, setSettled] = useState(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (node !== null && node.closest('[data-streaming]') === null) setSettled(true)
  })
  const diagnostic = settled ? <FenceDiagnostic raw={raw} /> : null
  return (
    <div ref={ref}>
      {diagnostic}
      <CodeBlock key={fenceKey} {...codeBlockLabels()} code={`${raw}\n`} lang="dsh-ui" />
    </div>
  )
}

/**
 * Resolve a raw fence body to a guarded spec.
 *
 * - Tier-1 repair (quote escape + trailing commas): safe at any time —
 *   adopted only when the whole body parses, so a still-growing streaming
 *   half keeps falling back to the code block, never flashing a banner.
 * - Tier-2 completion (missing quotes/brackets): settled renders only —
 *   `context.source` exists exclusively once the message finished, so
 *   streaming halves are never completed early.
 * - Native chart semantics are checked before repair on every candidate so
 *   aliases, empty collections, or line/donut series cannot repair into a
 *   default/blank chart.
 */
export function resolveGenuiFence(raw: string, context?: GenuiFenceContext): FenceResolution {
  const settled = context?.source !== undefined
  const stableSeed =
    context?.sessionId && context?.source
      ? `${context.sessionId}:${context.source.id}`
      : context?.sessionId
        ? `${context.sessionId}:${raw.slice(0, 64)}`
        : undefined
  return resolveFence(raw, {
    settled,
    ...(context?.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
    ...(stableSeed !== undefined ? { stableSeed } : {}),
  })
}

export function resolveGenuiSpec(raw: string, context?: GenuiFenceContext): GenuiSpec | null {
  return resolveGenuiFence(raw, context).spec
}

/** Sandbox-first legacy notice (catalog GenuiBlock / panel removed). */
function renderLegacyCatalogTip(key: Key): ReactNode {
  return (
    <div
      key={key}
      data-iui-legacy-catalog="1"
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        // Rendered outside GenuiBlock, where --dsl-g-* are unset: fall back to host tokens, not white.
        border: '1px solid var(--dsl-g-border-surface, var(--dsw-alias-border-l2, #e5e7eb))',
        background: 'var(--dsl-g-surface, var(--dsw-alias-bg-layer-1, #fff))',
        fontSize: 13,
        color: 'var(--dsw-alias-label-secondary, #374151)',
        lineHeight: 1.5,
      }}
    >
      <strong>目录组件卡已移除。</strong>请改用 <code>{'```iui-html'}</code> 自由页（HTML/CSS/JS 沙箱）。
    </div>
  )
}

/**
 * DOM-channel resolved fence: sandbox mounts; catalog/panel GenuiBlock blocked
 * (aligned with registry {@link renderGenuiFence}). Returns a tip node so the
 * stock code block stays hidden rather than flashing raw JSON.
 */
export function renderResolvedFenceNode(raw: string, key: Key, context?: GenuiFenceContext): ReactNode | null {
  // P1-N2: never render ExportableGenuiBlock / panel publisher on DOM channel.
  if (parseHtmlSandboxFence(raw) !== null) {
    return renderHtmlFence(raw, key, context)
  }
  // Unrepairable / incomplete bodies stay null so DOM channel keeps stock code
  // block (+ settled diagnostic). Repairable catalog/panel specs → legacy tip.
  const resolution = resolveGenuiFence(raw, context)
  if (resolution.spec === null) return null
  return renderLegacyCatalogTip(key)
}

/**
 * Registry-channel fence renderer (contract hosts): like the resolved node,
 * but an unrepairable body renders the fallback code block + settled
 * diagnostic — the host replaced its own block with our output — and an
 * unpublishable `panel:true` fence renders `null` (nothing in the flow).
 */
export function renderGenuiFence(raw: string, key: Key, context?: GenuiFenceContext, lang: 'iui' | 'dsh-ui' = 'iui'): ReactNode {
  return <LegacyFenceGate key={key} raw={raw} fenceKey={key} lang={lang} {...(context !== undefined ? { context } : {})} />
}

function renderLegacyFence(raw: string, key: Key, context?: GenuiFenceContext): ReactNode {
  // Sandbox-first: legacy ```iui / dsh-ui bodies that look like html sandbox mount here.
  if (parseHtmlSandboxFence(raw) !== null) {
    return renderHtmlFence(raw, key, context)
  }
  return renderLegacyCatalogTip(key)
}

const RENDER_OFFER_STYLE: CSSProperties = {
  font: '12px/1.4 system-ui,sans-serif', padding: '2px 10px', borderRadius: 6,
  border: '1px solid rgba(127,127,127,.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.85,
}

/**
 * F16: deprecated ```iui / ```dsh-ui fences. With the compat switch off they
 * are ordinary code; a settled page body offers「▶ 渲染为页面」.
 */
function LegacyFenceGate({ raw, fenceKey, context, lang }: { raw: string; fenceKey: Key; context?: GenuiFenceContext; lang: 'iui' | 'dsh-ui' }): ReactNode {
  useT()
  const enabled = useSyncExternalStore(subscribeRuntimeConfig, isLegacyFencesEnabled, isLegacyFencesEnabled)
  const [forced, setForced] = useState(false)
  if (enabled || forced) return renderLegacyFence(raw, fenceKey, context)
  const settled = context?.source !== undefined
  const page = settled && parseHtmlSandboxFence(raw) !== null
  return (
    <div data-iui-legacy-fence="code">
      {page && (
        <div data-iui-render-offer="" style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 -2px' }}>
          <button type="button" style={RENDER_OFFER_STYLE} title={t('fence.renderAsPageHint')} onClick={() => { setForced(true) }}>
            {t('fence.renderAsPage')}
          </button>
        </div>
      )}
      <CodeBlock {...codeBlockLabels()} code={`${raw}\n`} lang={lang} />
    </div>
  )
}
