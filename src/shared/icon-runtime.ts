/**
 * G4: in-frame Lucide icons (local, no CDN).
 *
 *   <i data-iui-icon="map-pin"></i>                → inline SVG inside the <i> (inherits colour + font-size)
 *   <svg class="iui-icon"><use href="#i-map-pin"/></svg> → symbol injected on demand
 *
 * Names are Lucide kebab-case; common synonyms (rain, home, edit, chart…) resolve via ICON_ALIASES.
 * The runtime watches the DOM, so icons streamed in later (preview shell) or written by author JS paint too.
 * NOTE: the inline script below deliberately contains no backslashes (template-literal safety).
 */
import { ICON_PATHS } from './icon-sprite.ts'

export const ICON_ALIASES: Readonly<Record<string, string>> = {
  sunny: 'sun', clear: 'sun', cloudy: 'cloud', overcast: 'cloud', 'partly-cloudy': 'cloud-sun', 'cloud-sun-rain': 'cloud-rain',
  rain: 'cloud-rain', rainy: 'cloud-rain', drizzle: 'cloud-rain', shower: 'cloud-rain', storm: 'cloud-rain', snow: 'snowflake',
  humidity: 'droplets', droplet: 'droplets', temperature: 'thermometer', temp: 'thermometer', night: 'moon',
  home: 'house', location: 'map-pin', pin: 'map-pin', place: 'map-pin', marker: 'map-pin', directions: 'navigation',
  time: 'clock', date: 'calendar', schedule: 'calendar', stopwatch: 'timer', train: 'train-front', subway: 'train-front', metro: 'train-front',
  food: 'utensils', restaurant: 'utensils', dining: 'utensils', cafe: 'coffee', shop: 'store', shopping: 'shopping-bag', bag: 'shopping-bag',
  cart: 'shopping-cart', photo: 'camera', picture: 'image', museum: 'landmark', hiking: 'footprints', walk: 'footprints', walking: 'footprints',
  bed: 'bed-double', hostel: 'hotel', parking: 'square-parking', gas: 'fuel', 'gas-station': 'fuel', flight: 'plane', airplane: 'plane',
  boat: 'ship', ferry: 'ship', bicycle: 'bike', taxi: 'car', drive: 'car', beach: 'waves', sea: 'waves', forest: 'tree-pine', tree: 'tree-pine',
  close: 'x', cancel: 'x', remove: 'minus', add: 'plus', ok: 'check', done: 'check', edit: 'pencil', delete: 'trash-2', trash: 'trash-2',
  share: 'share-2', refresh: 'refresh-cw', reload: 'refresh-cw', replay: 'rotate-ccw', undo: 'rotate-ccw', view: 'eye', like: 'heart',
  favorite: 'heart', favourite: 'heart', rating: 'star', save: 'bookmark', external: 'external-link', 'link-external': 'external-link',
  warning: 'triangle-alert', 'alert-triangle': 'triangle-alert', alert: 'triangle-alert', error: 'circle-x', 'x-circle': 'circle-x',
  success: 'circle-check', 'check-circle': 'circle-check', 'check-circle-2': 'circle-check', 'circle-check-big': 'circle-check',
  idea: 'lightbulb', tip: 'lightbulb', magic: 'sparkles', ai: 'sparkles', energy: 'zap', fast: 'zap', hot: 'flame', trending: 'trending-up',
  eco: 'leaf', person: 'user', profile: 'user', account: 'user', team: 'users', people: 'users', group: 'users', building: 'building-2',
  office: 'building-2', company: 'building-2', call: 'phone', email: 'mail', message: 'message-circle', chat: 'message-circle',
  notification: 'bell', lock: 'lock', secure: 'lock', web: 'globe', world: 'globe', language: 'globe', network: 'wifi',
  chart: 'chart-column', 'bar-chart': 'chart-column', 'bar-chart-2': 'chart-column', 'bar-chart-3': 'chart-column', 'chart-bar': 'chart-column',
  'line-chart': 'chart-line', 'pie-chart': 'chart-pie', analytics: 'chart-line', speed: 'gauge', dashboard: 'gauge', pulse: 'activity',
  money: 'wallet', payment: 'credit-card', card: 'credit-card', savings: 'piggy-bank', bill: 'receipt', invoice: 'receipt', discount: 'percent',
  price: 'tag', label: 'tag', present: 'gift', box: 'package', delivery: 'truck', shipping: 'truck', menu: 'list', grid: 'layout-grid',
  apps: 'layout-grid', file: 'file-text', document: 'file-text', doc: 'file-text', book: 'book-open', read: 'book-open', education: 'graduation-cap',
  school: 'graduation-cap', work: 'briefcase', job: 'briefcase', chip: 'cpu', storage: 'hard-drive', power: 'battery', audio: 'music',
  camera_video: 'video', microphone: 'mic', game: 'gamepad-2', gaming: 'gamepad-2', gym: 'dumbbell', fitness: 'dumbbell', medicine: 'pill',
  health: 'stethoscope', doctor: 'stethoscope', kid: 'baby', child: 'baby', pet: 'dog', settings: 'settings', gear: 'settings', cog: 'settings',
  info: 'info', help: 'info', goal: 'target', award: 'award', prize: 'trophy', next: 'chevron-right', prev: 'chevron-left', back: 'chevron-left',
  forward: 'chevron-right', expand: 'chevron-down', collapse: 'chevron-up', go: 'arrow-right', send: 'send', play: 'play', pause: 'pause',
}

