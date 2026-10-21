/**
 * S6: user templates — saved ```iui-html pages (source), persisted as JSON.
 *
 * Format (v2): [{ id, name, description?, source, createdAt? }] where `source` is the
 * fence body (`title:` / `---css` … or JSON). Legacy catalog entries ({demo: GenuiSpec})
 * can no longer render; they are kept only when they carry an `instruction`
 * (re-usable as a prompt), otherwise skipped with an explanation.
 */
import { FENCE_LANG_PRIMARY } from '../../config/defaults.ts'

export type UserTemplate = {
  id: string
  name: string
  description?: string
  /** ```iui-html fence body of the saved page. */
  source?: string
  /** Prompt-only template (legacy entries or hand-written). */
  instruction?: string
  createdAt?: string
}

export const MAX_TEMPLATES = 30
const MAX_NAME = 80
const MAX_DESC = 280
const MAX_INSTRUCTION = 2000
/** One saved page; whole list is capped so the config file stays small. */
export const MAX_TEMPLATE_SOURCE = 64_000
export const MAX_TEMPLATES_JSON = 600_000

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanId(raw: string): string {
  return raw.trim().slice(0, 64).replace(/[^\w.-]+/g, '-')
}

/** Strip a surrounding ```iui-html fence if the user pasted a whole fence. */
export function templateSourceBody(raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  const m = /^(`{3,})[ \t]*[\w-]*[^\n]*\n([\s\S]*?)\n\1[ \t]*$/.exec(text)
  return (m ? m[2]! : text).trim()
}

/** Parse + validate userTemplatesJson. Invalid entries are dropped with errors. */
export function parseUserTemplatesJson(raw: string | undefined | null): {
  templates: UserTemplate[]
  errors: string[]
} {
  const text = (raw ?? '').trim()
  if (!text) return { templates: [], errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { templates: [], errors: ['invalid JSON'] }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.templates)
      ? parsed.templates
      : null
  if (list === null) return { templates: [], errors: ['expected an array or {templates:[]}'] }
  const errors: string[] = []
  const templates: UserTemplate[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length && templates.length < MAX_TEMPLATES; i++) {
    const row = list[i]
    if (!isPlainObject(row)) {
      errors.push(`#${i + 1}: not an object`)
      continue
    }
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, MAX_NAME) : ''
    if (!name) {
      errors.push(`#${i + 1}: name required`)
      continue
    }
    const id = cleanId(typeof row.id === 'string' && row.id.trim() ? row.id : `tpl-${i + 1}`) || `tpl-${i + 1}`
    if (seen.has(id)) {
      errors.push(`#${i + 1} (${id}): duplicate id`)
      continue
    }
    const source = typeof row.source === 'string' ? templateSourceBody(row.source) : ''
    const instruction = typeof row.instruction === 'string' ? row.instruction.trim().slice(0, MAX_INSTRUCTION) : ''
    if (source.length > MAX_TEMPLATE_SOURCE) {
      errors.push(`#${i + 1} (${id}): page source too large`)
      continue
    }
    if (!source && !instruction) {
      errors.push(row.demo !== undefined
        ? `#${i + 1} (${id}): legacy catalog template (no longer supported)`
        : `#${i + 1} (${id}): source required`)
      continue
    }
    seen.add(id)
    const item: UserTemplate = { id, name }
    if (typeof row.description === 'string' && row.description.trim()) item.description = row.description.trim().slice(0, MAX_DESC)
    if (source) item.source = source
    if (instruction) item.instruction = instruction
    const created = typeof row.createdAt === 'string' ? row.createdAt : typeof row.updatedAt === 'string' ? row.updatedAt : ''
    if (created.trim()) item.createdAt = created.trim().slice(0, 40)
    templates.push(item)
  }
  if (list.length > MAX_TEMPLATES) errors.push(`truncated to ${MAX_TEMPLATES} templates`)
  return { templates, errors }
}

