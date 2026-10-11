/**
 * Progressive mount by node: as a ```iui fence streams, each finished root
 * item mounts with a stable identity and stays mounted while later siblings
 * arrive. Trailing incomplete JSON shows a compact pulse — never remounts the
 * whole block as a single unit.
 */
import { memo, useEffect, useRef, type ReactNode } from 'react'
import css from './GenuiBlock.module.css'
import { renderNode } from './blocks/render-node.tsx'
import type { AnswersState } from './blocks/state.ts'
import type { GenuiNode } from './spec.ts'

export function nodeFingerprint(node: unknown): string {
  try {
    return JSON.stringify(node)
  } catch {
    return String(node)
  }
}

export interface ProgressiveNodeListProps {
  items: readonly GenuiNode[]
  gapPx: number
  /** True while the host message still carries [data-streaming]. */
  streaming?: boolean
  animateEntrance?: boolean
  answersState: AnswersState
  onAction: ((action: string, payload: Record<string, unknown>) => void) | undefined
  /** First paint of a settled replay should not animate. */
  isReplay?: boolean
}

const ProgressiveNode = memo(function ProgressiveNode({
  node,
  index,
  animate,
  delayMs,
  onAction,
  answersState,
}: {
  node: GenuiNode
  index: number
  animate: boolean
  delayMs: number
  onAction: ProgressiveNodeListProps['onAction']
  answersState: AnswersState
}) {
  return (
    <div
      className={css.reveal}
      data-iui-mount="node"
      data-iui-node-index={index}
      data-iui-node-type={(node as { type?: string }).type ?? 'unknown'}
      style={{
        animationDelay: `${delayMs}ms`,
        ...(!animate ? { animation: 'none' } : {}),
      }}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget) event.currentTarget.style.animation = 'none'
      }}
    >
      {renderNode(node, index, onAction, 0, answersState)}
    </div>
  )
}, (prev, next) => (
  prev.index === next.index
  && prev.animate === next.animate
  && prev.delayMs === next.delayMs
  && prev.onAction === next.onAction
  && prev.answersState === next.answersState
  && nodeFingerprint(prev.node) === nodeFingerprint(next.node)
))

/**
 * Mount finished fence nodes one-by-one with stable keys.
 * Only newly appended indices animate; earlier nodes keep their DOM.
 */
export function ProgressiveNodeList({
  items,
  gapPx,
  streaming = false,
  animateEntrance = true,
  answersState,
  onAction,
  isReplay = false,
}: ProgressiveNodeListProps): ReactNode {
  const revealedRef = useRef(0)
  const count = items.length
  useEffect(() => {
    if (count > revealedRef.current) revealedRef.current = count
  }, [count])
  const priorRevealed = revealedRef.current

  return (
    <div
      className={css.col}
      style={{ gap: `${gapPx}px` }}
      data-iui-items={count}
      data-iui-progressive="nodes"
      data-iui-streaming={streaming ? '1' : '0'}
    >
      {items.map((node, i) => {
        const animateThis = Boolean(
          animateEntrance
          && !isReplay
          && (priorRevealed <= 0 || i >= priorRevealed),
        )
        const delay = Math.min((i - Math.max(0, priorRevealed)) * 55, 440)
        return (
          <ProgressiveNode
            key={`iui-node-${i}`}
            node={node}
            index={i}
            animate={animateThis}
            delayMs={Math.max(0, delay)}
            onAction={onAction}
            answersState={answersState}
          />
        )
      })}
      {streaming ? (
        <div
          className={css.streamTail}
          role="status"
          aria-label="正在生成更多组件"
          data-iui-stream="tail"
        >
          <span className={css.streamTailDot} />
          <span className={css.streamTailDot} />
          <span className={css.streamTailDot} />
          <span className={css.streamTailLabel}>继续生成…</span>
        </div>
      ) : null}
    </div>
  )
}
