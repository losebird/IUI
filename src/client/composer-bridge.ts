/**
 * Cross-surface composer draft insert: Settings templates and the panel
 * "try it" button share one setter. Last registered active session wins.
 * Fallback chain: registered draft API → DOM composer probe → clipboard.
 */

export type ComposerInsertResult = 'inserted' | 'copied' | 'failed'

type DraftSetter = (text: string) => boolean

let activeSetter: DraftSetter | null = null

/** Register (or replace) the live conversation draft setter. */
export function registerComposerDraftSetter(setter: DraftSetter): () => void {
  activeSetter = setter
  return () => {
    if (activeSetter === setter) activeSetter = null
  }
}

/** Test helper — clear the active setter between cases. */
export function clearComposerDraftSetterForTests(): void {
  activeSetter = null
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** Host composer seat + plugin/legacy markers. Typing lives here, not in fences. */
const COMPOSER_REGION = '[data-composer-seat], [data-composer], [data-chat-input], [data-testid="composer"]'
/** Fence / IUI mounts that must keep streaming characterData observations. */
const FENCE_REGION = '.md-code-block, .code-block, .code-block-small, .genui-dom-fence, .genui-dom-fence-diagnostic, [data-iui-html-sandbox], [data-iui-md-rescue]'

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement
}

/** True when a DOM node belongs to the live composer (Lexical / textarea). */
export function nodeTouchesComposer(node: Node | null | undefined): boolean {
  if (node == null || typeof Element === 'undefined') return false
  const el = elementOf(node)
  if (el == null) return false
  if (typeof el.closest !== 'function') return false
  if (el.closest(COMPOSER_REGION) !== null) return true
  const editable = el.closest('[contenteditable="true"], textarea, [role="textbox"]')
  if (editable == null) return false
  if (editable.closest(FENCE_REGION) !== null) return false
  return true
}

/** True when a MutationObserver record is composer typing / IME, not fence growth. */
export function mutationTouchesComposer(record: Pick<MutationRecord, 'target' | 'addedNodes' | 'removedNodes'>): boolean {
  if (nodeTouchesComposer(record.target)) return true
  for (const node of record.addedNodes) {
    if (nodeTouchesComposer(node)) return true
  }
  for (const node of record.removedNodes) {
    if (nodeTouchesComposer(node)) return true
  }
  return false
}

const COMPOSER_SELECTORS = [
  'textarea[data-testid="composer"]',
  'textarea[data-composer]',
  '[data-composer] textarea',
  '[data-chat-input] textarea',
  'form[data-composer] textarea',
  '.composer textarea',
  '[contenteditable="true"][data-composer]',
  '[role="textbox"][data-composer]',
  'textarea[placeholder]',
  '[contenteditable="true"][role="textbox"]',
] as const

function isVisible(el: HTMLElement): boolean {
  const style = globalThis.getComputedStyle?.(el)
  if (style) {
    if (style.visibility === 'hidden' || style.display === 'none') return false
  }
  // jsdom often reports empty client rects for laid-out nodes — only treat as
  // hidden when the element (or an ancestor) is explicitly display:none.
  if (el.closest?.('[hidden], [aria-hidden="true"]')) return false
  return true
}

/** Exported for unit tests — pick the best visible composer control. */
export function findComposerEditable(root: ParentNode = document): HTMLElement | null {
  for (const selector of COMPOSER_SELECTORS) {
    const nodes = root.querySelectorAll(selector)
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      if (!isVisible(node)) continue
      return node
    }
  }
  return null
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) descriptor.set.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Write text into a textarea / input / contenteditable. */
export function writeComposerEditable(el: HTMLElement, text: string): boolean {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus()
      setNativeValue(el, text)
      return true
    }
    const editableAttr = (el.getAttribute('contenteditable') || '').toLowerCase()
    const editable = el.isContentEditable
      || editableAttr === 'true'
      || editableAttr === 'plaintext-only'
      || (el as HTMLElement).contentEditable === 'true'
    if (editable) {
      try { el.focus() } catch { /* jsdom */ }
      el.textContent = text
      try { el.dispatchEvent(new Event('input', { bubbles: true })) } catch { /* ignore */ }
      return true
    }
  } catch {
    return false
  }
  return false
}

function insertViaDom(text: string): boolean {
  if (typeof document === 'undefined') return false
  const el = findComposerEditable()
  if (el === null) return false
  return writeComposerEditable(el, text)
}

/**
 * Prefer inserting into the active composer draft; otherwise probe the DOM;
 * otherwise copy so the user can paste. Never throws.
 */
export async function insertIntoComposer(text: string): Promise<ComposerInsertResult> {
  const trimmed = text.trim()
  if (!trimmed) return 'failed'
  try {
    if (activeSetter?.(trimmed) === true) return 'inserted'
  } catch {
    // fall through
  }
  try {
    if (insertViaDom(trimmed)) return 'inserted'
  } catch {
    // fall through
  }
  const copied = await copyText(trimmed)
  return copied ? 'copied' : 'failed'
}
