// @vitest-environment jsdom
// DOM render channel: pure-plugin fence rendering on pristine hosts.
// Builds the stock CodeBlock surface (`.md-code-block` + banner label div +
// `<pre>`) inside a conversation row and drives the observer pipeline.
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import { installDomFenceRenderer, setDomRootFactory, sourceLanguageOf } from '../src/client/dom-fence.tsx'
import { inject } from '../src/client/index.tsx'
import { clearSessionPanel, getPanelSpec } from '../src/client/panel-store.ts'

const VALID_SPEC = '{"title":"卡片","items":[{"type":"text","content":"目录组件卡已移除"}]}'
const BUTTON_SPEC = '{"items":[{"type":"button","label":"刷新","action":"refresh"}]}'
const PANEL_SPEC = '{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]}'
const BROKEN_SPEC = '{"items":[{"type":"text","content":'
const TIER2_SCHEMA_FAILURE = '{"items":[{"type":"stat","value":"好"'

function makeCtx(sessionId: string | undefined, send: ReturnType<typeof vi.fn>): Context {
  return {
    sessions: { list: { getSnapshot: () => ({ current: sessionId }) } },
  } as unknown as Context
}

function makeModernCtx(sessionId: string): Context {
  return {
    sessions: {
      list: {
        getSnapshot: () => ({
          ids: ['sidebar-session', sessionId],
          byId: {
            'sidebar-session': { id: 'sidebar-session', retainedBy: { sidebar: 1 } },
            [sessionId]: { id: sessionId, retainedBy: { mainView: 1 } },
          },
          phase: 'ready',
          projectionsBySession: {},
        }),
      },
    },
  } as unknown as Context
}

function makeSourceCtx(sessionId: string, getChat: () => unknown, subscribe: (listener: () => void) => () => void): Context {
  const base = makeModernCtx(sessionId) as unknown as Record<string, unknown>
  return {
    ...base,
    get: (name: string) => name === 'uiConversation' ? {
      binding: () => ({ target: () => ({ getSnapshot: getChat, subscribe }) }),
    } : undefined,
  } as unknown as Context
}

/** Stock CodeBlock surface: wrapper.md-code-block > banner > label div + pre. */
function stockCodeBlock(raw: string, lang: string): HTMLElement {
  const block = document.createElement('div')
  block.className = 'md-code-block'
  const banner = document.createElement('div')
  const label = document.createElement('div')
  label.textContent = lang
  banner.appendChild(label)
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  block.appendChild(banner)
  block.appendChild(pre)
  return block
}

/** 构造 DSH 0.1.7 仅显示通用标签的 CodeToolbar DOM 测试结构。 */
function genericCodeBlock(raw: string, label = '代码块'): HTMLElement {
  const block = stockCodeBlock(raw, label)
  block.querySelector('div')?.setAttribute('data-code-block-banner', '')
  return block
}

/** Deepsuite-style fence surface (issue #6): `.code-block` / span language
 * label + copy button in the banner, body wrapped in a content div. */
function deepsuiteCodeBlock(raw: string, lang: string, cls = 'code-block'): HTMLElement {
  const block = document.createElement('div')
  block.className = cls
  const banner = document.createElement('div')
  const label = document.createElement('span')
  label.textContent = lang
  const copy = document.createElement('button')
  copy.textContent = '复制'
  banner.appendChild(label)
  banner.appendChild(copy)
  const content = document.createElement('div')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  content.appendChild(pre)
  block.appendChild(banner)
  block.appendChild(content)
  return block
}

function assistantRow(anchorKey: string, streaming = false): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-anchor-key', anchorKey)
  row.setAttribute('data-chat-flow-kind', 'assistant-step')
  row.setAttribute('data-chat-node-key', anchorKey)
  if (streaming) row.setAttribute('data-streaming', '')
  return row
}

async function tick(ms = 40): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

/** Poll instead of a single fixed wait: the rAF sweep can land late under a
 *  loaded parallel test run, which made the growth assertion flaky. */
