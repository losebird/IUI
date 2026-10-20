// @vitest-environment jsdom
// F6: no native modals; heartbeat watchdog shows「页面无响应」with 停止 / 重新加载.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { buildSandboxBridgeScript } from '../src/shared/html-sandbox.ts'

const PAGE = JSON.stringify({ title: 'p', css: '.a{}', html: '<div class="a">hi</div>', js: 'document.querySelector(".a").textContent="ok"' })

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('F6 sandbox dialogs + watchdog', () => {
  it('bridge replaces alert/confirm/prompt and sends heartbeats', () => {
    const src = buildSandboxBridgeScript('f1')
    expect(src).toContain('window.alert = function')
    expect(src).toContain('window.confirm = function (m) { toast(m); return false; }')
    expect(src).toContain('window.prompt = function (m) { toast(m); return null; }')
    expect(src).toContain("post({ type: 'heartbeat' })")
  })

  it('shows the hung overlay after 5s of silence; 停止 swaps in an inert page', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const view = render(<HtmlSandboxFrame raw={PAGE} />)
    const frame = view.container.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    const frameId = (frame.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1]
    expect(frameId).toBeTruthy()
    const beat = (): void => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { source: 'iui-html', type: 'heartbeat', frameId } }))
    }
    await act(async () => { beat() })
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(view.container.querySelector('[data-iui-sandbox-hung]')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(3500) })
    expect(view.container.querySelector('[data-iui-sandbox-hung]')).not.toBeNull()
    // A late heartbeat clears it.
    await act(async () => { beat() })
    expect(view.container.querySelector('[data-iui-sandbox-hung]')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(6500) })
    const stop = view.container.querySelector('[data-iui-sandbox-stop]') as HTMLButtonElement
    expect(stop).not.toBeNull()
    await act(async () => { stop.click() })
    const after = view.container.querySelector('iframe')!
    expect(after.getAttribute('srcdoc')).not.toContain('FRAME_ID')
    expect(view.container.querySelector('[data-iui-sandbox-hung]')).toBeNull()
  })
})
