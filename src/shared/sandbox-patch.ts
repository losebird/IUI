/**
 * F24: ```iui-patch — iterate on the previous ```iui-html page in place.
 *
 * A patch names its page (`page: <id or title>`, default = the latest page in the
 * conversation) and lists local edits; the host merges them into a new version
 * (v1 · v2 · v3) and renders that. Any edit that cannot be applied fails the
 * whole patch, and the host offers a full-page rewrite instead.
 *
 * ```iui-patch
 * page: 记账本
 * ---css
 * .total{font-size:28px}            ← appended (later rules win)
 * ---replace #summary               ← outerHTML of the first match
 * <div id="summary">…</div>
 * ---append #list                   ← also prepend / before / after
 * <li>新条目</li>
 * ---remove .ad
 * ---find                           ← literal text, first hit in html → css → js
 * 每月预算
 * ---with
 * 本月预算
 * ---js                             ← appended after the page script
 * render()
 * ```
 *
 * Selectors are one compound selector: `tag`, `#id`, `.class`, `[attr]`,
 * `[attr="v"]` (combined freely, no spaces / combinators). Pure string work —
 * runs the same in the browser and in the plugin (no DOM).
 * @module @losebird/iui/shared/sandbox-patch
 */

import type { HtmlSandboxSpec } from './html-sandbox.ts'

export type SandboxPatchOp =
  | { kind: 'css' | 'css-replace' | 'js' | 'js-replace' | 'html-replace'; content: string }
  | { kind: 'replace' | 'append' | 'prepend' | 'before' | 'after'; selector: string; content: string }
  | { kind: 'remove'; selector: string }
  | { kind: 'find'; find: string; with: string }

export type SandboxPatch = {
  /** Target page id / title; undefined = latest page. */
  page?: string
  /** Optional new title for the merged version. */
  title?: string
  ops: SandboxPatchOp[]
  /** Parse problems (e.g. `---find` without `---with`). */
  errors: string[]
}

/** The mergeable part of a page. */
export type SandboxPage = {
  id?: string
  title?: string
  height?: number
  css: string
  html: string
  js: string
  jsFunctions?: string
  jsExpressions?: readonly string[]
}

export type SandboxPatchResult = {
  ok: boolean
  page: SandboxPage
  applied: number
  errors: string[]
}

const OP_HEADER = /^---\s*(css-replace|js-replace|html-replace|css|js|replace|append|prepend|before|after|remove|find|with)\b\s*(.*)$/iu
const META = /^(page|id|title)\s*[:：]\s*(.+)$/iu
const SELECTOR_OPS = new Set(['replace', 'append', 'prepend', 'before', 'after', 'remove'])
const MAX_OPS = 40

function trimBlock(lines: string[]): string {
  let a = 0
  let b = lines.length
  while (a < b && lines[a]!.trim() === '') a++
  while (b > a && lines[b - 1]!.trim() === '') b--
  return lines.slice(a, b).join('\n')
}

/** Parse a patch fence body; `null` when it has no edits at all. */
export function parseSandboxPatch(raw: string): SandboxPatch | null {
  const lines = raw.replace(/\r\n/gu, '\n').split('\n')
  const patch: SandboxPatch = { ops: [], errors: [] }
  let current: { kind: string; arg: string; buf: string[] } | null = null
  let pendingFind: string | null = null
  const flush = (): void => {
    if (current === null) return
    const content = trimBlock(current.buf)
    const kind = current.kind
    if (kind === 'find') {
      if (pendingFind !== null) patch.errors.push('---find without ---with')
      pendingFind = content
    } else if (kind === 'with') {
      if (pendingFind === null) patch.errors.push('---with without ---find')
      else if (pendingFind === '') patch.errors.push('---find is empty')
      else patch.ops.push({ kind: 'find', find: pendingFind, with: content })
      pendingFind = null
    } else if (SELECTOR_OPS.has(kind)) {
      const selector = current.arg.trim()
      if (selector === '') patch.errors.push(`---${kind} needs a selector`)
      else if (kind === 'remove') patch.ops.push({ kind: 'remove', selector })
      else patch.ops.push({ kind: kind as 'replace', selector, content })
    } else {
      patch.ops.push({ kind: kind as 'css', content })
    }
    current = null
  }
  for (const line of lines) {
    const header = OP_HEADER.exec(line.trim())
    if (header) {
      flush()
      current = { kind: header[1]!.toLowerCase(), arg: header[2] ?? '', buf: [] }
      if (patch.ops.length >= MAX_OPS) break
      continue
    }
    if (current !== null) { current.buf.push(line); continue }
    const meta = META.exec(line.trim())
    if (meta) {
      const key = meta[1]!.toLowerCase()
      const value = meta[2]!.trim().slice(0, 80)
      if (key === 'title') patch.title = value
      else patch.page = value
    }
  }
  flush()
  if (pendingFind !== null) patch.errors.push('---find without ---with')
  if (patch.ops.length === 0 && patch.errors.length === 0) return null
  return patch
}

