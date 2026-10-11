/**
 * Parse tool stdout / JSON into a flat binding map (id → string|number).
 * Toward ChatGPT Intelligent UI appData bindings: envelopes, dotted paths,
 * JSON blob values for chart/list fill, `$appData:` alias.
 * Used by the plugin bridge and client resolver — keep pure and bounded.
 */

const MAX_KEYS = 96
const MAX_KEY_LEN = 64
const MAX_VAL_LEN = 240
const MAX_JSON_VAL_LEN = 8_000

export type BindingScalar = string | number
export type BindingMap = Record<string, BindingScalar>

/** Flatten nested JSON into dotted keys (depth ≤ 4). Arrays also store JSON blob at prefix. */
function flattenJson(value: unknown, prefix: string, out: BindingMap, depth: number): void {
  if (Object.keys(out).length >= MAX_KEYS || depth > 4) return
  if (value === null || value === undefined) return
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (prefix) out[prefix.slice(0, MAX_KEY_LEN)] = value
    return
  }
  if (typeof value === 'boolean') {
    if (prefix) out[prefix.slice(0, MAX_KEY_LEN)] = value ? 1 : 0
    return
  }
  if (typeof value === 'string') {
    if (prefix) out[prefix.slice(0, MAX_KEY_LEN)] = value.slice(0, MAX_VAL_LEN)
    return
  }
  if (Array.isArray(value)) {
    if (prefix && !(prefix in out)) {
      try {
        const blob = JSON.stringify(value)
        if (blob.length <= MAX_JSON_VAL_LEN) out[prefix.slice(0, MAX_KEY_LEN)] = blob
      } catch { /* ignore */ }
    }
    const n = Math.min(value.length, 24)
    for (let i = 0; i < n; i++) {
      flattenJson(value[i], prefix ? `${prefix}.${i}` : String(i), out, depth + 1)
    }
    return
  }
  if (typeof value === 'object') {
    if (prefix && !(prefix in out)) {
      try {
        const blob = JSON.stringify(value)
        if (blob.length <= MAX_JSON_VAL_LEN && blob.length <= 400) {
          // Small objects also as blob for `$bind:obj` whole-node fill.
          out[prefix.slice(0, MAX_KEY_LEN)] = blob
        }
      } catch { /* ignore */ }
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (Object.keys(out).length >= MAX_KEYS) return
      const key = /^[A-Za-z_][\w.-]*$/.test(k) ? k : null
      if (key === null) continue
      flattenJson(v, prefix ? `${prefix}.${key}` : key, out, depth + 1)
    }
  }
}

/** Common metric lines: `CPU: 34%`, `内存=8.2`, `load 1.23`. */
const LINE_KV = /^\s*([A-Za-z_\u4e00-\u9fff][\w.\u4e00-\u9fff-]{0,40})\s*[:=：]\s*([+\-]?[\d.]+%?|\S.{0,80})\s*$/u

/** ChatGPT-ish / tool envelopes that wrap the real payload. */
function unwrapAppDataEnvelope(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed
  const rec = parsed as Record<string, unknown>
  for (const key of ['appData', 'app_data', 'data', 'bindings', 'values', 'payload', 'result', 'metrics'] as const) {
    const inner = rec[key]
    if (inner !== null && typeof inner === 'object') return inner
  }
  return parsed
}

/**
 * Extract bindings from a tool result body (JSON preferred, else key:value lines).
 * @param content - tool stdout / result text
 * @param toolName - optional tool name prefix (bash → also `bash.cpu`)
 * @param callId - optional tool call id → also `call.<short>.cpu` (appData call scope)
 */
