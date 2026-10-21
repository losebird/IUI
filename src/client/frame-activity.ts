/**
 * G9: keep long chats light. Every settled page card registers here; when more
 * than {@link MAX_LIVE_FRAMES} cards are live, the ones that left the viewport
 * longest ago are frozen into a static copy (click to resume). Pausing while
 * offscreen is handled per card (visibility message to the frame).
 */
export const MAX_LIVE_FRAMES = 6

export interface FrameActivityEntry {
  /** Card is in (or near) the viewport. */
  visible: boolean
  /** Last time the card was visible (0 = never; ties fall back to mount order). */
  lastVisibleAt: number
  frozen: boolean
  /** Settled, not streaming, no error / fullscreen, ready for a while. */
  canFreeze: () => boolean
  /** Ask the card to freeze itself (async; it calls `setFrozen(true)` when done). */
  freeze: () => void
}

interface Slot extends FrameActivityEntry { order: number; refused: boolean; pending: boolean }

const slots = new Map<string, Slot>()
let orderSeq = 0
let timer: ReturnType<typeof setTimeout> | null = null

/** Pure pick (tests): which live cards to freeze so at most `max` stay live. */
export function pickFramesToFreeze(
  entries: ReadonlyArray<{ id: string; visible: boolean; lastVisibleAt: number; frozen: boolean; eligible: boolean; order: number }>,
  max = MAX_LIVE_FRAMES,
): string[] {
  const live = entries.filter((e) => !e.frozen)
  let excess = live.length - max
  if (excess <= 0) return []
  const candidates = live
    .filter((e) => !e.visible && e.eligible)
    .sort((a, b) => (a.lastVisibleAt - b.lastVisibleAt) || (a.order - b.order))
  const out: string[] = []
  for (const c of candidates) {
    if (excess <= 0) break
    out.push(c.id)
    excess--
  }
  return out
}

function enforce(): void {
  timer = null
  const list = [...slots.entries()].map(([id, s]) => ({
    id,
    visible: s.visible,
    lastVisibleAt: s.lastVisibleAt,
    // A card that is mid-freeze counts as frozen so it is not asked twice.
    frozen: s.frozen || s.pending,
    eligible: !s.refused && (() => { try { return s.canFreeze() } catch { return false } })(),
    order: s.order,
  }))
  for (const id of pickFramesToFreeze(list)) {
    const s = slots.get(id)
    if (!s) continue
    s.pending = true
    try { s.freeze() } catch { s.pending = false }
  }
}

/** Re-check soon (debounced). */
export function scheduleFrameActivityCheck(delayMs = 400): void {
  if (timer !== null) return
  timer = setTimeout(enforce, delayMs)
}

export interface FrameActivityHandle {
  setVisible: (visible: boolean) => void
  /** `refused`: the page cannot be frozen (WebGL, too large) — never ask again until resumed. */
  setFrozen: (frozen: boolean, opts?: { refused?: boolean }) => void
  dispose: () => void
}

export function registerFrameActivity(id: string, entry: Pick<FrameActivityEntry, 'canFreeze' | 'freeze'>): FrameActivityHandle {
  slots.set(id, { visible: false, lastVisibleAt: 0, frozen: false, ...entry, order: ++orderSeq, refused: false, pending: false })
  scheduleFrameActivityCheck()
  return {
    setVisible(visible) {
      const s = slots.get(id)
      if (!s) return
      if (s.visible || visible) s.lastVisibleAt = Date.now()
      s.visible = visible
      scheduleFrameActivityCheck()
    },
    setFrozen(frozen, opts) {
      const s = slots.get(id)
      if (!s) return
      s.pending = false
      s.frozen = frozen
      if (opts?.refused) s.refused = true
      if (!frozen && !opts?.refused) { s.refused = false; s.lastVisibleAt = Date.now() }
      scheduleFrameActivityCheck()
    },
    dispose() {
      slots.delete(id)
      scheduleFrameActivityCheck()
    },
  }
}

/** Tests only. */
export function resetFrameActivityForTests(): void {
  slots.clear()
  orderSeq = 0
  if (timer !== null) { clearTimeout(timer); timer = null }
}
