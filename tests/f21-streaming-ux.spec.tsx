// @vitest-environment jsdom
// F21: skeleton shows the fence title +「已写 N 行」; once html has streamed the
// static page is visible with a "still generating" pill until the fence settles.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HtmlSandboxFrame } from '../src/client/html-fence.tsx'
import { streamedLineCount } from '../src/client/sandbox-skeleton.tsx'

afterEach(() => { cleanup() })

describe('F21 streaming experience', () => {
  it('counts non-empty streamed lines', () => {
    expect(streamedLineCount('a\n\n b\n  \nc')).toBe(3)
  })

  it('skeleton carries the title and line count before any html', () => {
    const raw = 'title: 周报看板\nheight: 420\n---css\n.a{color:red}\n'
    const view = render(<HtmlSandboxFrame raw={raw} streaming />)
    const sk = view.container.querySelector('[data-iui-html-skeleton]')
    expect(sk).not.toBeNull()
    expect(sk!.textContent).toContain('周报看板')
    expect(sk!.textContent).toMatch(/已写 4 行|4 lines written/)
    expect(view.container.querySelector('[data-iui-stream-pill]')).toBeNull()
  })

  it('static html shows with a generating pill; settled fence drops it', () => {
    const head = 'title: 周报\n---css\n.a{color:red}\n---html\n<div class="a">hi</div>\n'
    const view = render(<HtmlSandboxFrame raw={head} streaming />)
    expect(view.container.querySelector('iframe')).not.toBeNull()
    const pill = view.container.querySelector('[data-iui-stream-pill]')
    expect(pill).not.toBeNull()
    expect(pill!.textContent).toMatch(/写完后可交互|interactive when done/)
    view.rerender(<HtmlSandboxFrame raw={head + '---js\ndocument.title="x"\n'} />)
    expect(view.container.querySelector('[data-iui-stream-pill]')).toBeNull()
  })
})
