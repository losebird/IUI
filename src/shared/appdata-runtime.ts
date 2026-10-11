/**
 * Typed appData runtime: tool results stay as structured JSON and are projected
 * onto component fields by COMPONENT_SCHEMAS — not only a flat string map.
 *
 * This is the plugin-feasible half of ChatGPT Intelligent UI's appData binding.
 * Hard walls (server DIL compiler, constrained decoding) live in docs/HARD-WALLS.md.
 */

import { COMPONENT_SCHEMAS, type ComponentFieldKind, type ComponentSchema } from '../client/genui-runtime/schema.ts'
import type { BindingMap } from './binding-parse.ts'
import { hasUnresolvedBind, lookupBinding, resolveBindValue } from './binding-parse.ts'

const MAX_TYPED = 64
const MAX_ID_LEN = 64
const MAX_DEPTH = 6
const MAX_JSON = 48_000

/** Structured payload keyed by binding id (cpu, weather.hourly, call.abc.metrics…). */
export type AppDataValue = unknown
export type AppDataMap = Record<string, AppDataValue>

export interface AppDataSnapshot {
  /** Flat scalars for `$bind:id` inline string tokens (backward compatible). */
  readonly bindings: BindingMap
  /** Structured payloads for schema projection. */
  readonly appData: AppDataMap
}

/** Fields that typically receive whole structured payloads by component type. */
const WHOLE_FIELD_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  chart: ['data', 'series'],
  echart: ['data', 'series', 'option'],
  list: ['items'],
  table: ['rows', 'columns'],
  chips: ['items'],
  steps: ['steps'],
  timeline: ['items'],
  keyvalue: ['pairs'],
  progress: ['value'],
  slider: ['value'],
  stat: ['value', 'spark', 'ring', 'label', 'delta', 'hint', 'tone'],
  hero: ['value', 'spark', 'title', 'subtitle', 'delta', 'label'],
  text: ['content'],
  badge: ['label'],
  entity: ['title', 'subtitle'],
  map: ['address', 'lat', 'lng', 'zoom', 'provider', 'query', 'facts', 'links', 'title', 'embed', 'markers', 'height', 'path', 'route'],
  json: ['value'],
  quiz: ['questions', 'items'],
  accordion: ['items'],
  input: ['value', 'placeholder'],
  textarea: ['value', 'placeholder'],
  select: ['options', 'value', 'selected'],
  radio: ['options', 'selected'],
  checkbox: ['checked', 'options'],
  switch: ['checked'],
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Unwrap common tool envelopes so the typed payload is the inner object/array. */
export function unwrapTypedEnvelope(parsed: unknown): unknown {
  if (!isPlainObject(parsed)) return parsed
  for (const key of ['appData', 'app_data', 'data', 'bindings', 'values', 'payload', 'result', 'metrics'] as const) {
    const inner = parsed[key]
    if (inner !== null && typeof inner === 'object') return inner
  }
  return parsed
}

/**
 * Parse tool stdout into a typed AppDataMap (id → structured value).
 * Scalars are stored as-is; objects/arrays keep structure (not stringified).
 */
export function parseToolResultAppData(
  content: string,
  toolName?: string,
  callId?: string,
): AppDataMap {
  const out: AppDataMap = {}
  const text = content.trim()
  if (text === '' || text.length > 200_000) return out

  const jsonCandidate = extractJsonBlob(text)
  if (jsonCandidate !== null) {
    try {
      const raw: unknown = JSON.parse(jsonCandidate)
      const unwrapped = unwrapTypedEnvelope(raw)
      ingestStructured(unwrapped, '', out, 0)
      if (raw !== unwrapped && isPlainObject(raw)) {
        // Keep envelope-level keys too (status, ok, …).
        for (const [k, v] of Object.entries(raw)) {
          if (k in out) continue
          if (['appData', 'app_data', 'data', 'bindings', 'values', 'payload', 'result', 'metrics'].includes(k)) continue
          putTyped(out, k, v)
        }
      }
    } catch {
      /* line fallback below */
    }
  }

  if (Object.keys(out).length === 0) {
    const LINE_KV = /^\s*([A-Za-z_\u4e00-\u9fff][\w.\u4e00-\u9fff-]{0,40})\s*[:=：]\s*([+\-]?[\d.]+%?|\S.{0,80})\s*$/u
    for (const line of text.split(/\r?\n/).slice(0, 200)) {
      if (Object.keys(out).length >= MAX_TYPED) break
      const m = LINE_KV.exec(line)
      if (m === null || m[1] === undefined || m[2] === undefined) continue
      const key = m[1].trim().slice(0, MAX_ID_LEN)
      const raw = m[2].trim()
      const num = Number(raw.replace(/%$/, ''))
      putTyped(out, key, Number.isFinite(num) && /^-?[\d.]+%?$/.test(raw) ? num : raw)
    }
  }

  aliasResourceKeys(out)

  if (toolName && toolName.trim() !== '') {
    const prefix = toolName.trim().slice(0, 32)
    const extra: AppDataMap = {}
    for (const [k, v] of Object.entries(out)) {
      if (Object.keys(extra).length + Object.keys(out).length >= MAX_TYPED) break
      putTyped(extra, `${prefix}.${k}`, v)
    }
    Object.assign(out, extra)
  }

  if (callId && callId.trim() !== '') {
    const short = callId.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)
    if (short !== '') {
      const extra: AppDataMap = {}
      for (const [k, v] of Object.entries(out)) {
        if (Object.keys(extra).length + Object.keys(out).length >= MAX_TYPED) break
        putTyped(extra, `call.${short}.${k}`, v)
      }
      Object.assign(out, extra)
    }
  }

  return out
}

