/**
 * visual(③): per-page Tailwind utilities for the ```iui-html sandbox.
 *
 * Models write Tailwind layout classes next to daisyUI components
 * (`grid md:grid-cols-3 gap-4`, `flex items-center`, `bg-blue-600/10` …).
 * The sandbox has no Tailwind runtime, so the host compiles exactly the
 * classes a page mentions: tokens are cut from the page's html / css / js and
 * resolved through Tailwind's design system (synchronous once loaded).
 *
 * - Default Tailwind theme, **inlined** (no `:root` variables — nothing can
 *   collide with the daisyUI / IUI tokens), plus the daisyUI semantic colours
 *   (`bg-base-200`, `text-primary-content`, `border-base-300` …) and radii.
 * - Breakpoints are scaled for the chat column (688px wide): sm 30rem,
 *   md 40rem, lg 56rem, xl 72rem, 2xl 90rem — `md:grid-cols-3` turns on in the
 *   bubble and collapses at phone width (390).
 * - `dark:` follows the sandbox scheme (prefers-color-scheme is rewritten by
 *   the appearance bridge) and the forced dark themes.
 * - No Tailwind preflight (IUI ships its own base); output goes into
 *   `@layer utilities`, above daisyUI's nested component layers.
 * - Classes IUI already defines (IUI_UTILITIES_CSS: `.border`, `bg-primary`,
 *   `text-base-content/60` …) and daisyUI component names that Tailwind also
 *   knows (`collapse`, `table`, `filter`) are left to IUI / daisyUI.
 */
import { __unstable__loadDesignSystem as loadDesignSystem } from 'tailwindcss'
import { TAILWIND_THEME_CSS } from './tailwind-theme.generated.ts'
import { IUI_UTILITIES_CSS } from './iui-daisy.ts'

type DesignSystem = Awaited<ReturnType<typeof loadDesignSystem>>

const SEMANTIC = [
  'base-100', 'base-200', 'base-300', 'base-content',
  ...['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'].flatMap((c) => [c, `${c}-content`]),
]

/** Tailwind source: inlined default theme + IUI overrides + utilities only. */
export const TAILWIND_SOURCE_CSS = [
  TAILWIND_THEME_CSS.replace('@theme default', '@theme default inline'),
  '@theme inline {',
  ...SEMANTIC.map((c) => `--color-${c}: var(--color-${c});`),
  '--radius-box: var(--radius-box); --radius-field: var(--radius-field); --radius-selector: var(--radius-selector);',
  '--font-sans: var(--font-sans); --font-serif: var(--font-serif); --font-mono: var(--font-mono);',
  '--breakpoint-sm: 30rem; --breakpoint-md: 40rem; --breakpoint-lg: 56rem; --breakpoint-xl: 72rem; --breakpoint-2xl: 90rem;',
  '}',
  '@custom-variant dark { @media (prefers-color-scheme: dark) { @slot; } &:where([data-theme=iui-dark], [data-theme=iui-dark] *, [data-theme=dim], [data-theme=dim] *) { @slot; } }',
  '@tailwind utilities;',
].join('\n')

/** daisyUI component classes Tailwind would also emit a utility for. */
const DAISY_OWNED = ['collapse', 'table', 'filter']

let designSystem: DesignSystem | null = null
let failed = false
const owned = new Set<string>(DAISY_OWNED)
const cache = new Map<string, string | null>()
const CACHE_MAX = 8000

/** Loads in microtasks only (no I/O): ready before the first render task. */
const ready: Promise<void> = loadDesignSystem(TAILWIND_SOURCE_CSS)
  .then((ds) => { designSystem = ds })
  .catch(() => { failed = true })

/** Await in scripts / tests that build a srcdoc right after import. */
export function whenTailwindReady(): Promise<void> {
  return ready
}

export function isTailwindReady(): boolean {
  return designSystem !== null && !failed
}

/** Register classes the host CSS already defines (e.g. IUI_UTILITIES_CSS) so Tailwind leaves them alone. */
export function reserveTailwindClasses(css: string): void {
  for (const m of css.matchAll(/\.((?:[a-zA-Z0-9_-]|\\.)+)/g)) owned.add(m[1]!.replace(/\\(.)/g, '$1'))
}

