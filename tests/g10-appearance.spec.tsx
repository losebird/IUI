// @vitest-environment jsdom
// G10: per-page appearance (accent / density / size / corners / scheme) + user default style.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { resetFrameActivityForTests } from '../src/client/frame-activity.ts'
import { getDefaultPageAppearance, saveDefaultPageAppearance } from '../src/client/page-appearance-store.ts'
import {
  DEFAULT_PAGE_APPEARANCE,
  isDefaultPageAppearance,
  normalizePageAppearance,
  pageAppearanceCss,
  pageAppearanceNote,
  serializePageAppearance,
} from '../src/shared/page-appearance.ts'
import { pageStyleNoteFor } from '../src/config/referee-rules.ts'
import { buildHtmlSandboxSrcdoc, buildSandboxBridgeScript, isIuiSandboxFrameCommand, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'

beforeEach(() => { resetFrameActivityForTests(); localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('G10 model', () => {
  it('normalizes, serializes and builds css / prompt note', () => {
    expect(normalizePageAppearance('not json')).toEqual(DEFAULT_PAGE_APPEARANCE)
    const a = normalizePageAppearance({ accent: '#0f766e', density: 'compact', scale: 'L', radius: 'round', scheme: 'dark', junk: 1 })
    expect(a).toMatchObject({ density: 'compact', scale: 'L', radius: 'round', scheme: 'dark' })
    expect(a.accent?.toLowerCase()).toBe('#0f766e')
    expect(normalizePageAppearance({ accent: 'red; x', density: 'huge' })).toEqual(DEFAULT_PAGE_APPEARANCE)
    expect(serializePageAppearance(DEFAULT_PAGE_APPEARANCE)).toBe('')
    expect(normalizePageAppearance(serializePageAppearance(a))).toEqual(a)
    expect(isDefaultPageAppearance(normalizePageAppearance('{}'))).toBe(true)
    expect(pageAppearanceCss(DEFAULT_PAGE_APPEARANCE)).toBe('')
    const css = pageAppearanceCss(a)
    expect(css).toContain('html{zoom:1.15}')
    expect(css).toContain('color-scheme:dark')
    expect(css).toContain('!important')
    expect(pageAppearanceNote(DEFAULT_PAGE_APPEARANCE)).toBeNull()
    expect(pageAppearanceNote(a)).toMatch(/^\[iui-style\] 用户偏好：主色 #0f766e，密度紧凑，字号大，圆角圆润，深色/i)
  })

  it('only mentions the default style on UI asks', () => {
    const json = serializePageAppearance({ ...DEFAULT_PAGE_APPEARANCE, scheme: 'dark' })
    expect(pageStyleNoteFor('', '做一个仪表盘页面')).toBeNull()
    expect(pageStyleNoteFor(json, '谢谢')).toBeNull()
    expect(pageStyleNoteFor(json, '做一个仪表盘页面')).toContain('深色')
  })
})

describe('G10 sandbox', () => {
  it('bakes the style into the srcdoc and validates the live command', () => {
    const parsed = parseHtmlSandboxFence(JSON.stringify({ title: 't', css: '', html: '<p>x</p>', js: '' }))!
    const a = normalizePageAppearance({ scheme: 'dark', accent: '#4F46E5' })
    const doc = buildHtmlSandboxSrcdoc(parsed, { frameId: 'g10', appearanceCss: pageAppearanceCss(a), appearanceScheme: 'dark' })
    expect(doc).toContain('data-iui-scheme="dark"')
    expect(doc).toMatch(/<style id="iui-appearance">[^<]*color-scheme:dark/)
    expect(doc.indexOf('id="iui-author-css"')).toBeLessThan(doc.indexOf('id="iui-appearance"'))
    expect(buildHtmlSandboxSrcdoc(parsed, { frameId: 'g10' })).not.toContain('<style id="iui-appearance">')
    const bridge = buildSandboxBridgeScript('g10')
    expect(bridge).toContain("data.type === 'appearance'")
    expect(bridge).toContain('__iuiSetAppearance')
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'appearance', css: '', scheme: 'light' })).toBe(true)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'appearance', css: 'x'.repeat(20_001), scheme: 'light' })).toBe(false)
    expect(isIuiSandboxFrameCommand({ source: 'iui-html-host', frameId: 'x', type: 'appearance', css: '', scheme: 'neon' })).toBe(false)
  })
})

describe('G10 host', () => {
  it('menu → 外观 panel posts live changes, reset, and saves the default', async () => {
    const raw = JSON.stringify({ title: 'g10', css: '', html: '<p>hi</p>', js: '' })
    const view = render(<HtmlSandboxFrame raw={raw} />)
    const frame = view.container.querySelector('iframe')!
    const id = (frame.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1] ?? ''
    const sent: Array<Record<string, unknown>> = []
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(((m: Record<string, unknown>) => { sent.push(m) }) as never)
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { source: 'iui-html', type: 'ready', frameId: id } }))
    })
    const q = (sel: string) => view.container.querySelector(sel) as HTMLElement
    await act(async () => { q('[data-iui-sandbox-menu]').click() })
    await act(async () => { q('[data-iui-sandbox-appearance]').click() })
    expect(q('[data-iui-appearance-panel]')).not.toBeNull()
    await act(async () => { q('[data-iui-appearance-group="scheme"] [data-iui-appearance-option="dark"]').click() })
    await act(async () => { q('[data-iui-appearance-group="accent"] [data-iui-appearance-option="teal"]').click() })
    const last = () => sent.filter((m) => m.type === 'appearance').at(-1)
    expect(last()).toMatchObject({ scheme: 'dark' })
    expect(String(last()?.css)).toContain('color-scheme:dark')
    expect((q('[data-iui-appearance-group="scheme"] [data-iui-appearance-option="dark"]')).getAttribute('aria-checked')).toBe('true')
    // Reset → back to the default look.
    await act(async () => { q('[data-iui-appearance-reset]').click() })
    expect(last()).toMatchObject({ css: '', scheme: 'auto' })
    // Save a default: stored locally (no settings form here) and applied to the page.
    await act(async () => { q('[data-iui-appearance-group="scale"] [data-iui-appearance-option="L"]').click() })
    await act(async () => { q('[data-iui-appearance-save-default]').click() })
    await act(async () => { await Promise.resolve() })
    expect(getDefaultPageAppearance().scale).toBe('L')
    expect(String(last()?.css)).toContain('zoom:1.15')
  })

  it('new pages start from the saved default', async () => {
    expect(await saveDefaultPageAppearance({ ...DEFAULT_PAGE_APPEARANCE, radius: 'round' })).toBe('local')
    expect(await saveDefaultPageAppearance({ ...DEFAULT_PAGE_APPEARANCE, radius: 'round' }, async () => true)).toBe('synced')
    const view = render(<HtmlSandboxFrame raw={JSON.stringify({ title: 'n', css: '', html: '<p>n</p>', js: '' })} />)
    expect(view.container.querySelector('iframe')!.getAttribute('srcdoc')).toContain('<style id="iui-appearance">')
  })
})
