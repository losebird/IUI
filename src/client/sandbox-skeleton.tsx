/**
 * D10: streaming skeleton + stage progress for ```iui-html (no blank flashes).
 * Shown while the fence body is still empty / CSS-only, before the first
 * frame paints, and while page storage is loading.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { HtmlSandboxSpec } from '../shared/html-sandbox.ts'
import { useT } from './i18n/index.ts'
import { ChromeIcon, chromeCss as ck } from './chrome/icons.tsx'

export type StreamPhase = 'waiting' | 'css' | 'html' | 'js' | 'loading'

/** Monotone-ish progress estimate from what has streamed so far (never 100 until done). */
export function sandboxStreamProgress(spec: Pick<HtmlSandboxSpec, 'html' | 'css' | 'js' | 'partial'> | null): { phase: StreamPhase; pct: number } {
  if (spec === null) return { phase: 'waiting', pct: 6 }
  if (!spec.partial) return { phase: 'loading', pct: 96 }
  const css = spec.css.trim().length
  const html = spec.html.trim().length
  const js = spec.js.trim().length
  if (js > 0) return { phase: 'js', pct: Math.round(Math.min(95, 75 + js / 400)) }
  if (html > 0) return { phase: 'html', pct: Math.round(Math.min(74, 35 + html / 400)) }
  if (css > 0) return { phase: 'css', pct: Math.round(Math.min(34, 12 + css / 200)) }
  return { phase: 'waiting', pct: 6 }
}

/** F21: non-empty lines streamed so far (shown as「已写 N 行」). */
export function streamedLineCount(raw: string): number {
  let n = 0
  for (const line of raw.split('\n')) if (line.trim()) n++
  return n
}

/** visual(⑪): "12.4 KB" for the 已接收 counter (UTF-8 bytes of what streamed). */
export function formatReceived(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** UTF-8 byte length without allocating a Blob per streamed chunk. */
export function utf8Bytes(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++ }
    else n += 3
  }
  return n
}

const SKELETON_CSS = `
.iui-fence-sk{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));background:var(--dsw-alias-bg-base,transparent);box-sizing:border-box;width:100%;overflow:hidden}
.iui-fence-sk .sk-row{display:flex;gap:10px}
.iui-fence-sk .sk{border-radius:10px;background:linear-gradient(90deg,rgba(127,127,127,.09),rgba(127,127,127,.18),rgba(127,127,127,.09));background-size:200% 100%;animation:iuiFenceSk 1.3s ease infinite}
.iui-fence-sk .sk.line{height:12px;border-radius:999px}
.iui-fence-sk .sk.block{flex:1;height:64px}
.iui-fence-sk .sk.wide{height:72px}
.iui-fence-sk .sk-progress{height:3px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden}
.iui-fence-sk .sk-progress>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-label-primary,#0f1115);opacity:.55;transition:width .35s ease}
.iui-fence-sk .sk-title{font-size:15px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-primary,#1f2937);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes iuiFenceSk{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.iui-fence-sk .sk{animation:none}.iui-fence-sk .sk-progress>i{transition:none}}
`

export function SandboxSkeleton({
  label,
  pct,
  height,
  overlay = false,
  showProgress = true,
  title,
  received,
}: {
  label: string
  /** F21: fence `title:` as soon as the header has streamed. */
  title?: string
  pct?: number
  height?: number | string
  overlay?: boolean
  showProgress?: boolean
  /** visual(⑪): bytes streamed so far →「已接收 12.4 KB」. */
  received?: number
}): ReactNode {
  const t = useT()
  const style: CSSProperties = overlay
    ? { position: 'absolute', inset: 0, zIndex: 1 }
    : { minHeight: height ?? 180 }
  const p = Math.max(0, Math.min(100, Math.round(pct ?? 0)))
  return (
    <div className={`iui-fence-sk ${ck.root}`} style={style} data-iui-html-skeleton="1" aria-busy="true" role="status" aria-live="polite">
      <style>{SKELETON_CSS}</style>
      <div className={ck.skHead}>
        <ChromeIcon name="loader-circle" size={15} className={ck.spin} />
        <span className={`sk-label ${ck.skHeadLabel}`}>{label}</span>
        {received !== undefined && received > 0 && (
          <span className={ck.skHeadMeta} data-iui-skeleton-received={received}>
            {t('sandbox.skeleton.received').replace('{size}', formatReceived(received))}
          </span>
        )}
      </div>
      {title ? <div className="sk-title">{title}</div> : <div className="sk line" style={{ width: '42%' }} />}
      <div className="sk-row">
        <div className="sk block" />
        <div className="sk block" />
        <div className="sk block" />
      </div>
      <div className="sk wide" />
      {showProgress && (
        <div className="sk-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
          <i style={{ width: `${p}%` }} />
        </div>
      )}
    </div>
  )
}

/**
 * F21: phase 2 of streaming — the static page is visible (no JS yet); this
 * pill says it is still being written and becomes interactive when done.
 */
export function SandboxStreamingPill({ label }: { label: string }): ReactNode {
  return (
    <div
      data-iui-stream-pill="1"
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 2, maxWidth: '70%', padding: '3px 10px', borderRadius: 999,
        fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary,#4b5563)',
        background: 'var(--dsw-alias-bg-elevated,rgba(255,255,255,.92))', border: '1px solid var(--dsw-alias-separator-default,rgba(0,0,0,.08))',
        boxShadow: '0 2px 8px rgba(0,0,0,.06)', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </div>
  )
}
