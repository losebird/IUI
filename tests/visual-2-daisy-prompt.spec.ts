/** visual(②/⑧): prompt, starters, design-lint and recipes speak daisyUI. */
import { describe, expect, it } from 'vitest'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'
import { SANDBOX_RECIPE } from '../src/plugin/format-referee.ts'
import { buildPatternNote, INTENT_RULES } from '../src/config/referee-rules.ts'
import { designLintNote, lintSandboxDesign } from '../src/shared/design-lint.ts'
import { PATTERN_STARTERS } from '../src/shared/pattern-starters.ts'
import { buildIuiDaisyCss, IUI_PREFLIGHT_CSS, IUI_UTILITIES_CSS } from '../src/themes/iui-daisy.ts'

const OLD_VOCAB = /iui-sandbox-(card|btn|grid|kpi|muted)|--color-(background|text)-(primary|secondary)|iui-compare-3|iui-weather-/u

describe('visual(②) daisyUI vocabulary', () => {
  it('resident prompt teaches daisyUI + no Tailwind runtime, no OIU classes', () => {
    expect(GENUI_SECTION_TEXT).toContain('card card-body')
    expect(GENUI_SECTION_TEXT).toContain('tabs tabs-box')
    expect(GENUI_SECTION_TEXT).toContain('NO Tailwind runtime')
    expect(GENUI_SECTION_TEXT).not.toMatch(OLD_VOCAB)
    expect(SANDBOX_RECIPE).toContain('btn btn-primary')
    expect(SANDBOX_RECIPE).not.toMatch(OLD_VOCAB)
  })

  it('pattern notes describe the ⑧ templates', () => {
    expect(buildPatternNote('帮我做个南京三日游行程地图')).toContain('World_Light_Gray_Base')
    expect(buildPatternNote('做个三档定价页')).toContain('bg-neutral')
    expect(buildPatternNote('上海天气怎么样，做个天气卡片')).toContain('temperature-range bar')
    expect(buildPatternNote('做一个任务看板')).toContain('status dot')
    expect(buildPatternNote('推荐几家上海酒店，做成卡片')).toContain('4:3 cover')
    expect(buildPatternNote('做个会议室预订看板')).toContain('「现在」')
  })

  it('starters and rescue recipes carry no OIU vocabulary and lint clean', () => {
    const ids = PATTERN_STARTERS.map((s) => s.id)
    for (const id of ['itinerary-coast', 'weather-dense', 'pricing-3col', 'hotel-covers', 'meeting-rooms', 'kanban-board']) expect(ids).toContain(id)
    for (const s of PATTERN_STARTERS.filter((x) => !['ag-grid-sheet', 'mermaid-mindmap', 'scene-3d'].includes(x.id))) {
      expect(s.spec.html + s.spec.css, s.id).not.toMatch(OLD_VOCAB)
      expect(lintSandboxDesign({ html: s.spec.html, css: s.spec.css }), s.id).toEqual([])
    }
    for (const r of INTENT_RULES) {
      const spec = JSON.parse(r.recipe) as { html: string; css: string; js: string }
      expect(spec.html + spec.css, r.id).not.toMatch(OLD_VOCAB)
      expect(spec.js, r.id).not.toMatch(/\balert\(/u)
      expect(lintSandboxDesign(spec), r.id).toEqual([])
    }
  })

  it('design-lint flags Tailwind layout utilities unless the author CSS defines them', () => {
    const html = '<div class="card border"><div class="card-body flex gap-4 p-6"><h2 class="text-xl">x</h2><div class="grid md:grid-cols-3"></div></div></div>'
    const issues = lintSandboxDesign({ html, css: '' })
    expect(issues.find((i) => i.kind === 'tailwind-utility')?.detail).toContain('gap-4')
    expect(designLintNote(issues)).toContain('没有 Tailwind')
    expect(lintSandboxDesign({ html: '<div class="card-body p-6 gap-4"></div>', css: '.p-6{padding:24px}.gap-4{gap:16px}' })).toEqual([])
    expect(lintSandboxDesign({ html: '<div class="card-body p-6"></div>', css: '' })).toEqual([])
    expect(designLintNote([{ kind: 'stat-label', detail: 'x' }])).toContain('stat-value')
  })

  it('theme ships the button preflight, soft-badge text tokens and bg-neutral', () => {
    const css = buildIuiDaisyCss()
    expect(css).toContain(IUI_PREFLIGHT_CSS)
    expect(IUI_PREFLIGHT_CSS).toMatch(/^@layer base\{/u)
    expect(IUI_PREFLIGHT_CSS).toContain('background-color:transparent')
    expect(css.indexOf(IUI_PREFLIGHT_CSS)).toBeLessThan(css.indexOf(IUI_UTILITIES_CSS))
    expect(IUI_UTILITIES_CSS).toContain('.badge-soft.badge-success,.badge-outline.badge-success,.alert-soft.alert-success{color:var(--color-text-success)}')
    expect(IUI_UTILITIES_CSS).toContain('.bg-neutral{background-color:var(--color-neutral);color:var(--color-neutral-content)}')
  })
})
