/**
 * D1 / D-补充: static design lint for ```iui-html fences (no browser).
 *
 * Checks the author css, `<style>` blocks and inline `style=""`:
 * - min-font: font-size below the 12px floor of the type scale (12/14/16/20/28/40)
 * - contrast: a rule that sets BOTH a literal text color and a literal solid
 *   background whose WCAG ratio is below 4.5:1 (3:1 for large text)
 * - stat-label: a number and its caption glued in one text run inside a
 *   stat/kpi/value element (must be two layers: big number, small caption)
 * - narrow-overflow (F22): a fixed width / min-width or fixed grid tracks wider
 *   than a 360px phone viewport (the browser check in scripts/browser-e2e.mts
 *   renders the starters at 360 / 720px)
 * - tailwind-hex (visual ③): Tailwind utilities are compiled per page now, so
 *   layout classes are fine; only arbitrary hard-coded colours
 *   (`text-[#333]`, `bg-[#fff]`) are flagged — they break the theme / dark mode.
 *
 * Results feed a non-steering design note for the NEXT UI turn — never a
 * same-turn correction, so a working page is never re-generated for style.
 */

export type DesignIssueKind = 'min-font' | 'contrast' | 'stat-label' | 'narrow-overflow' | 'tailwind-hex'

export type DesignIssue = {
  readonly kind: DesignIssueKind
  readonly detail: string
}

export type DesignLintInput = {
  readonly html: string
  readonly css: string
}

export const DESIGN_MIN_FONT_PX = 12
/** F22: narrowest supported viewport; fixed boxes wider than this overflow on phones. */
export const DESIGN_NARROW_VIEWPORT_PX = 360
export const DESIGN_TYPE_SCALE_PX = [12, 14, 16, 20, 28, 40] as const
const MAX_ISSUES = 6

type Rgb = { r: number; g: number; b: number; a: number }

const NAMED: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', gray: '#808080', grey: '#808080', silver: '#c0c0c0', orange: '#ffa500',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5', pink: '#ffc0cb', purple: '#800080',
  navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000', gold: '#ffd700',
  lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff',
}

/** Parse a literal CSS color (hex / rgb[a] / a few names). `null` for var(), gradients, hsl…. */
export function parseCssColor(raw: string): Rgb | null {
  let v = raw.trim().toLowerCase().replace(/\s*!important$/u, '')
  if (v in NAMED) v = NAMED[v]!
  let m = /^#([0-9a-f]{3,8})$/u.exec(v)
  if (m) {
    let h = m[1]!
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/u.exec(v)
  if (m) {
    const alphaRaw = m[4]
    const a = alphaRaw === undefined ? 1 : alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw)
    return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a }
  }
  return null
}

function luminance(c: Rgb): number {
  const ch = (x: number) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

/** WCAG 2.x contrast ratio (1…21). */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** font-size value → px (null when relative to an unknown parent: em, %, var, calc…). */
export function fontSizeToPx(raw: string): number | null {
  const v = raw.trim().toLowerCase()
  const m = /^(\d*\.?\d+)(px|rem|pt)$/u.exec(v)
  if (!m) return null
  const n = parseFloat(m[1]!)
  if (m[2] === 'px') return n
  if (m[2] === 'rem') return n * 16
  return (n * 4) / 3
}

/** Size inside the `font:` shorthand (`600 11px/1.4 var(--font-sans)`). */
function fontShorthandPx(raw: string): number | null {
  const m = /(?:^|\s)(\d*\.?\d+(?:px|rem|pt))(?:\s*\/|\s|$)/u.exec(raw.trim().toLowerCase())
  return m ? fontSizeToPx(m[1]!) : null
}

type Decl = { prop: string; value: string }

function parseDecls(body: string): Decl[] {
  const out: Decl[] = []
  for (const part of body.split(';')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const prop = part.slice(0, i).trim().toLowerCase()
    const value = part.slice(i + 1).trim()
    if (prop && value) out.push({ prop, value })
  }
  return out
}

type Rule = { selector: string; decls: Decl[]; wideOnly?: boolean }

/** Flat rule list; @media / @supports blocks are unwrapped, @keyframes / @font-face skipped. */
function parseCssRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//gu, '')
  const rules: Rule[] = []
  const walk = (text: string, depth: number, wideOnly = false): void => {
    let i = 0
    while (i < text.length && depth < 4) {
      const open = text.indexOf('{', i)
      if (open < 0) return
      const selector = text.slice(i, open).trim()
      let level = 1
      let j = open + 1
      while (j < text.length && level > 0) {
        if (text[j] === '{') level++
        else if (text[j] === '}') level--
        j++
      }
      const body = text.slice(open + 1, j - 1)
      if (/^@(media|supports|container|layer)/iu.test(selector)) walk(body, depth + 1, wideOnly || /min-width\s*:/iu.test(selector))
      else if (!selector.startsWith('@')) rules.push({ selector: selector.replace(/^[;}\s]+/u, ''), decls: parseDecls(body), wideOnly })
      i = j
    }
  }
  walk(src, 0)
  return rules
}

