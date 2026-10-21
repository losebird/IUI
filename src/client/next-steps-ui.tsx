/**
 * G13: 「继续修改」chips under the latest settled page, and example chips for a
 * blank conversation. Clicks only fill the composer — never send.
 */
import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react'
import { insertIntoComposer } from './composer-bridge.ts'
import { latestUserAskNear } from './markdown-rescue.tsx'
import { nextStepChips, pageIntentFor, recordPageIntent, starterChips, type Chip } from './next-steps.ts'
import { useLocaleRevision, useT } from './i18n/index.ts'
import { pushTipToast } from './tip-toast.tsx'

const SETTLED_EVENT = 'iui:page-settled'

const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '8px 0 2px' }
const CHIP: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '4px 12px', borderRadius: 999,
  border: '1px solid rgba(127,127,127,.28)', background: 'transparent', color: 'inherit', font: 'inherit',
  fontSize: 13, cursor: 'pointer', opacity: 0.88,
}

function fill(chip: Chip, title: string, t: (k: string) => string): void {
  void insertIntoComposer(chip.prompt).then((result) => {
    if (result === 'failed') return
    pushTipToast({ title, description: t(result === 'inserted' ? 'offer.inserted' : 'offer.copied'), durationMs: 3000 })
  })
}

/** True when `el` is the last sandbox page in the document. */
function isLatestPage(el: Element | null): boolean {
  if (!el || !el.isConnected) return false
  const all = el.ownerDocument.querySelectorAll('[data-iui-html-sandbox]')
  return all.length > 0 && all[all.length - 1] === el
}

function rowOf(el: Element): Element {
  return el.closest('[data-role="assistant"], [data-message-role="assistant"], .assistant-message, [data-chat-anchor-key]') ?? el
}

/** G16: intent of the page rendered in `el` (from the user ask near it + title). */
export function pageIntentOf(el: Element | null, title?: string | undefined): string {
  return pageIntentFor(el ? latestUserAskNear(rowOf(el)) : '', title)
}

export function NextStepChips({ shellRef, enabled, title, source }: {
  shellRef: RefObject<HTMLElement | null>
  enabled: boolean
  title?: string | undefined
  source: string
}) {
  const t = useT()
  const localeRevision = useLocaleRevision()
  const [latest, setLatest] = useState(false)
  const [ask, setAsk] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!enabled) { setLatest(false); return }
    const el = shellRef.current
    if (!el) return
    setAsk(latestUserAskNear(rowOf(el)))
    const check = (): void => setLatest(isLatestPage(shellRef.current))
    check()
    window.dispatchEvent(new CustomEvent(SETTLED_EVENT))
    window.addEventListener(SETTLED_EVENT, check)
    return () => {
      window.removeEventListener(SETTLED_EVENT, check)
      // Let the previous page take the chips back when this one goes away.
      setTimeout(() => window.dispatchEvent(new CustomEvent(SETTLED_EVENT)), 0)
    }
  }, [enabled, shellRef])

  const intent = useMemo(() => pageIntentFor(ask, title), [ask, title])
  useEffect(() => {
    if (enabled) recordPageIntent(intent, source)
  }, [enabled, intent, source])
  const chips = useMemo(() => nextStepChips(intent), [intent, localeRevision])

  if (!enabled || !latest || dismissed) return null
  return (
    <div data-iui-next-steps={intent} role="group" aria-label={t('next.aria')} style={ROW}>
      <span style={{ fontSize: 12, opacity: 0.6, marginRight: 2 }}>{t('next.label')}</span>
      {chips.map((chip) => (
        <button key={chip.id} type="button" data-iui-next-step={chip.id} style={CHIP} title={chip.prompt}
          onClick={() => { fill(chip, chip.label, t); setDismissed(true) }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

/** Blank-conversation examples; renders only while the conversation root is in its hero phase. */
export function StarterChips() {
  const t = useT()
  const localeRevision = useLocaleRevision()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [hero, setHero] = useState(false)

  useEffect(() => {
    const root = anchor?.closest('[data-phase]')
    if (!root) { setHero(false); return }
    const read = (): void => setHero(root.getAttribute('data-phase') === 'hero')
    read()
    if (typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(read)
    mo.observe(root, { attributes: true, attributeFilter: ['data-phase'] })
    return () => mo.disconnect()
  }, [anchor])

  const chips = useMemo(() => starterChips(), [localeRevision, hero])
  return (
    <div ref={setAnchor} data-iui-starters={hero ? 'shown' : 'hidden'} style={hero ? { ...ROW, margin: '0 0 8px', justifyContent: 'center' } : { display: 'none' }}>
      {hero && chips.map((chip) => (
        <button key={chip.id} type="button" data-iui-starter={chip.id} style={CHIP} title={chip.prompt}
          onClick={() => fill(chip, chip.label, t)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
