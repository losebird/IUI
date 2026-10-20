// @vitest-environment jsdom
// F7: ordinary JSON code blocks must never be auto-rendered as pages.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installDomFenceRenderer } from '../src/client/dom-fence.tsx'
import { isStrictSandboxJson } from '../src/shared/genui-shape.ts'

function ctx(): Context {
  return {
    sessions: { list: { getSnapshot: () => ({
      ids: ['s1'], byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } }, phase: 'ready', projectionsBySession: {},
    }) } },
  } as unknown as Context
}

function codeBlock(raw: string, label: string, generic = false): HTMLElement {
  const block = document.createElement('div')
  block.className = 'md-code-block'
  const banner = document.createElement('div')
  const labelEl = document.createElement('div')
  labelEl.textContent = label
  banner.appendChild(labelEl)
  if (generic) banner.setAttribute('data-code-block-banner', '')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  block.append(banner, pre)
  return block
}

function row(key: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-chat-anchor-key', key)
  el.setAttribute('data-chat-flow-kind', 'assistant-step')
  el.setAttribute('data-chat-node-key', key)
  return el
}

const tick = (ms = 60): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(fn: () => boolean, ms = 1500): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return true; await tick(20) }
  return fn()
}

const PAGE = JSON.stringify({ title: '页面', css: '.a{color:red}', html: '<div class="a">hi</div>', js: '' })
const CONFIG = JSON.stringify({ name: 'site', port: 8080, html: '<b>x</b>', css: 'main.css' })

afterEach(() => { document.body.innerHTML = '' })

describe('F7 strict page JSON', () => {
  it('strict check: whitelisted keys + html with a tag', () => {
    expect(isStrictSandboxJson(PAGE)).toBe(true)
    expect(isStrictSandboxJson(CONFIG)).toBe(false)
    expect(isStrictSandboxJson('{"html":"plain text","css":""}')).toBe(false)
    expect(isStrictSandboxJson('{"css":"a{}","js":"x()"}')).toBe(false)
  })

  it('keeps an ordinary config ```json as a code block, no render button', async () => {
    const r = row('cfg'); const block = codeBlock(CONFIG, 'json'); r.append(block); document.body.append(r)
    const dispose = installDomFenceRenderer(ctx(), () => {})
    try {
      await tick(150)
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(r.querySelector('[data-iui-render-offer]')).toBeNull()
    } finally { dispose() }
  })

  it('keeps a generic (host-hidden) config JSON as a code block', async () => {
    const r = row('cfg2'); const block = codeBlock(CONFIG, '代码块', true); r.append(block); document.body.append(r)
    const dispose = installDomFenceRenderer(ctx(), () => {})
    try {
      await tick(150)
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(r.querySelector('[data-iui-html-sandbox]')).toBeNull()
    } finally { dispose() }
  })

  it('page-shaped ```json is not auto-rendered; the button renders it on demand', async () => {
    const r = row('jsonpage'); const block = codeBlock(PAGE, 'json'); r.append(block); document.body.append(r)
    const dispose = installDomFenceRenderer(ctx(), () => {})
    try {
      expect(await waitFor(() => r.querySelector('[data-iui-render-offer] button') !== null)).toBe(true)
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      await tick(150)
      expect(r.querySelectorAll('[data-iui-render-offer]').length).toBe(1)
      ;(r.querySelector('[data-iui-render-offer] button') as HTMLButtonElement).click()
      expect(await waitFor(() => r.querySelector('[data-iui-html-sandbox]') !== null)).toBe(true)
      expect(block.style.display).toBe('none')
      expect(r.querySelector('[data-iui-render-offer]')).toBeNull()
    } finally { dispose() }
    expect(document.querySelector('[data-iui-render-offer]')).toBeNull()
  })

  it('explicit ```iui-html still auto-renders', async () => {
    const r = row('html'); const block = codeBlock(PAGE, 'iui-html'); r.append(block); document.body.append(r)
    const dispose = installDomFenceRenderer(ctx(), () => {})
    try {
      expect(await waitFor(() => r.querySelector('[data-iui-html-sandbox]') !== null)).toBe(true)
    } finally { dispose() }
  })
})
