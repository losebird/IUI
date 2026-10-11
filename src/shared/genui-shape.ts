/**
 * Pure shape heuristics for GenUI fence bodies.
 * Used by the client (```json mislabeled rescue) and the format referee
 * (wrong-lang detection) without importing the heavy guard stack.
 */

/** True when raw looks like a GenUI / IUI declarative spec (not arbitrary JSON). */
export function looksLikeGenuiSpecBody(raw: string): boolean {
  const text = raw.trim()
  if (text.length < 8) return false
  if (!(text.startsWith('{') || text.startsWith('['))) return false
  // Spec roots always carry items / type / title / panel / gap.
  if (!/"(items|type|title|panel|gap)"\s*:/.test(text)) return false
  // Prefer known component types so a random {title,items} API payload is less likely.
  if (
    /"type"\s*:\s*"(?:hero|stat|card|grid|row|col|list|table|chart|button|input|select|checkbox|switch|slider|radio|submit|callout|steps|tabs|progress|badge|link|form|keyvalue|timeline|accordion|text|divider|spacer|mermaid|svg|quiz|textarea|avatar|image|diff|code|copy|file-tree|breadcrumb|echart|plot|scene3d|json)"/.test(
      text,
    )
  ) {
    return true
  }
  // Array root of typed nodes, or object with items array containing typed nodes.
  return /"items"\s*:\s*\[[\s\S]*?"type"\s*:/.test(text)
}

/** True when raw looks like an ```iui-html sandbox page (css/html/js). */
export function looksLikeHtmlSandboxBody(raw: string): boolean {
  const text = raw.trim()
  if (text.length < 12 || !text.startsWith('{')) return false
  // Require at least one of the sandbox payload keys (not merely "title").
  return /"(?:html|css|js|jsFunctions|jsExpressions)"\s*:/.test(text)
}

/** Fence languages that weak models misuse instead of ```iui / ```iui-html. */
export function isJsonFenceLang(lang: string | null | undefined): boolean {
  if (lang === null || lang === undefined) return false
  const n = lang.trim().toLowerCase()
  return n === 'json' || n === 'json5' || n === 'jsonc'
}

/** True when a ```json (etc.) fence body should be treated as IUI sandbox. */
export function isJsonMasqueradingAsIui(
  lang: string | null | undefined,
  raw: string,
): boolean {
  // Catalog GenUI trees are removed — only sandbox-shaped JSON is rescued.
  return isJsonFenceLang(lang) && looksLikeHtmlSandboxBody(raw)
}
