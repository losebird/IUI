// @vitest-environment jsdom
// F22: tall pages scroll past 2400px with「展开全部」; base CSS has 480/560px
// breakpoints + minmax() grids; wide tables scroll; the static design lint flags
// fixed boxes / grid tracks wider than a 360px phone.
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HtmlSandboxFrame, sandboxFrameHeight } from '../src/client/html-fence.tsx'
import { buildSandboxBaseCss, buildSandboxBridgeScript } from '../src/shared/html-sandbox.ts'
import { gridMinTrackPx, lintSandboxDesign } from '../src/shared/design-lint.ts'
import { HTML_SANDBOX_STARTERS } from '../src/shared/html-sandbox.ts'

afterEach(() => { cleanup() })

const PAGE = JSON.stringify({ title: 'p', css: '.a{}', html: '<div class="a">hi</div>', js: 'document.querySelector(".a").textContent="ok"' })
const narrow = (html: string, css = ''): string[] =>
  lintSandboxDesign({ html, css }).filter((i) => i.kind === 'narrow-overflow').map((i) => i.detail)

describe('F22 tall pages', () => {
  it('caps auto height at 2400 until expanded (hard cap 20000)', () => {
    expect(sandboxFrameHeight(1800, false)).toBe(1800)
    expect(sandboxFrameHeight(3600, false)).toBe(2400)
    expect(sandboxFrameHeight(3600, true)).toBe(3600)
    expect(sandboxFrameHeight(50_000, true)).toBe(20000)
  })

  it('bridge reports the real height and wraps wide tables in a scroller', () => {
    const src = buildSandboxBridgeScript('f22')
    expect(src).toContain('Math.min(20000,')
    expect(src).toContain("classList.add('iui-scroll-x')")
  })

  it('a 3600px page shows 展开全部 and toggles the frame height', async () => {
    const view = render(<HtmlSandboxFrame raw={PAGE} />)
    const frame = view.container.querySelector('iframe')!
    const frameId = (frame.getAttribute('srcdoc') ?? '').match(/var FRAME_ID = "([^"]+)"/)?.[1]
    const resize = (height: number): void => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { source: 'iui-html', type: 'resize', frameId, height } }))
    }
    await act(async () => { resize(900) })
    expect(view.container.querySelector('[data-iui-sandbox-expand]')).toBeNull()
    expect(frame.style.height).toBe('900px')
    await act(async () => { resize(3600) })
    const bar = view.container.querySelector('[data-iui-sandbox-expand]')!
    expect(bar.getAttribute('data-iui-sandbox-expand')).toBe('collapsed')
    expect(frame.style.height).toBe('2400px')
    expect(bar.textContent).toMatch(/展开全部|Show all/)
    await act(async () => { fireEvent.click(bar.querySelector('button')!) })
    expect(frame.style.height).toBe('3600px')
    expect(view.container.querySelector('[data-iui-sandbox-expand]')!.textContent).toMatch(/收起|Collapse/)
  })
})

describe('F22 responsive base css', () => {
  const css = buildSandboxBaseCss()
  it('grids use minmax(min(…,100%)) and collapse at 560 / 480px', () => {
    expect(css).toContain('minmax(min(140px,100%),1fr)')
    expect(css).toContain('.iui-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}')
    expect(css).toMatch(/@media \(max-width:560px\)\{\s*\.iui-cols-4\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/)
    expect(css).toMatch(/@media \(max-width:480px\)\{\s*\.iui-cols-2,\.iui-cols-3,\.iui-sandbox-compare\{grid-template-columns:minmax\(0,1fr\)\}/)
    expect(css).toContain('.iui-scroll-x{display:block;max-width:100%;overflow-x:auto}')
  })
})

describe('F22 narrow-screen design lint', () => {
  it('measures grid minimum widths', () => {
    expect(gridMinTrackPx('repeat(4, 160px)')).toBe(640)
    expect(gridMinTrackPx('repeat(3, minmax(200px, 1fr))')).toBe(600)
    expect(gridMinTrackPx('repeat(auto-fit, minmax(200px, 1fr))')).toBe(200)
    expect(gridMinTrackPx('repeat(auto-fit, minmax(min(200px, 100%), 1fr))')).toBe(0)
    expect(gridMinTrackPx('220px 1fr 1fr')).toBe(220)
    expect(gridMinTrackPx('repeat(3, 1fr)')).toBe(0)
  })

  it('flags fixed widths and wide grids, not capped / media / wide-only rules', () => {
    expect(narrow('<div style="width:600px">x</div>')).toHaveLength(1)
    expect(narrow('<p>x</p>', '.panel{min-width:520px}')).toHaveLength(1)
    expect(narrow('<p>x</p>', '.g{display:grid;grid-template-columns:repeat(4,160px)}')).toHaveLength(1)
    expect(narrow('<div style="width:600px;max-width:100%">x</div>')).toEqual([])
    expect(narrow('<img style="width:800px" src="x.png">')).toEqual([])
    expect(narrow('<p>x</p>', '@media (min-width:900px){.wide{width:800px}}')).toEqual([])
    expect(narrow('<p>x</p>', '.g{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}')).toEqual([])
    expect(narrow('<p>x</p>', '.strip{display:flex;overflow-x:auto} .strip .card{width:400px}')).toEqual([])
  })

  it('built-in starters pass the narrow-screen lint', () => {
    for (const s of HTML_SANDBOX_STARTERS) expect(narrow(s.spec.html, s.spec.css), s.id).toEqual([])
  })
})
