import { describe, expect, it } from 'vitest'
import { sanitizeSandboxCss, sanitizeSandboxMarkup, isSafeDataImageUrl } from '../src/shared/html-sandbox.ts'

describe('F8 sanitizer fixes', () => {
  it('keeps literal \\n and backslashes inside pre/code/textarea', () => {
    const html = '<pre>printf("a\\n b")</pre><code>x\\ y</code><textarea>l1\\n l2</textarea>'
    expect(sanitizeSandboxMarkup(html)).toBe(html)
  })
  it('still cleans leaked \\n junk in normal text', () => {
    expect(sanitizeSandboxMarkup('<p>你好\\n 世界</p>')).toBe('<p>你好 世界</p>')
  })
  it('allows safe data: images in <img src>, blocks other data:/javascript:', () => {
    const out = sanitizeSandboxMarkup(`<img src="data:image/png;base64,iVBOR"><img src="data:image/svg+xml,<svg xmlns='x'/>"><a href="data:text/html,x">a</a><a href="javascript:alert('x')">b</a><img src="data:text/html,x">`)
    expect(out).toContain('src="data:image/png;base64,iVBOR"')
    expect(out).toContain('src="data:image/svg+xml')
    expect(out.match(/data-blocked=""/g)?.length).toBe(3)
  })
  it('caps data images at 1MB', () => {
    expect(isSafeDataImageUrl('data:image/png;base64,' + 'A'.repeat(1024 * 1024))).toBe(false)
    expect(isSafeDataImageUrl('data:image/webp;base64,AAAA')).toBe(true)
  })
  it('blocked CSS url() is replaced whole so later rules survive', () => {
    const css = '.a{background:url("javascript:alert(1)")}.b{color:red}.d{background:url(\'data:text/html,x\')}.e{color:blue}'
    const out = sanitizeSandboxCss(css)
    expect(out).toBe('.a{background:url(about:invalid)}.b{color:red}.d{background:url(about:invalid)}.e{color:blue}')
    expect((out.match(/"/g) ?? []).length % 2).toBe(0)
  })
  it('keeps safe data: images in CSS', () => {
    const css = '.c{background:url("data:image/svg+xml;utf8,<svg xmlns=\'x\'/>")}'
    expect(sanitizeSandboxCss(css)).toBe(css)
  })
})
