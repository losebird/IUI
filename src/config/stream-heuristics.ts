import { safeRegExp } from '../shared/safe-regexp.ts'
/**
 * Stream heuristics (soft) — not a hard guarantee — config/schema driven.
 * Fence-feedback / format-referee resolve via these helpers; never hard-code
 * forbidden prefixes or tool-before-fence heuristics at call sites.
 */

export type StreamHeuristics = {
  /** Fence languages that count as a valid IUI opener. */
  readonly fenceLanguages: readonly string[]
  /** Regex sources: if first non-whitespace matches, treat as first-token violation. */
  readonly forbiddenFirstPrefixes: readonly string[]
  /** Tool name substrings that, if called before a fence, trigger abort nudge. */
  readonly toolsBeforeFenceNames: readonly string[]
  /** Exact tool names allowed before the fence (photo resolve, etc.). */
  readonly toolsAllowedBeforeFence: readonly string[]
  /** Min assistant text length before first-token decision (characters). */
  readonly firstTokenDecideAfter: number
  /** Mid-turn nudge after this many agent steps without a fence. */
  readonly midNudgeAfterSteps: number
  /** Max same-turn steers (prime + nudge + violation) per turn. */
  readonly maxSameTurnSteers: number
  /** When true, inject first-token contract before full recipe prime. */
  readonly contractBeforePrime: boolean
  /** Prefer fence-first over lead prose for weak models. */
  readonly preferFenceFirst: boolean
  /**
   * Fence info-strings that look like GenUI JSON but are NOT iui/dsh-ui.
   * Used for mid-turn json-masquerade ops (weak-model trap).
   */
  readonly jsonMasqueradeLanguages: readonly string[]
}

export const STREAM_HEURISTICS: StreamHeuristics = {
  fenceLanguages: ['iui-html', 'iui', 'dsh-ui'],
  forbiddenFirstPrefixes: [
    // Apology / tool-failure prose (Chinese + English)
    '^(抱歉|对不起|不好意思|很抱歉)',
    '^(sorry|i\\s*apologize|unfortunately)',
    '搜索不可用',
    '无法搜索',
    '网络.*不可用',
    'tool\\s*unavailable',
    // Map / navigation failure dumps (Ace map ask regression)
    '无法(为你)?(打开|显示|提供)?地图',
    '暂时无法.*(地图|定位|导航)',
    '你可以(手动)?(打开|访问).*(高德|百度|地图)',
    'here\\s+(are|is)\\s+(some\\s+)?(map\\s+)?links?',
    // Markdown-as-UI openers
    '^#{1,3}\\s',
    '^[-*]\\s+\\*\\*',
    '^\\|\\s*[-:]',
    // Wrong fence languages
    '^```(?:json|json5|javascript|js|ts|typescript|html|markdown|md)\\b',
    // Pure chat lead that burns the first token
    '^(好的|当然|没问题|我来|让我|下面|以下是)',
    '^(sure|of\\s*course|here\\s*(is|are)|let\\s*me)',
  ],
  toolsBeforeFenceNames: [
    'bash',
    'shell',
    'exec',
    'search',
    'web_search',
    'websearch',
    'browser',
    'fetch',
    'http',
    'crawl',
    'read_file',
    'grep',
  ],
  toolsAllowedBeforeFence: ['get_trip_stop_images', 'get_place_images'],
  firstTokenDecideAfter: 3,
  midNudgeAfterSteps: 1,
  maxSameTurnSteers: 2,
  contractBeforePrime: false,
  preferFenceFirst: false,
  jsonMasqueradeLanguages: ['json', 'json5', 'javascript', 'js', 'ts', 'typescript'],
}

let _override: StreamHeuristics | null = null

/** Test / settings override (still schema-shaped). */
export function setStreamHeuristicsOverride(policy: StreamHeuristics | null): void {
  _override = policy
}

export function getStreamHeuristics(): StreamHeuristics {
  return _override ?? STREAM_HEURISTICS
}

export function describeToolsAllowedBeforeFence(
  policy: StreamHeuristics = getStreamHeuristics(),
): string {
  const names = policy.toolsAllowedBeforeFence
  if (names.length === 0) return 'No tool is allowed before the fence.'
  return `Tools allowed before the fence: ${names.join(', ')}. No other tool before the fence.`
}

const fenceOpenerCache = new Map<string, RegExp>()

export function fenceFirstRegex(policy: StreamHeuristics = getStreamHeuristics()): RegExp {
  const key = policy.fenceLanguages.join('|')
  let re = fenceOpenerCache.get(key)
  if (!re) {
    const alts = policy.fenceLanguages.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    re = new RegExp(`^\`\`\`(?:${alts})\\b`)
    fenceOpenerCache.set(key, re)
  }
  return re
}

export function matchesForbiddenFirstPrefix(
  text: string,
  policy: StreamHeuristics = getStreamHeuristics(),
): boolean {
  const trimmed = text.replace(/^\s+/u, '')
  if (trimmed.length === 0) return false
  if (fenceFirstRegex(policy).test(trimmed)) return false
  for (const source of policy.forbiddenFirstPrefixes) {
    const re = safeRegExp(source, 'iu')
    if (re && re.test(trimmed)) return true
  }
  // Any non-fence first token on must_fence is a soft violation if long enough
  return trimmed.length >= policy.firstTokenDecideAfter && !fenceFirstRegex(policy).test(trimmed)
}

export function isToolBeforeFenceName(
  toolName: string,
  policy: StreamHeuristics = getStreamHeuristics(),
): boolean {
  const lower = toolName.toLowerCase()
  if (policy.toolsAllowedBeforeFence.some((n) => lower === n.toLowerCase())) return false
  return policy.toolsBeforeFenceNames.some((n) => lower.includes(n.toLowerCase()))
}

const masqueradeOpenCache = new Map<string, RegExp>()

/** True when text opens with ```json (etc.) that often hides a GenUI body. */
export function looksLikeJsonMasqueradeOpen(
  text: string,
  policy: StreamHeuristics = getStreamHeuristics(),
): boolean {
  const trimmed = text.replace(/^\s+/u, '')
  if (trimmed.length === 0) return false
  if (fenceFirstRegex(policy).test(trimmed)) return false
  const key = policy.jsonMasqueradeLanguages.join('|')
  let re = masqueradeOpenCache.get(key)
  if (!re) {
    const alts = policy.jsonMasqueradeLanguages
      .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    re = new RegExp(`^\`\`\`(?:${alts})\\b`, 'i')
    masqueradeOpenCache.set(key, re)
  }
  return re.test(trimmed)
}
