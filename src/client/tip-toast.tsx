/**
 * tip-toast.tsx — lightweight body-level tips (Markdown auto-remediate, etc.).
 * Independent of the achievement stack so product tips stay quieter.
 */
import { createElement, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useT } from './i18n/index.ts'
import { ChromeIcon, chromeCss as ck } from './chrome/icons.tsx'

export interface TipToast {
  title: string
  description?: string
  /** ms; default 4200 */
  durationMs?: number
  /** visual(⑪): leading icon tone (default 'info'). */
  tone?: 'info' | 'success'
  /** visual(⑪): one inline action, e.g. 撤销 after 已保存为模板. */
  action?: { label: string; onClick: () => void }
}

interface TipItem extends TipToast {
  key: number
}

type Listener = () => void

let tipKey = 0
let pending: TipItem[] = []
let version = 0
const listeners = new Set<Listener>()

function notify(): void {
  version += 1
  for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getVersion(): number {
  return version
}

/** Push a tip toast (callers should fire once per remediation). */
export function pushTipToast(tip: TipToast): void {
  pending = [...pending, { ...tip, key: ++tipKey }]
  notify()
}

function TipToasts() {
  const rev = useSyncExternalStore(subscribe, getVersion, getVersion)
  const [items, setItems] = useState<TipItem[]>([])
  const timers = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    if (pending.length === 0) return
    const next = pending
    pending = []
    setItems((prev) => [...prev, ...next])
    for (const item of next) {
      const ms = item.durationMs ?? 4200
      const id = window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.key !== item.key))
        timers.current.delete(item.key)
      }, ms)
      timers.current.set(item.key, id)
    }
  }, [rev])

  useEffect(
    () => () => {
      for (const t of timers.current.values()) window.clearTimeout(t)
    },
    [],
  )

  const dismiss = (key: number): void => {
    setItems((prev) => prev.filter((i) => i.key !== key))
    const id = timers.current.get(key)
    if (id !== undefined) window.clearTimeout(id)
    timers.current.delete(key)
  }

  if (items.length === 0) return null
  return (
    <div className={`${ck.root} ${ck.toasts}`} data-iui-tip-toasts="" role="status" aria-live="polite">
      {items.map((item) => (
        <ToastCard
          key={item.key}
          tone={item.tone ?? 'info'}
          title={item.title}
          {...(item.description ? { description: item.description } : {})}
          {...(item.action ? { action: { label: item.action.label, onClick: () => { item.action!.onClick(); dismiss(item.key) } } } : {})}
          onClose={() => dismiss(item.key)}
        />
      ))}
    </div>
  )
}

/** visual(⑪): the one toast card shared by tips, 已保存为模板 and achievements. */
export function ToastCard(props: {
  tone: 'info' | 'success' | 'achievement'
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  onClose?: () => void
}): ReactElement {
  const t = useT()
  const icon = props.tone === 'success' ? 'circle-check' : props.tone === 'achievement' ? 'trophy' : 'sparkles'
  return (
    <div className={ck.toast} data-iui-toast={props.tone}>
      <span className={ck.toastIcon} data-tone={props.tone}><ChromeIcon name={icon} size={18} /></span>
      <div className={ck.toastBody}>
        <div className={ck.toastTitle}>{props.title}</div>
        {props.description ? <div className={ck.toastDesc}>{props.description}</div> : null}
      </div>
      {props.action ? (
        <button type="button" className={`${ck.btn} ${ck.btnSm}`} data-iui-toast-action="1" onClick={props.action.onClick}>{props.action.label}</button>
      ) : null}
      {props.onClose ? (
        <button type="button" className={ck.iconBtn} aria-label={t('toast.close')} title={t('toast.close')} onClick={props.onClose}>
          <ChromeIcon name="x" size={15} />
        </button>
      ) : null}
    </div>
  )
}

/** Mount the tip stack (from client apply; returns disposer). */
export function mountTipToasts(): () => void {
  if (typeof document === 'undefined') return () => {}
  const host = document.createElement('div')
  host.dataset.iuiTipToasts = '1'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(createElement(TipToasts))
  return () => {
    root.unmount()
    host.remove()
  }
}