/** Selectors whose text is decorative / not body copy (SVG labels, sub/sup, scrollbars, map chrome). */
function exemptSelector(selector: string): boolean {
  return /(^|[\s>+~,(])(svg|text|tspan|sup|sub|canvas)\b|::?-webkit-|::?-moz-|::?placeholder|\.leaflet-|\bkbd\b|\[aria-hidden/iu.test(selector)
}

/** Media / scrollers size themselves (max-width:100% in base css, or scroll inside). */
function narrowExempt(selector: string): boolean {
  return /(^|[\s>+~,(])(img|canvas|video|iframe|table|pre|html|body)\b|::?(before|after)|overflow|scroll|carousel|strip|marquee/iu.test(selector)
}

function largeText(decls: Decl[]): boolean {
  let px: number | null = null
  let bold = false
  for (const d of decls) {
    if (d.prop === 'font-size') px = fontSizeToPx(d.value) ?? px
    else if (d.prop === 'font') {
      px = fontShorthandPx(d.value) ?? px
      if (/\b(bold|[6-9]00)\b/u.test(d.value)) bold = true
    } else if (d.prop === 'font-weight' && /\b(bold|bolder|[6-9]00)\b/u.test(d.value)) bold = true
  }
  return px !== null && (px >= 24 || (bold && px >= 18.66))
}

/** Minimum px a grid-template-columns value needs (px tracks + minmax() px minimums). */
export function gridMinTrackPx(value: string): number {
  const v = value.toLowerCase().replace(/\s+/gu, ' ')
  if (/\bmin\(/u.test(v) && /%|vw/u.test(v)) return 0
  const trackPx = (track: string): number => {
    const mm = /^minmax\(\s*(\d*\.?\d+)px\s*,/u.exec(track.trim())
    if (mm) return Number(mm[1])
    const px = /^(\d*\.?\d+)px$/u.exec(track.trim())
    return px ? Number(px[1]) : 0
  }
  const splitTracks = (text: string): string[] => {
    const out: string[] = []
    let depth = 0
    let cur = ''
    for (const ch of text) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; continue }
      cur += ch
    }
    if (cur) out.push(cur)
    return out
  }
  let total = 0
  for (const track of splitTracks(v)) {
    const rep = /^repeat\(\s*([^,]+?)\s*,\s*(.+)\)$/u.exec(track)
    if (rep) {
      const count = /^\d+$/u.test(rep[1]!) ? Number(rep[1]) : 1 // auto-fit / auto-fill: one track minimum
      const inner = splitTracks(rep[2]!).reduce((sum, t) => sum + trackPx(t), 0)
      total += Math.min(count, 12) * inner
    } else {
      total += trackPx(track)
    }
  }
  return total
}

function checkNarrow(where: string, decls: Decl[], issues: DesignIssue[]): void {
  const capped = decls.some((d) => d.prop === 'max-width' && (/%|vw|min\(/u.test(d.value) || (fontSizeToPx(d.value) ?? Infinity) <= DESIGN_NARROW_VIEWPORT_PX))
  for (const d of decls) {
    if ((d.prop === 'width' || d.prop === 'min-width') && !capped) {
      const m = /^(\d*\.?\d+)px$/u.exec(d.value.trim().toLowerCase())
      if (m && Number(m[1]) > DESIGN_NARROW_VIEWPORT_PX) {
        issues.push({ kind: 'narrow-overflow', detail: `${where} ${d.prop} ${m[1]}px > ${DESIGN_NARROW_VIEWPORT_PX}px` })
      }
    } else if (d.prop === 'grid-template-columns' || d.prop === 'grid-template') {
      const need = gridMinTrackPx(d.prop === 'grid-template' ? (d.value.split('/')[1] ?? '') : d.value)
      if (need > DESIGN_NARROW_VIEWPORT_PX) {
        issues.push({ kind: 'narrow-overflow', detail: `${where} grid columns need ${Math.round(need)}px > ${DESIGN_NARROW_VIEWPORT_PX}px` })
      }
    }
  }
}

function checkDecls(where: string, decls: Decl[], issues: DesignIssue[], media = false): void {
  // Rules inside a min-width @media only apply on wide screens.
  if (!media) checkNarrow(where, decls, issues)
  for (const d of decls) {
    const px = d.prop === 'font-size' ? fontSizeToPx(d.value) : d.prop === 'font' ? fontShorthandPx(d.value) : null
    if (px !== null && px > 0 && px < DESIGN_MIN_FONT_PX - 0.01) {
      issues.push({ kind: 'min-font', detail: `${where} font-size ${+px.toFixed(1)}px < ${DESIGN_MIN_FONT_PX}px` })
    }
  }
  const color = decls.filter((d) => d.prop === 'color').pop()
  const bg = decls.filter((d) => d.prop === 'background-color' || d.prop === 'background').pop()
  if (color && bg) {
    const fg = parseCssColor(color.value)
    const bgc = parseCssColor(bg.value)
    if (fg && bgc && fg.a >= 0.99 && bgc.a >= 0.99) {
      const ratio = contrastRatio(fg, bgc)
      const need = largeText(decls) ? 3 : 4.5
      if (ratio < need) {
        issues.push({ kind: 'contrast', detail: `${where} ${color.value} on ${bg.value} = ${ratio.toFixed(2)}:1 < ${need}:1` })
      }
    }
  }
}

function shortSel(selector: string): string {
  const s = selector.replace(/\s+/gu, ' ').trim()
  return s.length > 48 ? `${s.slice(0, 45)}…` : s
}

const STAT_CLASS = /(?:^|[\s"'])(?:iui-)?(?:sandbox-)?(?:kpi|stat|metric|value|num|number|figure|big-?num(?:ber)?)(?:-value)?(?=[\s"']|$)/iu
/** Number followed by a caption word (≥2 CJK chars or ≥4 letters), or caption：number. */
const GLUED_AFTER = /\d[\d,.]*\s*%?\s*(?:[\u4e00-\u9fff]{2,}|[A-Za-z]{4,})/u
const GLUED_BEFORE = /(?:[\u4e00-\u9fff]{2,}|[A-Za-z]{3,})\s*[:：]\s*[-+]?[\d.,]+/u

function checkStatLabels(html: string, issues: DesignIssue[]): void {
  const re = /<([a-z][\w-]*)\b([^>]*)>([^<]*)/giu
  let m: RegExpExecArray | null
  let seen = 0
  while ((m = re.exec(html)) !== null && seen < 3) {
    const attrs = m[2] ?? ''
    const cls = /\bclass\s*=\s*("[^"]*"|'[^']*')/iu.exec(attrs)
    if (!cls || !STAT_CLASS.test(` ${cls[1]!.slice(1, -1)} `)) continue
    if (/\b(?:label|unit|caption|desc|delta)\b/iu.test(cls[1]!)) continue
    const text = (m[3] ?? '').replace(/&nbsp;/gu, ' ').trim()
    if (text === '' || !/\d/u.test(text)) continue
    if (GLUED_AFTER.test(text) || GLUED_BEFORE.test(text)) {
      seen++
      issues.push({ kind: 'stat-label', detail: `"${text.slice(0, 24)}" — number and caption in one line` })
    }
  }
}

/** Tailwind arbitrary colour on a text / surface / border utility (`text-[#333]`, `hover:bg-[#fafafa]`). */
const TAILWIND_HEX = /^(?:[\w-]+:)*!?(?:text|bg|border(?:-[xytrbl])?|divide|ring|outline|from|via|to|fill|stroke|decoration|shadow)-\[(?:#[0-9a-f]{3,8}|rgba?\([^\]]*\)|hsla?\([^\]]*\))\](?:\/\d+)?$/iu

function checkTailwindHex(html: string, issues: DesignIssue[]): void {
  const found: string[] = []
  const re = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/giu
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && found.length < 6) {
    for (const c of (m[2] ?? m[3] ?? '').split(/\s+/u)) {
      if (c === '' || found.includes(c) || !TAILWIND_HEX.test(c)) continue
      found.push(c)
      if (found.length >= 6) break
    }
  }
  if (found.length > 0) issues.push({ kind: 'tailwind-hex', detail: found.join(' ') })
}

/** Lint one sandbox spec. Bounded (≤ {@link MAX_ISSUES}), deterministic. */
export function lintSandboxDesign(input: DesignLintInput): DesignIssue[] {
  const issues: DesignIssue[] = []
  const html = (input.html ?? '').slice(0, 400_000)
  const styleBlocks: string[] = [input.css ?? '']
  html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/giu, (_all, body: string) => {
    styleBlocks.push(body)
    return ''
  })
  for (const block of styleBlocks) {
    for (const rule of parseCssRules(block.slice(0, 200_000))) {
      if (exemptSelector(rule.selector) || narrowExempt(rule.selector)) {
        if (!exemptSelector(rule.selector)) checkDecls(shortSel(rule.selector), rule.decls, issues, true)
        continue
      }
      checkDecls(shortSel(rule.selector), rule.decls, issues, rule.wideOnly === true)
    }
  }
  const bodyHtml = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '').replace(/<svg\b[\s\S]*?<\/svg>/giu, '')
  const inline = /<([a-z][\w-]*)\b[^>]*?\bstyle\s*=\s*("([^"]*)"|'([^']*)')/giu
  let m: RegExpExecArray | null
  while ((m = inline.exec(bodyHtml)) !== null) {
    if (/^(sup|sub|text|tspan)$/iu.test(m[1]!)) continue
    checkDecls(`<${m[1]!.toLowerCase()} style>`, parseDecls(m[3] ?? m[4] ?? ''), issues, /^(img|canvas|svg|video|iframe|table|pre)$/iu.test(m[1]!))
  }
  checkStatLabels(bodyHtml, issues)
  checkTailwindHex(bodyHtml, issues)
  // De-duplicate by kind+detail, keep order.
  const seen = new Set<string>()
  const out: DesignIssue[] = []
  for (const issue of issues) {
    const key = `${issue.kind}|${issue.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
    if (out.length >= MAX_ISSUES) break
  }
  return out
}

/** Model-facing next-turn note (Chinese-first, short). Empty string when clean. */
export function designLintNote(issues: readonly DesignIssue[]): string {
  if (issues.length === 0) return ''
  const kinds = new Set(issues.map((i) => i.kind))
  const rules: string[] = []
  if (kinds.has('min-font')) rules.push('字号只用 12/14/16/20/28/40（--fs-xs…--fs-2xl），任何文字不小于 12px')
  if (kinds.has('contrast')) rules.push('正文与背景对比度 ≥ 4.5:1（大字 ≥ 3:1），文字用 --color-base-content（次要文字 text-base-content/70），底色用 --color-base-100/200，不要写死十六进制')
  if (kinds.has('narrow-overflow')) rules.push('页面要在 360px 宽的手机上不横向溢出：固定宽度改成 max-width/百分比，网格用 repeat(auto-fit,minmax(min(160px,100%),1fr)) 或 .iui-cols-2/3/4（自带断点）')
  if (kinds.has('tailwind-hex')) rules.push('Tailwind 类里不要写死颜色（text-[#333] / bg-[#fff]）：文字用 text-base-content（次要 text-base-content/70），底色 bg-base-100/200，强调 text-primary / text-success，深色模式才会跟着变')
  if (kinds.has('stat-label')) rules.push('统计数字用 daisyUI stats：.stat > .stat-title 小号说明在上、.stat-value 大号数字（单位放 <small>）、.stat-desc 变化值，不要和说明写在同一行')
  const lines = issues.slice(0, 4).map((i) => `- ${i.kind}: ${i.detail}`)
  return [
    '[iui-design-referee] 上一个页面的设计检查（本条只用于接下来的新页面，不要因此重做已完成的页面）：',
    ...lines,
    `规则：${rules.join('；')}。`,
  ].join('\n')
}
