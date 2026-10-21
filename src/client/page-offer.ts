/**
 * G7: host-rendered 「做成可交互页面」 under the latest settled text answer.
 *
 * In `balanced` (default) explain / compare questions are answered in prose; this
 * offer lets the user ask for the page with one click — zero model tokens. The
 * click only fills the composer (same rule as a page's `sendPrompt`): the user
 * presses Send, so nothing is sent on their behalf.
 */
import { shouldOfferPage } from '../config/referee-rules.ts'
import { insertIntoComposer, mutationTouchesComposer } from './composer-bridge.ts'
import { t } from './i18n/index.ts'
import { assistantRows, hasIuiFenceInRow, isStreaming, latestUserAskNear, rowText } from './markdown-rescue.tsx'
import { pushTipToast } from './tip-toast.tsx'

const ATTR = 'data-iui-page-offer'
const MIN_ANSWER_CHARS = 40

/** Pure gate (tests): offer under this answer? */
export function pageOfferApplies(input: { ask: string; answer: string; hasFence: boolean; streaming: boolean; rescued: boolean }): boolean {
  if (input.streaming || input.hasFence || input.rescued) return false
  if (input.answer.trim().length < MIN_ANSWER_CHARS) return false
  return shouldOfferPage(input.ask)
}

function buildOffer(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.setAttribute(ATTR, 'mount')
  wrap.style.cssText = 'margin:10px 0 2px;display:flex;'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute(ATTR, 'button')
  btn.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:4px 12px;border-radius:999px;' +
    'border:1px solid rgba(127,127,127,.28);background:transparent;color:inherit;font:inherit;font-size:13px;' +
    'cursor:pointer;opacity:.85;transition:opacity .15s ease,background-color .15s ease;'
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.94 14.06 2 22"/><path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>'
  const label = document.createElement('span')
  label.textContent = t('offer.makePage')
  btn.appendChild(label)
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.backgroundColor = 'rgba(127,127,127,.08)' })
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '.85'; btn.style.backgroundColor = 'transparent' })
  btn.addEventListener('click', () => {
    void insertIntoComposer(t('offer.prompt')).then((result) => {
      if (result === 'failed') return
      pushTipToast({ title: t('offer.makePage'), description: t((result === 'inserted' ? 'offer.inserted' : 'offer.copied')), durationMs: 3000 })
    })
  })
  wrap.appendChild(btn)
  return wrap
}

export function installPageOffer(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const sweep = (): void => {
    const rows = assistantRows(document)
    const last = rows[rows.length - 1]
    for (const row of rows) {
      const mount = row.querySelector(`[${ATTR}="mount"]`)
      if (row !== last) { mount?.remove(); continue }
      let ok = false
      try {
        ok = pageOfferApplies({
          ask: latestUserAskNear(row),
          answer: rowText(row),
          hasFence: hasIuiFenceInRow(row),
          streaming: isStreaming(row),
          rescued: row.querySelector('[data-iui-md-rescue]') !== null,
        })
      } catch { ok = false }
      if (!ok) { mount?.remove(); continue }
      if (!mount) row.appendChild(buildOffer())
    }
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  const queue = (): void => {
    if (timer !== null) return
    timer = setTimeout(() => { timer = null; try { sweep() } catch { /* never break the chat */ } }, 400)
  }
  const observer = new MutationObserver((records) => {
    if (records.every((r) => mutationTouchesComposer(r) || (r.target instanceof Element && r.target.closest(`[${ATTR}]`) !== null))) return
    queue()
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-streaming'] })
  const interval = setInterval(queue, 2000)
  queue()
  return () => {
    observer.disconnect()
    clearInterval(interval)
    if (timer !== null) clearTimeout(timer)
    document.querySelectorAll(`[${ATTR}="mount"]`).forEach((n) => n.remove())
  }
}
