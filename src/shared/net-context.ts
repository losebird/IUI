/**
 * Batch F: what the connectivity probe means for one page build — which
 * mirrors to try (F2 `auto` preset), which basemap to draw (F4: AMap on a
 * mainland-China network) and whether Wikipedia photos are worth waiting for
 * (F3). Pure helpers + a module-level context set around a srcdoc build, the
 * same pattern as {@link withVendorSource}.
 */

import type { NetworkProbeSnapshot, ProbeTargetId } from './network-probe.ts'
import { CDN_IDS, type CdnId } from './vendor-registry.ts'

export type MapTilesSetting = 'auto' | 'amap' | 'global'
export const MAP_TILES_SETTINGS: readonly MapTilesSetting[] = ['auto', 'amap', 'global']

export function normalizeMapTilesSetting(value: unknown): MapTilesSetting {
  return typeof value === 'string' && (MAP_TILES_SETTINGS as readonly string[]).includes(value) ? value as MapTilesSetting : 'auto'
}

export interface NetContext {
  /** basemap family for Leaflet maps and photo map-thumbnails */
  readonly tiles: 'amap' | 'default'
  /** false when a probe saw Wikipedia + Wikimedia both unreachable */
  readonly wiki: boolean
}

export const DEFAULT_NET_CONTEXT: NetContext = { tiles: 'default', wiki: true }

/**
 * AMap (高德) raster tiles: no key, CORS `*`, GCJ-02 coordinates (the sandbox
 * shifts WGS-84 data onto them — see {@link GCJ_JS}). Max zoom 18.
 */
export const AMAP_TILE = {
  url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
  attribution: '&copy; 高德地图 AutoNavi',
  subdomains: '1234',
  maxZoom: 18,
  gcj: true,
} as const
export const AMAP_TILE_ORIGINS = ['https://*.is.autonavi.com'] as const
export const AMAP_PROBE_URL = 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=0&y=0&z=1'

function result(snap: NetworkProbeSnapshot | null | undefined, id: ProbeTargetId) {
  return snap?.results.find((r) => r.id === id)
}

/** F2: reachable mirrors, fastest first ([] without a probe → registry default order). */
export function cdnOrderFromProbe(snap: NetworkProbeSnapshot | null | undefined): CdnId[] {
  if (!snap) return []
  return snap.results
    .filter((r): r is typeof r & { id: CdnId } => (CDN_IDS as readonly string[]).includes(r.id) && r.ok)
    .sort((a, b) => a.ms - b.ms)
    .map((r) => r.id)
}

/**
 * F4: `auto` picks AMap when AMap answers and the network looks like mainland
 * China (Wikipedia + Wikimedia both blocked), or the default basemap is down /
 * far slower than AMap. Without a probe the default basemap stays.
 */
export function decideMapTiles(snap: NetworkProbeSnapshot | null | undefined, setting: MapTilesSetting = 'auto'): NetContext['tiles'] {
  if (setting === 'amap') return 'amap'
  if (setting === 'global' || !snap) return 'default'
  const amap = result(snap, 'amap')
  if (!amap?.ok) return 'default'
  if (result(snap, 'wikipedia')?.ok === false && result(snap, 'wikimedia')?.ok === false) return 'amap'
  const tiles = result(snap, 'tiles')
  if (tiles && (!tiles.ok || tiles.ms > Math.max(1200, amap.ms * 4))) return 'amap'
  return 'default'
}

export function decideNetContext(snap: NetworkProbeSnapshot | null | undefined, mapTiles: MapTilesSetting = 'auto'): NetContext {
  return {
    tiles: decideMapTiles(snap, mapTiles),
    wiki: !(result(snap, 'wikipedia')?.ok === false && result(snap, 'wikimedia')?.ok === false),
  }
}

let active: NetContext = DEFAULT_NET_CONTEXT

export function getNetContext(): NetContext {
  return active
}

export function withNetContext<T>(ctx: Partial<NetContext> | undefined, fn: () => T): T {
  if (!ctx) return fn()
  const prev = active
  active = { tiles: ctx.tiles === 'amap' ? 'amap' : 'default', wiki: ctx.wiki !== false }
  try { return fn() } finally { active = prev }
}

/**
 * In-frame WGS-84 ⇄ GCJ-02 (the public "Mars coordinates" transform; identity
 * outside mainland China). Defines `window.__iuiWgs2Gcj(lat, lng)` and
 * `window.__iuiGcj2Wgs(lat, lng)` → `[lat, lng]`, plus `window.__iuiInChina`.
 */
export const GCJ_JS = `(function () {
  if (window.__iuiWgs2Gcj) return;
  var PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
  function out(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function tLat(x, y) {
    var r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
    return r;
  }
  function tLng(x, y) {
    var r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
    return r;
  }
  function w2g(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng) || out(lat, lng)) return [lat, lng];
    var dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
    var rad = lat / 180 * PI, m = Math.sin(rad);
    m = 1 - EE * m * m;
    var sq = Math.sqrt(m);
    dLat = (dLat * 180) / ((A * (1 - EE)) / (m * sq) * PI);
    dLng = (dLng * 180) / (A / sq * Math.cos(rad) * PI);
    return [lat + dLat, lng + dLng];
  }
  function g2w(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng) || out(lat, lng)) return [lat, lng];
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 4; i++) {
      var g = w2g(wLat, wLng);
      wLat += lat - g[0];
      wLng += lng - g[1];
    }
    return [wLat, wLng];
  }
  window.__iuiWgs2Gcj = w2g;
  window.__iuiGcj2Wgs = g2w;
  window.__iuiInChina = function (lat, lng) { return !out(lat, lng); };
})();`

/**
 * Leaflet CRS `L.CRS.IuiGcj` (needs `L` + {@link GCJ_JS}): EPSG:3857 whose
 * projection runs WGS-84 → GCJ-02 first, so WGS-84 markers, routes and
 * fitBounds land on AMap's GCJ-02 tiles.
 */
export const GCJ_CRS_JS = `(function () {
  if (typeof L === 'undefined' || !L.CRS || !L.CRS.EPSG3857 || !L.Projection || L.CRS.IuiGcj || !window.__iuiWgs2Gcj) return;
  var SM = L.Projection.SphericalMercator;
  L.CRS.IuiGcj = L.extend({}, L.CRS.EPSG3857, {
    projection: L.extend({}, SM, {
      project: function (ll) { var g = window.__iuiWgs2Gcj(ll.lat, ll.lng); return SM.project(L.latLng(g[0], g[1])); },
      unproject: function (pt) { var g = SM.unproject(pt); var w = window.__iuiGcj2Wgs(g.lat, g.lng); return L.latLng(w[0], w[1]); }
    })
  });
})();`