/** Normalise an author-written icon name to a sprite key (or undefined). */
export function resolveIconName(raw: string): string | undefined {
  const n = String(raw || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^(?:lucide-|lu-|i-|icon-)/, '')
    .replace(/[\s_]+/g, '-')
  if (ICON_PATHS[n]) return n
  const a = ICON_ALIASES[n]
  return a && ICON_PATHS[a] ? a : undefined
}

/** True when a page (or a streaming shell that may still receive markup) should carry the icon runtime. */
export function pageWantsIcons(source: string, streaming: boolean): boolean {
  return streaming || /data-iui-icon|#i-[a-z]|iui-icon/.test(source)
}

export function buildIconRuntimeScript(): string {
  // Single-quoted attributes → JSON without escapes inside the inline script.
  const paths: Record<string, string> = {}
  for (const [k, v] of Object.entries(ICON_PATHS)) paths[k] = v.replace(/"/g, "'")
  const P = JSON.stringify(paths)
  const A = JSON.stringify(ICON_ALIASES)
  return `<script>
(function () {
  if (window.__iuiIcons) return;
  var P = ${P};
  var A = ${A};
  window.__iuiIcons = { names: Object.keys(P) };
  var NS = 'http://www.w3.org/2000/svg';
  function key(raw) {
    var n = String(raw || '').trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/^(lucide-|lu-|i-|icon-)/, '').split('_').join('-').split(' ').join('-');
    if (P[n]) return n;
    return A[n] && P[A[n]] ? A[n] : null;
  }
  var ATTRS = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  function paint(el) {
    var raw = el.getAttribute('data-iui-icon');
    if (el.__iuiIcon === raw && el.querySelector('svg')) return;
    el.__iuiIcon = raw;
    var n = key(raw);
    if (!n) { el.setAttribute('data-iui-icon-missing', ''); return; }
    el.removeAttribute('data-iui-icon-missing');
    el.innerHTML = '<svg class="iui-icon"' + ATTRS + ' aria-hidden="true" focusable="false">' + P[n] + '</svg>';
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('role')) el.setAttribute('aria-hidden', 'true');
  }
  var sprite = null;
  function symbol(n) {
    if (document.getElementById('i-' + n)) return;
    if (!sprite) {
      sprite = document.createElementNS(NS, 'svg');
      sprite.setAttribute('id', 'iui-icon-sprite');
      sprite.setAttribute('aria-hidden', 'true');
      sprite.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      document.documentElement.appendChild(sprite);
    }
    var s = document.createElementNS(NS, 'symbol');
    s.setAttribute('id', 'i-' + n);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = P[n];
    sprite.appendChild(s);
  }
  function scan() {
    try {
      var els = document.querySelectorAll('[data-iui-icon]');
      for (var i = 0; i < els.length && i < 600; i++) paint(els[i]);
      var uses = document.querySelectorAll('use');
      for (var j = 0; j < uses.length && j < 600; j++) {
        var h = uses[j].getAttribute('href') || uses[j].getAttribute('xlink:href') || '';
        if (h.indexOf('#i-') !== 0) continue;
        var n = key(h.slice(3));
        if (!n) continue;
        symbol(n);
        if (n !== h.slice(3)) uses[j].setAttribute('href', '#i-' + n);
      }
    } catch (e) {}
  }
  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; scan(); });
  }
  function boot() {
    scan();
    try {
      new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-iui-icon', 'href'] });
    } catch (e) {}
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
<\/script>`
}
