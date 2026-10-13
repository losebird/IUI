import { describe, expect, it } from 'vitest'
import { hardenAuthorJs, prepareAuthorJs } from '../src/shared/html-sandbox.ts'
import { buildAuthorJsRuntimeSource } from '../src/shared/author-js-runtime.ts'

function accepts(src: string): boolean {
  try {
    // eslint-disable-next-line no-new-func
    new Function(src)
    return true
  } catch {
    return false
  }
}

describe('string-aware smart-quote hardening', () => {
  it('keeps a curly apostrophe inside single quotes valid', () => {
    const raw = "var cards=[{fr:'s’aider', zh:'帮助'}];"
    expect(accepts(raw)).toBe(true)
    const out = hardenAuthorJs(raw)
    expect(accepts(out)).toBe(true)
    expect(out).toContain('aider')
    expect(out).not.toMatch(/'s'aider'/)
  })

  it('keeps a curly apostrophe in a French sentence', () => {
    const raw = "var ex = 'Je vais t’aider.';"
    expect(accepts(raw)).toBe(true)
    const out = prepareAuthorJs(raw)
    expect(accepts(out)).toBe(true)
    expect(out).toContain('aider')
  })

  it('still converts outer smart quotes used as JS delimiters', () => {
    const raw = 'var x = { a: “hi”, b: 1'
    const out = hardenAuthorJs(raw)
    expect(out).toContain('"hi"')
    expect(out).not.toContain('“')
    expect(out.endsWith('}')).toBe(true)
    expect(accepts(out)).toBe(true)
  })

  it('does not claim to heal a straight apostrophe that already breaks JS', () => {
    const raw = "var cards=[{fr:'s'aider', zh:'帮助'}];"
    expect(accepts(raw)).toBe(false)
    const out = hardenAuthorJs(raw)
    expect(accepts(out)).toBe(false)
  })

  it('iframe softHarden is not a global U+2019 → ASCII quote rewrite', () => {
    const src = buildAuthorJsRuntimeSource()
    expect(src).toMatch(/function softHarden/)
    expect(src).not.toContain("split(q(0x2019)).join(\"'\"")
  })

  it('does not append an extra ) after replace(/"/g) in a closed IIFE', () => {
    const raw = "(function(){\nvar val='x';\nh+='<td value=\"'+String(val).replace(/\"/g,'&quot;')+'\"></td>';\n})();"
    expect(accepts(raw)).toBe(true)
    const out = hardenAuthorJs(raw)
    expect(accepts(out)).toBe(true)
    expect(out.trimEnd()).not.toMatch(/\)\s*\)\s*;?\s*$/)
  })

  it('keeps character-class quotes inside a regex as regex, not strings', () => {
    const raw = "(function(){ var s = String(x).replace(/['\"]/g, ''); })();"
    expect(accepts(raw)).toBe(true)
    expect(accepts(hardenAuthorJs(raw))).toBe(true)
  })

  it('still closes a truly truncated call', () => {
    const raw = 'foo(1, 2'
    const out = hardenAuthorJs(raw)
    expect(out).toContain(')')
    expect(accepts(out)).toBe(true)
  })

  it('rewrites typeof import so dynamic import("three") can eval', () => {
    const raw = "(function(){ if(typeof import==='function'){ import('three').then(function(m){ window._t=m; }); } })();"
    expect(accepts(raw)).toBe(false)
    const out = hardenAuthorJs(raw)
    expect(out).not.toMatch(/typeof\s+import\b/)
    expect(out).toContain("import('three')")
    expect(accepts(out)).toBe(true)
  })

  it('leaves await import("three") in an async IIFE valid', () => {
    const raw = "(async function(){ var THREE = await import('three'); window._t = THREE; })();"
    expect(accepts(raw)).toBe(true)
    const out = hardenAuthorJs(raw)
    expect(out).toContain("import('three')")
    expect(accepts(out)).toBe(true)
  })
})
