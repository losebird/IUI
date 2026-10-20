import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  capActionPayload,
  createFrameActionGate,
  FRAME_MIN_INTERVAL_MS,
  INTERNAL_ACTION,
  MAX_PAYLOAD_CHARS,
  resetActionGateForTests,
  WINDOW_MAX,
} from '../src/client/action-gate.ts'

describe('F3 action gate', () => {
  beforeEach(() => resetActionGateForTests())

  it('never forwards host-internal sandbox_* events', () => {
    const gate = createFrameActionGate({ hasActivation: () => true, now: () => 0 })
    for (const name of ['sandbox_send_prompt', 'sandbox_reask', 'sandbox_rerun_author_js', 'sandbox_open_link']) {
      expect(INTERNAL_ACTION.test(name)).toBe(true)
      expect(gate.check(name)).toBe('internal')
    }
  })

  it('setInterval without a user gesture forwards zero actions', () => {
    let t = 0
    const gate = createFrameActionGate({ hasActivation: () => false, now: () => t })
    let sent = 0
    for (let i = 0; i < 100; i++) {
      t += 100
      if (gate.check('refresh') === 'ok') sent++
    }
    expect(sent).toBe(0)
  })

  it('a real click is forwarded; a burst inside 2s is throttled', () => {
    let t = 10_000
    const gate = createFrameActionGate({ hasActivation: () => true, now: () => t })
    expect(gate.check('filter')).toBe('ok')
    t += 300
    expect(gate.check('filter')).toBe('throttled')
    t += FRAME_MIN_INTERVAL_MS
    expect(gate.check('filter')).toBe('ok')
  })

  it('pauses after the per-minute cap and resumes on demand', () => {
    let t = 0
    const gate = createFrameActionGate({ hasActivation: () => true, now: () => t })
    for (let i = 0; i < WINDOW_MAX; i++) {
      t += FRAME_MIN_INTERVAL_MS
      expect(gate.check('next')).toBe('ok')
    }
    t += FRAME_MIN_INTERVAL_MS
    expect(gate.check('next')).toBe('paused')
    expect(gate.paused).toBe(true)
    t += 120_000
    expect(gate.check('next')).toBe('paused')
    gate.resume()
    expect(gate.check('next')).toBe('ok')
  })

  it('cap is tab-wide across frames', () => {
    let t = 0
    const frames = Array.from({ length: WINDOW_MAX + 1 }, () => createFrameActionGate({ hasActivation: () => true, now: () => t }))
    const verdicts = frames.map((g) => { t += 10; return g.check('go') })
    expect(verdicts.slice(0, WINDOW_MAX).every((v) => v === 'ok')).toBe(true)
    expect(verdicts[WINDOW_MAX]).toBe('paused')
  })

  it('browsers without UserActivation still get rate limits', () => {
    let t = 0
    const gate = createFrameActionGate({ hasActivation: () => undefined, now: () => t })
    expect(gate.check('go')).toBe('ok')
    t += 100
    expect(gate.check('go')).toBe('throttled')
  })

  it('caps oversized payloads', () => {
    expect(capActionPayload({ a: 1 })).toEqual({ a: 1 })
    const big = capActionPayload({ blob: 'x'.repeat(5000) })
    expect(big.truncated).toBe(true)
    expect(String(big.preview).length).toBe(MAX_PAYLOAD_CHARS)
  })

  it('html-fence no longer reports internal events to the model channel', () => {
    const src = readFileSync('src/client/html-fence.tsx', 'utf8')
    expect(src).not.toMatch(/onAction\?\.\('sandbox_/)
    expect(src).toContain('gateOutbound(action)')
    expect(src).toContain("gateOutbound('prompt')")
    const index = readFileSync('src/client/index.tsx', 'utf8')
    expect(index.match(/INTERNAL_ACTION\.test\(action\)/g)?.length).toBe(2)
  })
})

describe('F9 reask prompt', () => {
  it('is generic and carries the first line of the failure', async () => {
    const { reaskPrompt } = await import('../src/client/html-fence.tsx')
    const zh = (await import('../src/client/i18n/zh.ts')).ZH as Record<string, string>
    const t = (k: string) => zh[k] ?? k
    const plain = reaskPrompt(t)
    expect(plain).not.toMatch(/行程|Wikimedia/)
    expect(plain).toMatch(/iui-html/)
    const withErr = reaskPrompt(t, '\nTypeError: x is not defined\n  at foo')
    expect(withErr).toContain('问题：TypeError: x is not defined')
    expect(withErr).not.toContain('at foo')
  })
})
