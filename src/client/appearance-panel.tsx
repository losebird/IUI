/**
 * G10: per-page appearance panel inside the iui-html ⋯ menu.
 * Accent swatches + custom colour, density / font size / corners / scheme,
 * reset, and "make this my default style".
 */
import type { ReactElement } from 'react'
import {
  ACCENT_PRESETS,
  type PageAppearance,
  type PageDensity,
  type PageFontScale,
  type PageRadius,
  type PageScheme,
} from '../shared/page-appearance.ts'
import { useT, type GenuiTextKey } from './i18n/index.ts'
import { ChromeIcon, chromeCss as ck } from './chrome/icons.tsx'

export interface AppearancePanelProps {
  value: PageAppearance
  /** True when this page has its own tweaks (reset is meaningful). */
  customized: boolean
  onChange: (next: PageAppearance) => void
  onReset: () => void
  onSaveDefault: () => void
  onBack: () => void
  savingNote?: string | null
  /** Settings → IUI → 外观: no back header / reset / save row (the page owns them). */
  embedded?: boolean
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
      <div className={ck.label}>{props.label}</div>
      <div className={ck.seg} role="radiogroup" aria-label={props.label} data-iui-appearance-group={props.attr}>
        {props.options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={props.value === o.id}
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
  const swatchClass = (on: boolean): string => (on ? `${ck.swatch} ${ck.swatchOn}` : `${ck.swatch}`)
  return (
    <div className={`${ck.root} ${props.embedded ? ck.panelRows : ck.panel}`} data-iui-appearance-panel={props.embedded ? 'embedded' : '1'}>
      {!props.embedded && (
        <div className={ck.panelHead}>
          <button type="button" className={ck.iconBtn} aria-label={t('appearance.back')} title={t('appearance.back')} onClick={props.onBack}>
            <ChromeIcon name="chevron-left" size={16} />
          </button>
          <span className={ck.panelTitle}>{t('sandbox.appearance')}</span>
          <span className={ck.panelScope}>{t('appearance.scope')}</span>
        </div>
      )}
      <div>
        <div className={ck.label}>{t('appearance.accent')}</div>
        <div className={ck.swatches} role="radiogroup" aria-label={t('appearance.accent')} data-iui-appearance-group="accent">
          <button
            type="button"
            role="radio"
            aria-checked={value.accent === null}
            aria-label={t('appearance.accentAuto')}
            title={t('appearance.accentAuto')}
            className={swatchClass(value.accent === null)}
            style={{ background: 'conic-gradient(#185FA5, #0F766E, #E4572E, #D6336C, #185FA5)' }}
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
                className={swatchClass(on)}
                style={{ background: p.hex }}
                data-iui-appearance-option={p.id}
                onClick={() => set({ accent: p.hex })}
              />
            )
          })}
          <label
            title={t('appearance.accentCustom')}
            className={custom ? swatchClass(true) : `${ck.swatch} ${ck.swatchAdd}`}
            style={custom ? { background: value.accent ?? '#888', overflow: 'hidden' } : undefined}
          >
            {custom ? null : <ChromeIcon name="plus" size={13} />}
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
      {!props.embedded && <div className={ck.panelActions}>
        <button type="button" className={ck.btn} disabled={!props.customized} onClick={props.onReset} data-iui-appearance-reset="1">
          {t('appearance.reset')}
        </button>
        <button type="button" className={`${ck.btn} ${ck.btnInk} ${ck.btnGrow}`} onClick={props.onSaveDefault} data-iui-appearance-save-default="1">
          {props.savingNote ?? t('appearance.saveDefault')}
        </button>
      </div>}
    </div>
  )
}