function extractJsonBlob(text: string): string | null {
  if (text.startsWith('{') || text.startsWith('[')) return text
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence?.[1]) {
    const inner = fence[1].trim()
    if (inner.startsWith('{') || inner.startsWith('[')) return inner
  }
  const brace = text.indexOf('{')
  const bracket = text.indexOf('[')
  const start = brace >= 0 && (bracket < 0 || brace < bracket) ? brace : bracket
  if (start < 0) return null
  return text.slice(start)
}

function putTyped(out: AppDataMap, id: string, value: unknown): void {
  if (Object.keys(out).length >= MAX_TYPED) return
  const key = id.slice(0, MAX_ID_LEN)
  if (key === '') return
  if (typeof value === 'string' && value.length > MAX_JSON) {
    out[key] = value.slice(0, MAX_JSON)
    return
  }
  out[key] = value
}

function ingestStructured(value: unknown, prefix: string, out: AppDataMap, depth: number): void {
  if (Object.keys(out).length >= MAX_TYPED || depth > MAX_DEPTH) return
  if (value === null || value === undefined) return

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    if (prefix) putTyped(out, prefix, typeof value === 'boolean' ? (value ? 1 : 0) : value)
    return
  }

  if (Array.isArray(value)) {
    if (prefix) putTyped(out, prefix, value)
    const n = Math.min(value.length, 32)
    for (let i = 0; i < n; i++) {
      ingestStructured(value[i], prefix ? `${prefix}.${i}` : String(i), out, depth + 1)
    }
    return
  }

  if (isPlainObject(value)) {
    if (prefix) putTyped(out, prefix, value)
    else {
      // Root object: each top-level key is an appData id.
      for (const [k, v] of Object.entries(value)) {
        if (Object.keys(out).length >= MAX_TYPED) return
        if (!/^[A-Za-z_][\w.-]*$/.test(k)) continue
        putTyped(out, k, v)
        if (isPlainObject(v) || Array.isArray(v)) {
          ingestStructured(v, k, out, depth + 1)
        }
      }
      return
    }
    for (const [k, v] of Object.entries(value)) {
      if (Object.keys(out).length >= MAX_TYPED) return
      if (!/^[A-Za-z_][\w.-]*$/.test(k)) continue
      ingestStructured(v, `${prefix}.${k}`, out, depth + 1)
    }
  }
}

