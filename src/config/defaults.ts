/** Default theme id — single neutral theme for sandbox product path. */
export const DEFAULT_THEME_ID = 'iui-default'
/** @deprecated packs deleted; kept as no-op id for any leftover callers */
export const DEFAULT_PACK_ID = 'sandbox'

/** Product fence language: free HTML/CSS/JS sandbox. */
export const FENCE_LANG_PRIMARY = 'iui-html'
/** Legacy aliases — degrade / optional html parse only. */
export const FENCE_LANG_ALIASES = ['iui', 'dsh-ui'] as const
/** Explicit sandbox fence (same as primary). */
export const FENCE_LANG_HTML = 'iui-html'
