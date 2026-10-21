/**
 * G10: per-page appearance panel inside the iui-html ⋯ menu.
 * Accent swatches + custom colour, density / font size / corners / scheme,
 * reset, and "make this my default style".
 */
import type { CSSProperties, ReactElement } from 'react'
import {
  ACCENT_PRESETS,
  type PageAppearance,
  type PageDensity,
  type PageFontScale,
  type PageRadius,
  type PageScheme,
} from '../shared/page-appearance.ts'
import { useT, type GenuiTextKey } from './i18n/index.ts'

export interface AppearancePanelProps {
  value: PageAppearance
  /** True when this page has its own tweaks (reset is meaningful). */
  customized: boolean
  onChange: (next: PageAppearance) => void
  onReset: () => void
  onSaveDefault: () => void
  onBack: () => void
  savingNote?: string | null
}

const PANEL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 6px 4px', width: 236 }
const LABEL: CSSProperties = { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary, #6b7280)', marginBottom: 4 }
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '2px 2px' }
const SEG: CSSProperties = {
  display: 'flex', borderRadius: 7, padding: 2, gap: 2,
  background: 'var(--dsw-alias-bg-subtle, hsl(240 5% 95%))',
}
const SEG_BTN: CSSProperties = {
  flex: 1, fontSize: 12, padding: '4px 0', border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'transparent', color: 'var(--dsw-alias-label-secondary, #4b5563)',
}
const SEG_ON: CSSProperties = {
  ...SEG_BTN, background: 'var(--dsw-alias-bg-base, #fff)', color: 'var(--dsw-alias-label-primary, #111827)',
  boxShadow: '0 1px 2px rgba(15,23,42,.12)', fontWeight: 600,
}
const SWATCH: CSSProperties = {
  width: 20, height: 20, borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer', padding: 0,
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)',
}
const SWATCH_ON: CSSProperties = {
  boxShadow: '0 0 0 2px var(--dsw-alias-bg-base, #fff), 0 0 0 3.5px var(--dsw-alias-label-primary, #111827)',
}
const ACTION: CSSProperties = {
  flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--dsl-g-border-surface, hsl(240 6% 88%))',
  background: 'transparent', color: 'var(--dsw-alias-label-primary, #1f2937)',
}

function Segmented<T extends string>(props: {
  label: string
  options: ReadonlyArray<{ id: T; label: string }>
  value: T
  onPick: (v: T) => void
  attr: string
}): ReactElement {
  return (
    <div>
      <div style={LABEL}>{props.label}</div>
      <div style={SEG} role="radiogroup" aria-label={props.label} data-iui-appearance-group={props.attr}>
        {props.options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={props.value === o.id}
            style={props.value === o.id ? SEG_ON : SEG_BTN}
            data-iui-appearance-option={o.id}
            onClick={() => props.onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AppearancePanel(props: AppearancePanelProps): ReactElement {
  const t = useT()
  const { value, onChange } = props
  const set = (patch: Partial<PageAppearance>) => onChange({ ...value, ...patch })
  const custom = value.accent !== null && !ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === value.accent?.toLowerCase())
  return (
    <div style={PANEL} data-iui-appearance-panel="1">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" style={{ ...SEG_BTN, flex: 'none', padding: '2px 6px' }} aria-label={t('appearance.back')} onClick={props.onBack}>‹</button>
        <strong style={{ fontSize: 13 }}>{t('sandbox.appearance')}</strong>
      </div>
      <div>
        <div style={LABEL}>{t('appearance.accent')}</div>
        <div style={ROW} role="radiogroup" aria-label={t('appearance.accent')} data-iui-appearance-group="accent">
          <button
            type="button"
            role="radio"
            aria-checked={value.accent === null}
            title={t('appearance.accentAuto')}
            style={{ ...SWATCH, background: 'conic-gradient(#185FA5, #0F766E, #E4572E, #D6336C, #185FA5)', ...(value.accent === null ? SWATCH_ON : {}) }}
            data-iui-appearance-option="auto"
            onClick={() => set({ accent: null })}
          />
          {ACCENT_PRESETS.map((p) => {
            const name = t(`appearance.color.${p.id}` as GenuiTextKey)
            const on = value.accent?.toLowerCase() === p.hex.toLowerCase()
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                title={name}
                style={{ ...SWATCH, background: p.hex, ...(on ? SWATCH_ON : {}) }}
                data-iui-appearance-option={p.id}
                onClick={() => set({ accent: p.hex })}
              />
            )
          })}
          <label
            title={t('appearance.accentCustom')}
            style={{ ...SWATCH, position: 'relative', overflow: 'hidden', display: 'inline-block', background: custom ? value.accent ?? '#888' : 'var(--dsw-alias-bg-subtle, #f3f4f6)', ...(custom ? SWATCH_ON : {}), fontSize: 12, lineHeight: '16px', textAlign: 'center' }}
          >
            {custom ? '' : '+'}
            <input
              type="color"
              aria-label={t('appearance.accentCustom')}
              value={value.accent ?? '#185fa5'}
              onChange={(e) => set({ accent: e.target.value })}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            />
          </label>
        </div>
      </div>
      <Segmented<PageDensity>
        label={t('appearance.density')}
        attr="density"
        value={value.density}
        onPick={(density) => set({ density })}
        options={[
          { id: 'compact', label: t('appearance.density.compact') },
          { id: 'standard', label: t('appearance.density.standard') },
          { id: 'comfortable', label: t('appearance.density.comfortable') },
        ]}
      />
      <Segmented<PageFontScale>
        label={t('appearance.scale')}
        attr="scale"
        value={value.scale}
        onPick={(scale) => set({ scale })}
        options={[
          { id: 'S', label: t('appearance.scale.S') },
          { id: 'M', label: t('appearance.scale.M') },
          { id: 'L', label: t('appearance.scale.L') },
        ]}
      />
      <Segmented<PageRadius>
        label={t('appearance.radius')}
        attr="radius"
        value={value.radius}
        onPick={(radius) => set({ radius })}
        options={[
          { id: 'square', label: t('appearance.radius.square') },
          { id: 'standard', label: t('appearance.radius.standard') },
          { id: 'round', label: t('appearance.radius.round') },
        ]}
      />
      <Segmented<PageScheme>
        label={t('appearance.scheme')}
        attr="scheme"
        value={value.scheme}
        onPick={(scheme) => set({ scheme })}
        options={[
          { id: 'auto', label: t('appearance.scheme.auto') },
          { id: 'light', label: t('appearance.scheme.light') },
          { id: 'dark', label: t('appearance.scheme.dark') },
        ]}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button type="button" style={{ ...ACTION, opacity: props.customized ? 1 : 0.5 }} disabled={!props.customized} onClick={props.onReset} data-iui-appearance-reset="1">
          {t('appearance.reset')}
        </button>
        <button type="button" style={{ ...ACTION, flex: 1.6 }} onClick={props.onSaveDefault} data-iui-appearance-save-default="1">
          {props.savingNote ?? t('appearance.saveDefault')}
        </button>
      </div>
    </div>
  )
}
