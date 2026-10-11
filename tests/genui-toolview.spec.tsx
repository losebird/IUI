// @vitest-environment jsdom
// render_ui toolview — catalog GenuiBlock removed (P1-DEAD-SURFACE); shows sandbox tip.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { GenuiToolView } from '../src/client/toolview.tsx'

afterEach(cleanup)

function props(block: ToolCallBlock): ToolCallViewProps {
  return {
    callId: 'call-1',
    toolName: 'render_ui',
    block,
    openFile: () => {},
  } as unknown as ToolCallViewProps
}

const resultBlock = (meta: unknown): ToolCallBlock => ({
  kind: 'tool-result',
  seq: 1,
  time: 0,
  callId: 'call-1',
  call: { name: 'render_ui', argsRaw: '{}' },
  callTime: 1,
  content: [],
  isError: false,
  meta,
  callView: null,
  resultView: null,
  subCalls: [],
} as unknown as ToolCallBlock)

describe('GenuiToolView', () => {
  it('shows sandbox-first tip instead of catalog GenuiBlock', () => {
    render(<GenuiToolView {...props(resultBlock({ title: '监控面板', items: [
      { type: 'stat', label: 'CPU', value: '42%' },
    ] }))} />)
    expect(document.querySelector('[data-genui]')).toBeNull()
    const tip = document.querySelector('[data-iui-legacy-catalog="1"]')
    expect(tip).not.toBeNull()
    expect(document.body.textContent).toMatch(/iui-html/)
    expect(document.body.textContent).toContain('call-1')
  })

  it('still tips for hostile meta (no catalog render)', () => {
    render(<GenuiToolView {...props(resultBlock({ items: Array.from({ length: 500 }, (_, i) => ({ type: 'text', content: `t${i}` })) }))} />)
    expect(document.querySelector('[data-genui]')).toBeNull()
    expect(document.body.textContent).toMatch(/目录组件工具卡已移除|iui-html/)
  })

  it('falls back to a summary row while the call is running (no meta)', () => {
    render(<GenuiToolView {...props({ callId: 'call-1', name: 'render_ui', argsRaw: '{}', turn: 1, step: 1, time: 0, callView: null, subCalls: [] } as unknown as ToolCallBlock)} />)
    const fallback = document.querySelector('[data-genui-tool]')
    expect(fallback).not.toBeNull()
    expect(fallback!.textContent).toContain('call-1')
    expect(document.querySelector('[data-genui]')).toBeNull()
  })

  it('falls back when meta is not a spec (replayed log without projection)', () => {
    render(<GenuiToolView {...props(resultBlock({ some: 'junk' }))} />)
    expect(document.querySelector('[data-genui-tool]')).not.toBeNull()
    expect(document.querySelector('[data-genui]')).toBeNull()
  })
})
