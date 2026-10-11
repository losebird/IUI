/**
 * Structured appearance overrides ↔ customTokensJson.
 * Primary UX is form controls; JSON is an advanced escape hatch only.
 */

export type TokenOverrideForm = {
  accent: string
  radius: 'sm' | 'md' | 'lg' | ''
  density: 'compact' | 'comfortable' | ''
}

const RADIUS: Record<'sm' | 'md' | 'lg', { surface: string; control: string; sm: string }> = {
  sm: { surface: '6px', control: '4px', sm: '2px' },
  md: { surface: '10px', control: '6px', sm: '4px' },
  lg: { surface: '14px', control: '8px', sm: '6px' },
}

const DENSITY: Record<'compact' | 'comfortable', Record<string, string>> = {
  compact: {
    '--dsl-g-gap-lg': '10px',
    '--dsl-g-gap-md': '8px',
    '--dsl-g-gap-sm': '4px',
    '--dsl-g-stat-padding': '10px 12px',
    '--dsl-g-progress-height': '8px',
  },
  comfortable: {
    '--dsl-g-gap-lg': '16px',
    '--dsl-g-gap-md': '12px',
    '--dsl-g-gap-sm': '8px',
    '--dsl-g-stat-padding': '14px 16px',
    '--dsl-g-progress-height': '12px',
  },
}

export function emptyOverrides(): TokenOverrideForm {
  return { accent: '', radius: '', density: '' }
}

export function parseOverrides(json: string): TokenOverrideForm {
  const out = emptyOverrides()
  const raw = json.trim()
  if (!raw) return out
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed['--dsl-g-accent'] === 'string') out.accent = parsed['--dsl-g-accent']
    const surface = parsed['--dsl-g-radius-surface']
    if (surface === '6px') out.radius = 'sm'
    else if (surface === '10px') out.radius = 'md'
    else if (surface === '14px') out.radius = 'lg'
    if (parsed['--dsl-g-gap-lg'] === '10px') out.density = 'compact'
    else if (parsed['--dsl-g-gap-lg'] === '16px') out.density = 'comfortable'
  } catch {
    /* keep empty */
  }
  return out
}

export function composeOverrides(form: TokenOverrideForm): string {
  const map: Record<string, string> = {}
  if (form.accent.trim()) map['--dsl-g-accent'] = form.accent.trim()
  if (form.radius) {
    const r = RADIUS[form.radius]
    map['--dsl-g-radius-surface'] = r.surface
    map['--dsl-g-radius-control'] = r.control
    map['--dsl-g-radius-sm'] = r.sm
  }
  if (form.density) Object.assign(map, DENSITY[form.density])
  if (Object.keys(map).length === 0) return ''
  return JSON.stringify(map, null, 2)
}
