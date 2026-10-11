/**
 * User custom UI templates — persisted as JSON in plugin config.
 * Schema is data-driven; validation reuses validateGenuiSpec (no hard-coded demos).
 */
import type { GenuiSpec } from '../spec.ts'
import { validateGenuiSpec } from '../guard.ts'

export type UserTemplate = {
  id: string
  name: string
  description?: string
  /** Optional natural-language instruction for "try it". */
  instruction?: string
  /** Valid ```iui demo spec shown in Settings preview. */
  demo: GenuiSpec
  updatedAt?: string
}

const MAX_TEMPLATES = 40
const MAX_NAME = 80
const MAX_DESC = 280
const MAX_INSTRUCTION = 2000

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanId(raw: string): string {
  return raw.trim().slice(0, 64).replace(/[^\w.-]+/g, '-')
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
    return { templates: [], errors: ['userTemplatesJson: invalid JSON'] }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.templates)
      ? parsed.templates
      : null
  if (list === null) {
    return { templates: [], errors: ['userTemplatesJson: expected an array or {templates:[]}'] }
  }
  const errors: string[] = []
  const templates: UserTemplate[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length && templates.length < MAX_TEMPLATES; i++) {
    const row = list[i]
    if (!isPlainObject(row)) {
      errors.push(`templates[${i}]: not an object`)
      continue
    }
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, MAX_NAME) : ''
    if (!name) {
      errors.push(`templates[${i}]: name required`)
      continue
    }
    const idRaw = typeof row.id === 'string' && row.id.trim() ? row.id : `tpl-${i + 1}`
    const id = cleanId(idRaw) || `tpl-${i + 1}`
    if (seen.has(id)) {
      errors.push(`templates[${i}]: duplicate id ${id}`)
      continue
    }
    const demo = row.demo
    const validation = validateGenuiSpec(demo)
    if (!validation.ok) {
      errors.push(`templates[${i}] (${id}): ${validation.errors.join('; ')}`)
      continue
    }
    seen.add(id)
    const item: UserTemplate = {
      id,
      name,
      demo: demo as GenuiSpec,
    }
    if (typeof row.description === 'string' && row.description.trim()) {
      item.description = row.description.trim().slice(0, MAX_DESC)
    }
    if (typeof row.instruction === 'string' && row.instruction.trim()) {
      item.instruction = row.instruction.trim().slice(0, MAX_INSTRUCTION)
    }
    if (typeof row.updatedAt === 'string' && row.updatedAt.trim()) {
      item.updatedAt = row.updatedAt.trim()
    }
    templates.push(item)
  }
  if (list.length > MAX_TEMPLATES) {
    errors.push(`userTemplatesJson: truncated to ${MAX_TEMPLATES} templates`)
  }
  return { templates, errors }
}

export function serializeUserTemplates(templates: readonly UserTemplate[]): string {
  return JSON.stringify(
    templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      ...(tpl.description ? { description: tpl.description } : {}),
      ...(tpl.instruction ? { instruction: tpl.instruction } : {}),
      demo: tpl.demo,
      ...(tpl.updatedAt ? { updatedAt: tpl.updatedAt } : {}),
    })),
    null,
    2,
  )
}

export function upsertUserTemplate(
  templates: readonly UserTemplate[],
  next: UserTemplate,
): UserTemplate[] {
  const id = cleanId(next.id) || `tpl-${Date.now()}`
  const validation = validateGenuiSpec(next.demo)
  if (!validation.ok) {
    throw new Error(validation.errors.join('; ') || 'invalid demo spec')
  }
  const row: UserTemplate = {
    id,
    name: next.name.trim().slice(0, MAX_NAME) || id,
    demo: next.demo,
    updatedAt: new Date().toISOString(),
  }
  if (next.description?.trim()) row.description = next.description.trim().slice(0, MAX_DESC)
  if (next.instruction?.trim()) row.instruction = next.instruction.trim().slice(0, MAX_INSTRUCTION)
  const without = templates.filter((tpl) => tpl.id !== id)
  return [row, ...without].slice(0, MAX_TEMPLATES)
}

export function removeUserTemplate(
  templates: readonly UserTemplate[],
  id: string,
): UserTemplate[] {
  return templates.filter((tpl) => tpl.id !== id)
}

export { MAX_TEMPLATES }

/** Build a paste/composer-ready ```iui fence (optional instruction prefix). */
export function formatIuiFence(
  demo: GenuiSpec,
  options: { instruction?: string; leadIn?: string } = {},
): string {
  const body = JSON.stringify(demo, null, 2)
  const fence = `\`\`\`iui\n${body}\n\`\`\``
  const instruction = options.instruction?.trim()
  if (instruction) return `${instruction}\n\n${fence}`
  const lead = options.leadIn?.trim() || '请按下面的 ```iui 规格在气泡里渲染界面：'
  return `${lead}\n\n${fence}`
}
