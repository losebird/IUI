/**
 * S7: customTokensJson validation. visual(①): only the whitelist (accent,
 * radius, density, font size — CUSTOM_TOKEN_WHITELIST) is applied; any other
 * name is ignored and listed back, so a token can no longer repaint base or
 * text colours behind the theme's back.
 */
import { CUSTOM_TOKEN_WHITELIST } from '../../themes/iui-daisy.ts'

const WHITELIST: ReadonlySet<string> = new Set(CUSTOM_TOKEN_WHITELIST)

/** The names shown as examples in the settings hint. */
export const TOKEN_EXAMPLES: readonly string[] = ['--color-primary', '--radius-box', '--radius-field', '--size-field', '--fs-sm']

export type CustomTokensCheck = {
  /** JSON parse / shape error (nothing applies). */
  error: string | null
  tokens: Record<string, string>
  /** Valid but not on the whitelist (ignored, flagged yellow). */
  unknown: string[]
  /** Dropped: bad name or unsafe value. */
  rejected: string[]
}

const NAME_RE = /^--[a-zA-Z0-9-]{1,80}$/
const BAD_VALUE_RE = /[;{}<>]|\/\*|url\s*\(|expression\s*\(/i

export function checkCustomTokensJson(raw: string | undefined | null): CustomTokensCheck {
  const text = (raw ?? '').trim()
  const out: CustomTokensCheck = { error: null, tokens: {}, unknown: [], rejected: [] }
  if (!text) return out
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return { ...out, error: 'json' } }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...out, error: 'shape' }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!NAME_RE.test(key) || typeof value !== 'string' || value.length > 200 || BAD_VALUE_RE.test(value)) {
      out.rejected.push(key)
      continue
    }
    if (!WHITELIST.has(key)) {
      out.unknown.push(key)
      continue
    }
    out.tokens[key] = value.trim()
  }
  return out
}
