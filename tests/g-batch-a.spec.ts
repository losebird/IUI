/**
 * Round 3 batch A: G1 (responsive patterns), G2 (page accent + tokens), G3 (chart /
 * ECharts theming guards), G5 (state classes), G6 (slim prompt + pattern notes),
 * G8 (map gestures).
 */
import { describe, expect, it } from 'vitest'
import { contrastRatio, deriveAccentSet, normalizeAccent, pageAccentCss } from '../src/shared/page-accent.ts'
import { buildHtmlSandboxSrcdoc, parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { applySandboxPatch, pageFromSpec, parseSandboxPatch } from '../src/shared/sandbox-patch.ts'
import { OIU_DESIGN_KIT_CSS, OIU_FORM_STYLES_CSS, OIU_THEME_CSS } from '../src/themes/oiu-design-system.ts'
import { GENUI_SECTION_TEXT } from '../src/plugin/section-text.ts'
import { buildPatternNote, patternNotesFor } from '../src/config/referee-rules.ts'

describe('G2 page accent', () => {
  it('normalises hex and rejects junk', () => {
    expect(normalizeAccent('#E4572E')).toBe('#e4572e')
    expect(normalizeAccent('#abc')).toBe('#aabbcc')
    expect(normalizeAccent('red; } body{display:none')).toBeNull()
    expect(normalizeAccent(42)).toBeNull()
    expect(pageAccentCss('nope')).toBe('')
  })

  it.each(['#F2C94C', '#E4572E', '#185FA5', '#2DD4BF', '#111111', '#FFFFFF', '#8B5CF6'])(
    'derives AA-safe tokens for %s',
    (hex) => {
      const light = deriveAccentSet(hex, 'light')
      expect(contrastRatio(light.accent, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(light.onAccent, light.fill)).toBeGreaterThanOrEqual(4.5)
      const dark = deriveAccentSet(hex, 'dark')
      expect(contrastRatio(dark.accent, '#1a1a18')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.onAccent, dark.fill)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps a light accent fill and switches ink to dark', () => {
    const s = deriveAccentSet('#F2C94C', 'light')
    expect(s.fill).toBe('#f2c94c')
    expect(s.onAccent).toBe('#111111')
  })

  it('section header and JSON accept accent; srcdoc injects it after the theme', () => {
    const sec = parseHtmlSandboxFence('title: t\nheight: 300\naccent: #E4572E\n---html\n<p>x</p>')!
    expect(sec.accent).toBe('#e4572e')
    const json = parseHtmlSandboxFence(JSON.stringify({ title: 't', html: '<p>x</p>', accent: '#185FA5' }))!
    expect(json.accent).toBe('#185fa5')
    const doc = buildHtmlSandboxSrcdoc(sec)
    expect(doc).toContain('--accent-fill:#e4572e!important')
    expect(doc.indexOf('--accent-fill:#e4572e')).toBeGreaterThan(doc.indexOf('--color-background-primary'))
  })

  it('iui-patch can change only the accent', () => {
    const base = pageFromSpec(parseHtmlSandboxFence('title: 记账\nheight: 300\n---html\n<p id="a">x</p>')!)
    const patch = parseSandboxPatch('page: 记账\naccent: #2DD4BF')
    expect(patch).not.toBeNull()
    const out = applySandboxPatch(base, patch!)
    expect(out.page.accent).toBe('#2dd4bf')
  })

  it('theme ships the shared token scale', () => {
    for (const t of ['--space-1', '--space-8', '--shadow-1', '--shadow-3', '--lh-body', '--accent-strong', '--iui-chart-8']) {
      expect(OIU_THEME_CSS).toContain(t)
    }
  })
})

describe('G3 chart / ECharts theming', () => {
  const spec = parseHtmlSandboxFence(
    "title: t\nheight: 300\n---html\n<canvas id=c></canvas><div id=e></div><div id=m></div>\n---js\nnew Chart(document.getElementById('c'),{type:'bar',data:{labels:['a'],datasets:[{data:[1]}]}});echarts.init(document.getElementById('e'));L.map('m');",
  )!
  const doc = buildHtmlSandboxSrcdoc(spec)
  it('chart guard runs before the Chart.js vendor tag', () => {
    expect(doc).toContain('iuiChartPalette')
    expect(doc).toContain('__iuiRethemeCharts')
    expect(doc.indexOf('iuiChartPalette')).toBeLessThan(doc.indexOf('src="https://cdn.jsdelivr.net/npm/chart.js'))
  })
  it('echarts guard registers the iui theme before the vendor tag', () => {
    expect(doc).toContain('__iuiRethemeEcharts')
    expect(doc.indexOf('__iuiRethemeEcharts')).toBeLessThan(doc.indexOf('src="https://cdn.jsdelivr.net/npm/echarts'))
  })
  it('leaflet guard (G8 cooperative gestures) runs before the Leaflet vendor tag', () => {
    expect(doc).toContain('addInitHook')
    expect(doc.indexOf('addInitHook')).toBeLessThan(doc.indexOf('src="https://cdn.jsdelivr.net/npm/leaflet'))
  })
})

describe('G1 / G5 / G8 CSS', () => {
  it('compare stacks and kanban scrolls on phones', () => {
    expect(OIU_FORM_STYLES_CSS).toMatch(/max-width: 520px\)\s*\{\s*\.iui-compare-3 \{ grid-template-columns: 1fr; \}/)
    expect(OIU_FORM_STYLES_CSS).toContain('scroll-snap-type: x mandatory')
  })
  it('ships hero / empty / skeleton / sample badge and map hint', () => {
    for (const c of ['.iui-hero', '.iui-empty', '.iui-skeleton', '.iui-badge-sample', '.iui-map-hint']) {
      expect(OIU_DESIGN_KIT_CSS + OIU_FORM_STYLES_CSS + OIU_THEME_CSS).toContain(c)
    }
  })
})

describe('G6 slim prompt + pattern notes', () => {
  it('resident section is short and carries the 7 design principles', () => {
    expect(GENUI_SECTION_TEXT.length).toBeLessThan(3600)
    expect(GENUI_SECTION_TEXT).toContain('accent:')
    expect(GENUI_SECTION_TEXT).toContain('.iui-empty')
    expect(GENUI_SECTION_TEXT).toContain('[iui-pattern]')
    expect(GENUI_SECTION_TEXT).not.toContain('World_Street_Map')
    expect(GENUI_SECTION_TEXT).not.toContain('iui-weather-day')
  })
  it.each([
    ['做一个任务看板', 'kanban'],
    ['帮我规划南京三日游行程', 'map'],
    ['上海天气怎么样', 'weather'],
    ['做个定价页三档', 'compare'],
    ['做一个可排序的员工数据表', 'grid-table'],
    ['画个思维导图', 'mindmap'],
    ['做一个3D地球', 'scene-3d'],
    ['做个销售数据看板', 'dashboard'],
    ['做一个报名表单', 'form'],
  ])('%s → %s', (ask, id) => {
    expect(patternNotesFor(ask)[0]?.id).toBe(id)
  })
  it('no note for plain, knowledge or opt-out asks', () => {
    for (const ask of ['你好', 'Python 里怎么反转列表', '不要做页面，告诉我北京天气']) {
      expect(buildPatternNote(ask)).toBeNull()
    }
  })
  it('notes are tagged and bounded', () => {
    const note = buildPatternNote('做个南京行程地图，顺便看看天气')!
    expect(note.startsWith('[iui-pattern]')).toBe(true)
    expect(patternNotesFor('做个南京行程地图，顺便看看天气').length).toBeLessThanOrEqual(2)
    expect(buildPatternNote('做一个任务看板')).not.toContain('Dashboard:')
  })
})
