/**
 * While Settings → IUI is editing pack/theme for live preview, ignore
 * runtime-config polls so the card selection is not clobbered every 2.5s.
 * Cleared after Save / Discard (refresh then unlock).
 */
let locked = false
const listeners = new Set<() => void>()

export function lockVisualPreview(): void {
  if (locked) return
  locked = true
  for (const listener of listeners) listener()
}

export function unlockVisualPreview(): void {
  if (!locked) return
  locked = false
  for (const listener of listeners) listener()
}

export function isVisualPreviewLocked(): boolean {
  return locked
}

export function subscribeVisualPreviewLock(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
