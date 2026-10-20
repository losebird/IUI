/**
 * D10: streaming skeleton + stage progress for ```iui-html (no blank flashes).
 * Shown while the fence body is still empty / CSS-only, before the first
 * frame paints, and while page storage is loading.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { HtmlSandboxSpec } from '../shared/html-sandbox.ts'

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

const SKELETON_CSS = `
.iui-fence-sk{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:12px;border:1px solid var(--dsw-alias-separator-default,rgba(0,0,0,.08));background:var(--dsw-alias-bg-elevated,transparent);box-sizing:border-box;width:100%;overflow:hidden}
.iui-fence-sk .sk-row{display:flex;gap:10px}
.iui-fence-sk .sk{border-radius:8px;background:linear-gradient(90deg,rgba(127,127,127,.10),rgba(127,127,127,.20),rgba(127,127,127,.10));background-size:200% 100%;animation:iuiFenceSk 1.3s ease infinite}
.iui-fence-sk .sk.line{height:12px;border-radius:999px}
.iui-fence-sk .sk.block{flex:1;height:64px}
.iui-fence-sk .sk-progress{height:3px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden}
.iui-fence-sk .sk-progress>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-accent,#185FA5);transition:width .35s ease}
.iui-fence-sk .sk-label{font-size:12px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#6b7280)}
@keyframes iuiFenceSk{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.iui-fence-sk .sk{animation:none}.iui-fence-sk .sk-progress>i{transition:none}}
`

export function SandboxSkeleton({
  label,
  pct,
  height,
  overlay = false,
  showProgress = true,
}: {
  label: string
  pct?: number
  height?: number | string
  overlay?: boolean
  showProgress?: boolean
}): ReactNode {
  const style: CSSProperties = overlay
    ? { position: 'absolute', inset: 0, zIndex: 1 }
    : { minHeight: height ?? 180 }
  const p = Math.max(0, Math.min(100, Math.round(pct ?? 0)))
  return (
    <div className="iui-fence-sk" style={style} data-iui-html-skeleton="1" aria-busy="true" role="status" aria-live="polite">
      <style>{SKELETON_CSS}</style>
      <div className="sk line" style={{ width: '42%' }} />
      <div className="sk line" style={{ width: '68%', opacity: 0.8 }} />
      <div className="sk-row">
        <div className="sk block" />
        <div className="sk block" />
        <div className="sk block" />
      </div>
      <div className="sk line" style={{ width: '88%', opacity: 0.7 }} />
      {showProgress && (
        <div className="sk-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
          <i style={{ width: `${p}%` }} />
        </div>
      )}
      <div className="sk-label">{label}</div>
    </div>
  )
}
