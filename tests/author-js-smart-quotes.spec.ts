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
})
