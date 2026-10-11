import { describe, expect, it, beforeEach } from 'vitest'
import {
  getFenceOpsSnapshot,
  recordFenceOp,
  resetFenceOpsForTests,
} from '../src/shared/fence-ops.ts'
import { looksLikeJsonMasqueradeOpen } from '../src/config/stream-heuristics.ts'

describe('fence-ops', () => {
  beforeEach(() => resetFenceOpsForTests())

  it('records kinds and exposes snapshot', () => {
    recordFenceOp('prime', 'map')
    recordFenceOp('json_masquerade', '```json')
    recordFenceOp('prime', 'form')
    const snap = getFenceOpsSnapshot()
    expect(snap.total).toBe(3)
    expect(snap.byKind.prime).toBe(2)
    expect(snap.byKind.json_masquerade).toBe(1)
    expect(snap.lastKind).toBe('prime')
    expect(snap.lastDetail).toBe('form')
  })
})

describe('looksLikeJsonMasqueradeOpen', () => {
  it('flags ```json openers but not ```iui', () => {
    expect(looksLikeJsonMasqueradeOpen('```json\n{"type":"card"}')).toBe(true)
    expect(looksLikeJsonMasqueradeOpen('```iui\n{"type":"card"}')).toBe(false)
    expect(looksLikeJsonMasqueradeOpen('抱歉')).toBe(false)
  })
})
