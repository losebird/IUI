/**
 * G10: the user's default page style. Saved in this browser immediately and,
 * when the host settings form is writable, in the IUI config (`pageStyleJson`)
 * so the plugin can mention it in the prompt and other devices pick it up.
 */
import {
  DEFAULT_PAGE_APPEARANCE,
  normalizePageAppearance,
  serializePageAppearance,
  type PageAppearance,
} from '../shared/page-appearance.ts'
import { getRuntimeConfigSnapshot, subscribeRuntimeConfig } from './runtime-config.ts'

const LOCAL_KEY = 'iui:page-style-default'
const listeners = new Set<() => void>()
let cached: { key: string; value: PageAppearance } | null = null

function readLocal(): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCAL_KEY) } catch { return null }
}

/** Browser value wins (set from this device); else the config value. */
export function getDefaultPageAppearance(): PageAppearance {
  const local = readLocal()
  const raw = local ?? getRuntimeConfigSnapshot().pageStyleJson ?? ''
  const key = `${local === null ? 'c' : 'l'}:${raw}`
  if (cached?.key === key) return cached.value
  cached = { key, value: raw === '' ? { ...DEFAULT_PAGE_APPEARANCE } : normalizePageAppearance(raw) }
  return cached.value
}

export function subscribeDefaultPageAppearance(listener: () => void): () => void {
  listeners.add(listener)
  const stop = subscribeRuntimeConfig(listener)
  return () => { listeners.delete(listener); stop() }
}

export type SaveDefaultResult = 'synced' | 'local'

/** Save as default; `writeConfig` (settings bridge) is injected to keep this module testable. */
export async function saveDefaultPageAppearance(
  a: PageAppearance,
  writeConfig?: (field: string, value: string) => Promise<boolean>,
): Promise<SaveDefaultResult> {
  const json = serializePageAppearance(a)
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LOCAL_KEY, json) } catch { /* private mode */ }
  for (const l of listeners) l()
  if (!writeConfig) return 'local'
  const ok = await writeConfig('pageStyleJson', json).catch(() => false)
  return ok ? 'synced' : 'local'
}
