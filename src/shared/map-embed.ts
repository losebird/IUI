/**
 * Real map surfaces for map embeds — config-driven OSM embed + Leaflet srcdoc.
 * No hard-coded city/poi coordinate tables: coords come from the fence, or
 * Leaflet geocodes the free-text query via Nominatim at render time.
 */

export type MapLinkTemplate = {
  readonly id: string
  readonly label: string
  /** Build an https URL from a free-text place query. */
  readonly href: (query: string) => string
}

/** External map CTAs — templates only; query is URL-encoded at call time. */
export const MAP_LINK_TEMPLATES: readonly MapLinkTemplate[] = [
  {
    id: 'amap',
    label: '在高德地图打开',
    href: (q) => `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: 'baidu',
    label: '在百度地图打开',
    href: (q) => `https://map.baidu.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'osm',
    label: '在 OpenStreetMap 打开',
    href: (q) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`,
  },
]

export type MapCoords = { lat: number; lng: number }

export type MapMarker = MapCoords & { label?: string }

export function finiteCoords(lat: unknown, lng: unknown): MapCoords | undefined {
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}

export function clampZoom(zoom: unknown, fallback = 15): number {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return fallback
  return Math.max(1, Math.min(19, Math.round(zoom)))
}

export function clampMapHeight(height: unknown, fallback = 280): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) return fallback
  return Math.max(160, Math.min(640, Math.round(height)))
}

/** Normalize optional markers array from fence JSON (no hard-coded places). */
export function normalizeMapMarkers(raw: unknown): MapMarker[] {
  if (!Array.isArray(raw)) return []
  const out: MapMarker[] = []
  for (const row of raw.slice(0, 24)) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const c =
      finiteCoords(rec.lat, rec.lng) ??
      finiteCoords(rec.latitude, rec.longitude) ??
      finiteCoords(rec.lat, rec.lon) ??
      finiteCoords(rec.latitude, rec.lon)
    if (!c) continue
    const label =
      typeof rec.label === 'string'
        ? rec.label
        : typeof rec.title === 'string'
          ? rec.title
          : typeof rec.name === 'string'
            ? rec.name
            : undefined
    out.push(label !== undefined ? { ...c, label } : c)
  }
  return out
}

/** Normalize optional path / polyline from fence or `$bind` payloads. */
export function normalizeMapPath(raw: unknown): MapCoords[] {
  return normalizeMapMarkers(raw).map(({ lat, lng }) => ({ lat, lng }))
}

/** OpenStreetMap official export embed (marker + bbox). */
export function buildOsmEmbedUrl(lat: number, lng: number, zoom = 15): string {
  const z = clampZoom(zoom)
  const span = 360 / 2 ** z
  const minLon = lng - span / 2
  const maxLon = lng + span / 2
  const minLat = lat - span / 4
  const maxLat = lat + span / 4
  const bbox = [minLon, minLat, maxLon, maxLat].map((n) => n.toFixed(6)).join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`
}

export function buildDefaultMapLinks(query: string): Array<{ label: string; href: string }> {
  const q = query.trim()
  if (q.length === 0) return []
  return MAP_LINK_TEMPLATES.map((t) => ({ label: t.label, href: t.href(q) }))
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const OSM_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export type LeafletMapSrcdocOptions = {
  lat?: number
  lng?: number
  zoom?: number
  /** Free-text place; used for Nominatim when coords missing. */
  query?: string
  title?: string
  markers?: readonly MapMarker[]
  /** Optional route polyline. */
  path?: readonly MapCoords[]
  /** Connect markers with a polyline when path is empty. */
  route?: boolean
  /** Accent for status chrome (CSS color). */
  accent?: string
}

/**
 * Interactive Leaflet + OSM tiles as an iframe srcdoc.
 * With coords/markers: pin immediately. Without: Nominatim geocode `query`.
 */
export function buildLeafletMapSrcdoc(opts: LeafletMapSrcdocOptions): string {
  const zoom = clampZoom(opts.zoom)
  const coords = finiteCoords(opts.lat, opts.lng)
  const markers = [...(opts.markers ?? [])]
  if (coords && !markers.some((m) => m.lat === coords.lat && m.lng === coords.lng)) {
    markers.unshift({
      ...coords,
      ...(opts.title ? { label: opts.title } : {}),
    })
  }
  const pathPts = normalizeMapPath(opts.path)
  const route = opts.route === true || pathPts.length >= 2
  const query = (opts.query ?? opts.title ?? '').trim()
  const title = ((opts.title ?? query) || '地图').replace(/</g, '')
  const accent = (opts.accent ?? '#2563eb').replace(/[<>"']/g, '')
  const markersJson = JSON.stringify(
    markers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
      label: m.label ?? '',
    })),
  )
  const pathJson = JSON.stringify(
    pathPts.length >= 2
      ? pathPts.map((p) => [p.lat, p.lng])
      : route && markers.length >= 2
        ? markers.map((m) => [m.lat, m.lng])
        : [],
  )
  const qJson = JSON.stringify(query)
  const titleJson = JSON.stringify(title)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="${LEAFLET_CSS}"/>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#f4f4f5}
  #status{position:absolute;z-index:500;left:12px;right:12px;top:12px;padding:9px 12px;
    border-radius:12px;font:12.5px/1.4 system-ui,-apple-system,sans-serif;
    background:rgba(255,255,255,.94);border:1px solid rgba(0,0,0,.08);
    color:#3f3f46;display:none;box-shadow:0 1px 3px rgba(0,0,0,.06);
    backdrop-filter:blur(8px)}
  #status.show{display:block}
  #status.err{border-color:#fecaca;color:#991b1b;background:#fef2f2}
  #status.ok{border-color:color-mix(in srgb,${accent} 35%,#e4e4e7);color:#18181b}
  .leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.82)!important}