function aliasResourceKeys(out: AppDataMap): void {
  const pairs: Array<[RegExp, string]> = [
    [/^(cpu|CPU|处理器)$/u, 'cpu'],
    [/^(mem|memory|内存|Mem|Memory)$/u, 'mem'],
    [/^(disk|磁盘|Disk)$/u, 'disk'],
    [/^(load|负载|Load)$/u, 'load'],
    [/^(temp|temperature|温度)$/u, 'temp'],
    [/^(humidity|湿度)$/u, 'humidity'],
    [/^(wind|风速)$/u, 'wind'],
    [/^(lat|latitude|纬度)$/u, 'lat'],
    [/^(lng|lon|longitude|经度)$/u, 'lng'],
    [/^(query|place|address|地点|地址)$/u, 'query'],
    [/^(markers|pins|waypoints)$/u, 'markers'],
    [/^(path|polyline|route_path)$/u, 'path'],
  ]
  for (const [re, alias] of pairs) {
    for (const [k, v] of Object.entries(out)) {
      if (re.test(k) && !(alias in out)) out[alias] = v
    }
  }
  // Geo object envelope → flat lat/lng/query for `$bind:lat` style fills.
  for (const key of ['geo', 'location', 'coords', 'coordinate', 'position'] as const) {
    const raw = out[key]
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const rec = raw as Record<string, unknown>
    const lat = rec.lat ?? rec.latitude
    const lng = rec.lng ?? rec.lon ?? rec.longitude
    if (!('lat' in out) && typeof lat === 'number' && Number.isFinite(lat)) out.lat = lat
    if (!('lng' in out) && typeof lng === 'number' && Number.isFinite(lng)) out.lng = lng
    const q = rec.query ?? rec.place ?? rec.address ?? rec.name
    if (!('query' in out) && typeof q === 'string' && q.trim()) out.query = q.trim()
  }
}

/** Look up a typed payload (case-insensitive / trailing-segment fallback). */
export function lookupAppData(map: Readonly<AppDataMap>, id: string): AppDataValue | undefined {
  if (id in map) return map[id]
  const lower = id.toLowerCase()
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v
  }
  const seg = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id
  if (seg !== id && seg in map) return map[seg]
  return undefined
}


/**
 * Resolve `id` or dotted path (`metrics.cpu`, `weather.hourly.0`) against typed map.
 * Also accepts `instanceId`/`bindFrom` style: `card.cpu` where card is a namespace prefix.
 */
export function lookupAppDataPath(map: Readonly<AppDataMap>, path: string): AppDataValue | undefined {
  const direct = lookupAppData(map, path)
  if (direct !== undefined) return direct
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0) return undefined
  // Walk from longest prefix that exists as a typed key
  for (let len = parts.length; len >= 1; len--) {
    const head = parts.slice(0, len).join('.')
    const base = lookupAppData(map, head)
    if (base === undefined) continue
    let cur: unknown = base
    for (const seg of parts.slice(len)) {
      if (cur === null || cur === undefined) return undefined
      if (Array.isArray(cur)) {
        const idx = Number(seg)
        if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined
        cur = cur[idx]
        continue
      }
      if (!isPlainObject(cur) || !(seg in cur)) return undefined
      cur = cur[seg]
    }
    return cur
  }
  return undefined
}

/** Flatten typed map into BindingMap for legacy `$bind` string tokens. */
export function flattenAppDataToBindings(appData: Readonly<AppDataMap>): BindingMap {
  const out: BindingMap = {}
  for (const [k, v] of Object.entries(appData)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v
      continue
    }
    if (typeof v === 'string') {
      out[k] = v.slice(0, 8_000)
      continue
    }
    if (typeof v === 'boolean') {
      out[k] = v ? 1 : 0
      continue
    }
    try {
      const blob = JSON.stringify(v)
      if (blob.length <= 8_000) out[k] = blob
    } catch { /* skip */ }
  }
  return out
}

function coerceField(kind: ComponentFieldKind | undefined, value: unknown): unknown {
  if (kind === undefined || value === undefined) return value
  switch (kind) {
    case 'string':
    case 'string-or-null':
      if (value === null) return kind === 'string-or-null' ? null : ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      try { return JSON.stringify(value) } catch { return String(value) }
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const n = Number(value.replace(/%$/, ''))
        return Number.isFinite(n) ? n : value
      }
      if (typeof value === 'boolean') return value ? 1 : 0
      return value
    }
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (value === 1 || value === '1' || value === 'true') return true
      if (value === 0 || value === '0' || value === 'false') return false
      return value
    case 'array':
    case 'nodes':
      if (Array.isArray(value)) return value
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value)
          return Array.isArray(parsed) ? parsed : value
        } catch { return value }
      }
      return value
    case 'object':
      if (isPlainObject(value)) return value
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value)
          return isPlainObject(parsed) ? parsed : value
        } catch { return value }
      }
      return value
    case 'unknown':
    default:
      return value
  }
}

/**
 * Project a typed payload onto a component node using COMPONENT_SCHEMAS.
 * - scalar → primary value field
 * - array → whole-field (data/items/spark/…)
 * - object → pick keys that match schema fields (with kind coercion)
 */