async function waitFor(predicate: () => boolean, ms = 1500): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (predicate()) return true
    await tick(30)
  }
  return predicate()
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('installDomFenceRenderer', () => {
  it('renders a Desktop tag-text fence and restores the original text on disposal', async () => {
    const row = assistantRow('desktop-tag')
    const prose = document.createElement('span')
    prose.textContent = '回答正文'
    const tag = document.createElement('span')
    tag.className = '_plainRun_fbulu_6'
    tag.textContent = `<dsh-ui>\r\n${VALID_SPEC}\r\n</dsh-ui>`
    row.append(prose, tag)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('desktop-session'), () => {})
    try {
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(tag.style.display).toBe('none')
      expect(prose.textContent).toBe('回答正文')
    } finally { dispose() }
    expect(tag.style.display).toBe('')
    expect(tag.textContent).toContain(VALID_SPEC)
  })

  it('updates a tag-text fence as its content changes', async () => {
    const row = assistantRow('desktop-stream', true)
    const tag = document.createElement('span')
    tag.textContent = `<dsh-ui>\n${VALID_SPEC}\n</dsh-ui>`
    row.appendChild(tag)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('desktop-stream-session'), () => {})
    try {
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      tag.textContent = '<dsh-ui>\n{"title":"更新","items":[{"type":"text","content":"更新内容"}]}\n</dsh-ui>'
      row.removeAttribute('data-streaming')
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(row.querySelector('[data-iui-legacy-catalog]')?.getAttribute('data-iui-legacy-catalog')).toBe('1')
    } finally { dispose() }
  })

  it('renders tag text when the host omits the conversation row attributes', async () => {
    const tag = document.createElement('span')
    tag.textContent = `<dsh-ui>\n${VALID_SPEC}\n</dsh-ui>`
    document.body.appendChild(tag)
    const dispose = installDomFenceRenderer(makeModernCtx('desktop-no-row-session'), () => {})
    try {
      expect(await waitFor(() => document.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(tag.style.display).toBe('none')
    } finally { dispose() }
  })

  it('leaves non-assistant and incomplete tag text visible', async () => {
    const userRow = document.createElement('div')
    userRow.setAttribute('data-chat-flow-kind', 'user')
    const userTag = document.createElement('span')
    userTag.textContent = `<dsh-ui>${VALID_SPEC}</dsh-ui>`
    userRow.appendChild(userTag)
    const assistant = assistantRow('desktop-incomplete')
    const incomplete = document.createElement('span')
    incomplete.textContent = `<dsh-ui>${VALID_SPEC}`
    assistant.appendChild(incomplete)
    document.body.append(userRow, assistant)
    const dispose = installDomFenceRenderer(makeModernCtx('desktop-filter-session'), () => {})
    try {
      await tick()
      expect(document.querySelector('.genui-dom-fence')).toBeNull()
      expect(userTag.style.display).toBe('')
      expect(incomplete.style.display).toBe('')
    } finally { dispose() }
  })


  it.each(['Code', 'Code block', '代码块', 'Код', 'Código'])('mounts ```iui-html sandbox from a generic %s banner (host hid lang)', async label => {
    // Sandbox-first regression: host highlighter strips `iui-html` → localized「代码块」.
    // ChatSnapshot source may be unavailable; content rescue must still mount the iframe
    // (Ace 3081: Shanghai→France trip rendered as raw JSON code block).
    const sandbox = JSON.stringify({
      title: '上海飞法国',
      height: 420,
      css: '.wrap{padding:12px}',
      html: '<div class="wrap" data-proof="sandbox-mount">trip</div>',
      js: '',
    })
    const row = assistantRow('generic-sandbox')
    const block = genericCodeBlock(sandbox, label)
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('generic-sandbox-session'), () => {})
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(await waitFor(() => row.querySelector('[data-iui-html-sandbox]') !== null)).toBe(true)
      expect(block.style.display).toBe('none')
    } finally { dispose() }
  })

  it.each(['Code', 'Code block', '代码块', 'Код', 'Código', 'Codice', 'Kode'])('does not take over catalog GenUI from a generic %s banner (sandbox-first)', async label => {
    const row = assistantRow(`generic-${label}`)
    const block = genericCodeBlock(VALID_SPEC)
    // generic banner label text
    const banner = block.querySelector('[data-code-block-banner]')
    if (banner) banner.textContent = label
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('generic-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally { dispose() }
  })

  it('does not take over catalog GenUI needing tier-1 repairs (sandbox-first)', async () => {
    const raw = '{"items":[{"type":"text","content":"hi",}]}'
    const row = assistantRow('tier1-generic')
    const block = genericCodeBlock(raw)
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('tier1-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
    } finally { dispose() }
  })


  it.each([
    '{"name":"ordinary","items":[]}',
    '{"items":[{"type":"text","content":',
    '{"items":[{"type":"button"}]}',
    '{"items":[{"type":"text","content":"你好","unknown":true}]}',
    '{"items":[{"type":"text","text":"别名"}]}',
  ])('keeps invalid or ordinary JSON in a generic CodeBlock: %s', async raw => {
    const row = assistantRow('generic-rejected')
    const block = genericCodeBlock(raw)
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('generic-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      expect(row.querySelector('.genui-dom-fence-diagnostic')).toBeNull()
    } finally { dispose() }
  })

  it.each(['json', 'javascript'])('honors explicit %s over GenUI-shaped content', async language => {
    const row = assistantRow(`explicit-${language}`)
    const block = stockCodeBlock(VALID_SPEC, language)
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('explicit-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally { dispose() }
  })

  it.each(['json', 'JSON', 'python'])('keeps a banner-labeled %s block even with the generic banner marker', async language => {
    // 反转后的 domLanguageOf（#258）：banner 标注了已知真实语言 ⇒ 明确不是通用块，
    // 即使宿主同时给了 data-code-block-banner 也不内容接管（大小写不敏感）。
    const row = assistantRow(`banner-language-${language}`)
    const block = genericCodeBlock(VALID_SPEC, language)
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('banner-language-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally { dispose() }
  })

  it('keeps a generic CodeBlock outside assistant conversation rows', async () => {
    const block = genericCodeBlock(VALID_SPEC)
    document.body.appendChild(block)
    const dispose = installDomFenceRenderer(makeModernCtx('sidebar-session'), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(document.querySelector('.genui-dom-fence')).toBeNull()
    } finally { dispose() }
  })

  it('keeps explicit dsh-ui and earlier host language labels on the existing path', async () => {
    const row = assistantRow('explicit-genui')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('explicit-session'), () => {})
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
    } finally { dispose() }
  })

  it('restores dsh-ui from ChatSnapshot when DSH shows a generic Code banner', async () => {
    const row = assistantRow('source-genui')
    const block = genericCodeBlock(VALID_SPEC)
    row.append(block)
    document.body.append(row)
    const chat = {
      nodes: {
        get: (key: string) => key === 'source-genui' ? {
          kind: 'assistant-step',
          data: { blocks: [{ kind: 'text', text: `\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`` }] },
        } : undefined,
      },
    }
    const sourceCtx = makeSourceCtx('source-session', () => chat, () => () => {})
    expect(sourceLanguageOf(sourceCtx, block)).toBe('dsh-ui')
    const dispose = installDomFenceRenderer(sourceCtx, () => {})
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
    } finally { dispose() }
  })

  it('parses each assistant Markdown source once after the opening language is stable', async () => {
    const row = assistantRow('cached-source')
    const block = genericCodeBlock(VALID_SPEC)
    row.append(block)
    document.body.append(row)
    let sourceReads = 0
    const data = Object.defineProperty({}, 'blocks', {
      get: () => {
        sourceReads += 1
        return [{ kind: 'text', text: `\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`` }]
      },
    })
    const chat = { nodes: { get: () => ({ kind: 'assistant-step', data }) } }
    const dispose = installDomFenceRenderer(makeSourceCtx('source-session', () => chat, () => () => {}), () => {})
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      await tick(1100)
      expect(sourceReads).toBe(1)
    } finally { dispose() }
  })

  it('does not mount catalog GenUI without ChatSnapshot (sandbox-first)', async () => {
    const row = assistantRow('no-snap')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const dispose = installDomFenceRenderer(makeModernCtx('no-snap-session'), () => {})
    try {
      await tick()
      // Explicit dsh-ui language still takes over the stock block (legacy notice or leftover catalog render).
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
    } finally { dispose() }
  })

  it('retries the ChatSnapshot subscription after an unavailable session binding recovers', async () => {
    let available = false
    let subscriptions = 0
    const ctx = {
      ...makeModernCtx('recovering-session'),
      get: (name: string) => name === 'uiConversation' ? {
        binding: () => {
          if (!available) throw new Error('session is inactive')
          return { target: () => ({
            getSnapshot: () => undefined,
            subscribe: () => {
              subscriptions += 1
              return () => {}
            },
          }) }
        },
      } : undefined,
    } as unknown as Context
    const dispose = installDomFenceRenderer(ctx, () => {})
    try {
      await tick(40)
      expect(subscriptions).toBe(0)
      available = true
      expect(await waitFor(() => subscriptions === 1, 1500)).toBe(true)
    } finally { dispose() }
  })

  it.each([
    ['json', '```json'],
    ['foobar', '```foobar'],
    ['no language', '```'],
  ])('does not treat source %s as GenUI when the DOM is generic', async (_description, openingFence) => {
    const row = assistantRow(`source-other-${_description}`)
    const block = genericCodeBlock(VALID_SPEC)
    row.append(block)
    document.body.append(row)
    const chat = {
      nodes: {
        get: () => ({
          kind: 'assistant-step',
          data: { blocks: [{ kind: 'text', text: `${openingFence}\n${VALID_SPEC}\n\`\`\`` }] },
        }),
      },
    }
    const dispose = installDomFenceRenderer(makeSourceCtx('source-session', () => chat, () => () => {}), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally { dispose() }
  })

  it('uses the ChatSnapshot subscription when the DOM appears before source data', async () => {
    const row = assistantRow('late-source', true)
    const partial = '{"items":[{"type":"text","content":"hel'
    const block = genericCodeBlock(partial)
    row.append(block)
    document.body.append(row)
    let chat: unknown = { nodes: { get: () => undefined } }
    let update: (() => void) | undefined
    const dispose = installDomFenceRenderer(makeSourceCtx('source-session', () => chat, listener => {
      update = listener
      return () => { update = undefined }
    }), () => {})
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      chat = {
        nodes: {
          get: () => ({ kind: 'assistant-step', data: { blocks: [{ kind: 'text', text: `\`\`\`dsh-ui\n${partial}` }] } }),
        },
      }
      update?.()
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(row.querySelector('.genui-dom-fence')).not.toBeNull()
      block.querySelector('code')!.textContent = VALID_SPEC
      chat = {
        nodes: {
          get: () => ({ kind: 'assistant-step', data: { blocks: [{ kind: 'text', text: `\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`` }] } }),
        },
      }
      update?.()
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally { dispose() }
  })

  it('resolves source data that arrives before its DOM CodeBlock', async () => {
    const row = assistantRow('source-first')
    const chat = {
      nodes: {
        get: () => ({ kind: 'assistant-step', data: { blocks: [{ kind: 'text', text: `\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`` }] } }),
      },
    }
    const dispose = installDomFenceRenderer(makeSourceCtx('source-session', () => chat, () => () => {}), () => {})
    try {
      const block = genericCodeBlock(VALID_SPEC)
      row.append(block)
      document.body.append(row)
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
    } finally { dispose() }
  })

  it('releases the old ChatSnapshot subscription when the viewed session changes', async () => {
    let sessionId = 'session-a'
    const subscriptions: string[] = []
    const releases: string[] = []
    let sessionUpdate: (() => void) | undefined
    const ctx = {
      sessions: {
        list: {
          getSnapshot: () => ({ ids: [sessionId], byId: { [sessionId]: { id: sessionId, retainedBy: { mainView: 1 } } } }),
          subscribe: (listener: () => void) => {
            sessionUpdate = listener
            return () => { sessionUpdate = undefined }
          },
        },
      },
      get: (name: string) => name === 'uiConversation' ? {
        binding: (id: string) => ({ target: () => ({
          getSnapshot: () => undefined,
          subscribe: () => {
            subscriptions.push(id)
            return () => { releases.push(id) }
          },
        }) }),
      } : undefined,
    } as unknown as Context
    const dispose = installDomFenceRenderer(ctx, () => {})
    try {
      expect(await waitFor(() => subscriptions.includes('session-a'))).toBe(true)
      sessionId = 'session-b'
      sessionUpdate?.()
      expect(await waitFor(() => subscriptions.includes('session-b'))).toBe(true)
      expect(releases).toContain('session-a')
    } finally { dispose() }
    expect(releases).toContain('session-b')
  })

  it('uses the row fence ordinal and ignores plugin-owned code surfaces', async () => {
    const row = assistantRow('source-ordinal')
    const first = stockCodeBlock('first', 'ts')
    const second = genericCodeBlock(VALID_SPEC)
    const third = genericCodeBlock('third')
    row.append(first, second, third)
    document.body.append(row)
    const chat = {
      nodes: {
        get: () => ({
          kind: 'assistant-step',
          data: { blocks: [{ kind: 'text', text: `\`\`\`ts\nfirst\n\`\`\`\n\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`\n\`\`\`json\nthird\n\`\`\`` }] },
        }),
      },
    }
    const sourceCtx = makeSourceCtx('source-session', () => chat, () => () => {})
    expect(sourceLanguageOf(sourceCtx, second)).toBe('dsh-ui')
    expect(sourceLanguageOf(sourceCtx, third)).toBe('json')
    const dispose = installDomFenceRenderer(sourceCtx, () => {})
    try {
      expect(await waitFor(() => second.hasAttribute('data-genui-rendered'))).toBe(true)
      expect(await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(first.hasAttribute('data-genui-rendered')).toBe(false)
      expect(third.hasAttribute('data-genui-rendered')).toBe(false)
    } finally { dispose() }
  })

  it('keeps one streaming GenUI mount as source text grows and settles', async () => {
    const row = assistantRow('stream-source', true)
    const partial = '{"items":[{"type":"text","content":"hel'
    const block = genericCodeBlock(partial)
    row.append(block)
    document.body.append(row)
    let blocks = [{ kind: 'text', text: `\`\`\`dsh-ui\n${partial}` }]
    let update: (() => void) | undefined
    const chat = { nodes: { get: () => ({ kind: 'assistant-step', data: { blocks } }) } }
    const dispose = installDomFenceRenderer(makeSourceCtx('source-session', () => chat, listener => {
      update = listener
      return () => { update = undefined }
    }), () => {})
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
      const mount = row.querySelector('.genui-dom-fence')
      expect(mount).not.toBeNull()
      block.querySelector('code')!.textContent = VALID_SPEC
      blocks = [{ kind: 'text', text: `\`\`\`dsh-ui\n${VALID_SPEC}\n\`\`\`` }]
      update?.()
      expect(await waitFor(() => mount?.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      row.removeAttribute('data-streaming')
      update?.()
      expect(await waitFor(() => row.querySelector('.genui-dom-fence') === mount)).toBe(true)
    } finally { dispose() }
  })

  it('previews only explicitly labelled settled SVG and restores it on dispose', async () => {
    const raw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="50" height="20"/></svg>'
    const row = assistantRow('svg-row', true)
    const block = stockCodeBlock(raw, 'svg')
    const other = stockCodeBlock(raw, 'xml')
    row.append(block, other)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('svg-session', send), send)
    try {
      await tick()
      expect(block.style.display).not.toBe('none')
      expect(row.querySelector('[data-genui-svg-fence]')).toBeNull()
      row.removeAttribute('data-streaming')
      expect(await waitFor(() => row.querySelector('[data-genui-svg-fence] img') !== null)).toBe(true)
      expect(other.style.display).not.toBe('none')
      const source = [...row.querySelectorAll('button')].find(button => button.textContent === '源码')!
      fireEvent.click(source)
      await tick(100)
      expect(row.querySelectorAll('[data-genui-svg-fence]')).toHaveLength(1)
      expect(row.querySelector('[data-genui-svg-fence] pre')?.textContent).toContain(raw)
      expect(send).not.toHaveBeenCalled()
    } finally { dispose() }
    expect(block.style.display).not.toBe('none')
    expect(row.querySelector('[data-genui-svg-fence]')).toBeNull()
  })

  it('declares its cordis service injects (boot sweep depends on it)', () => {
    // 回归钉：曾丢失 inject 导出 → 宿主 fiber inject waiting 失效 →
    // apply 早于 slots 服务运行 → 整页 "Failed to load plugins"。
    // inputTriggers 刻意不在硬注入列表里：cordis `inject` 是硬激活门控，
    // 原版 DSH 壳不提供该服务 → fiber 永久 waiting、apply 永不执行 →
    // 全部 dsh-ui 围栏静默保持代码块。apply() 体内已用 ctx.get() 可选降级。
    expect([...inject].sort()).toEqual(['configForms', 'locale', 'sessions', 'slots'])
  })

  it('accepts surrounding whitespace in a language label', async () => {
    const block = stockCodeBlock(VALID_SPEC, '  dsh-ui\n')
    document.body.appendChild(block)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      expect(await waitFor(() => block.hasAttribute('data-genui-rendered'))).toBe(true)
    } finally { dispose() }
  })

  it('diagnoses each rejected known surface once without hiding its prose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocks = [0, 1].map(() => {
      const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
      const prose = document.createElement('p')
      prose.textContent = 'Keep this answer visible'
      block.appendChild(prose)
      document.body.appendChild(block)
      return block
    })
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick(100)
      blocks[0]!.setAttribute('data-update', '1')
      await tick(100)
      const diagnostics = warn.mock.calls.filter(args => String(args[0]).includes('pre=1'))
      expect(diagnostics).toHaveLength(2)
      expect(diagnostics.every(args => String(args[0]).includes('p'))).toBe(true)
      for (const block of blocks) {
        expect(block.style.display).not.toBe('none')
        expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      }
    } finally { dispose() }
  })

  it('renders a settled dsh-ui fence into its own root and hides the stock block', async () => {
    const row = assistantRow('s7')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('ignores non-dsh-ui code blocks', async () => {
    const row = assistantRow('s8')
    const ts = stockCodeBlock('const x = 1', 'ts')
    const plain = stockCodeBlock('hello', '')
    row.appendChild(ts)
    row.appendChild(plain)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(ts.hasAttribute('data-genui-rendered')).toBe(false)
      expect(plain.hasAttribute('data-genui-rendered')).toBe(false)
      expect(ts.style.display).toBe('')
    } finally {
      dispose()
    }
  })


  it('shows a skeleton while the spec is still arriving, then swaps in the real tree', async () => {
    const row = assistantRow('s9b', true)
    const block = stockCodeBlock('{"items":[{"type":"text","content":', 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      // v3: half-written JSON is replaced by the skeleton, not left on screen.
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const skeleton = row.querySelector('.genui-dom-fence [class*="skeleton"]')
      expect(skeleton).not.toBeNull()
      expect(skeleton!.getAttribute('role')).toBe('status')
      // The component closes: the skeleton is replaced by the real tree.
      block.querySelector('code')!.textContent = '{"items":[{"type":"text","content":"你好，世界"}]}'
      await waitFor(() => row.querySelector('.genui-dom-fence')?.textContent?.includes('目录组件卡已移除') === true)
      expect(row.querySelector('.genui-dom-fence [class*="skeleton"]')).toBeNull()
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('restores the raw code block when a skeleton body never parses at settle', async () => {
    const row = assistantRow('s9b2', true)
    const block = stockCodeBlock('{"items":[{"type":"text","content":', 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence [class*="skeleton"]')).not.toBeNull()
      // The reply settles with the body still broken: the skeleton must give
      // the raw block back rather than hiding it forever.
      row.removeAttribute('data-streaming')
      await tick()
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
    } finally {
      dispose()
    }
  })

  it('never skeletons a streaming JSON fence that is not a GenUI spec', async () => {
    const row = assistantRow('s9b3', true)
    const block = stockCodeBlock('{"name":"配置","value":[1,2,', '')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
    } finally {
      dispose()
    }
  })


  it('does not infer a language from a streaming body when source data is unavailable', async () => {
    const row = assistantRow('s9e', true)
    const block = stockCodeBlock('{"items":[{"type":"text","content":"目录组件卡已移除"}]', '')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      const label = block.querySelector('div')
      label!.textContent = 'json'
      row.removeAttribute('data-streaming')
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('re-applies the surgery when a host re-render wipes the container', async () => {
    const row = assistantRow('s9d', true)
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      const container = row.querySelector<HTMLElement>('.genui-dom-fence')
      expect(container).not.toBeNull()
      // Simulate a host React re-render dropping the foreign node and
      // resetting the hide during streaming.
      container!.remove()
      block.style.display = ''
      await tick()
      expect(container!.isConnected).toBe(true)
      expect(container!.previousElementSibling).toBe(block)
      expect(block.style.display).toBe('none')
    } finally {
      dispose()
    }
  })

  it('keeps the stock block visible for an unrepairable body', async () => {
    const row = assistantRow('s10')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('shows a visible diagnostic for a settled unrepairable body (issue #158)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s10-diag')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-diag', send), send)
    try {
      await tick()
      const alert = row.querySelector('.genui-dom-fence-diagnostic [role="alert"]')
      expect(alert).not.toBeNull()
      expect(alert!.textContent).toContain('dsh-ui')
      // The raw body stays visible: the diagnostic explains, it never replaces.
      expect(block.style.display).toBe('')
      expect(block.textContent).toContain('content')
      // The strip is mounted BEFORE the code block, and repeated sweeps do not
      // duplicate it.
      expect(row.querySelector('.genui-dom-fence-diagnostic')!.nextElementSibling).toBe(block)
      await tick(60)
      expect(row.querySelectorAll('.genui-dom-fence-diagnostic')).toHaveLength(1)
    } finally {
      dispose()
    }
  })


  it('keeps the diagnostic off a streaming body (partial JSON is not an error)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s10-stream', true)
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-stream', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence-diagnostic')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('clears the diagnostic once the body becomes renderable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s10-fixed')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-fixed', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence-diagnostic')).not.toBeNull()
      // The host re-renders the settled message with a repaired body → legacy tip.
      block.querySelector('code')!.textContent = VALID_SPEC
      const mounted = await waitFor(() => row.querySelector('[data-iui-legacy-catalog]') !== null)
      expect(mounted).toBe(true)
      expect(row.querySelector('.genui-dom-fence-diagnostic')).toBeNull()
      expect(block.style.display).toBe('none')
    } finally {
      dispose()
    }
  })

  it('rebuilds the diagnostic when a host re-render wipes its container', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s10-wiped')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-wiped', send), send)
    try {
      await tick()
      const container = row.querySelector('.genui-dom-fence-diagnostic')!
      container.textContent = ''
      // A mutation in the row drives the pre-paint repair pass.
      row.setAttribute('data-probe', '1')
      const restored = await waitFor(() => row.querySelector('.genui-dom-fence-diagnostic [role="alert"]') !== null)
      expect(restored).toBe(true)
      expect(row.querySelectorAll('.genui-dom-fence-diagnostic')).toHaveLength(1)
    } finally {
      dispose()
    }
  })


  it('relays component actions through the injected sender', async () => {
    // P1-N2: catalog button card blocked — tip only, no action relay.
    const row = assistantRow('s11')
    const block = stockCodeBlock(BUTTON_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
      expect(row.querySelector('.genui-dom-fence button')).toBeNull()
      expect(send).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  })

  it('relays component actions when the host omits list.current', async () => {
    const row = assistantRow('s11-modern')
    const block = stockCodeBlock(BUTTON_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeModernCtx('sess-modern'), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
      expect(send).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  })

  it('publishes a panel:true fence to the panel store without mounting UI', async () => {
    // P1-N2: panel catalog path blocked — legacy tip, panel store untouched.
    const row = assistantRow('s12')
    const block = stockCodeBlock(PANEL_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('目录组件卡已移除')
      expect(getPanelSpec('sess-1')).toBeFalsy()
    } finally {
      dispose()
    }
  })

  it('publishes a panel:true fence when the host omits list.current', async () => {
    const row = assistantRow('s12-modern')
    const block = stockCodeBlock(PANEL_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeModernCtx('sess-modern-panel'), send)
    try {
      await tick()
      expect(row.querySelector('[data-iui-legacy-catalog]')?.textContent).toContain('目录组件卡已移除')
      expect(getPanelSpec('sess-modern-panel')).toBeFalsy()
    } finally {
      dispose()
      clearSessionPanel('sess-modern-panel')
    }
  })

  it('warns once when an action has no resolvable session', async () => {
    // Catalog actions removed with GenuiBlock — tip mounts, nothing to click/warn.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s12-missing')
    const block = stockCodeBlock(BUTTON_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx(undefined, send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
      expect(row.querySelector('.genui-dom-fence button')).toBeNull()
      expect(send).not.toHaveBeenCalled()
      expect(warn.mock.calls.filter(([message]) => String(message).includes('cannot resolve the viewed session'))).toHaveLength(0)
    } finally {
      dispose()
    }
  })

  it('unmounts and restores the stock block when the row leaves the DOM', async () => {
    const row = assistantRow('s13')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      row.remove()
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(block.isConnected).toBe(false)
    } finally {
      dispose()
    }
  })

  it('skips fences without a current session (renders with no persistence)', async () => {
    const row = assistantRow('s14')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx(undefined, send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })
})

describe('anchor-less rows (Safari fallback render path)', () => {
  // 回归钉 #1: Safari 宿主渲染消息行时省略 data-chat-anchor-key（该属性是
  // React key 派生值，key 为 undefined 时 React 直接不渲染属性）→ rowOf 落空
  // → DOM 通道静默放弃所有围栏。降级链必须兜住：flow 行属性 → 代码块自身。
  it('renders a settled dsh-ui fence when the row lacks data-chat-anchor-key', async () => {
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', 'assistant-step')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-safari-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('renders a fence with no owning row at all (block directly in the body)', async () => {
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    document.body.appendChild(block)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-safari-2', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      expect(document.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('assigns distinct fallback identities to sibling fences in an anchor-less row', async () => {
    // P1-N2: panels blocked — both fences mount distinct legacy tips (two containers).
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', 'assistant-step')
    const first = stockCodeBlock('{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]}', 'dsh-ui')
    const second = stockCodeBlock('{"panel":true,"title":"面板B","items":[{"type":"text","content":"B"}]}', 'dsh-ui')
    row.appendChild(first)
    row.appendChild(second)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-safari-3', send), send)
    try {
      expect(await waitFor(() => row.querySelectorAll('.genui-dom-fence').length === 2)).toBe(true)
      await tick(200)
      const fences = [...row.querySelectorAll('.genui-dom-fence')]
      expect(fences).toHaveLength(2)
      // Catalog tip may be empty briefly under MutationObserver; identity + no panel fold is the contract.
      expect(first.hasAttribute('data-genui-rendered')).toBe(true)
      expect(second.hasAttribute('data-genui-rendered')).toBe(true)
      expect(getPanelSpec('sess-safari-3')).toBeFalsy()
    } finally {
      dispose()
    }
  })

  it('assigns distinct fallback identities to fences in separate anchor-less rows', async () => {
    const firstRow = document.createElement('div')
    firstRow.setAttribute('data-chat-flow-kind', 'assistant-step')
    firstRow.appendChild(stockCodeBlock('{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]}', 'dsh-ui'))
    const secondRow = document.createElement('div')
    secondRow.setAttribute('data-chat-flow-kind', 'assistant-step')
    secondRow.appendChild(stockCodeBlock('{"panel":true,"title":"面板B","items":[{"type":"text","content":"B"}]}', 'dsh-ui'))
    document.body.append(firstRow, secondRow)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-safari-6', send), send)
    try {
      expect(await waitFor(() => document.querySelectorAll('.genui-dom-fence').length === 2)).toBe(true)
      await tick(200)
      expect(document.querySelectorAll('.genui-dom-fence')).toHaveLength(2)
      expect(getPanelSpec('sess-safari-6')).toBeFalsy()
    } finally {
      dispose()
    }
  })


})

describe('persisted replay barrier across page refresh (issue #4)', () => {
  // 回归钉 #4: 宿主 anchor key 是 `<kindlen>:<kind><id>`，assistant step 的
  // id 是 `<turn>:<step>`（如 `14:assistant-step3:0`）。旧实现取 key 里第一个
  // 数字 = kind 长度常量 → 所有消息的 order[0] 相同 → 刷新后 replayBarrier
  // (= 持久化 maxSeenSeq = 该常量) 拒绝一切新 panel 围栏，dock 冻结且零日志。
  // 修复：order[0] 改为 turn*1000+step（随消息顺序严格单调），刷新后新消息
  // 的 turn 必然大于持久化屏障 → 正常更新。
  const PANEL = (title: string, content: string) =>
    `{"panel":true,"title":"${title}","items":[{"type":"text","content":"${content}"}]}`

  it('lets a new-turn panel fence update the dock after a refresh', async () => {
    // P1-N2: panel dock path removed — fences mount as legacy tips across refresh.
    const send = vi.fn()
    const row2 = assistantRow('14:assistant-step2:0')
    const blockA = stockCodeBlock(PANEL('面板A', 'A'), 'dsh-ui')
    row2.appendChild(blockA)
    document.body.appendChild(row2)
    const row3 = assistantRow('14:assistant-step3:0')
    const blockB = stockCodeBlock(PANEL('面板B', 'B'), 'dsh-ui')
    row3.appendChild(blockB)
    document.body.appendChild(row3)
    let dispose = installDomFenceRenderer(makeCtx('sess-refresh', send), send)
    try {
      await tick()
      expect([...document.querySelectorAll('.genui-dom-fence')].filter(f => f.textContent?.includes('目录组件卡已移除')).length).toBeGreaterThanOrEqual(2)
      expect(getPanelSpec('sess-refresh')).toBeFalsy()

      dispose()
      clearSessionPanel('sess-refresh')
      document.body.innerHTML = ''
      dispose = installDomFenceRenderer(makeCtx('sess-refresh', send), send)
      await tick()

      document.body.appendChild(row2)
      document.body.appendChild(row3)
      await tick()
      expect([...document.querySelectorAll('.genui-dom-fence')].filter(f => f.textContent?.includes('目录组件卡已移除')).length).toBeGreaterThanOrEqual(2)
      expect(getPanelSpec('sess-refresh')).toBeFalsy()

      const row4 = assistantRow('14:assistant-step4:0')
      const blockC = stockCodeBlock(PANEL('面板C', 'C'), 'dsh-ui')
      row4.appendChild(blockC)
      document.body.appendChild(row4)
      await tick()
      expect([...document.querySelectorAll('.genui-dom-fence')].filter(f => f.textContent?.includes('目录组件卡已移除')).length).toBeGreaterThanOrEqual(3)
      expect(getPanelSpec('sess-refresh')).toBeFalsy()
    } finally {
      dispose()
    }
  })

  it('keeps per-step monotonicity within one turn (later step wins)', async () => {
    // Panel fold removed — both steps mount independent legacy tips.
    const send = vi.fn()
    const rowA = assistantRow('14:assistant-step5:0')
    const blockA = stockCodeBlock(PANEL('面板甲', '甲'), 'dsh-ui')
    rowA.appendChild(blockA)
    document.body.appendChild(rowA)
    const rowB = assistantRow('14:assistant-step5:1')
    const blockB = stockCodeBlock(PANEL('面板乙', '乙'), 'dsh-ui')
    rowB.appendChild(blockB)
    document.body.appendChild(rowB)
    const dispose = installDomFenceRenderer(makeCtx('sess-refresh-step', send), send)
    try {
      await tick()
      expect([...document.querySelectorAll('.genui-dom-fence')].filter(f => f.textContent?.includes('目录组件卡已移除'))).toHaveLength(2)
      expect(getPanelSpec('sess-refresh-step')).toBeFalsy()
    } finally {
      dispose()
    }
  })
})

describe('multi-surface discovery across host DOM shapes (issue #6)', () => {
  // 回归钉 #6: 宿主 DOM 的围栏表面并非只有 `.md-code-block`——deepsuite 风格
  // 渲染栈输出 `.code-block` / `.code-block-small`，语言标签是 span 而非 div，
  // 正文还可能被 content div 包裹。旧实现（单一选择器 + 只认 div 标签）在
  // 这类宿主上完全找不到围栏 → 静默保持代码块、控制台零报错。新实现按
  // label+pre 结构兜底识别，任何表面形态都能渲染。

  it('takes over a deepsuite-style .code-block surface (span label, wrapped body)', async () => {
    const row = assistantRow('s20')
    const block = deepsuiteCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-6-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('takes over a .code-block-small surface', async () => {
    const row = assistantRow('s21')
    const block = deepsuiteCodeBlock(VALID_SPEC, 'dsh-ui', 'code-block-small')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-6-2', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('structural backstop: an unlisted surface class renders via label+pre, warning once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s22')
    const block = deepsuiteCodeBlock(VALID_SPEC, 'dsh-ui', 'host-fence-v9')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-6-3', send), send)
    try {
      await tick()
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
      // 漂移诊断恰好一条（跨多轮 sweep 不刷屏），且不再有「找不到围栏」式静默。
      const calls = warn.mock.calls.filter(([m]) => String(m).includes('围栏表面类名未被已知选择器命中'))
      expect(calls).toHaveLength(1)
    } finally {
      dispose()
      warn.mockRestore()
    }
  })


  it('only the outermost element of a nested modifier surface is taken over', async () => {
    // 宿主把 `code-block-small` 作为 `code-block` 的修饰子元素时，围栏只能
    // 接管一次（外层），不得把内外两层当两个围栏重复渲染。
    const row = assistantRow('s24')
    const outer = deepsuiteCodeBlock(VALID_SPEC, 'dsh-ui', 'code-block')
    const inner = document.createElement('div')
    inner.className = 'code-block-small'
    inner.textContent = 'modifier'
    outer.appendChild(inner)
    row.appendChild(outer)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-6-5', send), send)
    try {
      await tick()
      expect(outer.hasAttribute('data-genui-rendered')).toBe(true)
      expect(inner.hasAttribute('data-genui-rendered')).toBe(false)
      expect(outer.style.display).toBe('none')
      // 只挂了一个 genui 容器：内外层没有被当成两个围栏。
      expect(row.querySelectorAll('.genui-dom-fence')).toHaveLength(1)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('目录组件卡已移除')
    } finally {
      dispose()
    }
  })

  it('renders both fences when two .code-block surfaces sit side by side in one row', async () => {
    // 两个独立 deepsuite 围栏在同一行：各自挂 legacy tip，身份不折叠。
    const row = assistantRow('s25')
    const first = deepsuiteCodeBlock('{"panel":true,"title":"面板甲","items":[{"type":"text","content":"甲"}]}', 'dsh-ui')
    const second = deepsuiteCodeBlock('{"panel":true,"title":"面板乙","items":[{"type":"text","content":"乙"}]}', 'dsh-ui')
    row.appendChild(first)
    row.appendChild(second)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-6-6', send), send)
    try {
      await tick()
      expect(first.hasAttribute('data-genui-rendered')).toBe(true)
      expect(second.hasAttribute('data-genui-rendered')).toBe(true)
      expect([...row.querySelectorAll('.genui-dom-fence')].every(f => f.textContent?.includes('目录组件卡已移除'))).toBe(true)
      expect(getPanelSpec('sess-6-6')).toBeFalsy()
    } finally {
      dispose()
    }
  })

})

describe('shared markdown root with mixed code blocks (issue #13)', () => {
  // 回归钉 #13: 同一消息容器里 dsh-ui 围栏和 python/ts/bash 等普通代码块
  // 共存时，结构兜底从普通代码块的 <pre> 向上回溯，越过它自己的
  // .md-code-block 把共享的 .markdown 根容器误判为「dsh-ui 围栏」→ 整条消息
  // display:none，python 代码块被吞掉。兜底必须跳过已知表面的 <pre>，且
  // 标签判定不得认领嵌套代码块的 banner。

  /** Shared markdown root: the host renders one `.markdown` wrapper around
   * every code block of a message. */
  function markdownRoot(): HTMLElement {
    const root = document.createElement('div')
    root.className = 'markdown'
    return root
  }

  it('renders the dsh-ui fence and keeps a sibling python block untouched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s30')
    const root = markdownRoot()
    const genui = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    const python = stockCodeBlock('@dataclass\nclass LineSegment:\n    points: list', 'python')
    root.appendChild(genui)
    root.appendChild(python)
    row.appendChild(root)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-13-1', send), send)
    try {
      await tick()
      await tick()
      // dsh-ui 围栏正常接管；python 块与共享根容器都不许被隐藏或接管。
      expect(genui.hasAttribute('data-genui-rendered')).toBe(true)
      expect(genui.style.display).toBe('none')
      expect(python.hasAttribute('data-genui-rendered')).toBe(false)
      expect(python.style.display).toBe('')
      expect(python.textContent).toContain('LineSegment')
      expect(root.style.display).toBe('')
      // 恰好一个 genui 容器，且挂在 dsh-ui 块之后，而不是整条消息之后。
      expect(row.querySelectorAll('.genui-dom-fence')).toHaveLength(1)
      expect(root.querySelectorAll('.genui-dom-fence')).toHaveLength(1)
      const container = row.querySelector('.genui-dom-fence')
      expect(container?.previousElementSibling).toBe(genui)
      expect(container!.textContent).toContain('目录组件卡已移除')
      // 不该出现「未知表面类名」漂移告警：两个表面都是已知选择器命中的。
      const drift = warn.mock.calls.filter(([m]) => String(m).includes('围栏表面类名未被已知选择器命中'))
      expect(drift).toHaveLength(0)
    } finally {
      dispose()
      warn.mockRestore()
    }
  })

  it('renders the dsh-ui fence when the shared root contains TWO dsh-ui blocks', async () => {
    const row = assistantRow('s31')
    const root = markdownRoot()
    const first = stockCodeBlock(PANEL_SPEC, 'dsh-ui')
    const second = stockCodeBlock('{"panel":true,"title":"面板B","items":[{"type":"text","content":"B"}]}', 'dsh-ui')
    root.appendChild(first)
    root.appendChild(second)
    row.appendChild(root)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-13-2', send), send)
    try {
      await tick()
      expect(first.hasAttribute('data-genui-rendered')).toBe(true)
      expect(second.hasAttribute('data-genui-rendered')).toBe(true)
      expect(root.style.display).toBe('')
      expect(root.querySelectorAll('.genui-dom-fence')).toHaveLength(2)
      expect([...root.querySelectorAll('.genui-dom-fence')].every(f => f.textContent?.includes('目录组件卡已移除'))).toBe(true)
      expect(getPanelSpec('sess-13-2')).toBeFalsy()
    } finally {
      dispose()
    }
  })

  it('keeps the structural backstop working for an unknown surface beside a known python block', async () => {
    // 加固不能把结构兜底一并误杀：未知类名表面的 <pre> 没有已知祖先，仍要
    // 通过 label+pre 兜底被发现；旁边已知类名的 python 块继续被忽略。
    const row = assistantRow('s32')
    const root = markdownRoot()
    const unknown = deepsuiteCodeBlock(VALID_SPEC, 'dsh-ui', 'host-fence-v99')
    const python = stockCodeBlock('print("hello")', 'python')
    root.appendChild(unknown)
    root.appendChild(python)
    row.appendChild(root)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-13-3', send), send)
    try {
      await tick()
      expect(unknown.hasAttribute('data-genui-rendered')).toBe(true)
      expect(unknown.style.display).toBe('none')
      expect(python.hasAttribute('data-genui-rendered')).toBe(false)
      expect(python.style.display).toBe('')
      expect(root.style.display).toBe('')
      expect(root.querySelectorAll('.genui-dom-fence')).toHaveLength(1)
    } finally {
      dispose()
    }
  })
})

describe('final-answer blank-out hardening (issue #19)', () => {
  // 回归钉 #19: 含 dsh-ui 围栏的最终回答偶发整条不显示（Timeline 正常、刷新
  // 恢复）。DOM 通道的两处失败模式都会造成「原始块被隐藏 + 替代组件缺失」：
  // ① 先 display:none 后挂载，挂载失败时原始围栏已被隐藏；
  // ② 结构兜底把「标签 dsh-ui + 含 <pre>」的消息级容器当成围栏表面，整条
  // 消息（含正文段落）被 display:none。修复：先挂载成功再隐藏、失败保留原
  // 始代码块；候选表面必须是「banner + 单一代码体」，消息容器直接跳过并告警。

  it('refuses to take over a message-level container that labels dsh-ui (prose stays visible)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const row = assistantRow('s40')
    // A host render shape where the banner label, prose and the fence body
    // share one message-level container: hiding it would blank the answer.
    const root = document.createElement('div')
    root.className = 'host-message-body'
    const label = document.createElement('div')
    label.textContent = 'dsh-ui'
    const prose = document.createElement('p')
    prose.textContent = '这段正文必须在任何情况下可见'
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = VALID_SPEC
    pre.appendChild(code)
    root.append(label, prose, pre)
    row.appendChild(root)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-19-1', send), send)
    try {
      await tick()
      await tick()
      // The message container is never hidden or taken over; the prose and
      // the raw fence stay visible instead of the whole answer going blank.
      expect(root.style.display).toBe('')
      expect(root.hasAttribute('data-genui-rendered')).toBe(false)
      expect(prose.isConnected).toBe(true)
      expect(pre.isConnected).toBe(true)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      // 恰好一条 issue #19 防御诊断，跨 sweep 不刷屏。
      const calls = warn.mock.calls.filter(([m]) => String(m).includes('疑似消息容器'))
      expect(calls).toHaveLength(1)
    } finally {
      dispose()
      warn.mockRestore()
    }
  })

  it('refuses a surface-class element that is actually a message container', async () => {
    const row = assistantRow('s41')
    const root = document.createElement('div')
    root.className = 'md-code-block'
    const label = document.createElement('div')
    label.textContent = 'dsh-ui'
    const prose = document.createElement('p')
    prose.textContent = '正文'
    const pre = document.createElement('pre')
    pre.textContent = VALID_SPEC
    root.append(label, prose, pre)
    row.appendChild(root)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-19-2', send), send)
    try {
      await tick()
      expect(root.hasAttribute('data-genui-rendered')).toBe(false)
      expect(root.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('preserves input and pending actions when the host wipes a streaming container', async () => {
    // P1-N2: catalog form/button blocked — tip remounts after host wipe.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const row = assistantRow('s42', true)
    const block = stockCodeBlock(JSON.stringify({ items: [
      { type: 'input', id: 'name', label: '姓名' },
      { type: 'button', label: '确认', action: 'confirm' },
    ] }), 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-19-3', send), send)
    try {
      await tick()
      const container = row.querySelector<HTMLElement>('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('目录组件卡已移除')
      container!.replaceChildren()
      await tick()
      expect(block.style.display).toBe('none')
      expect(row.querySelector('.genui-dom-fence')).toBe(container)
      expect(await waitFor(() => container!.textContent?.includes('目录组件卡已移除') === true)).toBe(true)
      expect(send).not.toHaveBeenCalled()
    } finally {
      dispose()
      err.mockRestore()
    }
  })

  it('removes the orphaned replacement container when the host replaces the stock block', async () => {
    const row = assistantRow('s43')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-19-4', send), send)
    try {
      await tick()
      expect(row.querySelector('.genui-dom-fence')).not.toBeNull()
      // The host swaps the message node out from under us but our foreign
      // container survives as an orphan: it must be removed immediately.
      block.remove()
      await tick()
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('keeps the stock block visible when the React root fails to mount (issue #19)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setDomRootFactory(() => {
      throw new Error('synthetic root failure')
    })
    const row = assistantRow('s44')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-19-5', send), send)
    try {
      await tick()
      // Mount-then-hide: the takeover failed BEFORE the block was hidden, so
      // the final answer keeps its raw code block instead of going blank.
      expect(block.style.display).toBe('')
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
      const calls = warn.mock.calls.filter(([m]) => String(m).includes('keeping the stock code block'))
      expect(calls).toHaveLength(1)
    } finally {
      dispose()
      setDomRootFactory(createRoot)
      warn.mockRestore()
    }
  })
})
