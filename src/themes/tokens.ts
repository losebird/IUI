/**
 * IUI design-token catalog — toward ChatGPT Intelligent UI density.
 * Packs map these semantic names onto CSS variables; Settings may
 * override a subset via customTokensJson. No call site hard-codes pixel values.
 */

export const IUI_TOKEN_CATALOG = {
  /** Surface & ink */
  color: {
    bg: 'surface.bg',
    fg: 'surface.fg',
    muted: 'surface.muted',
    mutedFg: 'surface.mutedFg',
    border: 'surface.border',
    primary: 'action.primary',
    primaryFg: 'action.primaryFg',
    ok: 'semantic.ok',
    warn: 'semantic.warn',
    danger: 'semantic.danger',
    ring: 'focus.ring',
  },
  /** Density (ChatGPT-like compact cards) */
  density: {
    radius: '16px',
    radiusSm: '10px',
    radiusControl: '8px',
    gapLg: '16px',
    gap: '12px',
    gapSm: '8px',
    gapXs: '4px',
    pad: '14px 16px',
    padSm: '8px 10px',
    controlHeight: '32px',
    controlHeightSm: '28px',
    fontSize: '13px',
    fontSizeSm: '12px',
    fontHero: '28px',
    fontStat: '22px',
    lineHeight: '1.45',
    letterSpacing: '-0.011em',
  },
  /** Elevation */
  elevation: {
    0: 'none',
    1: '0 1px 0 hsl(240 5% 10% / 0.03), 0 1px 3px hsl(240 5% 10% / 0.04)',
    2: '0 2px 8px hsl(240 5% 10% / 0.06)',
    3: '0 8px 24px hsl(240 5% 10% / 0.10)',
  },
  /** Motion */
  motion: {
    ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
    enterMs: 260,
    staggerMs: 45,
    hoverMs: 160,
    enterY: '6px',
  },
  /** Control chrome (ChatGPT-like) */
  control: {
    height: '32px',
    heightSm: '28px',
    radius: '8px',
    fontSize: '13px',
    segmentedRadius: '999px',
  },
  /** Chart defaults */
  chart: {
    strokeWidth: 2,
    areaOpacity: 0.12,
    axisMuted: 'surface.mutedFg',
    sparkHeight: 22,
    ringSize: 40,
    ringStroke: 3.5,
  },
  map: {
    height: 280,
    minHeight: 220,
    radius: '12px',
  },
} as const

export type IuiTokenCatalog = typeof IUI_TOKEN_CATALOG

/**
 * Flatten catalog into CSS custom properties shared by every pack root.
 * Brand packs only override accent / font / radius brand keys on top of this.
 */
export function tokenCatalogToCssVars(
  catalog: IuiTokenCatalog = IUI_TOKEN_CATALOG,
  brand?: Readonly<{ accent?: string; fontFamily?: string; radius?: string; radiusSm?: string }>,
): Record<string, string> {
  const d = catalog.density
  const m = catalog.motion
  const e = catalog.elevation
  const c = catalog.control
  const ch = catalog.chart
  const out: Record<string, string> = {
    '--iui-pack-radius': brand?.radius ?? d.radius,
    '--iui-pack-radius-sm': brand?.radiusSm ?? d.radiusSm,
    '--iui-pack-radius-control': d.radiusControl,
    '--iui-pack-gap-lg': d.gapLg,
    '--iui-pack-gap': d.gap,
    '--iui-pack-gap-sm': d.gapSm,
    '--iui-pack-gap-xs': d.gapXs,
    '--iui-pack-pad': d.pad,
    '--iui-pack-pad-sm': d.padSm,
    '--iui-pack-control-h': d.controlHeight,
    '--iui-pack-control-h-sm': d.controlHeightSm,
    '--iui-pack-font': d.fontSize,
    '--iui-pack-font-sm': d.fontSizeSm,
    '--iui-pack-font-hero': d.fontHero,
    '--iui-pack-font-stat': d.fontStat,
    '--iui-pack-lh': d.lineHeight,
    '--iui-pack-tracking': d.letterSpacing,
    '--iui-pack-elev': e[1],
    '--iui-pack-elev-2': e[2],
    '--iui-pack-elev-3': e[3],
    '--iui-pack-ease': m.ease,
    '--iui-pack-enter-ms': `${m.enterMs}ms`,
    '--iui-pack-stagger-ms': `${m.staggerMs}ms`,
    '--iui-pack-hover-ms': `${m.hoverMs}ms`,
    '--iui-pack-enter-y': m.enterY,
    '--iui-pack-control-radius': c.radius,
    '--iui-pack-segment-radius': c.segmentedRadius,
    '--iui-pack-spark-h': `${ch.sparkHeight}px`,
    '--iui-pack-ring-size': `${ch.ringSize}px`,
    '--iui-pack-ring-stroke': String(ch.ringStroke),
    '--iui-pack-map-h': `${catalog.map.height}px`,
    '--iui-pack-map-min-h': `${catalog.map.minHeight}px`,
    '--iui-pack-map-radius': catalog.map.radius,
    // Host theme bridge (also used by library-tokens)
    '--dsl-g-gap-lg': d.gapLg,
    '--dsl-g-gap-md': d.gap,
    '--dsl-g-gap-sm': d.gapSm,
    '--dsl-g-gap-xs': d.gapXs,
    '--dsl-g-radius-surface': brand?.radius ?? d.radius,
    '--dsl-g-radius-control': brand?.radiusSm ?? d.radiusControl,
    '--dsl-g-radius-sm': d.radiusControl,
    '--dsl-g-motion-ease': m.ease,
    '--dsl-g-motion-enter-ms': `${m.enterMs}ms`,
    '--dsl-g-motion-stagger-ms': `${m.staggerMs}ms`,
    '--dsl-g-control-height': c.height,
    '--dsl-g-font-body': d.fontSize,
  }
  if (brand?.accent) {
    out['--iui-pack-accent'] = brand.accent
    out['--dsl-g-accent'] = brand.accent
  }
  if (brand?.fontFamily) out['--iui-pack-font-family'] = brand.fontFamily
  return out
}

/** Serialize CSS vars for injection into :root / pack root style attribute. */
export function cssVarsToInline(vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

/**
 * First-class component catalog (names the model may emit).
 * Depth target: ChatGPT-like coverage, not npm skin count.
 */
export const IUI_COMPONENT_CATALOG = [
  // layout
  'text', 'row', 'col', 'grid', 'card', 'divider', 'spacer', 'hero',
  // display
  'badge', 'entity', 'chips', 'stat', 'progress', 'list', 'table', 'keyvalue', 'timeline',
  'file-tree', 'breadcrumb', 'callout', 'steps', 'diff', 'json', 'code',
  'copy', 'avatar', 'audio', 'video', 'image', 'map',
  // charts
  'chart', 'echart', 'plot',
  // interactive (local-first capable)
  'button', 'input', 'textarea', 'select', 'checkbox', 'switch', 'slider',
  'radio', 'submit', 'quiz', 'link', 'tabs', 'accordion',
  // advanced
  'mermaid', 'diagram', 'scene3d', 'svg',
  // DIL-lite macros compile to the above (see dilLiteCatalog().macros)
] as const

export type IuiComponentType = (typeof IUI_COMPONENT_CATALOG)[number]
