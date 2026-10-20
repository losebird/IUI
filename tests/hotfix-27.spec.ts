import { describe, expect, it } from 'vitest'
import { hoistTopLevelLexical, splitAuthorJsChunks } from '../src/shared/author-js-runtime.ts'
import { buildHtmlSandboxSrcdoc, makeCdnTagsNonBlocking, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'

describe('.27 hotfix', () => {
  it('F1: top-level const/let/class are shared across chunks', () => {
    const src = 'const a = 1; let b = {x: 2}\nclass Foo { m(){ const z = 3; return z } }\nfunction f(){ return a + b.x + new Foo().m() }\nglobalThis.__f1 = f()'
    for (const part of splitAuthorJsChunks(src)) (0, eval)(part)
    expect((globalThis as Record<string, unknown>).__f1).toBe(6)
  })
  it('F1: nested scopes, strings, templates and class expressions are untouched', () => {
    const src = 'for (let i=0;i<2;i++){ const j=i }\nconst s = "const q"; const t = `${s} let ${ {k:1}.k }`\nconst X = class Y {}'
    const out = hoistTopLevelLexical(src)
    expect(out).toContain('for (let i=0;i<2;i++){ const j=i }')
    expect(out).toContain('"const q"')
    expect(out).toContain('} let ${ {k:1}.k }`')
    expect(out).toContain('X = class Y {}')
    expect(out).not.toMatch(/var Y = class/)
  })
  it('F26: closed fields with a stray brace still count as complete', () => {
    const raw = '{"title":"t","css":".a{}"},"html":"<div id=\\"x\\"></div>","js":"document.title=1"}'
    const spec = parseHtmlSandboxFence(raw)!
    expect(spec.jsComplete).toBe(true)
    expect(spec.partial).toBe(false)
    expect(buildHtmlSandboxSrcdoc(spec, { frameId: 't' })).toContain('document.title=1')
  })
  it('F26: a truly unterminated js string stays incomplete', () => {
    const spec = parseHtmlSandboxFence('{"html":"<div></div>","js":"let a = 1;')!
    expect(spec.jsComplete).toBe(false)
  })
  it('C1: CDN tags are async/non-blocking and author JS does not wait for window.load', () => {
    const tags = makeCdnTagsNonBlocking('<link rel="stylesheet" href="https://x/a.css"/><script src="https://x/a.js"></script>')
    expect(tags).toContain('async data-iui-cdn')
    expect(tags).toContain('media="print"')
    const doc = buildHtmlSandboxSrcdoc(parseHtmlSandboxFence('{"html":"<canvas id=\\"chart\\"></canvas>","js":"new Chart(document.getElementById(\'chart\'),{type:\'bar\'})"}')!, { frameId: 't' })
    expect(doc).toMatch(/<script async data-iui-cdn[^>]+chart\.umd/)
    expect(doc).not.toContain("window.addEventListener('load', go)")
  })
})