// ── HTML element ranges (no DOM) ────────────────────────────────────────────

type SimpleSelector = { tag?: string; id?: string; classes: string[]; attrs: { name: string; value?: string }[] }

export function parseSimpleSelector(selector: string): SimpleSelector | null {
  const src = selector.trim()
  if (src === '' || /[\s>+~,:]/u.test(src.replace(/\[[^\]]*\]/gu, ''))) return null
  const out: SimpleSelector = { classes: [], attrs: [] }
  const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/gu
  let pos = 0
  let m: RegExpExecArray | null
  while (pos < src.length) {
    re.lastIndex = 0
    m = re.exec(src.slice(pos))
    if (m === null || m.index !== 0) return null
    if (m[1] !== undefined) { if (pos !== 0) return null; out.tag = m[1].toLowerCase() }
    else if (m[2] !== undefined) out.id = m[2]
    else if (m[3] !== undefined) out.classes.push(m[3])
    else if (m[4] !== undefined) out.attrs.push({ name: m[4].toLowerCase(), ...(m[5] ?? m[6] ?? m[7]) !== undefined ? { value: (m[5] ?? m[6] ?? m[7])! } : {} })
    pos += m[0].length
  }
  return out
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const OPTIONAL_END = new Set(['li', 'p', 'td', 'th', 'tr', 'option', 'dt', 'dd'])
const START_TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/gu
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu

/** Blank out comments and script/style/textarea bodies (same length) so tags inside them never match. */
function maskHtml(html: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/gu, ' ')
  return html
    .replace(/<!--[\s\S]*?-->/gu, blank)
    .replace(/(<(script|style|textarea)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/giu, (_all, open: string, _t: string, body: string, close: string) => open + blank(body) + close)
}

function attrsOf(text: string): Map<string, string> {
  const out = new Map<string, string>()
  ATTR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR.exec(text)) !== null) out.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

function matches(sel: SimpleSelector, tag: string, attrs: Map<string, string>): boolean {
  if (sel.tag !== undefined && sel.tag !== tag) return false
  if (sel.id !== undefined && attrs.get('id') !== sel.id) return false
  if (sel.classes.length) {
    const cls = new Set((attrs.get('class') ?? '').split(/\s+/u))
    if (!sel.classes.every((c) => cls.has(c))) return false
  }
  for (const a of sel.attrs) {
    if (!attrs.has(a.name)) return false
    if (a.value !== undefined && attrs.get(a.name) !== a.value) return false
  }
  return true
}

export type ElementRange = { start: number; openEnd: number; closeStart: number; end: number }

/** First element matching a simple selector: outer range + inner (openEnd..closeStart). */
export function findElementRange(html: string, selector: string): ElementRange | null {
  const sel = parseSimpleSelector(selector)
  if (sel === null) return null
  const masked = maskHtml(html)
  START_TAG.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = START_TAG.exec(masked)) !== null) {
    const tag = m[1]!.toLowerCase()
    if (!matches(sel, tag, attrsOf(m[2] ?? ''))) continue
    const start = m.index
    const openEnd = m.index + m[0].length
    if (VOID.has(tag) || m[3] === '/') return { start, openEnd, closeStart: openEnd, end: openEnd }
    // Walk same-name tags to the matching close.
    const scan = new RegExp(`<(/?)${tag.replace(/[-:]/gu, '\\$&')}(?=[\\s/>])[^>]*>`, 'giu')
    scan.lastIndex = openEnd
    let depth = 1
    let t: RegExpExecArray | null
    while ((t = scan.exec(masked)) !== null) {
      const closing = t[1] === '/'
      if (!closing && /\/>$/u.test(t[0])) continue
      if (!closing && OPTIONAL_END.has(tag) && depth === 1) return { start, openEnd, closeStart: t.index, end: t.index }
      depth += closing ? -1 : 1
      if (depth === 0) return { start, openEnd, closeStart: t.index, end: t.index + t[0].length }
    }
    // Unclosed optional-end element runs to the end of its parent: give up rather than guess.
    return OPTIONAL_END.has(tag) ? null : null
  }
  return null
}

// ── merge ───────────────────────────────────────────────────────────────────

export function pageFromSpec(spec: HtmlSandboxSpec): SandboxPage {
  return {
    ...(spec.id ? { id: spec.id } : {}),
    ...(spec.title ? { title: spec.title } : {}),
    ...(spec.height !== undefined ? { height: spec.height } : {}),
    css: spec.css,
    html: spec.html,
    js: spec.js,
    ...(spec.jsFunctions ? { jsFunctions: spec.jsFunctions } : {}),
    ...(spec.jsExpressions && spec.jsExpressions.length ? { jsExpressions: spec.jsExpressions } : {}),
  }
}

