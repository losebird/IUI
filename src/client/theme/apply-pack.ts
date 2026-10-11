/** Packs deleted — sandbox brand only. */
const SANDBOX = 'sandbox'
const listeners = new Set<() => void>()

export function setActivePackId(_id?: string | null): void {
  /* no-op */
}

export function getActivePackId(): string {
  return SANDBOX
}

export function subscribeActivePack(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
