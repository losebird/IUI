import { describe, expect, it } from 'vitest'
import { contrastRatio, deriveAccentSet, deriveSeriesPalette, pageAccentCss } from '../src/shared/page-accent.ts'
import { OIU_FORM_STYLES_CSS as OIU_DESIGN_SYSTEM_CSS } from '../src/themes/oiu-design-system.ts'

describe('R5-0 screenshot defects', () => {
  it('accent pages get a harmonised 8-step chart series (no stock green next to orange)', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const fill = deriveAccentSet('#E4572E', scheme).fill
      const pal = deriveSeriesPalette(fill, scheme)
      expect(pal).toHaveLength(8)
      expect(pal[0]).toBe(fill)
      expect(pal).not.toContain('#3b6d11')
      const surface = scheme === 'light' ? '#ffffff' : '#1a1a18'
      for (const c of pal.slice(1)) expect(contrastRatio(c, surface)).toBeGreaterThanOrEqual(2.95)
    }
    const css = pageAccentCss('#E4572E')
    for (let i = 1; i <= 8; i++) expect(css).toContain(`--iui-chart-${i}:`)
  })

  it('achromatic accents only override series 1–2', () => {
    expect(deriveSeriesPalette('#111111', 'light')).toHaveLength(2)
    expect(pageAccentCss('#111111')).not.toContain('--iui-chart-3:')
  })

  it('itinerary header groups trailing chips; Leaflet font + tile seam fixed', () => {
    expect(OIU_DESIGN_SYSTEM_CSS).toContain('.iui-itinerary-head > :first-child { margin-right: auto; }')
    expect(OIU_DESIGN_SYSTEM_CSS).toContain('html body .leaflet-container img.leaflet-tile { mix-blend-mode: normal; }')
    expect(OIU_DESIGN_SYSTEM_CSS).toMatch(/html body \.leaflet-container, html body \.leaflet-popup-content-wrapper[^{]*\{ font-family: var\(--font-sans\)/)
  })
})
