const Q = new URLSearchParams(location.search)
document.documentElement.dataset.theme = Q.get('theme') || 'iui'
window.W = +(Q.get('w') || 688)
const _cv = document.createElement('canvas'); _cv.width = _cv.height = 1; const _cx = _cv.getContext('2d', { willReadFrequently: true })
function rgb(c, a = 1) { _cx.clearRect(0, 0, 1, 1); _cx.fillStyle = '#000'; _cx.fillStyle = c; _cx.fillRect(0, 0, 1, 1); const d = _cx.getImageData(0, 0, 1, 1).data; return `rgba(${d[0]},${d[1]},${d[2]},${a})` }
function tok() { const cs = getComputedStyle(document.documentElement); const g = (n) => rgb(cs.getPropertyValue('--color-' + n).trim() || '#000'); return { ink: g('base-content'), bg: g('base-100'), b2: g('base-200'), b3: g('base-300'), primary: g('primary'), success: g('success'), warning: g('warning'), error: g('error'), info: g('info'), accent: g('accent'), a: (c, al) => c.replace(/,[\d.]+\)$/, ',' + al + ')') } }
const FONT = 'InterVar, "PingFang SC", "Noto Sans SC", sans-serif'
function spark(vals, w = 120, h = 32, color = 'currentColor', fill = true) {
  const mn = Math.min(...vals), mx = Math.max(...vals), sx = w / (vals.length - 1), y = (v) => h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)
  const pts = vals.map((v, i) => [i * sx, y(v)]); const d = 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${fill ? `<path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".08"/>` : ''}<path d="${d}" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pts.at(-1)[0] - 2}" cy="${pts.at(-1)[1]}" r="2.5" fill="${color}"/></svg>`
}
const ICON = {
  info: '<path d="M12 8h.01M11 12h1v4h1"/><circle cx="12" cy="12" r="9"/>', ok: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', err: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>', play: '<path d="M8 5.5v13l11-6.5Z" fill="currentColor"/>', pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor" stroke="none"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', cloud: '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.4 11 3.5 3.5 0 0 1 18.5 18Z"/>',
  rain: '<path d="M7 15a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.4 8 3.5 3.5 0 0 1 18.5 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>', psun: '<path d="M12 3v1.5M5.6 5.6l1 1M3 12h1.5M17.4 6.6l1-1"/><path d="M8.5 11a3.5 3.5 0 0 1 6.6-1.6"/><path d="M8 20a3.8 3.8 0 1 1 .8-7.5 5 5 0 0 1 9.7 1.6A3 3 0 0 1 17.8 20Z"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>', tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
}
const ic = (n, s = 16, cls = '') => `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`
function ready(fn, delay = 400) { document.addEventListener('DOMContentLoaded', () => { document.getElementById('shot').style.width = W + 'px'; document.fonts.ready.then(async () => { if (fn) await fn(tok()); setTimeout(() => (window.__ready = 1), delay) }) }) }
function ec(el, opt) { const t = tok(); const c = echarts.init(typeof el === 'string' ? document.getElementById(el) : el, null, { renderer: 'svg' }); c.setOption({ animation: false, textStyle: { fontFamily: FONT, color: t.a(t.ink, .55) }, ...opt }); return c }
function ax(t) { return { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.a(t.ink, .5), fontSize: 11 }, splitLine: { lineStyle: { color: t.a(t.ink, .07) } } } }
