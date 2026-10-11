import { describe, expect, it } from 'vitest'
import {
  parseToolResultAppData,
  projectAppDataOntoNode,
  injectAppDataIntoSpec,
  flattenAppDataToBindings,
  lookupAppData,
} from '../src/shared/appdata-runtime.ts'
// path/instance helpers covered below
import {
  ingestToolResultBindings,
  getSessionSnapshot,
  resetBindingBridgeForTests,
} from '../src/plugin/binding-bridge.ts'
import { resolveSpecBindings } from '../src/client/binding-store.ts'
import type { GenuiSpec } from '../src/client/spec.ts'

describe('parseToolResultAppData', () => {
  it('keeps structured arrays (not only flat strings)', () => {
    const m = parseToolResultAppData(JSON.stringify({
      appData: {
        cpu: 34,
        hourly: [{ x: '10', y: 18 }, { x: '12', y: 21 }],
      },
    }))
    expect(m.cpu).toBe(34)
    expect(Array.isArray(m.hourly)).toBe(true)
    expect((m.hourly as unknown[])).toHaveLength(2)
  })

  it('flattens to bindings for legacy tokens', () => {
    const typed = parseToolResultAppData('{"mem":62,"spark":[1,2,3]}')
    const flat = flattenAppDataToBindings(typed)
    expect(flat.mem).toBe(62)
    expect(String(flat.spark).startsWith('[')).toBe(true)
  })
})

describe('projectAppDataOntoNode', () => {
  it('projects object onto stat schema fields', () => {
    const node = projectAppDataOntoNode(
      { type: 'stat', label: 'CPU', value: '$bind:cpu' },
      { value: 34, ring: 34, spark: [10, 20, 34], tone: 'warning' },
    )
    expect(node.value).toBe('34')
    expect(node.ring).toBe(34)
    expect(node.spark).toEqual([10, 20, 34])
    expect(node.tone).toBe('warning')
  })

  it('projects array onto chart.data', () => {
    const node = projectAppDataOntoNode(
      { type: 'chart', kind: 'line', data: '$bind:hourly' },
      [{ label: '10', value: 18 }, { label: '12', value: 21 }],
    )
    expect(Array.isArray(node.data)).toBe(true)
    expect((node.data as unknown[]).length).toBe(2)
  })
})

describe('injectAppDataIntoSpec', () => {
  it('fills $bind by schema projection', () => {
    const spec = {
      items: [
        { type: 'stat', label: 'CPU', value: '$bind:cpu', ring: '$bind:cpu' },
        { type: 'chart', kind: 'line', data: '$bind:hourly' },
      ],
    }
    const snap = {
      bindings: flattenAppDataToBindings({
        cpu: 34,
        hourly: [{ label: '10', value: 18 }],
      }),
      appData: {
        cpu: 34,
        hourly: [{ label: '10', value: 18 }],
      },
    }
    const out = injectAppDataIntoSpec(spec, snap)
    const stat = out.items[0] as Record<string, unknown>
    const chart = out.items[1] as Record<string, unknown>
    expect(stat.value).toBe('34')
    expect(stat.ring).toBe(34)
    expect(Array.isArray(chart.data)).toBe(true)
  })
})

describe('binding bridge typed snapshot', () => {
  it('exposes appData alongside flat bindings', () => {
    resetBindingBridgeForTests()
    ingestToolResultBindings('s1', JSON.stringify({
      appData: { cpu: 12, hourly: [1, 2, 3] },
    }))
    const snap = getSessionSnapshot('s1')
    expect(snap.bindings.cpu).toBe(12)
    expect(Array.isArray(snap.appData.hourly)).toBe(true)
    expect(lookupAppData(snap.appData, 'CPU')).toBe(12)
  })
})

describe('resolveSpecBindings uses typed projection', () => {
  it('injects chart series from typed map', () => {
    const spec: GenuiSpec = {
      items: [
        { type: 'chart', kind: 'bars', data: '$bind:series' } as never,
      ],
    }
    const out = resolveSpecBindings(
      spec,
      { series: '[{"label":"A","value":1}]' },
      { series: [{ label: 'A', value: 1 }] },
    )
    const chart = out.items[0] as { data?: unknown }
    expect(Array.isArray(chart.data)).toBe(true)
  })
})

describe('appData path + instance projection', () => {
  it('resolves dotted paths', async () => {
    const { lookupAppDataPath, injectAppDataIntoSpec } = await import('../src/shared/appdata-runtime.ts')
    const map = { weather: { hourly: [1, 2, 3], place: '北京' }, 'card.cpu': 44 }
    expect(lookupAppDataPath(map, 'weather.place')).toBe('北京')
    expect(lookupAppDataPath(map, 'weather.hourly.1')).toBe(2)
    const spec = injectAppDataIntoSpec(
      { items: [{ type: 'stat', label: 'CPU', instanceId: 'card', bindFrom: 'cpu' }] },
      { bindings: {}, appData: map },
    )
    expect(Number((spec.items[0] as { value?: unknown }).value)).toBe(44)
  })
})

