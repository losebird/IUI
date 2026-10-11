import { describe, expect, it } from 'vitest'
import {
  looksLikeGenuiSpecBody,
  looksLikeHtmlSandboxBody,
  isJsonMasqueradingAsIui,
} from '../src/shared/genui-shape.ts'

describe('looksLikeHtmlSandboxBody', () => {
  it('detects sandbox css/html/js payloads', () => {
    const sandbox = '{"title":"行程","css":".a{}","html":"<div/>","js":""}'
    expect(looksLikeHtmlSandboxBody(sandbox)).toBe(true)
    expect(looksLikeHtmlSandboxBody('{"title":"x"}')).toBe(false)
    expect(looksLikeGenuiSpecBody(sandbox)).toBe(false)
    expect(isJsonMasqueradingAsIui('json', sandbox)).toBe(true)
  })
})