const TOKEN_SPLIT = /[\s"'`<>\\]+|&quot;|&#39;/
const CANDIDATE = /^[!-]?[a-z@*[][\w\-:/.[\]()%#,!@*&>+~=|^$?]*$/
const MAX_CANDIDATES = 4000

/** Class-like tokens in page source (html attributes, js strings, css). */
export function tailwindCandidates(source: string): string[] {
  const out = new Set<string>()
  for (const raw of source.split(TOKEN_SPLIT)) {
    if (raw.length < 2 || raw.length > 100 || !CANDIDATE.test(raw)) continue
    if (owned.has(raw)) continue
    out.add(raw)
    if (out.size >= MAX_CANDIDATES) break
  }
  return [...out]
}

function cssFor(ds: DesignSystem, candidate: string): string | null {
  let css = cache.get(candidate)
  if (css !== undefined) return css
  try {
    css = ds.candidatesToCss([candidate])[0] ?? null
  } catch {
    css = null
  }
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(candidate, css)
  return css
}

/**
 * Tailwind CSS for the classes a page mentions, or '' (nothing used / not loaded yet).
 * Rules sort in Tailwind order (base before variants); `@property` blocks are hoisted
 * out of the layer and deduplicated.
 */
export function buildTailwindCss(source: string): string {
  const ds = designSystem
  if (ds === null || failed) return ''
  const hits: Array<[string, string]> = []
  for (const c of tailwindCandidates(source)) {
    const css = cssFor(ds, c)
    if (css) hits.push([c, css])
  }
  if (hits.length === 0) return ''
  let order: Map<string, bigint | null>
  try {
    order = new Map(ds.getClassOrder(hits.map(([c]) => c)))
  } catch {
    order = new Map()
  }
  hits.sort((a, b) => {
    const x = order.get(a[0]) ?? 0n
    const y = order.get(b[0]) ?? 0n
    return x < y ? -1 : x > y ? 1 : 0
  })
  const props = new Map<string, string>()
  const rules: string[] = []
  for (const [, css] of hits) {
    rules.push(css.replace(/@property\s+(--[\w-]+)\s*\{[^}]*\}/g, (block, name: string) => {
      if (!props.has(name)) props.set(name, block)
      return ''
    }).trim())
  }
  const min = (s: string) => s.replace(/\s*\n\s*/g, '').replace(/\s*([{};])\s*/g, '$1').replace(/;}/g, '}')
  return min([...props.values()].join('')) + '@layer utilities{' + min(rules.join('')) + '}'
}

reserveTailwindClasses(IUI_UTILITIES_CSS)

/**
 * Host side of the live top-up: sandbox frames post the classes their DOM uses
 * (`{ source: 'iui-tailwind', type: 'need', seq, classes }`) and get one sorted
 * sheet back. Pure computation on bounded input; installed once per window.
 */
export function installTailwindHost(): void {
  const g = globalThis as { __iuiTailwindHost?: boolean }
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || g.__iuiTailwindHost) return
  g.__iuiTailwindHost = true
  window.addEventListener('message', (event: MessageEvent) => {
    const d = event.data as { source?: unknown; type?: unknown; seq?: unknown; classes?: unknown } | null
    if (!d || d.source !== 'iui-tailwind' || d.type !== 'need' || !Array.isArray(d.classes)) return
    const target = event.source as Window | null
    if (!target || typeof target.postMessage !== 'function') return
    const classes = d.classes.filter((c): c is string => typeof c === 'string' && c.length <= 100).slice(0, 3000)
    const seq = typeof d.seq === 'number' ? d.seq : 0
    const reply = (): void => {
      try {
        target.postMessage({ source: 'iui-tailwind-host', type: 'css', seq, css: buildTailwindCss(classes.join(' ')) }, '*')
      } catch { /* frame gone */ }
    }
    if (designSystem !== null) reply()
    else void ready.then(reply)
  })
}
