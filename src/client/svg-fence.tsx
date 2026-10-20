import { useLayoutEffect, useRef, useState, type Key } from 'react'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { SvgNode } from './blocks/svg.tsx'
import { codeBlockLabels } from './primitive-labels.ts'
import { useT } from './i18n/index.ts'
import css from './GenuiBlock.module.css'

/**
 * F16: a plain ```svg block is ordinary code — it opens on the source tab.
 * Only an `<svg data-iui…>` root (IUI-authored) opens on the preview tab;
 * the preview tab is always one click away.
 */
export function isIuiMarkedSvg(raw: string): boolean {
  const head = raw.slice(0, 4000)
  return /<svg\b[^>]*\sdata-iui(?:-[\w-]+)?\s*=/iu.test(head)
    || /<svg\b[^>]*\sdata-iui[\s>/]/iu.test(head)
}

function SvgFence({ raw }: { raw: string }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
  const [source, setSource] = useState(() => !isIuiMarkedSvg(raw))
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const update = () => { setSettled(node.closest('[data-streaming]') === null) }
    update()
    const observer = new MutationObserver(update)
    for (let ancestor = node.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['data-streaming'] })
    }
    return () => { observer.disconnect() }
  })
  return (
    <div ref={ref} data-genui-svg-fence className={`${css.block} ${css.tabs}`}>
      {settled && <div role="group" aria-label={t('block.svgLabel')} className={css.tabBar}>
        <button type="button" className={`${css.tab} ${!source ? css.tabActive : ''}`} aria-pressed={!source} onClick={() => { setSource(false) }}>{t('block.svgPreview')}</button>
        <button type="button" className={`${css.tab} ${source ? css.tabActive : ''}`} aria-pressed={source} onClick={() => { setSource(true) }}>{t('block.svgSource')}</button>
      </div>}
      {!settled || source
        ? <CodeBlock {...codeBlockLabels()} code={raw} lang="svg" />
        : <SvgNode node={{ type: 'svg', code: raw }} />}
    </div>
  )
}

export function renderSvgFence(raw: string, key: Key) {
  return <SvgFence key={key} raw={raw} />
}