export function serializeUserTemplates(templates: readonly UserTemplate[]): string {
  if (templates.length === 0) return ''
  return JSON.stringify(templates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    ...(tpl.description ? { description: tpl.description } : {}),
    ...(tpl.source ? { source: tpl.source } : {}),
    ...(tpl.instruction ? { instruction: tpl.instruction } : {}),
    ...(tpl.createdAt ? { createdAt: tpl.createdAt } : {}),
  })))
}

/** Insert or replace (by id); newest first. Throws on an empty / oversized page. */
export function upsertUserTemplate(templates: readonly UserTemplate[], next: UserTemplate): UserTemplate[] {
  const id = cleanId(next.id) || `tpl-${Date.now().toString(36)}`
  const source = next.source ? templateSourceBody(next.source) : ''
  const instruction = next.instruction?.trim().slice(0, MAX_INSTRUCTION) ?? ''
  if (!source && !instruction) throw new Error('empty template')
  if (source.length > MAX_TEMPLATE_SOURCE) throw new Error('page too large')
  const row: UserTemplate = {
    id,
    name: next.name.trim().slice(0, MAX_NAME) || id,
    createdAt: next.createdAt ?? new Date().toISOString(),
  }
  if (next.description?.trim()) row.description = next.description.trim().slice(0, MAX_DESC)
  if (source) row.source = source
  if (instruction) row.instruction = instruction
  const out = [row, ...templates.filter((tpl) => tpl.id !== id)].slice(0, MAX_TEMPLATES)
  if (serializeUserTemplates(out).length > MAX_TEMPLATES_JSON) throw new Error('templates too large')
  return out
}

export function removeUserTemplate(templates: readonly UserTemplate[], id: string): UserTemplate[] {
  return templates.filter((tpl) => tpl.id !== id)
}

/** Merge an imported list (imported ids win), keeping the caps. */
export function mergeUserTemplates(current: readonly UserTemplate[], imported: readonly UserTemplate[]): UserTemplate[] {
  const ids = new Set(imported.map((tpl) => tpl.id))
  const out = [...imported, ...current.filter((tpl) => !ids.has(tpl.id))].slice(0, MAX_TEMPLATES)
  if (serializeUserTemplates(out).length > MAX_TEMPLATES_JSON) throw new Error('templates too large')
  return out
}

/** Composer text for "use this template": the page source plus room for the user's ask. */
export function userTemplatePrompt(tpl: UserTemplate, zh: boolean): string {
  if (!tpl.source) return tpl.instruction ?? ''
  const longest = Math.max(2, ...(tpl.source.match(/`{3,}/g) ?? []).map((run) => run.length))
  const ticks = '`'.repeat(longest + 1)
  const fence = `${ticks}${FENCE_LANG_PRIMARY}\n${tpl.source}\n${ticks}`
  const lead = tpl.instruction ?? (zh
    ? `请以下面这个页面「${tpl.name}」为模板，按我的需求改写后输出一个完整的 \`\`\`${FENCE_LANG_PRIMARY} 页面。我的需求：`
    : `Use the page “${tpl.name}” below as a template and output one complete \`\`\`${FENCE_LANG_PRIMARY} page adapted to my request. My request:`)
  return `${lead}\n\n${fence}`
}

/** Title from the fence header (`title: …`) or JSON body. */
export function templateNameFromSource(source: string): string {
  const body = templateSourceBody(source)
  const header = /^title:[ \t]*(.+)$/m.exec(body.split(/^---(?:css|html|js)\s*$/m)[0] ?? '')
  if (header?.[1]?.trim()) return header[1].trim().slice(0, MAX_NAME)
  try {
    const json = JSON.parse(body) as { title?: unknown }
    if (typeof json.title === 'string' && json.title.trim()) return json.title.trim().slice(0, MAX_NAME)
  } catch { /* not JSON */ }
  return ''
}
