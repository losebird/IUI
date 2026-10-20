/**
 * F3 · Outbound action gate for sandbox pages.
 *
 * A sandbox page can call `iuiSandbox.action()` / `sendPrompt()` at any time.
 * Every forwarded action becomes a `[genui-action]` model turn (billed), and
 * the reply is a new page that can fire again — a self-loop. The host is the
 * only party that can enforce policy, so every outbound message goes through
 * here:
 *
 * 1. `sandbox_*` names are host-internal (rerun / reask / sendPrompt / open
 *    link). They never reach the model.
 * 2. User-gesture gate: the host page's `navigator.userActivation.isActive`.
 *    Chromium/WebKit/Gecko propagate an iframe click's activation to its
 *    ancestors, so a real click inside the sandbox reads `true` here, while a
 *    timer or load-time call reads `false`. The iframe cannot forge it. When
 *    the API is missing, fall through to the rate limits below.
 * 3. Rate limit: one message per frame per 2 s; six per tab per minute. The
 *    minute cap pauses the frame until the user resumes it.
 * 4. Payload size cap (2000 chars of JSON).
 */

export const INTERNAL_ACTION = /^sandbox_/

export const FRAME_MIN_INTERVAL_MS = 2000
export const WINDOW_MS = 60_000
export const WINDOW_MAX = 6
export const MAX_PAYLOAD_CHARS = 2000

export type ActionVerdict = 'ok' | 'internal' | 'no-gesture' | 'throttled' | 'paused'

export interface ActionGateDeps {
  now?: () => number
  /** `true`/`false` when the browser exposes UserActivation, `undefined` otherwise. */
  hasActivation?: () => boolean | undefined
}

export function readUserActivation(): boolean | undefined {
  try {
    const ua = (globalThis.navigator as Navigator & { userActivation?: { isActive?: boolean } } | undefined)?.userActivation
    if (ua === undefined || typeof ua.isActive !== 'boolean') return undefined
    return ua.isActive
  } catch {
    return undefined
  }
}

/** Tab-wide sliding window shared by every sandbox frame. */
const tabWindow: number[] = []

export function resetActionGateForTests(): void {
  tabWindow.length = 0
}

export interface FrameActionGate {
  check(name: string): ActionVerdict
  readonly paused: boolean
  resume(): void
}

export function createFrameActionGate(deps: ActionGateDeps = {}): FrameActionGate {
  const now = deps.now ?? (() => Date.now())
  const hasActivation = deps.hasActivation ?? readUserActivation
  let lastAt = Number.NEGATIVE_INFINITY
  let paused = false
  return {
    get paused() { return paused },
    resume() {
      paused = false
      lastAt = Number.NEGATIVE_INFINITY
      tabWindow.length = 0
    },
    check(name: string): ActionVerdict {
      if (INTERNAL_ACTION.test(name)) return 'internal'
      if (paused) return 'paused'
      if (hasActivation() === false) return 'no-gesture'
      const t = now()
      if (t - lastAt < FRAME_MIN_INTERVAL_MS) return 'throttled'
      while (tabWindow.length > 0 && t - tabWindow[0]! >= WINDOW_MS) tabWindow.shift()
      if (tabWindow.length >= WINDOW_MAX) {
        paused = true
        return 'paused'
      }
      lastAt = t
      tabWindow.push(t)
      return 'ok'
    },
  }
}

/** Keep payloads small enough that one page cannot flood the model context. */
export function capActionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  let text: string
  try {
    text = JSON.stringify(payload) ?? '{}'
  } catch {
    return { truncated: true }
  }
  if (text.length <= MAX_PAYLOAD_CHARS) return payload
  return { truncated: true, preview: text.slice(0, MAX_PAYLOAD_CHARS) }
}
