/**
 * Advanced family: callout/steps/keyvalue, plot/diff/json/code, tabs and
 * accordion containers (recursing through renderNode), copy, mermaid,
 * scene3d, timeline, file-tree, quiz, breadcrumb.
 * @module @losebird/iui/client/blocks/advanced
 */
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CodeBlock, DiffBlock, JsonTree, writeClipboard } from '../primitive-adapter.ts'
import { renderInline } from '../inline.ts'
import css from '../GenuiBlock.module.css'
import { GENUI_LIMITS } from '../genui-runtime/index.ts'
import { PlotBlock } from '../PlotBlock.tsx'
import { renderNode } from './render-node.tsx'
import { codeBlockLabels, diffBlockLabels, jsonTreeLabels } from '../primitive-labels.ts'
import { useT } from '../i18n/index.ts'
import { EmptyState } from '../ui/StatusBlock.tsx'
import {
  buildDefaultMapLinks,
  resolveMapSurface,
} from '../../shared/map-embed.ts'
import type { AnswersState, GenuiBlockProps } from './state.ts'
import type {
  GenuiAccordion, GenuiBreadcrumb, GenuiCallout, GenuiCode, GenuiCopy, GenuiDiff, GenuiFileTree, GenuiFileTreeNode,
  GenuiChips, GenuiEntity, GenuiJson, GenuiKeyValue, GenuiMap, GenuiMermaid, GenuiPlot, GenuiQuiz, GenuiScene3D, GenuiSteps, GenuiTabs, GenuiTimeline,
} from '../spec.ts'

const CALLOUT_TONES: Record<string, string> = {
  info: css.calloutInfo!, success: css.calloutSuccess!, warning: css.calloutWarning!, error: css.calloutError!,
}

/** Callout: a tinted notice box with an optional heading. */
export const CalloutNode = memo(function CalloutNode({ node }: { node: GenuiCallout }) {
  const tone = node.tone ?? 'info'
  const toneClass = CALLOUT_TONES[tone] ?? css.calloutInfo
  return (
    <div className={`${css.callout} ${toneClass}`} data-genui-callout>
      {node.title !== undefined && <div className={css.calloutTitle}>{renderInline(node.title)}</div>}
      <div className={css.calloutBody}>{renderInline(node.content)}</div>
    </div>
  )
})

