import { describe, expect, it } from 'vitest'
import {
  parseToolResultBindings,
  resolveBindToken,
  resolveBindValue,
  hasUnresolvedBind,
  hasAppDataToken,
  lookupBinding,
} from '../src/shared/binding-parse.ts'
import {
  ingestToolResultBindings,
  getSessionBindings,
  resetBindingBridgeForTests,
  getLatestBindings,
} from '../src/plugin/binding-bridge.ts'
import {
  resolveSpecBindings,
  applyValueFromFields,
} from '../src/client/binding-store.ts'
import type { GenuiSpec } from '../src/client/spec.ts'

describe('parseToolResultBindings', () => {
  it('parses JSON metrics', () => {
    const m = parseToolResultBindings('{"cpu":34,"mem":41.2,"disk":62}')
    expect(m.cpu).toBe(34)
    expect(m.mem).toBe(41.2)
    expect(m.disk).toBe(62)
  })

  it('parses key:value lines and aliases', () => {
    const m = parseToolResultBindings('CPU: 28%\n内存: 8.1\n负载: 1.2')
    expect(m.cpu).toBe(28)
    expect(m.mem).toBe(8.1)
    expect(m.load).toBe(1.2)
  })

  it('prefixes tool name', () => {
    const m = parseToolResultBindings('{"temp":22}', 'bash')
    expect(m.temp).toBe(22)
    expect(m['bash.temp']).toBe(22)
  })

  it('unwraps appData envelope + JSON blob + call scope', () => {
    const m = parseToolResultBindings(JSON.stringify({
      appData: { cpu: 34, hourly: [{ x: '10', y: 18 }, { x: '12', y: 21 }] },
    }), 'bash', 'callABC123xyz')
    expect(m.cpu).toBe(34)
    expect(typeof m.hourly).toBe('string')
    expect(String(m.hourly).startsWith('[')).toBe(true)
    expect(m['bash.cpu']).toBe(34)
    const callKey = Object.keys(m).find((k) => k.startsWith('call.') && k.endsWith('.cpu'))
    expect(callKey).toBeTruthy()
    expect(m[callKey!]).toBe(34)
  })
})

describe('resolveBindToken / resolveBindValue', () => {
  it('fills and keeps fallback', () => {
    expect(resolveBindToken('$bind:cpu', { cpu: 34 })).toBe('34')
    expect(resolveBindToken('$bind:temp|22', {})).toBe('22')
    expect(hasUnresolvedBind('$bind:x')).toBe(true)
  })

  it('supports $appData alias and structured JSON', () => {
    expect(hasAppDataToken('$appData:temp')).toBe(true)
    expect(resolveBindToken('$appData:temp|22', { temp: 19 })).toBe('19')
    const hourly = JSON.stringify([{ x: '10', y: 18 }])
    const v = resolveBindValue('$bind:hourly', { hourly })
    expect(Array.isArray(v)).toBe(true)
    expect(lookupBinding({ 'Weather.Temp': 7 }, 'weather.temp')).toBe(7)
  })
})

describe('binding bridge', () => {
  it('merges per session and exposes latest', () => {
    resetBindingBridgeForTests()
    ingestToolResultBindings('s1', 'CPU: 10%')
    ingestToolResultBindings('s2', 'CPU: 90%')
    expect(getSessionBindings('s1').cpu).toBe(10)
    expect(getLatestBindings().cpu).toBe(90)
  })
})

describe('resolveSpecBindings + valueFrom', () => {
  it('resolves $bind in values', () => {
    const spec: GenuiSpec = {
      items: [{ type: 'stat', label: 'CPU', value: '$bind:cpu|0%' }],
    }
    const resolved = resolveSpecBindings(spec, { cpu: '34%' })
    expect((resolved.items[0] as { value: string }).value).toBe('34%')
  })

  it('resolves chart data from JSON blob binding', () => {
    const spec: GenuiSpec = {
      items: [{ type: 'chart', kind: 'line', data: '$bind:hourly' as unknown as Array<{ x: string; y: number }> }],
    }
    const hourly = JSON.stringify([{ x: '10', y: 18 }, { x: '12', y: 21 }])
    const resolved = resolveSpecBindings(spec, { hourly })
    const chart = resolved.items[0] as { data: unknown }
    expect(Array.isArray(chart.data)).toBe(true)
    expect((chart.data as unknown[]).length).toBe(2)
  })

  it('applies valueFrom from fields', () => {
    const spec: GenuiSpec = {
      items: [
        { type: 'slider', id: 'vol', value: 40, local: true },
        { type: 'progress', value: 0, valueFrom: 'vol', label: '音量' },
      ],
    }
    const next = applyValueFromFields(spec, { vol: '77' })
    expect((next.items[1] as { value: number }).value).toBe(77)
  })
})
