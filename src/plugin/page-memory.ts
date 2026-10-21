/**
 * F24: plugin-side memory of the conversation's current ```iui-html page, so an
 * edit ask ("把标题改大一点") gets the page source + ```iui-patch syntax instead
 * of a full regeneration.
 * Rebuilt from the session transcript (stateless across plugin restarts).
 * @module @losebird/iui/plugin/page-memory
 */
import { parseHtmlSandboxFence } from '../shared/html-sandbox.ts'
import {
  applySandboxPatch,
  pageFromSpec,
  pageSourceForPrompt,
  parseSandboxPatch,
  sandboxPageId,
  type SandboxPage,
} from '../shared/sandbox-patch.ts'

export type RememberedPage = { key: string; page: SandboxPage; version: number }

export type PageMemory = {
  pages: Map<string, RememberedPage>
  latest: string | null
  /** User asks seen since the latest page changed (for the "still on screen" gate). */
  asksSinceLatest: number
}

export type FenceLike = { raw: string; closed: boolean; lang?: string }

export function createPageMemory(): PageMemory {
  return { pages: new Map(), latest: null, asksSinceLatest: 0 }
}

function keyOf(page: { id?: string; title?: string }, fallback: string): string {
  return sandboxPageId(page) ?? fallback
}

/** Fold one reply's closed fences (document order) into the memory. */
export function trackPageFences(memory: PageMemory, fences: readonly FenceLike[]): void {
  for (const fence of fences) {
    if (!fence.closed) continue
    if (fence.lang === 'iui-patch') {
      const patch = parseSandboxPatch(fence.raw)
      if (patch === null) continue
      const wanted = patch.page ? sandboxPageId({ id: patch.page }) : null
      const base = wanted !== null
        ? memory.pages.get(wanted) ?? [...memory.pages.values()].find((p) => p.page.title && sandboxPageId({ title: p.page.title }) === wanted)
        : memory.latest !== null ? memory.pages.get(memory.latest) : undefined
      if (base === undefined) continue
      const result = applySandboxPatch(base.page, patch)
      if (!result.ok) continue
      memory.pages.set(base.key, { key: base.key, page: result.page, version: base.version + 1 })
      memory.latest = base.key
      memory.asksSinceLatest = 0
      continue
    }
    let spec
    try { spec = parseHtmlSandboxFence(fence.raw) } catch { spec = null }
    if (spec === null || (spec.html.trim() === '' && spec.js.trim() === '')) continue
    const page = pageFromSpec(spec)
    const key = keyOf(page, `#${memory.pages.size + 1}`)
    const prev = memory.pages.get(key)
    memory.pages.set(key, { key, page, version: (prev?.version ?? 0) + 1 })
    memory.latest = key
    memory.asksSinceLatest = 0
    if (memory.pages.size > 24) memory.pages.delete(memory.pages.keys().next().value!)
  }
}

export function currentPage(memory: PageMemory): RememberedPage | null {
  return memory.latest === null ? null : memory.pages.get(memory.latest) ?? null
}

const EDIT_ASK = /(?:改|换|加|删|调|去掉|去除|移除|放大|缩小|大一点|小一点|大些|小些|颜色|配色|字体|字号|标题|按钮|背景|增加|新增|添加|修改|替换|变成|改成|edit|change|make it|add|remove|delete|replace|rename|bigger|smaller|color|colour|tweak|adjust)/iu
const NEW_PAGE_ASK = /(?:新(?:的|建|做)?(?:一个|个)?(?:页面|页|看板|工具|应用)|另(?:一个|外做)|重新做|从头|new page|another page|from scratch)/iu

/** Heuristic: the ask edits the page already on screen (not a brand-new page). */
export function looksLikePageEditAsk(ask: string): boolean {
  const text = ask.trim()
  if (text === '' || text.length > 400) return false
  if (NEW_PAGE_ASK.test(text)) return false
  return EDIT_ASK.test(text)
}

/** Next-turn note: the current page source + ```iui-patch syntax. */
export function currentPageNote(entry: RememberedPage, maxSource = 4000): string {
  const { page } = entry
  const name = page.id ?? page.title ?? ''
  return [
    `[iui-current-page] 当前页面：${page.title ?? '(无标题)'}${page.id ? ` id=${page.id}` : ''} 版本 v${entry.version}`,
    '用户这句话像是在修改这个页面。只改少量内容时，输出一个 iui-patch 围栏（比整页重写快，用户会看到 v' + (entry.version + 1) + '），改动大或结构重做时仍输出完整 iui-html：',
    `iui-patch 正文：第一行 \`page: ${name || '<标题>'}\`，之后每段一个标记行：`,
    '- `---css` 追加 CSS（后写覆盖前写）· `---replace #id`/`.class`/`tag`/`[attr]` 用新 HTML 替换第一个匹配元素 · `---append #sel` / `---prepend` / `---before` / `---after` 插入 HTML · `---remove #sel` 删除 · `---find` 原文 + `---with` 新文本（精确匹配）· `---js` 追加脚本',
    '- 选择器只用单个 #id / .class / tag / [attr="v"]，必须在下面源码里存在；任何一条失败整个补丁作废。',
    '当前源码：',
    pageSourceForPrompt(page, maxSource),
  ].join('\n')
}