</style></head><body>
<div id="status"></div><div id="map" role="application" aria-label=${titleJson}></div>
<script src="${LEAFLET_JS}"></script>
<script>
(function(){
  var statusEl=document.getElementById('status');
  function setStatus(msg,kind){
    if(!msg){statusEl.className='';statusEl.textContent='';return;}
    statusEl.textContent=msg;statusEl.className='show '+(kind||'ok');
  }
  function notifyParent(payload){
    try{if(window.parent&&window.parent!==window)window.parent.postMessage(payload,'*');}catch(e){}
  }
  var map=L.map('map',{zoomControl:true,attributionControl:true});
  L.tileLayer(${JSON.stringify(OSM_TILE)},{
    maxZoom:19,
    attribution:'Tiles &copy; Esri'
  }).addTo(map);
  var group=L.featureGroup().addTo(map);
  var routeLine=null;
  function drawRoute(latlngs){
    if(routeLine){try{map.removeLayer(routeLine);}catch(e){}}
    routeLine=null;
    if(!latlngs||latlngs.length<2) return;
    routeLine=L.polyline(latlngs,{color:${JSON.stringify(accent)},weight:4,opacity:0.75,lineJoin:'round'}).addTo(map);
  }
  function pinAll(rows,z,pathOverride){
    group.clearLayers();
    rows.forEach(function(r){
      var m=L.marker([r.lat,r.lng]).addTo(group);
      if(r.label) m.bindPopup(r.label);
    });
    var path=${pathJson};
    if(pathOverride&&pathOverride.length>=2) path=pathOverride;
    drawRoute(path);
    if(rows.length===1 && (!path||path.length<2)){
      map.setView([rows[0].lat,rows[0].lng],z||${zoom});
      if(rows[0].label) group.eachLayer(function(l){if(l.openPopup)l.openPopup();});
    } else {
      try{
        var b=group.getBounds();
        if(routeLine) b=b.extend(routeLine.getBounds());
        map.fitBounds(b.pad(0.18));
      }catch(e){
        if(rows[0]) map.setView([rows[0].lat,rows[0].lng],z||${zoom});
      }
    }
    setStatus('');
    setTimeout(function(){map.invalidateSize();},40);
    setTimeout(function(){map.invalidateSize();},200);
  }
  var markers=${markersJson};
  var query=${qJson};
  var title=${titleJson};
  if(markers.length){
    pinAll(markers,${zoom});
    notifyParent({type:'iui-map-geocode',ok:true,lat:markers[0].lat,lng:markers[0].lng,label:markers[0].label||title,query:query,source:'markers'});
  }
  else if(!query){
    map.setView([20,0],2);
    setStatus('缺少坐标或地点，无法显示地图','err');
    notifyParent({type:'iui-map-geocode',ok:false,query:query,reason:'missing'});
  } else {
    setStatus('正在定位「'+query+'」…','ok');
    map.setView([20,0],2);
    var url=${JSON.stringify(NOMINATIM)}+'?format=json&limit=1&q='+encodeURIComponent(query);
    fetch(url,{headers:{'Accept':'application/json'}}).then(function(r){
      if(!r.ok) throw new Error('geocode '+r.status);
      return r.json();
    }).then(function(rows){
      if(!rows||!rows.length){setStatus('未能定位「'+query+'」，请用下方外链打开地图','err');notifyParent({type:'iui-map-geocode',ok:false,query:query,reason:'empty'});return;}
      var lat=parseFloat(rows[0].lat),lng=parseFloat(rows[0].lon);
      if(!isFinite(lat)||!isFinite(lng)){setStatus('定位结果无效','err');notifyParent({type:'iui-map-geocode',ok:false,query:query,reason:'invalid'});return;}
      pinAll([{lat:lat,lng:lng,label:rows[0].display_name||title}],${zoom});
      notifyParent({type:'iui-map-geocode',ok:true,lat:lat,lng:lng,label:rows[0].display_name||title,query:query,source:'nominatim'});
    }).catch(function(){
      setStatus('定位服务暂不可用，请用下方外链打开地图','err');
      notifyParent({type:'iui-map-geocode',ok:false,query:query,reason:'network'});
    });
  }
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(function(){map.invalidateSize();}).observe(document.getElementById('map'));
  }
  window.addEventListener('message',function(ev){
    if(!ev||!ev.data||ev.data.type!=='iui-map-resize') return;
    map.invalidateSize();
  });
})();
</script></body></html>`
}

/**
 * Build ```iui-html fence body JSON for Leaflet escape hatch (sandbox starter).
 */