/** If a flat-binding stored a JSON blob string, revive it for schema projection. */
function reviveJsonBlob(payload: AppDataValue): AppDataValue {
  if (typeof payload !== 'string') return payload
  const t = payload.trim()
  if ((t.startsWith('[') || t.startsWith('{')) && t.length >= 2) {
    try { return JSON.parse(t) as unknown } catch { return payload }
  }
  return payload
}

export function projectAppDataOntoNode(
  node: Record<string, unknown>,
  payload: AppDataValue,
): Record<string, unknown> {
  const type = typeof node.type === 'string' ? node.type : ''
  const schema: ComponentSchema | undefined = type !== '' ? COMPONENT_SCHEMAS[type] : undefined
  const next: Record<string, unknown> = { ...node }

  if (payload === null || payload === undefined) return next
  payload = reviveJsonBlob(payload)

  // Scalar → value / content / label
  if (typeof payload === 'number' || typeof payload === 'boolean' || typeof payload === 'string') {
    const kind = schema?.fields.value ?? schema?.fields.content ?? schema?.fields.label
    const field =
      schema?.fields.value !== undefined ? 'value'
        : schema?.fields.content !== undefined ? 'content'
          : schema?.fields.label !== undefined ? 'label'
            : 'value'
    if (next[field] === undefined || isBindToken(next[field])) {
      next[field] = coerceField(kind ?? 'unknown', payload)
    }
    // stat ring: numeric percent also fills ring when unset
    if (type === 'stat' && typeof payload === 'number' && next.ring === undefined) {
      next.ring = payload
    }
    if (type === 'progress' && typeof payload === 'number' && (next.value === undefined || isBindToken(next.value))) {
      next.value = payload
    }
    return next
  }

  if (Array.isArray(payload)) {
    const candidates = WHOLE_FIELD_BY_TYPE[type] ?? ['data', 'items', 'rows']
    for (const field of candidates) {
      const kind = schema?.fields[field]
      if (kind === 'array' || kind === 'nodes' || kind === undefined) {
        if (next[field] === undefined || isBindToken(next[field])) {
          next[field] = payload
          break
        }
      }
    }
    // table convenience: [{col:…},…] without columns → rows only
    if (type === 'table' && next.rows === undefined) next.rows = payload
    if (type === 'stat' && next.spark === undefined) next.spark = payload
    return next
  }

  if (isPlainObject(payload)) {
    // Special: { value, spark, ring, … } mirrors component fields
    if (schema !== undefined) {
      for (const [field, kind] of Object.entries(schema.fields)) {
        if (field === 'type' || field === 'span') continue
        if (!(field in payload)) continue
        if (next[field] !== undefined && !isBindToken(next[field])) continue
        next[field] = coerceField(kind, payload[field])
      }
      // aliases on payload keys
      for (const [alias, canonical] of Object.entries(schema.aliases)) {
        if (!(alias in payload)) continue
        if (next[canonical] !== undefined && !isBindToken(next[canonical])) continue
        next[canonical] = coerceField(schema.fields[canonical], payload[alias])
      }
    } else {
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'type') continue
        if (next[k] !== undefined && !isBindToken(next[k])) continue
        next[k] = v
      }
    }
    return next
  }

  return next
}

function isBindToken(value: unknown): boolean {
  return typeof value === 'string' && (value.includes('$bind:') || value.includes('$appData:'))
}

const NODE_BIND_ID_RE = /^\s*\$(?:bind|appData):([A-Za-z_][\w.-]*)(?:\|([^]*))?\s*$/

/**
 * Inject typed appData into a full spec:
 * 1. Nodes with `appData` / `dataRef` / `bind` (or value exactly `$bind:id`) get schema projection.
 * 2. Remaining string `$bind` tokens resolve via flat bindings (legacy path).
 */
export function injectAppDataIntoSpec<T extends { items: unknown[] }>(
  spec: T,
  snapshot: AppDataSnapshot,
): T {
  const map = snapshot.appData
  const flat = snapshot.bindings
  const items = (spec.items as unknown[]).map((node) => walkInject(node, map, flat))
  return { ...spec, items } as T
}

