/**
 * Shared empty / error chrome for core IUI components and ```iui-html.
 * Config-driven copy via i18n — no hard-coded product strings in callers.
 */
import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import type { GenuiTextKey } from '../i18n/runtime.ts'
import css from './StatusBlock.module.css'

export type StatusTone = 'empty' | 'error'

export type StatusAction = {
  label: string
  onClick: () => void
}

export type StatusBlockProps = {
  tone?: StatusTone
  /** Optional short eyebrow (defaults from tone). */
  eyebrow?: string
  title: string
  detail?: string
  actions?: ReadonlyArray<StatusAction>
  /** For tests / DOM queries. */
  kind?: string
}

export function StatusBlock({
  tone = 'empty',
  eyebrow,
  title,
  detail,
  actions,
  kind,
}: StatusBlockProps): ReactNode {
  const t = useT()
  const resolvedEyebrow = eyebrow
    ?? (tone === 'error' ? t('status.errorEyebrow') : t('status.emptyEyebrow'))
  return (
    <div
      className={css.status}
      data-tone={tone}
      data-iui-status={kind ?? tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={css.eyebrow}>{resolvedEyebrow}</span>
      <span className={css.title}>{title}</span>
      {detail !== undefined && detail !== '' && <span className={css.detail}>{detail}</span>}
      {actions !== undefined && actions.length > 0 && (
        <div className={css.actions}>
          {actions.map((action, i) => (
            <button key={i} type="button" className={css.actionBtn} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Preset empty state keyed by component kind. */
export function EmptyState({
  kind,
  detail,
  actions,
}: {
  kind: 'table' | 'list' | 'chart' | 'tabs' | 'steps' | 'keyvalue' | 'select' | 'card' | 'sandbox' | 'link' | 'map' | 'generic'
  detail?: string
  actions?: ReadonlyArray<StatusAction>
}): ReactNode {
  const t = useT()
  const titleKey = `status.empty.${kind}` as GenuiTextKey
  const title = t(titleKey)
  return (
    <StatusBlock
      tone="empty"
      kind={kind}
      title={title === titleKey ? t('status.empty.generic') : title}
      {...(detail !== undefined ? { detail } : {})}
      {...(actions !== undefined ? { actions } : {})}
    />
  )
}

export function ErrorState({
  title,
  detail,
  actions,
  kind = 'error',
}: {
  title?: string
  detail?: string
  actions?: ReadonlyArray<StatusAction>
  kind?: string
}): ReactNode {
  const t = useT()
  return (
    <StatusBlock
      tone="error"
      kind={kind}
      title={title ?? t('status.error.title')}
      {...(detail !== undefined ? { detail } : {})}
      {...(actions !== undefined ? { actions } : {})}
    />
  )
}