export function buildLeafletSandboxFenceBody(opts: LeafletMapSrcdocOptions): string {
  const zoom = clampZoom(opts.zoom)
  const coords = finiteCoords(opts.lat, opts.lng)
  const query = (opts.query ?? opts.title ?? '').trim()
  const title = (opts.title ?? query) || '地图'
  const latExpr = coords ? String(coords.lat) : 'null'
  const lngExpr = coords ? String(coords.lng) : 'null'
  const qLit = JSON.stringify(query)
  return JSON.stringify(
    {
      title,
      height: clampMapHeight(undefined, 320),
      css: '#map{height:280px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}#hint{font-size:12px;color:#6b7280;margin-top:8px}',
      html: `<link rel="stylesheet" href="${LEAFLET_CSS}"/><div id="map"></div><p id="hint" class="iui-sandbox-muted">Leaflet · OSM</p>`,
      js: `var map=L.map('map');L.tileLayer('${OSM_TILE}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map);var lat=${latExpr},lng=${lngExpr},q=${qLit};function pin(a,b,label){map.setView([a,b],${zoom});L.marker([a,b]).addTo(map).bindPopup(label||q).openPopup();}if(lat!=null&&lng!=null){pin(lat,lng,q);}else if(q){fetch('${NOMINATIM}?format=json&limit=1&q='+encodeURIComponent(q)).then(function(r){return r.json()}).then(function(rows){if(rows[0])pin(parseFloat(rows[0].lat),parseFloat(rows[0].lon),rows[0].display_name);else{map.setView([20,0],2);document.getElementById('hint').textContent='未能定位';}}).catch(function(){map.setView([20,0],2);});}else{map.setView([20,0],2);}`,
    },
    null,
    2,
  )
}

/** Decide which surface MapNode should mount. */
export type MapSurface =
  | { kind: 'iframe-src'; src: string; mode: 'embed' | 'osm' }
  | { kind: 'iframe-srcdoc'; srcdoc: string; mode: 'leaflet' }
  | { kind: 'none' }

export type ResolveMapSurfaceInput = {
  embed?: string
  lat?: number
  lng?: number
  zoom?: number
  provider?: 'osm' | 'leaflet'
  query?: string
  title?: string
  address?: string
  markers?: unknown
  path?: unknown
  route?: boolean
  accent?: string
  /** Host allowlist check for author-supplied embed URLs. */
  safeEmbedUrl?: (raw: string | undefined) => string | undefined
}

export function resolveMapSurface(input: ResolveMapSurfaceInput): MapSurface {
  const coords = finiteCoords(input.lat, input.lng)
  const zoom = clampZoom(input.zoom)
  const markers = normalizeMapMarkers(input.markers)
  const query = (input.query ?? input.address ?? input.title ?? '').trim()
  const safe =
    input.safeEmbedUrl?.(input.embed) ??
    (typeof input.embed === 'string' && /^https:\/\//i.test(input.embed) ? input.embed : undefined)
  if (safe) return { kind: 'iframe-src', src: safe, mode: 'embed' }

  // Default interactive Leaflet (real map). osm export only when explicitly requested.
  const provider = input.provider ?? 'leaflet'

  if (provider === 'osm' && coords) {
    return { kind: 'iframe-src', src: buildOsmEmbedUrl(coords.lat, coords.lng, zoom), mode: 'osm' }
  }

  const path = normalizeMapPath(input.path)
  if (coords || markers.length > 0 || query.length > 0 || path.length >= 2) {
    const leafletOpts: LeafletMapSrcdocOptions = { zoom }
    if (coords) {
      leafletOpts.lat = coords.lat
      leafletOpts.lng = coords.lng
    }
    if (markers.length > 0) leafletOpts.markers = markers
    if (path.length > 0) leafletOpts.path = path
    if (input.route === true) leafletOpts.route = true
    if (query.length > 0) leafletOpts.query = query
    if (input.title !== undefined) leafletOpts.title = input.title
    if (input.accent !== undefined) leafletOpts.accent = input.accent
    return {
      kind: 'iframe-srcdoc',
      srcdoc: buildLeafletMapSrcdoc(leafletOpts),
      mode: 'leaflet',
    }
  }

  return { kind: 'none' }
}
