/**
 * S6: 「我的模板」 store. Like the default page style: this browser's copy wins
 * (instant, works without the settings form), and every change is also written to
 * the IUI config (`userTemplatesJson`) when the host form is writable so other
 * devices see it.
 */
import { getRuntimeConfigSnapshot, subscribeRuntimeConfig } from './runtime-config.ts'
import {
  parseUserTemplatesJson,
  removeUserTemplate,
  serializeUserTemplates,
  templateNameFromSource,
  upsertUserTemplate,
  type UserTemplate,
} from './settings/user-templates.ts'

const LOCAL_KEY = 'iui:user-templates'
const listeners = new Set<() => void>()
let cached: { key: string; value: readonly UserTemplate[] } | null = null

/** Settings bridge (`writeIuiConfigField`), injected to keep this module testable. */
export type WriteConfig = (field: string, value: string) => Promise<boolean>

function readLocal(): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCAL_KEY) } catch { return null }
}

export function getUserTemplates(): readonly UserTemplate[] {
  const local = readLocal()
  const raw = local ?? getRuntimeConfigSnapshot().userTemplatesJson ?? ''
  const key = `${local === null ? 'c' : 'l'}:${raw}`
  if (cached?.key === key) return cached.value
  cached = { key, value: parseUserTemplatesJson(raw).templates }
  return cached.value
}

export function subscribeUserTemplates(listener: () => void): () => void {
  listeners.add(listener)
  const stop = subscribeRuntimeConfig(listener)
  return () => { listeners.delete(listener); stop() }
}

export type SaveTemplatesResult = 'synced' | 'local'

/** Replace the whole list (settings page, import, delete). */
export async function replaceUserTemplates(list: readonly UserTemplate[], writeConfig?: WriteConfig): Promise<SaveTemplatesResult> {
  const json = serializeUserTemplates(list)
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LOCAL_KEY, json) } catch { /* private mode / quota */ }
  for (const l of [...listeners]) l()
  if (!writeConfig) return 'local'
  const ok = await writeConfig('userTemplatesJson', json).catch(() => false)
  return ok ? 'synced' : 'local'
}

/** ⋯ → 「保存为模板」: save a page's fence body. */
export async function saveUserTemplateFromPage(
  input: { source: string; name?: string; description?: string },
  writeConfig?: WriteConfig,
): Promise<{ result: SaveTemplatesResult; template: UserTemplate }> {
  const name = input.name?.trim() || templateNameFromSource(input.source) || new Date().toLocaleString()
  const next = upsertUserTemplate(getUserTemplates(), {
    id: `tpl-${Date.now().toString(36)}`,
    name,
    ...(input.description ? { description: input.description } : {}),
    source: input.source,
  })
  const result = await replaceUserTemplates(next, writeConfig)
  return { result, template: next[0]! }
}

export async function deleteUserTemplate(id: string, writeConfig?: WriteConfig): Promise<SaveTemplatesResult> {
  return replaceUserTemplates(removeUserTemplate(getUserTemplates(), id), writeConfig)
}
