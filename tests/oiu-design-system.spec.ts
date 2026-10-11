import { describe, expect, it } from 'vitest'
import {
  buildOiuDesignSystemCss,
  buildOiuImportmapScriptTag,
  buildTripAnimatorScriptTag,
  OIU_DESIGN_SKILL,
  OIU_IMPORTMAP,
} from '../src/themes/oiu-design-system.ts'
import {
  buildHtmlSandboxSrcdoc,
  getHtmlSandboxStarter,
  listHtmlSandboxStarters,
} from '../src/shared/html-sandbox.ts'
import { buildGenuiSectionText } from '../src/plugin/section-text.ts'

describe('OIU design-system port', () => {
  it('exports theme + svg + form CSS with color tokens', () => {
    const css = buildOiuDesignSystemCss()
    expect(css).toContain('--color-background-primary')
    expect(css).toContain('--color-text-secondary')
    expect(css).toContain('svg .c-teal')
    expect(css).toContain('.iui-itinerary')
    expect(css).toContain('.iui-compare-3')
    expect(css).toContain('fadeSlideIn')
  })

  it('importmap includes three/gsap/d3/chart.js/leaflet', () => {
    const tag = buildOiuImportmapScriptTag()
    expect(tag).toContain('type="importmap"')
    for (const key of Object.keys(OIU_IMPORTMAP.imports)) {
      expect(tag).toContain(key)
    }
  })

  it('injects createTripAnimator into srcdoc', () => {
    const trip = buildTripAnimatorScriptTag()
    expect(trip).toContain('window.createTripAnimator')
    expect(trip).toContain('pinProgress')

    const starter = getHtmlSandboxStarter('itinerary-coast')
    expect(starter).toBeTruthy()
    const doc = buildHtmlSandboxSrcdoc(starter!.spec, { frameId: 't1' })
    expect(doc).toContain('window.createTripAnimator')
    expect(doc).toContain('--color-background-primary')
    expect(doc).toContain('type="importmap"')
    expect(doc).toContain('iui-itinerary')
    expect(doc).toContain('Special:FilePath/GoldenGateBridge-001.jpg')
    expect(doc).toContain('<img src=')
    expect(OIU_DESIGN_SKILL).toMatch(/Photos \(REQUIRED/)
    expect(OIU_DESIGN_SKILL).not.toMatch(/solid muted blocks or Wikimedia/)
  })

  it('pricing starter is 3-column compare', () => {
    const starter = getHtmlSandboxStarter('pricing-3col')
    expect(starter).toBeTruthy()
    expect(starter!.spec.html).toContain('iui-compare-3')
    expect(starter!.spec.html).toContain('iui-tier featured')
    const tiers = starter!.spec.html.split('iui-tier').length - 1
    expect(tiers).toBeGreaterThanOrEqual(3)
  })

  it('system prompt includes OIU design skill + trip pattern', () => {
    const section = buildGenuiSectionText()
    expect(section).toContain('--color-background-primary')
    expect(section).toContain('createTripAnimator')
    expect(section).toContain('iui-compare-3')
    expect(section).toContain('runnable author JS')
    expect(section).toContain('in-page')
    expect(section).toContain('window.iuiCreateChart')
    expect(OIU_DESIGN_SKILL).toContain('California-coast')
  })

  it('lists new starters', () => {
    const ids = listHtmlSandboxStarters().map((s) => s.id)
    expect(ids).toContain('itinerary-coast')
    expect(ids).toContain('pricing-3col')
  })
})
