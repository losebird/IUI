/**
 * Neutral sandbox brand tokens (single product path: iui-html).
 * No pack catalog — accent/density from IUI_TOKEN_CATALOG + soft accent.
 */
import { IUI_TOKEN_CATALOG, tokenCatalogToCssVars } from './tokens.ts'
import { deriveBrandSurfaces } from './color-utils.ts'

export const SANDBOX_BRAND_ID = 'sandbox' as const

const ACCENT = '#18181b'
const ACCENT_DARK = '#fafafa'
const FONT = 'ui-sans-serif, system-ui, sans-serif'
const OK = '#16a34a'
const WARN = '#d97706'
const DANGER = '#dc2626'

/** CSS vars injected into ```iui-html (shared density + soft accent). */
export function sandboxBrandCssVars(_id?: string): Record<string, string> {
  const d = IUI_TOKEN_CATALOG.density
  const surfaces = deriveBrandSurfaces(ACCENT)
  const vars = tokenCatalogToCssVars(IUI_TOKEN_CATALOG, {
    accent: ACCENT,
    fontFamily: FONT,
    radius: d.radius,
    radiusSm: d.radiusSm,
  })
  vars['--iui-pack-radius-control'] = d.radiusControl
  vars['--iui-pack-ok'] = OK
  vars['--iui-pack-warn'] = WARN
  vars['--iui-pack-danger'] = DANGER
  vars['--iui-pack-accent-dark'] = ACCENT_DARK
  vars['--iui-pack-secondary'] = surfaces.secondary
  vars['--iui-pack-tint'] = surfaces.tint
  vars['--iui-pack-tint-strong'] = surfaces.tintStrong
  vars['--iui-pack-hero-from'] = surfaces.heroFrom
  vars['--iui-pack-hero-to'] = surfaces.heroTo
  vars['--iui-pack-surface'] = surfaces.surface
  vars['--iui-pack-surface-muted'] = surfaces.surfaceMuted
  vars['--iui-pack-fg'] = surfaces.fg
  vars['--iui-pack-muted-fg'] = surfaces.mutedFg
  vars['--iui-pack-border'] = surfaces.border
  vars['--iui-pack-on-accent'] = surfaces.onAccent
  vars['--iui-pack-surface-dark'] = surfaces.surfaceDark
  vars['--iui-pack-surface-muted-dark'] = surfaces.surfaceMutedDark
  vars['--iui-pack-fg-dark'] = surfaces.fgDark
  vars['--iui-pack-muted-fg-dark'] = surfaces.mutedFgDark
  vars['--iui-pack-border-dark'] = surfaces.borderDark
  vars['--dsl-g-fg'] = surfaces.fg
  vars['--dsl-g-bg'] = surfaces.surface
  vars['--dsl-g-surface'] = surfaces.surface
  vars['--dsl-g-muted-fg'] = surfaces.mutedFg
  vars['--dsl-g-border'] = surfaces.border
  return vars
}

/** @deprecated alias — packBrandCssVars removed with packs */
export const packBrandCssVars = sandboxBrandCssVars
