/**
 * C10: connectivity probe — which public hosts the sandbox depends on are
 * reachable from this network. The plugin (Node side) runs it with short
 * concurrent HEAD requests, caches the result for an hour and publishes it in
 * runtime-config.json; Settings → 网络与资源 shows it and suggests a preset,
 * and the photo tool skips its 8 s wait when Wikimedia is known-unreachable.
 * Pure + fetch-injectable so it is testable without the network.
 */

import { vendorProbeUrls, type CdnPreset } from './vendor-registry.ts'
import { AMAP_PROBE_URL } from './net-context.ts'

export type ProbeTargetId = 'jsdelivr' | 'npmmirror' | 'unpkg' | 'zstatic' | 'staticfile' | 'wikipedia' | 'wikimedia' | 'tiles' | 'amap' | 'models'

export interface ProbeResult {
  readonly id: ProbeTargetId
  /** got any HTTP response before the timeout */
  readonly ok: boolean
  /** round trip in ms (timeout value when it timed out) */
  readonly ms: number
  /** HTTP status when there was a response */
  readonly status?: number
}

export interface NetworkProbeSnapshot {
  /** epoch ms the probe finished */
  readonly at: number
  readonly results: readonly ProbeResult[]
}

export const NETWORK_PROBE_TTL_MS = 60 * 60 * 1000
export const NETWORK_PROBE_TIMEOUT_MS = 2000

/** Default map tiles (keep in sync with IUI_DEFAULT_MAP_TILE_URL's host). */
const TILE_PROBE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/0/0/0'

export function networkProbeTargets(): Array<{ id: ProbeTargetId; url: string }> {
  return [
    ...vendorProbeUrls(),
    { id: 'wikipedia', url: 'https://en.wikipedia.org/w/api.php' },
    { id: 'wikimedia', url: 'https://upload.wikimedia.org/' },
    { id: 'tiles', url: TILE_PROBE_URL },
    { id: 'amap', url: AMAP_PROBE_URL },
    // R5-3: CC0 3D models (Poly Haven files; Khronos samples ride on jsDelivr / GitHub).
    { id: 'models', url: 'https://dl.polyhaven.org/' },
  ]
}

type FetchLike = (url: string, init: { method: string; signal: AbortSignal; redirect?: 'manual' | 'follow' }) => Promise<{ status: number }>

export async function probeNetwork(opts: { fetchImpl?: FetchLike; timeoutMs?: number; now?: () => number } = {}): Promise<NetworkProbeSnapshot> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  const timeoutMs = opts.timeoutMs ?? NETWORK_PROBE_TIMEOUT_MS
  const now = opts.now ?? Date.now
  const results = await Promise.all(networkProbeTargets().map(async ({ id, url }): Promise<ProbeResult> => {
    if (typeof fetchImpl !== 'function') return { id, ok: false, ms: 0 }
    const t0 = now()
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { method: 'HEAD', signal: ctl.signal, redirect: 'manual' })
      return { id, ok: true, ms: Math.max(0, Math.round(now() - t0)), status: res.status }
    } catch {
      return { id, ok: false, ms: Math.max(0, Math.round(now() - t0)) }
    } finally {
      clearTimeout(timer)
    }
  }))
  return { at: now(), results }
}

let cached: NetworkProbeSnapshot | null = null
let inflight: Promise<NetworkProbeSnapshot> | null = null

/** Last finished probe (null before the first one completes). */
export function getNetworkProbe(): NetworkProbeSnapshot | null {
  return cached
}

/** Cached probe (≤ 1 h old) or a fresh one; concurrent callers share one run. */
export function ensureNetworkProbe(opts: { force?: boolean; fetchImpl?: FetchLike; now?: () => number } = {}): Promise<NetworkProbeSnapshot> {
  const now = opts.now ?? Date.now
  if (!opts.force && cached && now() - cached.at < NETWORK_PROBE_TTL_MS) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = probeNetwork({ ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), now })
    .then((snap) => { cached = snap; return snap })
    .finally(() => { inflight = null })
  return inflight
}

/** Test seam. */
export function setNetworkProbeForTest(snap: NetworkProbeSnapshot | null): void {
  cached = snap
  inflight = null
}

/** True only when a fresh probe saw every listed host fail (unknown → false). */
export function isKnownUnreachable(ids: readonly ProbeTargetId[], snap: NetworkProbeSnapshot | null = cached, now: number = Date.now()): boolean {
  if (!snap || now - snap.at >= NETWORK_PROBE_TTL_MS) return false
  return ids.length > 0 && ids.every((id) => snap.results.some((r) => r.id === id && !r.ok))
}

export type ProbeAdvice = 'switch-china' | 'switch-global' | 'cdn-all-down' | 'no-wikimedia' | 'no-tiles'

/** Settings hints derived from a probe + the configured preset. */
export function probeAdvice(snap: NetworkProbeSnapshot | null | undefined, preset: CdnPreset): ProbeAdvice[] {
  if (!snap) return []
  const ok = (id: ProbeTargetId): boolean | undefined => snap.results.find((r) => r.id === id)?.ok
  const out: ProbeAdvice[] = []
  const jsd = ok('jsdelivr'), npmm = ok('npmmirror')
  const mirrors = snap.results.filter((r) => r.id === 'jsdelivr' || r.id === 'npmmirror' || r.id === 'unpkg' || r.id === 'zstatic' || r.id === 'staticfile')
  if (mirrors.length > 0 && mirrors.every((r) => !r.ok)) out.push('cdn-all-down')
  else if (preset === 'global' && jsd === false && npmm === true) out.push('switch-china')
  else if (preset === 'china' && npmm === false && jsd === true) out.push('switch-global')
  if (ok('wikipedia') === false && ok('wikimedia') === false) out.push('no-wikimedia')
  if (ok('tiles') === false && ok('amap') !== true) out.push('no-tiles')
  return out
}
