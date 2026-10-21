// @vitest-environment jsdom
// F24: ```iui-patch — local edits merged into the previous page, versions v1·v2·v3.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import {
  applySandboxPatch,
  findElementRange,
  pageFromSpec,
  pageSourceForPrompt,
  parseSandboxPatch,
  parseSimpleSelector,
  sandboxPageId,
  serializeSandboxPage,
} from '../src/shared/sandbox-patch.ts'
import { parseHtmlSandboxFence } from '../src/shared/html-sandbox.ts'
import { mergePatchFence, renderHtmlFence, renderPatchFence } from '../src/client/html-fence.tsx'
import { registerPageVersion, resetPageVersions, resolvePatchBase } from '../src/client/page-versions.ts'
import { createPageMemory, currentPage, looksLikePageEditAsk, trackPageFences } from '../src/plugin/page-memory.ts'
import { currentPageNoteFor, fenceFailures, pageMemoryFromSession } from '../src/plugin/fence-feedback.ts'
import { replyHasValidFence } from '../src/plugin/format-referee.ts'
import { buildGenuiSectionText } from '../src/plugin/section-text.ts'

const BASE = [
  'title: 记账本',
  'height: 400',
  '---css',
  '.total{font-size:20px}',
  '---html',
  '<div class="wrap"><h3 id="t">记账本</h3><p class="total">合计 0</p><ul id="list"><li>早餐</li></ul><div class="ad">广告</div></div>',
  '---js',
  'var n = 0;',
].join('\n')

const page = () => pageFromSpec(parseHtmlSandboxFence(BASE)!)

afterEach(() => { cleanup() })
beforeEach(() => { resetPageVersions() })

describe('F24 patch parse + apply', () => {
  it('parses meta and every op kind', () => {
    const p = parseSandboxPatch('page: 记账本\ntitle: 记账本 v2\n---css\n.total{font-size:28px}\n---replace #t\n<h3 id="t">我的账本</h3>\n---append #list\n<li>午餐</li>\n---remove .ad\n---find\n合计 0\n---with\n合计 ¥0\n---js\nn = 1;')!
    expect(p.page).toBe('记账本')
    expect(p.title).toBe('记账本 v2')
    expect(p.ops.map((o) => o.kind)).toEqual(['css', 'replace', 'append', 'remove', 'find', 'js'])
    expect(p.errors).toEqual([])
  })

  it('returns null without edits and reports dangling find', () => {
    expect(parseSandboxPatch('page: x\n随便说点')).toBeNull()
    expect(parseSandboxPatch('---find\nabc')!.errors.join()).toContain('without ---with')
  })

  it('applies edits and keeps the page parseable', () => {
    const p = parseSandboxPatch('---css\n.total{font-size:28px}\n---replace #t\n<h3 id="t">我的账本</h3>\n---append #list\n<li>午餐</li>\n---prepend #list\n<li>夜宵</li>\n---remove .ad\n---find\n合计 0\n---with\n合计 ¥0\n---js\nn = 1;')!
    const r = applySandboxPatch(page(), p)
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(7)
    expect(r.page.html).toContain('<h3 id="t">我的账本</h3>')
    expect(r.page.html).toContain('<ul id="list"><li>夜宵</li><li>早餐</li><li>午餐</li></ul>')
    expect(r.page.html).not.toContain('广告')
    expect(r.page.html).toContain('合计 ¥0')
    expect(r.page.css).toMatch(/font-size:20px\}\n\.total\{font-size:28px\}$/u)
    expect(r.page.js).toContain('n = 1;')
    const back = parseHtmlSandboxFence(serializeSandboxPage(r.page))!
    expect(back.html).toBe(r.page.html)
    expect(back.title).toBe('记账本')
  })

  it('fails the whole patch when a selector misses', () => {
    const r = applySandboxPatch(page(), parseSandboxPatch('---css\n.a{}\n---replace #nope\n<b></b>')!)
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('#nope')
    expect(applySandboxPatch(page(), parseSandboxPatch('---replace div p\n<b></b>')!).errors.join()).toContain('too complex')
  })

  it('selectors: tag/id/class/attr, skipping comments and scripts', () => {
    expect(parseSimpleSelector('li.a.b[data-x="1"]')).toEqual({ tag: 'li', classes: ['a', 'b'], attrs: [{ name: 'data-x', value: '1' }] })
    expect(parseSimpleSelector('div > p')).toBeNull()
    const html = '<!-- <p id="x">no</p> --><script>"<p id=x>"</script><p id="x">yes<br>ok</p><img id="i" src="a.png">'
    const r = findElementRange(html, '#x')!
    expect(html.slice(r.start, r.end)).toBe('<p id="x">yes<br>ok</p>')
    const v = findElementRange(html, '#i')!
    expect(v.end).toBe(v.openEnd)
    const nested = '<div class="c"><div>in</div></div><span></span>'
    const n = findElementRange(nested, '.c')!
    expect(nested.slice(n.start, n.end)).toBe('<div class="c"><div>in</div></div>')
  })

  it('page ids and prompt source', () => {
    expect(sandboxPageId({ title: '  My   Page ' })).toBe('my page')
    expect(sandboxPageId({ id: 'ledger', title: 'x' })).toBe('ledger')
    expect(sandboxPageId({})).toBeNull()
    const big = { ...page(), html: `<div>${'x'.repeat(9000)}</div>` }
    const src = pageSourceForPrompt(big, 2000)
    expect(src.length).toBeLessThan(2300)
    expect(src).toContain('chars elided')
    expect(src).toContain('title: 记账本')
  })
})

