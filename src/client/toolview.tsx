/**
 * render_ui tool card — catalog GenuiBlock removed (P1-DEAD-SURFACE).
 * Sandbox-first: instruct model to emit ```iui-html instead.
 */
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import css from './GenuiBlock.module.css'

export function GenuiToolView({ toolName, block }: ToolCallViewProps) {
  return (
    <div className={css.toolFallback} data-genui-tool data-iui-legacy-catalog="1">
      <span className={css.toolFallbackTitle}>{toolName}</span>
      <span className={css.toolFallbackMeta}>
        目录组件工具卡已移除 — 请改用 ```iui-html 自由页（{block.callId}）
      </span>
    </div>
  )
}
