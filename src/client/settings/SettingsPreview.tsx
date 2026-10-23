/**
 * S3: live settings preview — the real sandbox runtime (same srcdoc builder as chat
 * pages), one scheme at a time (浅色 / 深色 switch). Appearance edits are posted live (no reload);
 * token edits rebuild the frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildHtmlSandboxSrcdoc, mergeSandboxDesignTokens, parseHtmlSandboxFence } from '../../shared/html-sandbox.ts'
import { pageAppearanceCss, serializePageAppearance, type PageAppearance } from '../../shared/page-appearance.ts'
import { sandboxAssetBase } from '../asset-loader.ts'
import { currentLocale } from '../i18n/index.ts'
import { getActiveTheme, themeToStyle } from '../theme/apply-theme.ts'
import { settingsPreviewPage } from './preview-page.ts'
import styles from './IuiSettingsSection.module.css'

type Scheme = 'light' | 'dark'

function PreviewFrame(props: { scheme: Scheme; appearance: PageAppearance; tokensKey: string; label: string }) {
  const { scheme } = props
  const zh = currentLocale() === 'zh'
  const frameId = `iui-settings-preview-${scheme}`
  const forced: PageAppearance = { ...props.appearance, scheme }
  const css = pageAppearanceCss(forced)
  const latest = useRef({ css, scheme })
  latest.current = { css, scheme }
  const ref = useRef<HTMLIFrameElement>(null)
  const srcdoc = useMemo(() => {
    const spec = parseHtmlSandboxFence(settingsPreviewPage(zh))
    if (spec === null) return ''
    const assetBase = sandboxAssetBase()
    return buildHtmlSandboxSrcdoc(spec, {
      frameId,
      designTokens: mergeSandboxDesignTokens(themeToStyle(getActiveTheme(), scheme === 'dark'), 'sandbox'),
      mergePackTokens: false,
      brandId: 'sandbox',
      uiLang: zh ? 'zh-CN' : 'en',
      appearanceCss: latest.current.css,
      appearanceScheme: scheme,
      ...(assetBase ? { assetBase } : {}),
    })
    // appearance is posted live below; only tokens / locale rebuild the page
  }, [frameId, scheme, zh, props.tokensKey])
  const post = (): void => {
    try {
      ref.current?.contentWindow?.postMessage({ source: 'iui-html-host', type: 'appearance', frameId, css: latest.current.css, scheme }, '*')
    } catch { /* detached */ }
  }
  useEffect(post, [serializePageAppearance(forced)])
  // Auto-height from the sandbox's own resize messages (clamped), so density / text size changes stay fully visible.
  const [height, setHeight] = useState(340)
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { source?: unknown; type?: unknown; frameId?: unknown; height?: unknown } | null
      if (!data || data.source !== 'iui-html' || data.type !== 'resize' || data.frameId !== frameId) return
      if (event.source !== ref.current?.contentWindow) return
      const h = Number(data.height)
      if (Number.isFinite(h) && h > 0) setHeight(Math.max(240, Math.min(560, Math.ceil(h) + 2)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameId])
  return (
    <figure className={styles.previewPane} data-iui-settings-preview={scheme}>
      <iframe
        ref={ref}
        title={props.label}
        className={styles.previewFrame}
        style={{ height }}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        onLoad={post}
      />
    </figure>
  )
}

/** visual(⑫): ONE full-width preview with a 浅色 / 深色 switch (the side-by-side pair squeezed 12,480 → 12,48). */
export function SettingsPreview(props: { appearance: PageAppearance; tokensKey: string; t: (key: string) => string; scheme?: Scheme }) {
  const scheme = props.scheme ?? 'light'
  return (
    <PreviewFrame key={scheme} scheme={scheme} appearance={props.appearance} tokensKey={props.tokensKey} label={props.t(scheme === 'dark' ? 'previewDark' : 'previewLight')} />
  )
}
