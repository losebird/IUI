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
    expect(css).not.toContain('.iui-itinerary .iui-pin-dot { opacity: 0; }')
    expect(css).toMatch(/\.iui-pin-dot \{[\s\S]*opacity: 1;/)
    expect(css).toMatch(/\.leaflet-container \{[\s\S]*grayscale/)
    expect(css).toContain('.iui-gallery .photo img')
    expect(css).toMatch(/\.iui-gallery \.photo img[\s\S]*max-height: min\(70vh, 640px\)/)
    expect(css).toMatch(/\.iui-gallery \.photo img[\s\S]*object-fit: contain !important/)
    expect(css).toContain('.iui-sandbox-card:not(:has(.iui-place-card ~ .iui-place-card))')
    expect(css).toContain('.iui-sandbox-card:not(:has(article ~ article)) > article > .photo img')
    expect(css).toContain('.iui-stop-card .photo img')
    expect(css).toMatch(/\.iui-stop-card \.photo img \{[\s\S]*object-fit: cover/)
    expect(css).not.toContain('#iui-preview-root img')
    expect(css).not.toMatch(/#iui-preview-root img[\s\S]{0,80}max-height: 360px/)
  })

  it('cards-strip can scroll inside a column flex/grid card instead of blowing the first border', () => {
    const css = buildOiuDesignSystemCss()
    const strip = css.match(/\.iui-cards-strip\s*\{[^}]+\}/)?.[0] ?? ''
    const itinerary = css.match(/\.iui-itinerary\s*\{[^}]+\}/)?.[0] ?? ''
    // 8×200px stop cards must not inflate min-content and paint past the
    // itinerary/sandbox-card border that was laid out at iframe width.
    expect(strip).toMatch(/overflow-x:\s*auto/)
    expect(strip).toMatch(/min-width:\s*0/)
    expect(strip).toMatch(/max-width:\s*100%/)
    expect(itinerary).toMatch(/min-width:\s*0/)
    expect(itinerary).toMatch(/max-width:\s*100%/)
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
    expect(section).toContain('typeof import')
    expect(section).toContain("import('three')")
    expect(section).toContain('video.play()')
    expect(OIU_DESIGN_SKILL).toContain('Nanjing density')
    expect(OIU_DESIGN_SKILL).toContain('停留')
    expect(OIU_DESIGN_SKILL).toMatch(/避坑/)
    expect(section).toContain('click-to-detail')
  })

  it('lists new starters', () => {
    const ids = listHtmlSandboxStarters().map((s) => s.id)
    expect(ids).toContain('itinerary-coast')
    expect(ids).toContain('pricing-3col')
  })
})
