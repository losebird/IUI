/**
 * S7: customTokensJson validation against the sandbox token catalogue.
 * Unknown keys still apply (they may be author-level vars) but are flagged.
 */
import { OIU_THEME_CSS, buildOiuDesignSystemCss } from '../../themes/oiu-design-system.ts'
import { mergeSandboxDesignTokens } from '../../shared/html-sandbox.ts'

let known: Set<string> | null = null
export function knownSandboxTokens(): ReadonlySet<string> {
  if (known !== null) return known
  const set = new Set(Object.keys(mergeSandboxDesignTokens({}, 'sandbox')))
  for (const m of buildOiuDesignSystemCss().matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) set.add(m[1]!)
  for (const name of ['--accent', '--accent-fill', '--accent-soft', '--accent-strong']) set.add(name)
  known = set
  return set
}

/** The handful worth showing as examples in the settings hint. */
export const TOKEN_EXAMPLES: readonly string[] = (() => {
  const names = [...OIU_THEME_CSS.matchAll(/(--color-[a-z-]+)\s*:/g)].map((m) => m[1]!)
  const pick = ['--color-text-primary', '--color-text-secondary', '--color-background-primary', '--color-background-secondary', '--color-text-info', '--border-radius-md', '--border-radius-lg']
  return pick.filter((n) => names.includes(n) || n.startsWith('--border-radius'))
})()

export type CustomTokensCheck = {
  /** JSON parse / shape error (nothing applies). */
  error: string | null
  tokens: Record<string, string>
  /** Valid but not in the catalogue (applied, flagged yellow). */
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
  const catalogue = knownSandboxTokens()
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!NAME_RE.test(key) || typeof value !== 'string' || value.length > 200 || BAD_VALUE_RE.test(value)) {
      out.rejected.push(key)
      continue
    }
    out.tokens[key] = value.trim()
    if (!catalogue.has(key)) out.unknown.push(key)
  }
  return out
}