/** Steps: interactive vertical checklist — local check + expand/collapse. */
export const StepsNode = memo(function StepsNode({ steps }: { steps: GenuiSteps }) {
  const t = useT()
  const list = steps.steps.slice(0, GENUI_LIMITS.maxSteps)
  const checkable = steps.checkable !== false
  const expandable = steps.expandable !== false
  const initialDone = Math.max(0, Math.min(steps.current ?? 0, list.length))
  const [done, setDone] = useState<ReadonlySet<number>>(() => {
    const seed = new Set<number>()
    for (let i = 0; i < initialDone; i++) seed.add(i)
    return seed
  })
  const [open, setOpen] = useState<number | null>(() => {
    for (let i = 0; i < list.length; i++) {
      if (i >= initialDone) return i
    }
    return list.length > 0 ? 0 : null
  })

  const toggleDone = (index: number): void => {
    if (!checkable) return
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const firstOpen = (() => {
    for (let i = 0; i < list.length; i++) {
      if (!done.has(i)) return i
    }
    return -1
  })()
  const progress = list.length === 0 ? 0 : Math.round((done.size / list.length) * 100)

  if (list.length === 0) {
    return <EmptyState kind="steps" />
  }

  return (
    <div className={css.stepsWrap} data-genui-steps data-checkable={checkable || undefined}>
      {checkable && list.length > 0 && (
        <div className={css.stepsProgress} aria-live="polite">
          <span className={css.stepsProgressLabel}>
            {t('block.stepsProgress', { done: done.size, total: list.length })}
          </span>
          <div className={css.stepsProgressTrack} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className={css.stepsProgressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <ol className={css.steps}>
        {list.map((step, i) => {
          const isDone = done.has(i)
          const isActive = !isDone && i === firstOpen
          const hasBody = typeof step.desc === 'string' && step.desc.length > 0
          const isOpen = expandable ? open === i : true
          return (
            <li
              key={i}
              className={`${css.step} ${isDone ? css.stepDone : ''} ${isActive ? css.stepActive : ''}`}
            >
              {checkable ? (
                <button
                  type="button"
                  className={css.stepMarker}
                  aria-pressed={isDone}
                  aria-label={isDone ? t('block.stepsUncheck', { n: i + 1 }) : t('block.stepsCheck', { n: i + 1 })}
                  onClick={() => toggleDone(i)}
                >
                  {isDone ? '✓' : String(i + 1)}
                </button>
              ) : (
                <span className={css.stepMarker}>{isDone ? '✓' : String(i + 1)}</span>
              )}
              <div className={css.stepContent}>
                {expandable && hasBody ? (
                  <button
                    type="button"
                    className={css.stepHead}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span className={css.stepTitle}>{renderInline(step.title, false)}</span>
                    <span className={css.stepChevron} data-open={isOpen} aria-hidden>▸</span>
                  </button>
                ) : (
                  <span className={css.stepTitle}>{renderInline(step.title)}</span>
                )}
                {hasBody && isOpen && (
                  <span className={css.stepDesc}>{renderInline(step.desc!)}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
})

/** KeyValue: a definition list for configs and metadata. */
export const KeyValueNode = memo(function KeyValueNode({ node }: { node: GenuiKeyValue }) {
  const pairs = node.pairs.slice(0, GENUI_LIMITS.maxKeyValuePairs)
  if (pairs.length === 0) return <EmptyState kind="keyvalue" />
  return (
    <dl className={css.keyvalue}>
      {pairs.map((pair, i) => (
        <div key={i} className={css.kvRow}>
          <dt className={css.kvKey}>{renderInline(pair.key)}</dt>
          <dd className={css.kvValue}>{renderInline(pair.value)}</dd>
        </div>
      ))}
    </dl>
  )
})

/** Plot: SVG function plot over the SafeMath evaluator. The series mapping
 * is memoized on the stable spec node so the memo boundary actually skips
 * sibling-state re-renders (a fresh mapped array would defeat it). */
export const PlotNode = memo(function PlotNode({ plot }: { plot: GenuiPlot }) {
  const series = useMemo(
    () => plot.series.slice(0, GENUI_LIMITS.maxPlotSeries)
      .map(s => ({ expr: s.expr, label: s.label, color: s.color, kind: s.kind, params: s.params })),
    [plot],
  )
  return (
    <PlotBlock
      series={series}
      xMin={plot.xMin} xMax={plot.xMax} yMin={plot.yMin} yMax={plot.yMax} title={plot.title}
    />
  )
})

/** Diff: 收编 dsh DiffBlock (same path/oldText/newText shape as DiffHunk). */
export const DiffNode = memo(function DiffNode({ node }: { node: GenuiDiff }) {
  useT()
  return <DiffBlock diffs={node.diffs} labels={diffBlockLabels()} />
})

/** Json: 收编 dsh JsonTree. */
export const JsonNode = memo(function JsonNode({ node }: { node: GenuiJson }) {
  useT()
  const data = node.value
  if (typeof data !== 'object' || data === null) {
    return <div className={css.jsonScalar}>{String(data)}</div>
  }
  return <JsonTree data={data as object | unknown[]} label="JSON" labels={jsonTreeLabels()} copyable />
})

/** Code: 收编 dsh CodeBlock with explicit language. */
export const CodeNode = memo(function CodeNode({ node }: { node: GenuiCode }) {
  useT()
  return <CodeBlock {...codeBlockLabels()} code={node.code.slice(0, GENUI_LIMITS.maxCode)} lang={node.lang} />
})

/**
 * Table: LOCAL sorting (v2.9) — click a header to sort ascending, click
 * again for descending, a third click restores the spec order. Zero model
 * round trip. Numeric cells (numbers or numeric strings) compare numerically;
 * everything else compares as text.
 */
export function TabsNode({ tabs, onAction, depth = 0, answers }: {
  tabs: GenuiTabs
  onAction?: GenuiBlockProps['onAction']
  depth?: number
  answers?: AnswersState | undefined
}) {
  const [active, setActive] = useState(0)
  const uid = useId()
  const list = tabs.tabs.slice(0, GENUI_LIMITS.maxTabs)
  const safeActive = list.length === 0 ? 0 : Math.min(active, list.length - 1)
  const current = list[safeActive]
  useEffect(() => {
    if (list.length === 0) return
    if (safeActive !== active) setActive(safeActive)
  }, [active, safeActive, list.length])
  const move = (next: number): void => {
    if (list.length === 0) return
    const n = (next + list.length) % list.length
    setActive(n)
    document.getElementById(`${uid}-tab-${n}`)?.focus()
  }
  if (list.length === 0) return <EmptyState kind="tabs" />
  return (
    <div className={css.tabs}>
      <div
        className={css.tabBar}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); move(safeActive + 1) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); move(safeActive - 1) }
          else if (e.key === 'Home') { e.preventDefault(); move(0) }
          else if (e.key === 'End') { e.preventDefault(); move(list.length - 1) }
        }}
      >
        {list.map((tab, i) => (
          <button
            key={i}
            id={`${uid}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === safeActive}
            aria-controls={`${uid}-panel-${i}`}
            tabIndex={i === safeActive ? 0 : -1}
            className={`${css.tab} ${i === safeActive ? css.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            {renderInline(tab.label, false)}
          </button>
        ))}
      </div>
      {current !== undefined && (
        <div className={css.col} role="tabpanel" id={`${uid}-panel-${safeActive}`} aria-labelledby={`${uid}-tab-${safeActive}`}>
          {current.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
        </div>
      )}
    </div>
  )
}

/** Radio: one option from a group; local selection state. The group name is
 * useId-based so sibling groups never collide (deterministic per mount).
 *
 * v2.5 aggregation: when `group` is set, the selection is recorded into the
 * block-wide answers registry instead of firing a per-click action — a
 * sibling `submit` node then grades the paper IN PLACE (v2.6, questions
 * carry `answer` data) or collects all groups in ONE action. Without
 * `group`, the legacy per-click action fires. After a local grading the
 * group locks until 重新作答 resets it. */
export function AccordionNode({ node, onAction, depth = 0, answers }: {
  node: GenuiAccordion
  onAction?: GenuiBlockProps['onAction']
  depth?: number
  answers?: AnswersState | undefined
}) {
  const [open, setOpen] = useState<number | null>(0)
  const uid = useId()
  const items = node.items.slice(0, GENUI_LIMITS.maxAccordionItems)
  return (
    <div className={css.accordion}>
      {items.map((item, i) => (
        <div key={i} className={css.accItem}>
          <button
            type="button"
            className={css.accHead}
            id={`${uid}-head-${i}`}
            aria-expanded={open === i}
            aria-controls={`${uid}-body-${i}`}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className={css.accTitle}>{renderInline(item.title, false)}</span>
            <span className={css.accChevron} data-open={open === i} aria-hidden>▸</span>
          </button>
          {open === i && (
            <div className={css.accBody} id={`${uid}-body-${i}`} aria-labelledby={`${uid}-head-${i}`}>
              {item.items.map((c, ci) => renderNode(c, ci, onAction, depth + 1, answers))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

async function writeCopyText(text: string): Promise<boolean> {
  /* oxlint-disable-next-line typescript/no-unnecessary-condition */
  const hasAsyncClipboard = typeof navigator.clipboard?.writeText === 'function'
  const accepted = await writeClipboard(text)
  if (accepted || !hasAsyncClipboard) return accepted

  // ponytail: remove this retry once the host helper falls back after Clipboard API rejection.
  /* oxlint-disable typescript/no-deprecated */
  const exec = typeof document.execCommand === 'function'
    ? document.execCommand.bind(document)
    : undefined
  if (exec === undefined) return false
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  try {
    return exec('copy')
  } catch {
    return false
  } finally {
    el.remove()
  }
  /* oxlint-enable typescript/no-deprecated */
}

/** Copy: a one-click copy chip. The live region is a visually-hidden SIBLING
 * (not inside the button) — button content is atomic to screen readers, so a
 * live region inside it would never announce. */
export const CopyNode = memo(function CopyNode({ node }: { node: GenuiCopy }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`${css.copyChip} ${copied ? css.copyChipDone : ''}`}
        onClick={() => {
          void writeCopyText(node.text).then((ok) => {
            if (ok) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }
          })
        }}
      >
        {copied ? t('label.copiedShort') : renderInline(node.label ?? t('label.copy'), false)}
      </button>
      <span className={css.visuallyHidden} role="status">{copied ? t('label.copiedToClipboard') : ''}</span>
    </>
  )
})

type MermaidRenderState =
  | { status: 'loading' }
  | { status: 'ready'; html: string }
  | { status: 'error' }

/** Mermaid: lazily loaded diagram renderer. */
export const MermaidNode = memo(function MermaidNode({ node }: { node: GenuiMermaid }) {
  const t = useT()
  const [state, setState] = useState<MermaidRenderState>({ status: 'loading' })
  const code = node.code.slice(0, GENUI_LIMITS.maxMermaid)
  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    void (async () => {
      try {
        const m = await import('../mermaid-lazy.ts')
        const svg = await m.renderMermaid(code)
        if (alive) setState({ status: 'ready', html: svg })
      } catch {
        if (alive) setState({ status: 'error' })
      }
    })()
    return () => { alive = false }
  }, [code])
  if (state.status === 'error') return <div className={css.mermaidFallback}><pre>{code}</pre><div className={css.mermaidErr}>{t('block.mermaidError')}</div></div>
  if (state.status === 'loading') return <div className={css.mermaidFallback}><pre>{code}</pre><div className={css.mermaidHint}>{t('block.mermaidLoading')}</div></div>
  return <div className={css.mermaid} dangerouslySetInnerHTML={{ __html: state.html }} data-genui-mermaid />
})

/** Scene3D: three.js WebGL canvas, lazily imported. */
export const Scene3DNode = memo(function Scene3DNode({ node }: { node: GenuiScene3D }) {
  const t = useT()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const ref = useRef<HTMLDivElement | null>(null)
  // Mesh cap mirrored from the guard: a pathological scene never reaches
  // three.js (per-frame cost scales with mesh count).
  const scene = node.meshes.length > GENUI_LIMITS.maxMeshes ? { ...node, meshes: node.meshes.slice(0, GENUI_LIMITS.maxMeshes) } : node
  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import('../scene3d-lazy.ts').then(async m => {
      if (!alive || ref.current === null) return
      try {
        dispose = await m.mountScene(ref.current, scene)
        if (alive) setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })
    return () => { alive = false; dispose?.() }
  }, [scene])
  return (
    <div className={css.scene3dWrap} data-genui-scene3d>
      {node.title !== undefined && <div className={css.scene3dTitle}>{renderInline(node.title)}</div>}
      <div ref={ref} className={css.scene3dCanvas} />
      {status === 'loading' && <div className={css.scene3dHint}>{t('block.scene3dLoading')}</div>}
      {status === 'error' && <div className={css.scene3dHint}>{t('block.scene3dError')}</div>}
    </div>
  )
})

/** Timeline: vertical event list with time markers. */
export const TimelineNode = memo(function TimelineNode({ node }: { node: GenuiTimeline }) {
  const items = node.items.slice(0, GENUI_LIMITS.maxTimelineItems)
  return (
    <div className={css.timeline}>
      {items.map((item, i) => (
        <div key={i} className={css.tlItem}>
          <div className={css.tlRail}>
            <span className={css.tlDot} />
            {i < items.length - 1 && <span className={css.tlLine} />}
          </div>
          <div className={css.tlBody}>
            <div className={css.tlHead}>
              <span className={css.tlTitle}>{renderInline(item.title, false)}</span>
              {item.time !== undefined && <span className={css.tlTime}>{renderInline(item.time)}</span>}
            </div>
            {item.desc !== undefined && <div className={css.tlDesc}>{renderInline(item.desc)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
})

/** FileTree: indented tree of files and folders. Directory rows are LOCAL
 * collapsible (spec.ts promised "collapsible children"; this makes it true)
 * — click a dir to fold/unfold, default fully open. Zero model round trip. */
/** 14px folder / file glyphs: an emoji-free way to tell rows apart at a glance. */
function FolderGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.6 3.4h4.1l1.3 1.7h7.4v7.2a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1z" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

function FileGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.8 1.6h4.9L13 5.9v8.5a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.7 1.7v4.3h4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export const FileTreeNode = memo(function FileTreeNode({ node }: { node: GenuiFileTree }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (k: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  // Children live in their OWN container under the row. They used to be
  // appended inside `.ftRow` (display: flex), so a nested tree rendered
  // side-by-side on one line instead of stacking.
  const renderNode = (n: GenuiFileTreeNode, depth: number, path: string): ReactNode => {
    if (depth > GENUI_LIMITS.maxTreeDepth) return null
    const isDir = n.type === 'dir' || (n.children !== undefined && n.children.length > 0)
    const folded = isDir && collapsed.has(path)
    return (
      <div key={path}>
        <div className={css.ftRow} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
          {Array.from({ length: depth }, (_v, i) => (
            <span key={i} className={css.ftGuide} style={{ left: `${4 + i * 14 + 6}px` }} aria-hidden />
          ))}
          <button
            type="button"
            className={css.ftNameBtn}
            aria-expanded={isDir ? !folded : undefined}
            onClick={isDir ? () => toggle(path) : undefined}
          >
            <span
              className={css.ftChevron}
              data-open={isDir ? String(!folded) : undefined}
              aria-hidden
            >
              {isDir ? '▸' : ''}
            </span>
            <span className={`${css.ftGlyph} ${isDir ? css.ftGlyphDir : ''}`} aria-hidden>
              {isDir ? <FolderGlyph /> : <FileGlyph />}
            </span>
            <span className={`${css.ftName} ${isDir ? css.ftDir : ''}`}>{n.name}</span>
          </button>
        </div>
        {isDir && !folded && (
          <div className={css.ftChildren}>
            {(n.children ?? []).map((c, ci) => renderNode(c, depth + 1, `${path}/${ci}`))}
          </div>
        )}
      </div>
    )
  }
  return <div className={css.fileTree}>{node.items.slice(0, GENUI_LIMITS.maxListItems).map((n, i) => renderNode(n, 0, String(i)))}</div>
})

/** Quiz: a self-contained teaching question. Selecting an option marks it
 * correct/incorrect in place and reveals feedback + explanation. With
 * `action`, the chosen answer is ALSO sent back to the model
 * (`{type:'quiz', question, answer, correct}`) so the model can collect or
 * grade it — the in-place judging stays local (no round trip needed). */
export const QuizNode = memo(function QuizNode({ node, onAction }: {
  node: GenuiQuiz
  onAction?: GenuiBlockProps['onAction']
}) {
  const t = useT()
  const [selected, setSelected] = useState<number | null>(null)
  // `id` is the documented reset signal: when the model swaps the quiz in
  // place (same tree position, new question), the component instance is
  // reused, so the answered state must not leak onto the new question.
  const [prevId, setPrevId] = useState(node.id)
  if (node.id !== prevId) {
    setPrevId(node.id)
    setSelected(null)
  }
  const options = node.options.slice(0, GENUI_LIMITS.maxQuizOptions)
  const answered = selected !== null
  const chosen = selected === null ? undefined : options[selected]
  const correct = chosen?.correct === true
  const action = node.action
  return (
    <div className={css.quiz} data-genui-quiz>
      <div className={css.quizQuestion}>{renderInline(node.question)}</div>
      <div className={css.quizOptions}>
        {options.map((opt, i) => {
          const isChosen = selected === i
          const cls = answered
            ? isChosen
              ? opt.correct === true ? css.quizOptCorrect : css.quizOptWrong
              : opt.correct === true ? css.quizOptReveal : css.quizOpt
            : css.quizOpt
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={answered}
              onClick={() => {
                setSelected(i)
                if (action !== undefined && onAction !== undefined) {
                  onAction(action, {
                    type: 'quiz',
                    question: node.question,
                    answer: opt.label,
                    correct: opt.correct === true,
                  })
                }
              }}
            >
              {/* Before answering: a radio affordance so the row reads as a
                  choice. After: ✓ on the right answer, ✗ on a wrong pick. */}
              <span className={css.quizMarker}>
                {answered ? (opt.correct === true ? '✓' : isChosen ? '✗' : '') : isChosen ? '●' : '○'}
              </span>
              {renderInline(opt.label, false)}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={css.quizResult} aria-live="polite">
          <div className={correct ? css.quizCorrectMsg : css.quizWrongMsg}>
            {correct ? t('block.quizCorrect') : t('block.quizWrong')}
            {chosen?.feedback !== undefined && <div className={css.quizFeedback}>{renderInline(chosen.feedback)}</div>}
          </div>
          {node.explanation !== undefined && <div className={css.quizExplanation}>{renderInline(node.explanation)}</div>}
          <button type="button" className={css.quizRetry} onClick={() => setSelected(null)}>{t('block.quizRetry')}</button>
        </div>
      )}
    </div>
  )
})

/** Breadcrumb: path-style navigation trail. */
export const BreadcrumbNode = memo(function BreadcrumbNode({ node }: { node: GenuiBreadcrumb }) {
  const items = node.items.slice(0, GENUI_LIMITS.maxBreadcrumbItems)
  return (
    <nav className={css.breadcrumb} aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={i} className={css.bcItem}>
          <span className={`${css.bcText} ${i === items.length - 1 ? css.bcCurrent : ''}`}>{renderInline(item)}</span>
          {i < items.length - 1 && <span className={css.bcSep}>/</span>}
        </span>
      ))}
    </nav>
  )
})

/**
 * Trailing debounce window (ms) for one `[genui-action]` name: rapid
 * repeated interactions on one control (button mashing, switch flipping)
 * collapse into a single action with the LAST payload. Different action
 * names stay independent. The model round-trip takes seconds, so a few
 * hundred ms of trailing delay is imperceptible — and it stops bursts of
 * queued user turns.
 */


const MAP_EMBED_HOSTS = new Set([
  'www.openstreetmap.org',
  'openstreetmap.org',
  'maps.google.com',
  'www.google.com',
  'www.bing.com',
  'uri.amap.com',
  'map.baidu.com',
  'nominatim.openstreetmap.org',
])

function safeEmbedUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return undefined
    const host = u.hostname.toLowerCase()
    if (![...MAP_EMBED_HOSTS].some((h) => host === h || host.endsWith(`.${h}`))) {
      if (!/(map|maps|osm|leaflet)/i.test(host + u.pathname)) return undefined
    }
    return u.toString()
  } catch {
    return undefined
  }
}

/** Entity chip — person/place/thing with optional href/action. */
export function EntityNode({ node, onAction }: {
  node: GenuiEntity
  onAction?: GenuiBlockProps['onAction']
}) {
  const tone = node.tone ?? 'accent'
  const body = (
    <>
      {node.icon !== undefined && <span className={css.entityIcon} aria-hidden>{node.icon}</span>}
      <span className={css.entityBody}>
        <span className={css.entityTitle}>{renderInline(node.title, false)}</span>
        {node.subtitle !== undefined && <span className={css.entitySub}>{renderInline(node.subtitle, false)}</span>}
      </span>
      {node.label !== undefined && <span className={css.entityPill}>{renderInline(node.label, false)}</span>}
    </>
  )
  if (node.href !== undefined && node.href.trim() !== '') {
    return (
      <a className={`${css.entity} ${css[`entity_${tone}`] ?? ''}`} href={node.href} target="_blank" rel="noopener noreferrer" data-iui-entity="link">
        {body}
      </a>
    )
  }
  if (node.action !== undefined && onAction !== undefined) {
    return (
      <button
        type="button"
        className={`${css.entity} ${css[`entity_${tone}`] ?? ''}`}
        data-iui-entity="action"
        onClick={() => onAction(node.action!, { type: 'entity', title: node.title })}
      >
        {body}
      </button>
    )
  }
  return <span className={`${css.entity} ${css[`entity_${tone}`] ?? ''}`} data-iui-entity="static">{body}</span>
}

/** Horizontal wrap of entity chips. */
export function ChipsNode({ node, onAction }: {
  node: GenuiChips
  onAction?: GenuiBlockProps['onAction']
}) {
  const items = (node.items ?? []).slice(0, GENUI_LIMITS.maxListItems)
  if (items.length === 0) return <EmptyState kind="list" detail="暂无实体" />
  return (
    <div className={css.chips} role="list">
      {items.map((it, i) => {
        if (typeof it === 'string') {
          return <EntityNode key={i} node={{ type: 'entity', title: it }} onAction={onAction} />
        }
        const rec = it as Record<string, unknown>
        if (rec.type === 'badge') {
          return (
            <span key={i} className={`${css.badge} ${css[String(rec.tone ?? '')] || ''}`}>
              {renderInline(String(rec.label ?? ''), false)}
            </span>
          )
        }
        const entity: GenuiEntity = {
          type: 'entity',
          title: String(rec.title ?? rec.label ?? rec.name ?? '实体'),
        }
        if (typeof rec.subtitle === 'string') entity.subtitle = rec.subtitle
        if (typeof rec.label === 'string' && rec.title !== undefined) entity.label = rec.label
        if (typeof rec.tone === 'string') entity.tone = rec.tone as 'success' | 'warn' | 'danger' | 'accent' | 'muted'
        if (typeof rec.icon === 'string') entity.icon = rec.icon
        if (typeof rec.href === 'string') entity.href = rec.href
        if (typeof rec.action === 'string') entity.action = rec.action
        return <EntityNode key={i} node={entity} onAction={onAction} />
      })}
    </div>
  )
}

/** Map / destination card — real OSM embed or Leaflet tiles + CTA links. */
export function MapNode({ node }: {
  node: GenuiMap
}) {
  const query = (node.query ?? node.address ?? node.title ?? '').trim()
  const linksRaw = (node.links ?? []).filter((l) => typeof l?.href === 'string' && /^https?:\/\//i.test(l.href))
  const links = (linksRaw.length > 0 ? linksRaw : buildDefaultMapLinks(query)).slice(0, 4)
  const facts = (node.facts ?? []).slice(0, 8)
  const needsGeocode = node.lat === undefined && node.lng === undefined
    && ((node.query ?? node.address ?? node.title ?? '').trim() !== '')
  const [geo, setGeo] = useState<{ lat: number; lng: number; label?: string } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'pending' | 'ok' | 'err'>(
    needsGeocode ? 'pending' : 'idle',
  )
  useEffect(() => {
    if (needsGeocode) setGeoStatus('pending')
    else setGeoStatus('idle')
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data
      if (!data || typeof data !== 'object') return
      const row = data as { type?: string; ok?: boolean; lat?: number; lng?: number; label?: string; reason?: string }
      if (row.type !== 'iui-map-geocode') return
      if (row.ok === true) {
        if (typeof row.lat !== 'number' || typeof row.lng !== 'number') return
        if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return
        setGeo({
          lat: row.lat,
          lng: row.lng,
          ...(typeof row.label === 'string' ? { label: row.label } : {}),
        })
        setGeoStatus('ok')
        return
      }
      if (row.ok === false) setGeoStatus('err')
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [node.query, node.lat, node.lng, node.title, node.address, needsGeocode])
  const surface = resolveMapSurface({
    ...(node.embed !== undefined ? { embed: node.embed } : {}),
    ...(node.lat !== undefined ? { lat: node.lat } : {}),
    ...(node.lng !== undefined ? { lng: node.lng } : {}),
    ...(node.zoom !== undefined ? { zoom: node.zoom } : {}),
    ...(node.provider !== undefined ? { provider: node.provider } : {}),
    ...(node.query !== undefined ? { query: node.query } : {}),
    ...(node.title !== undefined ? { title: node.title } : {}),
    ...(node.address !== undefined ? { address: node.address } : {}),
    ...(node.markers !== undefined ? { markers: node.markers } : {}),
    ...(node.path !== undefined ? { path: node.path } : {}),
    ...(node.route !== undefined ? { route: node.route } : {}),
    safeEmbedUrl,
  })
  const embedH =
    typeof node.height === 'number' && Number.isFinite(node.height)
      ? Math.max(160, Math.min(640, Math.round(node.height)))
      : undefined
  const wrapStyle = embedH !== undefined ? { minHeight: embedH, height: embedH, aspectRatio: 'auto' as const } : undefined
  const displayLat = node.lat ?? geo?.lat
  const displayLng = node.lng ?? geo?.lng
  if (!node.title && !node.address && links.length === 0 && surface.kind === 'none') {
    return <EmptyState kind="map" detail="缺少地点信息" />
  }
  return (
    <div className={css.mapCard} data-iui-map data-iui-map-mode={surface.kind === 'none' ? 'links-only' : surface.mode}>
      <div className={css.mapHead}>
        {node.label !== undefined && <span className={css.mapLabel}>{renderInline(node.label, false)}</span>}
        {node.title !== undefined && <div className={css.mapTitle}>{renderInline(node.title)}</div>}
        {node.address !== undefined && <div className={css.mapAddress}>{renderInline(node.address)}</div>}
        {(displayLat !== undefined && displayLng !== undefined) && (
          <div className={css.mapCoords} data-iui-map-coords>
            {displayLat.toFixed(4)}, {displayLng.toFixed(4)}
            {geo && node.lat === undefined ? <span className={css.mapCoordsHint}> · 已定位</span> : null}
          </div>
        )}
      </div>
      {surface.kind === 'iframe-src' && (
        <div className={css.mapEmbedWrap} style={wrapStyle}>
          <iframe
            className={css.mapEmbed}
            src={surface.src}
            title={node.title ?? '地图'}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      )}
      {surface.kind === 'iframe-srcdoc' && (
        <div className={css.mapEmbedWrap} style={wrapStyle}>
          <iframe
            className={css.mapEmbed}
            srcDoc={surface.srcdoc}
            title={node.title ?? '地图'}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      )}
      {geoStatus === 'pending' && surface.kind !== 'none' && (
        <div className={css.mapStatus ?? undefined} data-iui-map-status="pending" role="status" style={css.mapStatus ? undefined : {
          fontSize: 12, color: 'var(--dsl-g-muted, hsl(240 4% 46%))', padding: '2px 0',
        }}>
          正在定位…
        </div>
      )}
      {geoStatus === 'err' && (
        <div className={css.mapStatusErr ?? css.mapStatus ?? undefined} data-iui-map-status="err" role="status" style={css.mapStatusErr || css.mapStatus ? undefined : {
          fontSize: 12, color: 'hsl(0 65% 40%)', padding: '2px 0',
        }}>
          未能自动定位，可用下方外链打开地图
        </div>
      )}
      {facts.length > 0 && (
        <ul className={css.mapFacts}>
          {facts.map((f, i) => <li key={i}>{renderInline(f, false)}</li>)}
        </ul>
      )}
      {links.length > 0 && (
        <div className={css.mapLinks}>
          {links.map((l, i) => (
            <a key={i} className={css.link} href={l.href} target="_blank" rel="noopener noreferrer" data-iui-link="open">
              <span className={css.linkLabel}>{renderInline(l.label, false)}</span>
              <span className={css.linkHint} aria-hidden>↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
