import { describe, expect, it, vi } from 'vitest'
import { isJevConfigured, jevChoose } from '../src/shared/jev-client.ts'

describe('jev-client', () => {
  it('isJevConfigured requires non-empty key', () => {
    expect(isJevConfigured('')).toBe(false)
    expect(isJevConfigured('   ')).toBe(false)
    expect(isJevConfigured(undefined)).toBe(false)
    expect(isJevConfigured('sk-test')).toBe(true)
  })

  it('returns jev_disabled_no_key without calling fetch', async () => {
    const fetchImpl = vi.fn()
    const result = await jevChoose(
      { apiKey: '', fetchImpl: fetchImpl as unknown as typeof fetch },
      {
        state: 'hello',
        questionId: 'format',
        instructions: 'pick',
        criteria: { none: 'plain', resource: 'dashboard' },
      },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('jev_disabled_no_key')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts a valid choice answer', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-latest',
        answers: {
          format: {
            type: 'choice',
            choice: 'resource',
            confidence: 0.82,
            probabilities: { resource: 0.82, none: 0.18 },
          },
        },
      }),
    }))
    const result = await jevChoose(
      { apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch },
      {
        state: { ask: '本机资源' },
        questionId: 'format',
        instructions: 'pick',
        criteria: { none: 'plain', resource: 'dashboard' },
      },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.choice).toBe('resource')
      expect(result.confidence).toBeCloseTo(0.82)
    }
  })

  it('rejects unknown choice ids', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          format: { type: 'choice', choice: 'not-in-catalog', confidence: 0.9 },
        },
      }),
    }))
    const result = await jevChoose(
      { apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch },
      {
        state: 'x',
        questionId: 'format',
        instructions: 'pick',
        criteria: { none: 'plain', resource: 'dashboard' },
      },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('jev_unknown_choice')
  })
})