function mount(node: ReactElement) {
  return render(node)
}

const ctx = (seq: number) => ({ sessionId: 's1', source: { id: `dom:a${seq}:1`, order: [seq, 0, 1] as const } })

describe('F24 client versions', () => {
  it('resolves the latest earlier page, by id when named', () => {
    const p = page()
    registerPageVersion('s', { fenceKey: 'a', pageId: '记账本', raw: BASE, page: p, storageKey: null, order: [1, 0, 1] })
    registerPageVersion('s', { fenceKey: 'b', pageId: 'other', raw: BASE, page: { ...p, title: 'other' }, storageKey: null, order: [2, 0, 1] })
    expect(resolvePatchBase('s', null, { fenceKey: 'p', order: [3, 0, 1] })!.fenceKey).toBe('b')
    expect(resolvePatchBase('s', '记账本', { fenceKey: 'p', order: [3, 0, 1] })!.fenceKey).toBe('a')
    expect(resolvePatchBase('s', null, { fenceKey: 'p', order: [1, 5, 0] })!.fenceKey).toBe('a')
    expect(resolvePatchBase('s', null, { fenceKey: 'p', order: [0, 0, 1] })).toBeNull()
  })

  it('renders v1 → patch v2 → patch v3 with a version strip', async () => {
    const v1 = mount(<div>{renderHtmlFence(BASE, 'dom:a1:1', ctx(1))}</div>)
    await act(async () => {})
    const v2 = mount(<div>{renderPatchFence('---find\n合计 0\n---with\n合计 ¥12', 'dom:a2:1', ctx(2))}</div>)
    await act(async () => {})
    const ok = v2.container.querySelector('[data-iui-patch="ok"]')!
    expect(ok).not.toBeNull()
    expect(v2.container.querySelector('iframe')!.getAttribute('srcdoc')).toContain('合计 ¥12')
    const v3 = mount(<div>{renderPatchFence('page: 记账本\n---remove .ad', 'dom:a3:1', ctx(3))}</div>)
    await act(async () => {})
    const srcdoc = v3.container.querySelector('iframe')!.getAttribute('srcdoc')!
    expect(srcdoc).toContain('合计 ¥12')
    expect(srcdoc).not.toContain('广告')
    const bar = v3.container.querySelector('[data-iui-page-versions]')!
    expect(bar.getAttribute('data-iui-page-versions')).toBe('3')
    // Switch v3's frame to v1.
    await act(async () => { (bar.querySelector('[data-iui-version="1"]') as HTMLButtonElement).click() })
    expect(v3.container.querySelector('iframe')!.getAttribute('srcdoc')).toContain('广告')
    expect(v1.container.querySelector('[data-iui-page-versions]')!.getAttribute('data-iui-page-versions')).toBe('3')
  })

  it('shows a rewrite action when the patch cannot apply or has no page', async () => {
    const none = mount(<div>{renderPatchFence('---css\n.a{}', 'dom:a9:1', ctx(9))}</div>)
    await act(async () => {})
    expect(none.container.querySelector('[data-iui-patch="no-base"]')).not.toBeNull()
    mount(<div>{renderHtmlFence(BASE, 'dom:a1:1', ctx(1))}</div>)
    await act(async () => {})
    // The no-base frame re-resolves once the page registers.
    expect(none.container.querySelector('[data-iui-patch="ok"]')).not.toBeNull()
    const bad = mount(<div>{renderPatchFence('---replace #missing\n<b>x</b>', 'dom:a10:1', ctx(10))}</div>)
    await act(async () => {})
    const fail = bad.container.querySelector('[data-iui-patch="failed"]')!
    expect(fail.textContent).toContain('#missing')
    expect(fail.textContent).toMatch(/整页重写|full rewrite/u)
    expect(mergePatchFence('随便', 's1', 'k').kind).toBe('failed')
  })

  it('streaming patches show a skeleton', () => {
    const view = mount(<div>{renderPatchFence('---css\n.a{', 'k', { sessionId: 's1', streaming: true })}</div>)
    expect(view.container.querySelector('[data-iui-patch="streaming"]')).not.toBeNull()
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('explicit id pages share one state key across versions', async () => {
    const withId = BASE.replace('title: 记账本', 'id: ledger\ntitle: 记账本')
    const a = mount(<div>{renderHtmlFence(withId, 'dom:b1:1', ctx(1))}</div>)
    await act(async () => {})
    const b = mount(<div>{renderPatchFence('---css\n.x{}', 'dom:b2:1', ctx(2))}</div>)
    await act(async () => {})
    expect(a.container.querySelector('[data-iui-page="ledger"]')).not.toBeNull()
    expect(b.container.querySelector('[data-iui-page="ledger"]')).not.toBeNull()
  })
})

const FENCE = '```'
const reply = (body: string, lang = 'iui-html') => `好的\n${FENCE}${lang}\n${body}\n${FENCE}\n`
function session(events: { type: string; data: unknown }[]) {
  return { snapshotEvents: () => events } as never
}
const user = (text: string) => ({ type: 'user/message', data: { content: text } })
const assistant = (text: string) => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } })

