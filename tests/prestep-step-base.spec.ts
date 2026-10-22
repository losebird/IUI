import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installFenceFeedback } from '../src/plugin/fence-feedback.ts'

type Listener = (payload: unknown, ...rest: unknown[]) => unknown

/** dsh 0.2.x numbers a turn's first step 1 (0.1.x used 0): turn-start notes must fire on either. */
function harness() {
  const listeners = new Map<string, Listener>()
  const ctx = {
    logger: { warn: vi.fn(), info: vi.fn() },
    reflect: { get: vi.fn() },
    inject: vi.fn(),
    on: (name: string, handler: Listener) => {
      listeners.set(name, handler)
      return () => listeners.delete(name)
    },
  } as unknown as Context
  installFenceFeedback(ctx, true)
  const session = { id: 'sess-1', snapshotEvents: () => [], header: { id: 'sess-1', version: 4 } }
  const agent = { session, steer: vi.fn() }
  const emit = (event: unknown): void => { listeners.get('session/event')?.(session, event) }
  const ask = (turn: number, text: string): void => {
    emit({ type: 'turn/start', seq: turn * 10, time: 1, data: { turn } })
    emit({ type: 'user/message', seq: turn * 10 + 1, time: 1, data: { content: [{ type: 'text', text }], source: { kind: 'user' } } })
  }
  const preStep = async (turn: number, step: number, entering: unknown[] = []): Promise<string[]> => {
    const decision = await listeners.get('agent/pre-step')!(
      { agent, messages: entering, turn, step, signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: entering }),
    ) as { kind: string; messages: Array<{ content: Array<{ text?: string }> }> }
    return decision.messages.slice(entering.length).map(m => m.content.map(c => c.text ?? '').join(''))
  }
  /** dsh 0.2 order: turn/start → pre-step (prompt still in the inbox) → user/message logged. */
  const ask02 = async (turn: number, text: string): Promise<string[]> => {
    emit({ type: 'turn/start', seq: turn * 10, time: 1, data: { turn } })
    const prompt = { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
    const notes = await preStep(turn, 1, [prompt])
    emit({ type: 'user/message', seq: turn * 10 + 1, time: 1, data: { content: prompt.content, source: { kind: 'user' } } })
    return notes
  }
  return { ask, preStep, ask02 }
}

describe('pre-step first-step notes', () => {
  for (const base of [0, 1]) {
    it(`injects the fence-first prime on the first step (step base ${base})`, async () => {
      const h = harness()
      h.ask(1, '做一个东京3日行程，带地图。')
      const first = await h.preStep(1, base)
      expect(first.length).toBeGreaterThan(0)
      expect(first.join('\n')).toMatch(/iui-html/)
      // Later steps of the same turn do not repeat the prime.
      const second = await h.preStep(1, base + 1)
      expect(second.join('\n')).not.toBe(first.join('\n'))
      expect(second.length).toBeLessThan(first.length)
    })
  }

  it('primes again on the next turn', async () => {
    const h = harness()
    h.ask(1, '做一个东京3日行程，带地图。')
    expect((await h.preStep(1, 1)).length).toBeGreaterThan(0)
    h.ask(2, '做一个本周北京天气看板，用示例数据即可。')
    expect((await h.preStep(2, 1)).length).toBeGreaterThan(0)
  })

  it('adds nothing for a plain question', async () => {
    const h = harness()
    h.ask(1, '量子计算和经典计算有什么区别？简单说说。')
    expect(await h.preStep(1, 1)).toEqual([])
  })

  it('dsh 0.2: notes follow the prompt entering the step, not the previous ask', async () => {
    const h = harness()
    const trip = await h.ask02(1, '做一个东京3日行程，带地图。')
    expect(trip.join('\n')).toMatch(/intent=map/)
    // The next turn is a plain question: nothing about the old map ask.
    expect(await h.ask02(2, '量子计算和经典计算有什么区别？简单说说。')).toEqual([])
    const weather = await h.ask02(3, '做一个本周北京天气看板，用示例数据即可。')
    expect(weather.join('\n')).not.toMatch(/intent=map/)
    expect(weather.length).toBeGreaterThan(0)
  })
})
