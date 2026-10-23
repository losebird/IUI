// @vitest-environment jsdom
// visual ⑤ / G15: rendered-color contrast check + one automatic iui-patch request (< 3:1).
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { resetFrameActivityForTests } from '../src/client/frame-activity.ts'
import {
  AUTO_FIX_CONTRAST_RATIO, claimAutoFix, contrastFixPrompt, contrastIssueToFix, isFenceLive, markFenceLive,
  registerConversationSender, resetAutoFixForTests,
} from '../src/client/auto-fix.ts'
import { buildSandboxBridgeScript, isIuiSandboxHostMessage, type SandboxSelfCheckIssue } from '../src/shared/html-sandbox.ts'
import { looksLikePageEditAsk } from '../src/plugin/page-memory.ts'

const low: SandboxSelfCheckIssue = {
  kind: 'lowContrast', count: 2, serious: true, minRatio: 1.24, detail: '第 1 天 · 1.2:1',
  samples: [
    { text: '第 1 天', sel: 'button#d1', ratio: 1.2, fg: '#fb923c', bg: '#f97316' },
    { text: '浅灰说明', sel: 'p.mt-4', ratio: 2.1, fg: '#b5b5b5', bg: '#ffffff' },
  ],
}

beforeEach(() => { resetFrameActivityForTests(); resetAutoFixForTests(); localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear(); document.body.removeAttribute('data-ds-dark-theme') })

describe('in-frame check', () => {
  it('normalizes oklch/oklab colors, composites the painted backdrop and re-checks after clicks', () => {
    const bridge = buildSandboxBridgeScript('f1')
    expect(bridge).toContain("getContext('2d', { willReadFrequently: true })")
    expect(bridge).toContain('elementsFromPoint')
    expect(bridge).toContain('function __iuiOver(')
    expect(bridge).toContain("document.addEventListener('click'")
    expect(bridge).toContain('minRatio')
  })

  it('accepts contrast samples and rejects malformed ones', () => {
    const ok = { source: 'iui-html', type: 'selfCheck', frameId: 'f', serious: 1, issues: [low] }
    expect(isIuiSandboxHostMessage(ok)).toBe(true)
    const bad = (s: unknown) => ({ ...ok, issues: [{ ...low, samples: s }] })
    expect(isIuiSandboxHostMessage(bad([{ ...low.samples![0], fg: 'red' }]))).toBe(false)
    expect(isIuiSandboxHostMessage(bad(Array.from({ length: 6 }, () => low.samples![0])))).toBe(false)
    expect(isIuiSandboxHostMessage({ ...ok, issues: [{ ...low, minRatio: 'x' }] })).toBe(false)
  })
})

describe('auto-fix policy', () => {
  it('only < 3:1 with samples qualifies', () => {
    expect(AUTO_FIX_CONTRAST_RATIO).toBe(3)
    expect(contrastIssueToFix([low])).toBe(low)
    expect(contrastIssueToFix([{ ...low, minRatio: 3.2 }])).toBeNull()
    expect(contrastIssueToFix([{ ...low, samples: [] }])).toBeNull()
    expect(contrastIssueToFix([{ kind: 'smallText', count: 9, serious: true }])).toBeNull()
  })

  it('one attempt per page lineage, persisted', () => {
    expect(claimAutoFix('s|trip')).toBe(true)
    expect(claimAutoFix('s|trip')).toBe(false)
    resetAutoFixForTests()
    expect(claimAutoFix('s|trip')).toBe(false)
    expect(claimAutoFix('s|other')).toBe(true)
  })

  it('prompt asks for a color-only iui-patch and reads as a page edit (server attaches the source)', () => {
    const text = contrastFixPrompt(low, '东京行程')
    expect(text.length).toBeLessThanOrEqual(400)
    expect(text).toContain('iui-patch')
    expect(text).toContain('button#d1')
    expect(text).toContain('#fb923c')
    expect(looksLikePageEditAsk(text)).toBe(true)
  })

  it('only fences seen streaming are live', () => {
    expect(isFenceLive('s', 'k')).toBe(false)
    markFenceLive('s', 'k')
    expect(isFenceLive('s', 'k')).toBe(true)
    expect(isFenceLive('t', 'k')).toBe(false)
  })
})

describe('host wiring', () => {
  const page = JSON.stringify({ title: '东京行程', css: '', html: '<p>hi</p>', js: '' })
  async function selfCheck(view: ReturnType<typeof render>, issues: SandboxSelfCheckIssue[]): Promise<void> {
    const frame = view.container.querySelector('iframe')!
    const id = (frame.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1] ?? ''
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { source: 'iui-html', type: 'selfCheck', frameId: id, issues, serious: 1 } }))
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  it('sends exactly one patch request for a fresh page', async () => {
    const send = vi.fn(async () => true)
    registerConversationSender(send)
    const view = render(<HtmlSandboxFrame raw={page} autoFix={{ key: 's1|trip', sessionId: 's1' }} />)
    await selfCheck(view, [low])
    await selfCheck(view, [low])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![0]).toBe('s1')
    expect(String(send.mock.calls[0]![1])).toContain('iui-patch')
  })

  it('never for history pages (no autoFix) or when the issue is mild', async () => {
    const send = vi.fn(async () => true)
    registerConversationSender(send)
    const a = render(<HtmlSandboxFrame raw={page} />)
    await selfCheck(a, [low])
    a.unmount()
    const b = render(<HtmlSandboxFrame raw={page} autoFix={{ key: 's1|x', sessionId: 's1' }} />)
    await selfCheck(b, [{ ...low, minRatio: 3.4 }])
    expect(send).not.toHaveBeenCalled()
  })
})