export function parseToolResultBindings(
  content: string,
  toolName?: string,
  callId?: string,
): BindingMap {
  const out: BindingMap = {}
  const text = content.trim()
  if (text === '' || text.length > 200_000) return out

  const jsonCandidate = extractJsonBlob(text)
  if (jsonCandidate !== null) {
    try {
      const parsed: unknown = unwrapAppDataEnvelope(JSON.parse(jsonCandidate))
      flattenJson(parsed, '', out, 0)
      // Also flatten the raw envelope root so `status` etc. remain available.
      if (parsed !== null && typeof parsed === 'object') {
        const raw: unknown = JSON.parse(jsonCandidate)
        if (raw !== parsed) flattenJson(raw, '', out, 0)
      }
    } catch {
      /* fall through to line parser */
    }
  }

  if (Object.keys(out).length === 0) {
    const lines = text.split(/\r?\n/).slice(0, 200)
    for (const line of lines) {
      if (Object.keys(out).length >= MAX_KEYS) break
      const m = LINE_KV.exec(line)
      if (m === null || m[1] === undefined || m[2] === undefined) continue
      const key = m[1].trim().slice(0, MAX_KEY_LEN)
      const raw = m[2].trim().slice(0, MAX_VAL_LEN)
      const num = Number(raw.replace(/%$/, ''))
      out[key] = Number.isFinite(num) && /^-?[\d.]+%?$/.test(raw) ? num : raw
      if (/^[A-Za-z]/.test(key)) out[key.toLowerCase()] = out[key]!
    }
  }

  aliasResourceKeys(out)
  coercePercentTwins(out)

  if (toolName && toolName.trim() !== '') {
    const prefix = toolName.trim().slice(0, 32)
    const prefixed: BindingMap = {}
    for (const [k, v] of Object.entries(out)) {
      if (Object.keys(prefixed).length + Object.keys(out).length >= MAX_KEYS) break
      prefixed[`${prefix}.${k}`] = v
    }
    Object.assign(out, prefixed)
  }

  if (callId && callId.trim() !== '') {
    const short = callId.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)
    if (short !== '') {
      const scoped: BindingMap = {}
      for (const [k, v] of Object.entries(out)) {
        if (Object.keys(scoped).length + Object.keys(out).length >= MAX_KEYS) break
        scoped[`call.${short}.${k}`] = v
      }
      Object.assign(out, scoped)
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

function aliasResourceKeys(out: BindingMap): void {
  const pairs: Array<[RegExp, string]> = [
    [/^(cpu|CPU|处理器)$/u, 'cpu'],
    [/^(mem|memory|内存|Mem|Memory)$/u, 'mem'],
    [/^(disk|磁盘|Disk)$/u, 'disk'],
    [/^(load|负载|Load)$/u, 'load'],
    [/^(temp|temperature|温度)$/u, 'temp'],
    [/^(humidity|湿度)$/u, 'humidity'],
    [/^(wind|风速)$/u, 'wind'],
  ]
  for (const [re, alias] of pairs) {
    for (const [k, v] of Object.entries(out)) {
      if (re.test(k) && !(alias in out)) out[alias] = v
    }
  }
}

/** When value is 34 and key looks like percent metric, also expose `key%` twin display. */
function coercePercentTwins(out: BindingMap): void {
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'number') continue
    if (!/cpu|mem|disk|percent|pct|usage|进度|占用/i.test(k)) continue
    const display = `${v}%`
    const dk = `${k}_pct`
    if (!(dk in out)) out[dk] = display
  }
}

/** Case-insensitive + dotted-path lookup (appData path style). */
export function lookupBinding(
  bindings: Readonly<BindingMap>,
  id: string,
): BindingScalar | undefined {
  if (id in bindings) return bindings[id]
  const lower = id.toLowerCase()
  for (const [k, v] of Object.entries(bindings)) {
    if (k.toLowerCase() === lower) return v
  }
  // Trailing segment match: weather.temp ↔ temp when unique-ish
  const seg = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id
  if (seg !== id && seg in bindings) return bindings[seg]
  return undefined
}

const BIND_TOKEN_RE = /\$(?:bind|appData):([A-Za-z_][\w.-]*)(?:\|([^"$]*))?/g
const BIND_EXACT_RE = /^\s*\$(?:bind|appData):([A-Za-z_][\w.-]*)(?:\|([^]*))?\s*$/

/**
 * Resolve a field that may be entirely `$bind:id` / `$appData:id` (structured
 * JSON blob → parsed array/object) or a string with inline tokens.
 */
export function resolveBindValue(
  raw: string,
  bindings: Readonly<BindingMap>,
): unknown {
  const exact = BIND_EXACT_RE.exec(raw)
  if (exact !== null && exact[1] !== undefined) {
    const hit = lookupBinding(bindings, exact[1])
    if (hit === undefined || hit === null) {
      return exact[2] !== undefined ? coerceFallback(exact[2]) : raw
    }
    if (typeof hit === 'string') {
      const t = hit.trim()
      if ((t.startsWith('[') || t.startsWith('{')) && t.length >= 2) {
        try { return JSON.parse(t) as unknown } catch { return hit }
      }
    }
    return hit
  }
  return resolveBindToken(raw, bindings)
}

function coerceFallback(raw: string): string | number {
  const t = raw.trim()
  if (/^-?[\d.]+$/.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  return raw
}

/** Resolve `$bind:id` / `$appData:id` or `…|fallback` in a string (inline). */
export function resolveBindToken(
  raw: string,
  bindings: Readonly<BindingMap>,
): string {
  return raw.replace(BIND_TOKEN_RE, (_m, id: string, fallback?: string) => {
    const hit = lookupBinding(bindings, id)
    if (hit === undefined || hit === null) {
      return fallback !== undefined ? fallback : `$bind:${id}`
    }
    return String(hit)
  })
}

/** True when a string still has unresolved `$bind:` / `$appData:` tokens. */
export function hasUnresolvedBind(raw: string): boolean {
  return /\$(?:bind|appData):[A-Za-z_]/.test(raw)
}

/** Detect appData-style tokens for docs / tests. */
export function hasAppDataToken(raw: string): boolean {
  return /\$appData:[A-Za-z_]/.test(raw)
}
