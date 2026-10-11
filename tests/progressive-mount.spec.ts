import { describe, expect, it } from 'vitest'
import { collectPartialCandidates, isPartialFenceBody, parsePartialGenuiSpec } from '../src/client/parse-partial.ts'
import { nodeFingerprint } from '../src/client/progressive-mount.tsx'

describe('progressive parse by node', () => {
  it('extracts finished root items while tail grows', () => {
    const spec = parsePartialGenuiSpec(
      '{"items":[{"type":"text","content":"A"},{"type":"stat","label":"B","value":"1"},{"type":"but',
    )
    expect(spec?.items).toHaveLength(2)
  })

  it('extracts finished child inside an open layout wrapper', () => {
    // row still open; first stat closed — should mount the row with 1 child
    const raw = '{"items":[{"type":"row","items":[{"type":"stat","label":"CPU","value":"34%"},{"type":"stat","lab'
    const spec = parsePartialGenuiSpec(raw)
    expect(spec).not.toBeNull()
    expect(spec!.items.length).toBeGreaterThanOrEqual(1)
    const row = spec!.items[0] as { type: string; items?: unknown[] }
    expect(row.type).toBe('row')
    expect(Array.isArray(row.items)).toBe(true)
    expect(row.items!.length).toBeGreaterThanOrEqual(1)
    expect((row.items![0] as { type: string }).type).toBe('stat')
  })

  it('isPartialFenceBody detects open brackets', () => {
    expect(isPartialFenceBody('{"items":[')).toBe(true)
    expect(isPartialFenceBody('{"items":[{"type":"text","content":"A"}]}')).toBe(false)
  })

  it('collects nested progressive candidates', () => {
    const raw = '{"items":[{"type":"col","items":[{"type":"text","content":"A"},'
    const { candidates } = collectPartialCandidates(raw)
    expect(candidates.some((c) => c.closingSuffix === ']}]}')).toBe(true)
  })

  it('nodeFingerprint is stable for equal nodes', () => {
    const a = { type: 'stat', label: 'CPU', value: '1' }
    const b = { type: 'stat', label: 'CPU', value: '1' }
    expect(nodeFingerprint(a)).toBe(nodeFingerprint(b))
  })
})
