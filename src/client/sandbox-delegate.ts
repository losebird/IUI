/**
 * F18: work the sandbox cannot do itself (no allow-downloads, no clipboard
 * permission) is delegated to the host — only right after a user gesture.
 */

/** Single-file cap for `iuiSandbox.download`. */
export const SANDBOX_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024

/** At most this many downloads per frame inside {@link DOWNLOAD_WINDOW_MS}. */
const DOWNLOAD_BURST = 3
const DOWNLOAD_WINDOW_MS = 10_000

// Extensions the OS may run on double-click. Pages are model-written: refuse.
const BLOCKED_EXT = new Set([
  'exe', 'msi', 'msix', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'hta',
  'ps1', 'psm1', 'reg', 'lnk', 'url', 'jar', 'app', 'dmg', 'pkg', 'apk', 'dll', 'desktop', 'appimage', 'command', 'scf', 'inf',
])

/** Plain file name (no path, no control/reserved chars, ≤120 chars); `null` when blocked. */
export function sanitizeDownloadName(input: unknown): string | null {
  let name = typeof input === 'string' ? input : ''
  name = name.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*\u202e\u200e\u200f]/g, '').replace(/^[.\s]+/, '').trim()
  if (!name) name = 'download'
  if (name.length > 120) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : ''
    name = name.slice(0, 120 - ext.length) + ext
  }
  const parts = name.toLowerCase().split('.')
  if (parts.length > 1 && parts.slice(1).some((p) => BLOCKED_EXT.has(p.trim()))) return null
  return name
}

export function safeDownloadMime(input: unknown): string {
  const m = typeof input === 'string' ? input.trim().toLowerCase() : ''
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;\s*charset=[a-z0-9_-]+)?$/.test(m) ? m : 'application/octet-stream'
}

export function hasUserActivation(): boolean {
  const activation = (globalThis.navigator as (Navigator & { userActivation?: { isActive: boolean } }) | undefined)?.userActivation
  // Browsers without the API: allow (the frame still needs a click to call us in practice).
  return activation === undefined ? true : activation.isActive
}

export type DelegateVerdict = 'ok' | 'gesture' | 'blocked' | 'tooLarge' | 'rate' | 'failed'

export function byteLength(data: unknown): number {
  if (typeof data === 'string') {
    try { return new Blob([data]).size } catch { return data.length * 3 }
  }
  if (data instanceof ArrayBuffer) return data.byteLength
  return -1
}

/** Per-frame burst limiter: a page cannot turn one click into a download storm. */
export function createDownloadLimiter(now: () => number = Date.now): () => boolean {
  const stamps: number[] = []
  return () => {
    const t = now()
    while (stamps.length && t - stamps[0]! > DOWNLOAD_WINDOW_MS) stamps.shift()
    if (stamps.length >= DOWNLOAD_BURST) return false
    stamps.push(t)
    return true
  }
}

/** Validate and save one file for the frame. */
export function hostDownload(
  filename: unknown,
  data: unknown,
  mime: unknown,
  allow: () => boolean,
): DelegateVerdict {
  if (!hasUserActivation()) return 'gesture'
  const name = sanitizeDownloadName(filename)
  if (name === null) return 'blocked'
  const size = byteLength(data)
  if (size < 0) return 'failed'
  if (size > SANDBOX_DOWNLOAD_MAX_BYTES) return 'tooLarge'
  if (!allow()) return 'rate'
  try {
    const type = safeDownloadMime(mime)
    const blob = new Blob([data as BlobPart], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke later — an immediate revoke can cancel the download (F17).
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'ok'
  } catch {
    return 'failed'
  }
}

/** Host clipboard write; falls back to a hidden textarea + execCommand. */
export async function hostCopy(text: string): Promise<DelegateVerdict> {
  if (!hasUserActivation()) return 'gesture'
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'ok'
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand?.('copy') === true
    ta.remove()
    return ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}
