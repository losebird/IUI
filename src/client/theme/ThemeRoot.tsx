/**
 * Applies the active ThemePack CSS variables onto the fence/panel root.
 * Visuals stay config-driven: swap themeId → different tokens, same CSS structure.
 */
import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import {
  getActiveTheme,
  getActiveThemeId,
  isHostDarkTheme,
  subscribeActiveTheme,
  themeToStyle,
} from './apply-theme.ts'
import { getActivePackId, subscribeActivePack } from './apply-pack.ts'

function subscribeDark(cb: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const obs = new MutationObserver(cb)
  obs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => obs.disconnect()
}

function readDark(): boolean {
  return isHostDarkTheme()
}

export function ThemeRoot({
  className,
  dataAttr = 'iui',
  children,
  style,
}: {
  className?: string | undefined
  dataAttr?: string | undefined
  children: ReactNode
  style?: CSSProperties | undefined
}) {
  const dark = useSyncExternalStore(subscribeDark, readDark, () => false)
  const themeId = useSyncExternalStore(subscribeActiveTheme, getActiveThemeId, () => getActiveThemeId())
  const packId = useSyncExternalStore(subscribeActivePack, getActivePackId, () => getActivePackId())
  // Re-read theme object when themeId (or custom tokens via same subscribe) changes.
  const theme = getActiveTheme()
  const tokenStyle = useMemo(() => themeToStyle(theme, dark), [theme, dark, themeId])
  const attrs: Record<string, string> = {
    [`data-${dataAttr}`]: '',
    'data-iui-theme': theme.id,
    'data-iui-pack': packId,
  }
  return (
    <div
      className={className ?? ''}
      style={{ ...tokenStyle, ...style } as CSSProperties}
      {...attrs}
    >
      {children}
    </div>
  )
}