describe('F24 plugin', () => {
  it('patch fences count as delivered and invalid ones are repaired', () => {
    expect(replyHasValidFence(reply('---css\n.a{}', 'iui-patch'))).toBe(true)
    expect(replyHasValidFence(reply('只是文字', 'iui-patch'))).toBe(false)
    expect(fenceFailures(reply('---css\n.a{}', 'iui-patch'))).toEqual([])
    expect(fenceFailures(reply('---find\nabc', 'iui-patch'))[0]!.detail).toContain('invalid_patch')
  })

  it('tracks the current page through patches', () => {
    const memory = createPageMemory()
    trackPageFences(memory, [{ raw: BASE, closed: true, lang: 'iui-html' }])
    trackPageFences(memory, [{ raw: '---remove .ad', closed: true, lang: 'iui-patch' }])
    trackPageFences(memory, [{ raw: '---remove #gone', closed: true, lang: 'iui-patch' }])
    const cur = currentPage(memory)!
    expect(cur.version).toBe(2)
    expect(cur.page.html).not.toContain('广告')
  })

  it('injects the page source for an edit ask right after a page', () => {
    expect(looksLikePageEditAsk('把标题改成红色')).toBe(true)
    expect(looksLikePageEditAsk('make the button bigger')).toBe(true)
    expect(looksLikePageEditAsk('今天天气怎么样')).toBe(false)
    expect(looksLikePageEditAsk('再新建一个页面做番茄钟，加上统计')).toBe(false)
    const s = session([user('做个记账本'), assistant(reply(BASE)), user('把合计字号调大')])
    const note = currentPageNoteFor(s, '把合计字号调大')!
    expect(note).toContain('[iui-current-page]')
    expect(note).toContain('v1')
    expect(note).toContain('iui-patch')
    expect(note).toContain('<p class="total">合计 0</p>')
    expect(pageMemoryFromSession(s).asksSinceLatest).toBe(1)
    const stale = session([user('做个记账本'), assistant(reply(BASE)), user('a'), user('b'), user('把合计字号调大')])
    expect(currentPageNoteFor(stale, '把合计字号调大')).toBeNull()
    expect(currentPageNoteFor(session([user('把合计字号调大')]), '把合计字号调大')).toBeNull()
  })

  it('system prompt documents iui-patch within budget', () => {
    const text = buildGenuiSectionText()
    expect(text).toContain('```iui-patch')
    expect(text.length).toBeLessThan(3600)
  })
})
