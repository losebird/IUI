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

describe('F27 function declarations hoist across chunks', () => {
  it('moves pure function declaration chunks ahead of statements', async () => {
    const { splitAuthorJsChunks, isPureFunctionDeclaration } = await import('../src/shared/author-js-runtime.ts')
    const src = "var api = make({ onReady: refresh });\n/* footer */\nfunction refresh(){ var o = {a:1}; return o.a }\nfunction tail(){ }\ntail()\nconsole.log(1);"
    const chunks = splitAuthorJsChunks(src)
    expect(chunks[0]).toContain('function refresh')
    expect(chunks.findIndex((c) => c.includes('make('))).toBeGreaterThan(0)
    expect(isPureFunctionDeclaration('function a(x = {b: 1}) { if (x) { return 2 } }')).toBe(true)
    expect(isPureFunctionDeclaration('function a(){}\nrun()')).toBe(false)
    expect(isPureFunctionDeclaration('var a = function(){}')).toBe(false)
    // tail() call must stay after its declaration and keep relative order
    // a declaration followed by statements in the same chunk is peeled: decl first, statements keep their order
    expect(chunks.findIndex((c) => c.startsWith('function tail'))).toBeLessThan(chunks.findIndex((c) => c.includes('make(')))
    const stmt = chunks.findIndex((c) => c.startsWith('tail()'))
    expect(chunks[stmt]).toContain('console.log')
    expect(chunks.findIndex((c) => c.includes('make('))).toBeLessThan(stmt)
  })
})

describe('.27 round 6: format + repair', () => {
  it('section bodies carry title / height / placeholder preamble', () => {
    const r = parseHtmlSandboxFence('title: 计数器\nheight: 380\n---css\n.a{color:red}\n---html\n<div id="x">hi</div>\n---js\nconst s = "a" + \'b\';')!
    expect(r.title).toBe('计数器')
    expect(r.height).toBe(380)
    expect(r.html).toBe('<div id="x">hi</div>')
    expect(r.js).toContain('const s = "a"')
  })
  it('F28: valid author JS is never soft-repaired', async () => {
    const { prepareAuthorJs } = await import('../src/shared/html-sandbox.ts')
    const js = "(function(){var m={a:1};el.innerHTML=`<b>${m.a}:00–${m.a + 1}:00</b>`;setTimeout(function(){go()},250)})()"
    expect(prepareAuthorJs(js)).toBe(js)
    // broken input still goes through the repair path
    expect(prepareAuthorJs('var cfg = {a: [1, 2')).not.toBe('var cfg = {a: [1, 2')
  })
  it('system prompt is the compact section-format contract', async () => {
    const { GENUI_SECTION_TEXT } = await import('../src/plugin/section-text.ts')
    expect(GENUI_SECTION_TEXT.length).toBeLessThan(4600)
    expect(GENUI_SECTION_TEXT).toContain('---js')
    expect(GENUI_SECTION_TEXT).toMatch(/NO network data/)
    expect(GENUI_SECTION_TEXT).toMatch(/never below 12px/)
  })
})
