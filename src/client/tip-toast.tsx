/**
 * tip-toast.tsx — lightweight body-level tips (Markdown auto-remediate, etc.).
 * Independent of the achievement stack so product tips stay quieter.
 */
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import css from './GenuiBlock.module.css'

export interface TipToast {
  title: string
  description?: string
  /** ms; default 4200 */
  durationMs?: number
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

  if (items.length === 0) return null
  return createElement(
    'div',
    { className: css.tipToasts, 'data-iui-tip-toasts': true, role: 'status', 'aria-live': 'polite' },
    items.map((item) =>
      createElement(
        'div',
        { key: item.key, className: css.tipToast },
        createElement('span', { className: css.tipToastBadge, 'aria-hidden': true }, '✦'),
        createElement(
          'div',
          { className: css.tipToastBody },
          createElement('div', { className: css.tipToastTitle }, item.title),
          item.description
            ? createElement('div', { className: css.tipToastDesc }, item.description)
            : null,
        ),
      ),
    ),
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
