/**
 * F12: photo confidence. A photo is used only when it demonstrably shows the
 * place: the Commons file name / object name / description / categories
 * name it, or the article (or the photo itself) sits within 300 m of the
 * stop's coordinates. Otherwise the host shows a designed placeholder.
 *
 * One ES5 source is shared by the Node tool (evaluated below) and the
 * in-page fill script (inlined), so both sides apply the same rule.
 */
export const PHOTO_MATCH_JS = String.raw`
var IUI_PHOTO_STOP = { the: 1, and: 1, of: 1, in: 1, at: 1, on: 1, day: 1, trip: 1, tour: 1, travel: 1, city: 1, road: 1, street: 1, cafe: 1, coffee: 1, hotel: 1, restaurant: 1, shop: 1, store: 1, park: 1, museum: 1, station: 1, china: 1, jpg: 1, jpeg: 1, png: 1, file: 1 };
function iuiPhotoNorm(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/^file:/, '')
    .replace(/\.(jpe?g|png|gif|webp|svg|tiff?)\b/g, ' ')
    .replace(/[_\-\u2013\u2014\u00b7\u2022\u3001,\uff0c.\u3002!\uff01?\uff1f:\uff1a;\uff1b"'\u2019\u201c\u201d\u300c\u300d\u300e\u300f\u3010\u3011\[\]()\uff08\uff09\/|#&+]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function iuiPlaceCores(place) {
  var n = iuiPhotoNorm(place).replace(/^day ?\d+ ?/, '').replace(/^\u7b2c ?\d+ ?[\u5929\u7ad9\u65e5] ?/, '');
  var cjk = n.match(/[\u3400-\u9fff\u3040-\u30ff]{2,}/g) || [];
  var latin = (n.match(/[a-z][a-z']{2,}/g) || []).filter(function (w) { return !IUI_PHOTO_STOP[w]; });
  return { cjk: cjk, latin: latin };
}
function iuiPhotoMatches(place, evidence) {
  var ev = iuiPhotoNorm(evidence);
  if (!ev) return false;
  var flat = ev.replace(/\s+/g, '');
  var words = ev.split(' ');
  var c = iuiPlaceCores(place);
  for (var i = 0; i < c.cjk.length; i++) {
    if (flat.indexOf(c.cjk[i]) !== -1) return true;
  }
  if (!c.latin.length) return false;
  var hit = 0;
  for (var j = 0; j < c.latin.length; j++) {
    var w = c.latin[j];
    for (var k = 0; k < words.length; k++) {
      var e = words[k];
      if (e === w || (w.length >= 5 && e.length >= 5 && (e.indexOf(w.slice(0, -1)) === 0 || w.indexOf(e.slice(0, -1)) === 0))) { hit++; break; }
    }
  }
  return hit >= Math.max(1, Math.ceil(c.latin.length * 0.6));
}
function iuiGeoMeters(a, b) {
  if (!a || !b) return Infinity;
  var lat1 = +a.lat, lon1 = +(a.lon != null ? a.lon : a.lng), lat2 = +b.lat, lon2 = +(b.lon != null ? b.lon : b.lng);
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return Infinity;
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
var IUI_PHOTO_GEO_RADIUS_M = 300;
function iuiLooksLikeFilename(s) {
  return /\.(jpe?g|png|gif|webp|svg|tiff?)\b/i.test(String(s || '')) || /^\s*file:/i.test(String(s || ''));
}
`

export type GeoPoint = { lat: number; lon?: number; lng?: number }

/*
 * TypeScript twin of PHOTO_MATCH_JS for the Node tool and static enrich.
 * (No eval / new Function: the host page may forbid unsafe-eval.)
 * tests/f12-photo-confidence.spec.ts checks both copies agree.
 */
const STOP = new Set(['the', 'and', 'of', 'in', 'at', 'on', 'day', 'trip', 'tour', 'travel', 'city', 'road', 'street', 'cafe', 'coffee', 'hotel', 'restaurant', 'shop', 'store', 'park', 'museum', 'station', 'china', 'jpg', 'jpeg', 'png', 'file'])

export function photoNorm(s: unknown): string {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/^file:/, '')
    .replace(/\.(jpe?g|png|gif|webp|svg|tiff?)\b/g, ' ')
    .replace(/[_\-\u2013\u2014\u00b7\u2022\u3001,\uff0c.\u3002!\uff01?\uff1f:\uff1a;\uff1b"'\u2019\u201c\u201d\u300c\u300d\u300e\u300f\u3010\u3011[\]()\uff08\uff09/|#&+]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function placeCores(place: string): { cjk: string[]; latin: string[] } {
  const n = photoNorm(place).replace(/^day ?\d+ ?/, '').replace(/^\u7b2c ?\d+ ?[\u5929\u7ad9\u65e5] ?/, '')
  const cjk = n.match(/[\u3400-\u9fff\u3040-\u30ff]{2,}/g) ?? []
  const latin = (n.match(/[a-z][a-z']{2,}/g) ?? []).filter((w) => !STOP.has(w))
  return { cjk, latin }
}

/** True when evidence (file name / object name / description / categories) names the place. */
export function photoMatchesPlace(place: string, evidence: string): boolean {
  const ev = photoNorm(evidence)
  if (!ev) return false
  const flat = ev.replace(/\s+/g, '')
  const words = ev.split(' ')
  const c = placeCores(place)
  for (const core of c.cjk) {
    if (flat.includes(core)) return true
  }
  if (!c.latin.length) return false
  let hit = 0
  for (const w of c.latin) {
    for (const e of words) {
      if (e === w || (w.length >= 5 && e.length >= 5 && (e.startsWith(w.slice(0, -1)) || w.startsWith(e.slice(0, -1))))) {
        hit++
        break
      }
    }
  }
  return hit >= Math.max(1, Math.ceil(c.latin.length * 0.6))
}

export function geoMeters(a: GeoPoint | null | undefined, b: GeoPoint | null | undefined): number {
  if (!a || !b) return Infinity
  const lat1 = +a.lat
  const lon1 = +(a.lon ?? a.lng ?? NaN)
  const lat2 = +b.lat
  const lon2 = +(b.lon ?? b.lng ?? NaN)
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity
  const R = 6371000
  const toR = Math.PI / 180
  const dLat = (lat2 - lat1) * toR
  const dLon = (lon2 - lon1) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const PHOTO_GEO_RADIUS_M = 300

export function looksLikeFilename(s: unknown): boolean {
  return /\.(jpe?g|png|gif|webp|svg|tiff?)\b/i.test(String(s ?? '')) || /^\s*file:/i.test(String(s ?? ''))
}

/** Collapsed attribution label (never a file name). */
export function photoCreditLabel(zh: boolean): string {
  return zh ? 'ⓘ 图片来自 Wikimedia' : 'ⓘ Photo: Wikimedia'
}