function walkInject(node: unknown, map: Readonly<AppDataMap>, flat: Readonly<BindingMap>): unknown {
  if (node === null || typeof node !== 'object') {
    if (typeof node === 'string' && (node.includes('$bind:') || node.includes('$appData:'))) {
      return resolveBindValue(node, flat)
    }
    return node
  }
  if (Array.isArray(node)) return node.map((c) => walkInject(c, map, flat))

  let rec = { ...(node as Record<string, unknown>) }

  // Explicit bind id on the node (pre-dil or leftover).
  // Supports instanceId + bindFrom (OpenUI-style instance hint) and dotted paths.
  const bindId =
    typeof rec.bind === 'string' && rec.bind.length > 0 ? rec.bind
      : typeof rec.appData === 'string' && rec.appData.length > 0 ? rec.appData
        : typeof rec.dataRef === 'string' && rec.dataRef.length > 0 ? rec.dataRef
          : typeof rec.bindFrom === 'string' && rec.bindFrom.length > 0 ? rec.bindFrom
            : ''

  const instanceId = typeof rec.instanceId === 'string' ? rec.instanceId : ''
  const resolvedBind =
    bindId !== '' && instanceId !== '' && !bindId.includes('.')
      ? `${instanceId}.${bindId}`
      : bindId

  let projected = false
  if (resolvedBind !== '') {
    const payload = lookupAppDataPath(map, resolvedBind) ?? lookupAppData(map, resolvedBind)
    if (payload !== undefined) {
      rec = projectAppDataOntoNode(rec, payload)
      projected = true
    }
    delete rec.bind
    delete rec.appData
    delete rec.dataRef
    delete rec.bindFrom
    // keep instanceId for diagnostics / future host store
  }

  // Exact `$bind:id` on value / data / items → project whole payload onto node
  for (const field of ['value', 'data', 'items', 'rows', 'series', 'spark', 'content', 'options', 'steps', 'pairs', 'questions', 'checked', 'selected'] as const) {
    const raw = rec[field]
    if (typeof raw !== 'string') continue
    const m = NODE_BIND_ID_RE.exec(raw)
    if (m === null || m[1] === undefined) continue
    const payload = lookupAppDataPath(map, m[1]) ?? lookupAppData(map, m[1])
    if (payload === undefined) continue
    rec = projectAppDataOntoNode(rec, payload)
    // If projection filled a different field, clear the token field when still token
    if (typeof rec[field] === 'string' && isBindToken(rec[field])) {
      if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
        rec[field] = payload
      } else if (Array.isArray(payload) && (field === 'data' || field === 'items' || field === 'rows' || field === 'series' || field === 'spark')) {
        rec[field] = payload
      } else {
        // leave fallback from flat resolve below
      }
    }
    projected = true
    break
  }

  // Walk children so nested cards / forms / accordions get projection
  if (Array.isArray(rec.items)) {
    rec.items = rec.items.map((c) => walkInject(c, map, flat))
  }
  if (Array.isArray(rec.tabs)) {
    rec.tabs = rec.tabs.map((c) => walkInject(c, map, flat))
  }
  if (Array.isArray(rec.steps)) {
    rec.steps = rec.steps.map((c) => walkInject(c, map, flat))
  }
  if (Array.isArray(rec.fields)) {
    rec.fields = rec.fields.map((c) => walkInject(c, map, flat))
  }
  if (Array.isArray(rec.questions)) {
    rec.questions = rec.questions.map((c) => walkInject(c, map, flat))
  }
  if (Array.isArray(rec.children)) {
    rec.children = rec.children.map((c) => walkInject(c, map, flat))
  }

  // Legacy string-token resolve for any remaining `$bind` / `$appData`
  if (!projected || hasUnresolvedBind(JSON.stringify(rec))) {
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'items' || k === 'tabs') continue
      if (typeof v === 'string' && (v.includes('$bind:') || v.includes('$appData:'))) {
        rec[k] = resolveBindValue(v, flat)
      } else if (Array.isArray(v) || isPlainObject(v)) {
        // shallow: only resolve string leaves inside one level of arrays for chart data tokens
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) continue
      }
    }
  }

  return rec
}

/** True when a snapshot still has unresolved bind tokens against a raw string. */
export function appDataHasGap(raw: string, snapshot: AppDataSnapshot): boolean {
  if (!hasUnresolvedBind(raw)) return false
  // If every token id exists in appData or bindings, gap is only stale render.
  const re = /\$(?:bind|appData):([A-Za-z_][\w.-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const id = m[1]!
    if (lookupAppData(snapshot.appData, id) === undefined && lookupBinding(snapshot.bindings, id) === undefined) {
      return true
    }
  }
  return false
}
