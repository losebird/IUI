import { describe, expect, it } from 'vitest'
import { compareScore, PAGE_FLOOR, RULES, scoreReportMarkdown, TEMPLATE_GATES, type Baseline, type VisualScore } from '../scripts/visual-score.mts'
import { HTML_SANDBOX_STARTERS } from '../src/shared/html-sandbox'
import { readFileSync } from 'node:fs'

const score = (over: Partial<VisualScore['scores']> = {}, extra: Partial<VisualScore> = {}): VisualScore => {
  const scores = { minFont: 100, contrast: 100, overflow: 100, narrow: 100, whitespace: 100, hero: 100, ...over }
  const total = Math.round(RULES.reduce((a, r) => a + scores[r], 0) / RULES.length)
  return { scores, total, notes: [], ...extra }
}

describe('F25 visual score', () => {
  const baseline: Baseline = { a: { scores: score().scores, total: 100 } }

  it('flags a rule that drops more than the allowed margin', () => {
    expect(compareScore('a', score({ contrast: 95 }), baseline)).toEqual([])
    expect(compareScore('a', score({ contrast: 80 }), baseline)).toEqual(['contrast 100 → 80'])
  })

  it('applies the page floor and ignores pages without a baseline', () => {
    const low = score({ hero: 0, whitespace: 0, minFont: 50 })
    expect(compareScore('new', low, baseline)).toEqual([])
    expect(compareScore('new', low, baseline, { floor: PAGE_FLOOR })).toEqual([`total ${low.total} < ${PAGE_FLOOR}`])
  })

  it('marks regressions red in the markdown report', () => {
    const s = score({ contrast: 80 })
    const md = scoreReportMarkdown('starters', [{ id: 'a', score: s, regressions: compareScore('a', s, baseline) }], baseline)
    expect(md).toContain('🔴 1 page(s) regressed')
    expect(md).toContain('🔴 **80** (-20)')
    expect(scoreReportMarkdown('starters', [{ id: 'a', score: score(), regressions: [] }], baseline)).toContain('✅ no visual regressions')
  })

  it('template gates: 3D subject fill and meeting-room hero', () => {
    expect(TEMPLATE_GATES['scene-3d']!(score({}, { heroFill: 0.3 }))).toHaveLength(1)
    expect(TEMPLATE_GATES['scene-3d']!(score({}, { heroFill: 0.45 }))).toEqual([])
    expect(TEMPLATE_GATES['meeting-rooms']!(score({ hero: 60 }))).toHaveLength(1)
  })

  it('committed baseline covers every built-in starter and passes the floor', () => {
    const committed = JSON.parse(readFileSync('scripts/golden/visual-baseline.json', 'utf8')) as Baseline
    for (const s of HTML_SANDBOX_STARTERS) {
      expect(committed[s.id], s.id).toBeDefined()
      expect(committed[s.id]!.total, s.id).toBeGreaterThanOrEqual(PAGE_FLOOR)
    }
  })
})
