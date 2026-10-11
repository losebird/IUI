/**
 * Client-side Markdown-as-UI rescue: when a settled assistant row has no
 * ```iui-html fence but looks like a must_fence Markdown dashboard, mount the
 * intent sandbox recipe as an iui-html frame so the user still sees Interactive UI.
 *
 * Does not rewrite the model transcript — appends a rescue mount under the
 * message. Gated by runtime formatReferee (Settings → IUI).
 */
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import { GenuiActionContext, type GenuiActionHandler } from './action-context.ts'
import { renderHtmlFence } from './html-fence.tsx'
import { classifyIntentAsk, type IntentRule } from '../config/referee-rules.ts'
import { safeRegExpTest } from '../shared/safe-regexp.ts'
import { getRuntimeConfigSnapshot, subscribeRuntimeConfig } from './runtime-config.ts'
import { pushTipToast } from './tip-toast.tsx'

const MARKER = 'data-iui-md-rescue'
const CONTAINER = 'iui-md-rescue'
const SWEEP_MS = 1200
const FENCE_OPEN = /```[ \t]*(?:iui-html|iui|dsh-ui)\b/iu

function matchAsk(ask: string): IntentRule | null {
  // Same classifier as the format referee: named intents + visual fallback.
  // Whitelist patterns alone must never be the fence gate.
  return classifyIntentAsk(ask)
}

function looksLikeMarkdownUi(text: string, rule: IntentRule): boolean {
  if (FENCE_OPEN.test(text)) return false
  return rule.markdownFailPatterns.some((src) => safeRegExpTest(src, 'imu', text))
}

/** Apology / tool-fail prose that should have been a fence for must_fence asks. */
const APOLOGY_FAIL = [
  /搜索(?:功能)?不可用/u,
  /无法(?:为你)?(?:获取|打开|生成|提供).{0,24}(?:地图|界面|看板|表单|卡片)/u,
  /很抱歉[，,].{0,40}(?:无法|不能)/u,
  /I(?:'m| am) sorry.{0,60}(?:unable|can't|cannot)/iu,
  /请(?:直接)?(?:点击|打开|访问).{0,40}(?:高德|百度|链接)/u,
  /暂时无法/u,
]

function looksLikeApologyInsteadOfUi(text: string): boolean {
  if (FENCE_OPEN.test(text)) return false
  if (text.trim().length < 12) return false
  return APOLOGY_FAIL.some((re) => re.test(text))
}

function latestUserAskNear(row: Element): string {
  let el: Element | null = row.previousElementSibling
  for (let i = 0; i < 16 && el; i++, el = el.previousElementSibling) {
    const role = el.getAttribute?.('data-role') ?? el.getAttribute?.('data-message-role')
    if (role === 'user' || el.classList?.contains('user-message')) {
      return (el.textContent ?? '').trim().slice(0, 800)
    }
    if (el.querySelector?.('[data-role="user"], [data-message-role="user"], .user-message')) {
      return (el.textContent ?? '').trim().slice(0, 800)
    }
  }
  const users = document.querySelectorAll('[data-role="user"], [data-message-role="user"], .user-message')
  let best = ''
  for (const u of Array.from(users)) {
    if (row.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_PRECEDING) {
      best = (u.textContent ?? '').trim().slice(0, 800)
    }
  }
  return best
}

function rowText(row: Element): string {
  const clone = row.cloneNode(true) as Element
  clone.querySelectorAll(`[${MARKER}], .${CONTAINER}, .genui-dom-fence, [data-genui-rendered]`).forEach((n) => n.remove())
  return (clone.textContent ?? '').trim()
}

function hasIuiFenceInRow(row: Element): boolean {
  if (row.querySelector('.genui-dom-fence, [data-genui-rendered="true"], .genui-block')) return true
  return FENCE_OPEN.test(rowText(row))
}

function isStreaming(row: Element): boolean {
  return row.closest('[data-streaming]') !== null || row.querySelector('[data-streaming]') !== null
}

function assistantRows(root: ParentNode): Element[] {
  const out: Element[] = []
  const candidates = root.querySelectorAll(
    '[data-role="assistant"], [data-message-role="assistant"], .assistant-message, [data-chat-anchor-key]',
  )
  for (const el of Array.from(candidates)) {
    if (el.querySelector('[data-role="assistant"], [data-message-role="assistant"]')) continue
    out.push(el)
  }
  return out
}

interface Mount {
  root: Root
  container: HTMLElement
}

export function installMarkdownRescue(ctx: Context): () => void {
  const mounts = new Map<Element, Mount>()
  let enabled = getRuntimeConfigSnapshot().formatReferee !== false

  const unsubCfg = subscribeRuntimeConfig(() => {
    enabled = getRuntimeConfigSnapshot().formatReferee !== false
    if (!enabled) clearAll()
  })

  const clearAll = (): void => {
    for (const [row, m] of mounts) {
      m.root.unmount()
      m.container.remove()
      row.removeAttribute(MARKER)
      mounts.delete(row)
    }
  }

  const actionHandler: GenuiActionHandler = (action, payload) => {
    ctx.logger?.info?.(`iui md-rescue action=${action} keys=${Object.keys(payload).join(',')}`)
  }

  const rescueRow = (row: Element): void => {
    if (!enabled) return
    if (isStreaming(row)) return
    if (hasIuiFenceInRow(row)) {
      const existing = mounts.get(row)
      if (existing) {
        existing.root.unmount()
        existing.container.remove()
        mounts.delete(row)
        row.removeAttribute(MARKER)
      }
      return
    }
    if (row.getAttribute(MARKER) === 'done' && mounts.has(row)) return

    const ask = latestUserAskNear(row)
    const rule = ask ? matchAsk(ask) : null
    if (rule === null) return
    const body = rowText(row)
    if (body.length < 8) return
    const needsRescue = looksLikeMarkdownUi(body, rule) || (
      rule.mode === 'must_fence' && looksLikeApologyInsteadOfUi(body)
    )
    if (!needsRescue) return

    let mount = mounts.get(row)
    if (mount === undefined) {
      const container = document.createElement('div')
      container.className = CONTAINER
      container.setAttribute(MARKER, 'mount')
      container.style.cssText =
        'margin:12px 0 4px;padding:14px 16px;border:1px solid hsl(240 5.9% 90%);' +
        'border-radius:10px;background:hsl(0 0% 100%);' +
        'box-shadow:0 1px 2px hsl(240 5.9% 10% / 0.04);'
      const note = document.createElement('div')
      note.textContent = 'IUI 自动补救 · 检测到应出围栏却写成文字/道歉，已用交互界面重绘（原文保留在上方）'
      note.style.cssText =
        'font-size:12px;color:hsl(240 3.8% 46.1%);margin-bottom:12px;font-weight:500;' +
        'letter-spacing:-0.01em;'
      container.appendChild(note)
      const host = document.createElement('div')
      container.appendChild(host)
      row.appendChild(container)
      const root = createRoot(host)
      mounts.set(row, { root, container })
      mount = { root, container }
      row.setAttribute(MARKER, 'done')
      pushTipToast({
        title: 'IUI 已自动补救',
        description: `用交互界面重绘了「${rule.label ?? rule.id}」看板（原文保留在上方）。`,
        durationMs: 4500,
      })
    }

    const node = renderHtmlFence(rule.recipe, `rescue:${rule.id}`)
    if (node === null) return
    mount.root.render(
      <GenuiActionContext.Provider value={actionHandler}>{node}</GenuiActionContext.Provider>,
    )
  }

  const sweep = (): void => {
    if (!enabled || typeof document === 'undefined') return
    for (const row of assistantRows(document)) {
      try {
        rescueRow(row)
      } catch (err) {
        ctx.logger?.warn?.(
          `iui md-rescue failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  const observer = new MutationObserver(() => {
    queueMicrotask(sweep)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  const timer = window.setInterval(sweep, SWEEP_MS)
  queueMicrotask(sweep)

  return () => {
    observer.disconnect()
    window.clearInterval(timer)
    unsubCfg()
    clearAll()
  }
}
