// @vitest-environment jsdom
// G9: offscreen pages pause; past 6 live cards the oldest offscreen one freezes (click to resume).
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { MAX_LIVE_FRAMES, pickFramesToFreeze, resetFrameActivityForTests } from '../src/client/frame-activity.ts'
import { buildSandboxBridgeScript, isIuiSandboxFrameCommand, isIuiSandboxHostMessage } from '../src/shared/html-sandbox.ts'

const page = (n: number): string => JSON.stringify({ title: `p${n}`, css: '.a{}', html: `<div class="a">page ${n}</div>`, js: '' })

type IoCb = (entries: Array<{ isIntersecting: boolean }>) => void
const observers: Array<{ cb: IoCb; el: Element | null }> = []
class FakeIO {
  cb: IoCb
  el: Element | null = null
  constructor(cb: IoCb) { this.cb = cb; observers.push(this) }
  observe(el: Element): void { this.el = el }
  disconnect(): void { this.el = null }
  unobserve(): void {}
  takeRecords(): [] { return [] }
}

beforeEach(() => {
  observers.length = 0
  resetFrameActivityForTests()
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO
})
afterEach(() => { cleanup(); vi.useRealTimers(); resetFrameActivityForTests() })

describe('G9 pick', () => {
  it('freezes the longest-offscreen eligible cards beyond the cap', () => {
    const mk = (id: string, o: Partial<{ visible: boolean; lastVisibleAt: number; frozen: boolean; eligible: boolean }>, order: number) =>
      ({ id, visible: false, lastVisibleAt: 0, frozen: false, eligible: true, order, ...o })
    const list = [
      mk('a', { lastVisibleAt: 50 }, 1), mk('b', { lastVisibleAt: 10 }, 2), mk('c', { visible: true }, 3),
      mk('d', {}, 4), mk('e', { eligible: false }, 5), mk('f', { frozen: true }, 6), mk('g', {}, 7), mk('h', {}, 8), mk('i', {}, 9),
    ]
    // 8 live, cap 6 → 2 to freeze: never-visible first (mount order), then oldest lastVisibleAt.
    expect(pickFramesToFreeze(list, MAX_LIVE_FRAMES)).toEqual(['d', 'g'])
    expect(pickFramesToFreeze(list.slice(0, 6), 6)).toEqual([])
  })
})

describe('G9 bridge', () => {
  it('handles visibility / requestFreeze and validates the messages', () => {
    const src = buildSandboxBridgeScript('g9')
    expect(src).toContain("data.type === 'visibility'")
    expect(src).toContain("data.type === 'requestFreeze'")
    expect(src).toContain('window.requestAnimationFrame = function (cb)')
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'visibility', visible: false })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'visibility' })).toBe(false)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'requestFreeze' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', frameId: 'x', type: 'frozen', html: '<html></html>' })).toBe(true)
    expect(isIuiSandboxHostMessage({ source: 'iui-html', frameId: 'x', type: 'frozen', html: 'x'.repeat(3_100_000) })).toBe(false)
  })
})

describe('G9 host', () => {
  it('pauses offscreen, freezes the oldest of 7 offscreen cards, click resumes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const view = render(<div>{Array.from({ length: 7 }, (_, n) => <HtmlSandboxFrame key={n} raw={page(n)} />)}</div>)
    const frames = [...view.container.querySelectorAll('iframe')]
    expect(frames).toHaveLength(7)
    const sent: Array<Array<Record<string, unknown>>> = frames.map(() => [])
    const ids = frames.map((f) => (f.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1] ?? '')
    frames.forEach((f, i) => {
      vi.spyOn(f.contentWindow!, 'postMessage').mockImplementation(((m: Record<string, unknown>) => { sent[i]!.push(m) }) as never)
    })
    await act(async () => {
      frames.forEach((f, i) => window.dispatchEvent(new MessageEvent('message', { source: f.contentWindow, data: { source: 'iui-html', type: 'ready', frameId: ids[i] } })))
    })
    await act(async () => { for (const o of observers) o.cb([{ isIntersecting: false }]) })
    await act(async () => { vi.advanceTimersByTime(1600) })
    for (const s of sent) expect(s.some((m) => m.type === 'visibility' && m.visible === false)).toBe(true)
    // Back in view → resume.
    await act(async () => { observers[6]!.cb([{ isIntersecting: true }]) })
    expect(sent[6]!.some((m) => m.type === 'visibility' && m.visible === true)).toBe(true)
    await act(async () => { vi.advanceTimersByTime(4000) })
    // 7 live > 6: only the first (oldest offscreen) is asked to freeze.
    const asked = sent.map((s) => s.some((m) => m.type === 'requestFreeze'))
    expect(asked).toEqual([true, false, false, false, false, false, false])
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: frames[0]!.contentWindow, data: { source: 'iui-html', type: 'frozen', frameId: ids[0], html: '<!doctype html><html><body>static copy</body></html>' } }))
    })
    const frozenFrame = view.container.querySelectorAll('iframe')[0]!
    expect(frozenFrame.getAttribute('sandbox')).toBe('')
    expect(frozenFrame.getAttribute('srcdoc')).toContain('static copy')
    const resume = view.container.querySelector('[data-iui-sandbox-frozen]') as HTMLButtonElement
    expect(resume).not.toBeNull()
    // Frozen cards never trip the watchdog.
    await act(async () => { vi.advanceTimersByTime(7000) })
    const firstShell = view.container.querySelectorAll('[data-iui-html-sandbox]')[0]!
    expect(firstShell.querySelector('[data-iui-sandbox-hung]')).toBeNull()
    await act(async () => { resume.click() })
    const live = view.container.querySelectorAll('iframe')[0]!
    expect(live.getAttribute('sandbox')).toBe('allow-scripts')
    expect(live.getAttribute('srcdoc')).toContain('FRAME_ID')
    expect(view.container.querySelector('[data-iui-sandbox-frozen]')).toBeNull()
  })
})