/** Apply every edit; one failure fails the patch (the host then asks for a full rewrite). */
export function applySandboxPatch(base: SandboxPage, patch: SandboxPatch): SandboxPatchResult {
  const page: SandboxPage = { ...base }
  const errors = [...patch.errors]
  let applied = 0
  const join = (a: string, b: string): string => (a.trim() === '' ? b : b.trim() === '' ? a : `${a.replace(/\s+$/u, '')}\n${b}`)
  for (const op of patch.ops) {
    switch (op.kind) {
      case 'css': page.css = join(page.css, op.content); applied++; break
      case 'css-replace': page.css = op.content; applied++; break
      case 'js': page.js = join(page.js, op.content); applied++; break
      case 'js-replace': page.js = op.content; delete page.jsFunctions; delete page.jsExpressions; applied++; break
      case 'html-replace':
        if (op.content.trim() === '') { errors.push('---html-replace is empty'); break }
        page.html = op.content; applied++; break
      case 'find': {
        let hit = false
        for (const field of ['html', 'css', 'js'] as const) {
          const i = page[field].indexOf(op.find)
          if (i < 0) continue
          page[field] = page[field].slice(0, i) + op.with + page[field].slice(i + op.find.length)
          hit = true
          break
        }
        if (hit) applied++
        else errors.push(`---find text not found: ${JSON.stringify(op.find.slice(0, 40))}`)
        break
      }
      default: {
        if (parseSimpleSelector(op.selector) === null) {
          errors.push(`selector too complex: ${op.selector} (use #id, .class, tag or [attr])`)
          break
        }
        const r = findElementRange(page.html, op.selector)
        if (r === null) { errors.push(`no element matches ${op.selector}`); break }
        const h = page.html
        if (op.kind === 'remove') page.html = h.slice(0, r.start) + h.slice(r.end)
        else if (op.kind === 'replace') page.html = h.slice(0, r.start) + op.content + h.slice(r.end)
        else if (op.kind === 'before') page.html = h.slice(0, r.start) + op.content + h.slice(r.start)
        else if (op.kind === 'after') page.html = h.slice(0, r.end) + op.content + h.slice(r.end)
        else if (r.closeStart === r.openEnd && r.end === r.openEnd) { errors.push(`${op.selector} cannot hold children`); break }
        else if (op.kind === 'append') page.html = h.slice(0, r.closeStart) + op.content + h.slice(r.closeStart)
        else page.html = h.slice(0, r.openEnd) + op.content + h.slice(r.openEnd)
        applied++
      }
    }
  }
  if (patch.title) page.title = patch.title
  return { ok: errors.length === 0 && applied > 0, page, applied, errors }
}

/** Serialize a merged page as an ```iui-html JSON body (parses back losslessly). */
export function serializeSandboxPage(page: SandboxPage): string {
  return JSON.stringify({
    ...(page.id ? { id: page.id } : {}),
    ...(page.title ? { title: page.title } : {}),
    ...(page.height !== undefined ? { height: page.height } : {}),
    css: page.css,
    html: page.html,
    js: page.js,
    ...(page.jsFunctions ? { jsFunctions: page.jsFunctions } : {}),
    ...(page.jsExpressions && page.jsExpressions.length ? { jsExpressions: page.jsExpressions } : {}),
  })
}

/** Page identity: explicit `id:`, else the normalized title; `null` = unversioned. */
export function sandboxPageId(spec: { id?: string; title?: string }): string | null {
  const raw = (spec.id ?? spec.title ?? '').trim()
  if (raw === '') return null
  return raw.toLowerCase().replace(/\s+/gu, ' ').slice(0, 80)
}

/** Section-format source of a page for prompts (truncated to `max` chars, middle of long parts elided). */
export function pageSourceForPrompt(page: SandboxPage, max = 4000): string {
  const parts: [string, string][] = [['css', page.css], ['html', page.html], ['js', [page.js, page.jsFunctions ?? '', ...(page.jsExpressions ?? [])].filter(Boolean).join('\n')]]
  const total = parts.reduce((n, [, v]) => n + v.length, 0)
  const budget = Math.max(600, max - 60)
  const clip = (v: string, share: number): string => {
    if (v.length <= share) return v
    const head = Math.floor(share * 0.7)
    const tail = Math.max(0, share - head - 20)
    return `${v.slice(0, head)}\n/* … ${v.length - head - tail} chars elided … */\n${tail ? v.slice(-tail) : ''}`
  }
  const lines: string[] = []
  if (page.id) lines.push(`id: ${page.id}`)
  if (page.title) lines.push(`title: ${page.title}`)
  for (const [name, v] of parts) {
    if (v.trim() === '') continue
    const share = total <= budget ? v.length : Math.floor((v.length / total) * budget)
    lines.push(`---${name}`, clip(v, share))
  }
  return lines.join('\n')
}
