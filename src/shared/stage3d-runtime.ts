/**
 * R5-3 host 3D stage (inline in iui-html pages that use it; zero author boilerplate).
 *
 *   <div data-iui-3d='{"model":"polyhaven:ArmChair_01","hotspots":[{"id":"seat","label":"坐垫","at":[0,0.1,0.5]}]}'>
 *     <h2 data-iui-3d-layer="back">ARMCHAIR</h2>          ← giant type behind the model
 *   </div>
 *
 * Model: https URL (GLB / glTF, Draco + Meshopt ok), `polyhaven:<id>` or `khronos:<Name>` (CC0 ids
 * from the find_3d_models tool); no model → a primitive `shape`. The host does the rest: room
 * environment + key/fill/rim lights, soft shadow (or plinth), auto framing by projected vertices,
 * damped orbit (horizontal swipe rotates, vertical swipe scrolls the chat, Ctrl+wheel zooms),
 * hotspots that fly the camera, animation clips, cursor look (tilt / drift on touch), text layers,
 * toolbar, keyboard (arrows / + - / Home), loading progress, fallback shape on failure, render
 * only while visible, dispose when removed. `iuiStage3d(el, opts)` → Promise<stage> for scripts;
 * `iui3d:ready` / `iui3d:hotspot` events bubble from the element.
 * Source deliberately has no backslashes or template placeholders (embedded in a template literal).
 */

import { KHRONOS_ASSETS_CDN, VENDOR_CDN_HOSTS, VENDOR_CDN_PREFIX, getVendorSource, vendorBaseOrigin } from './vendor-registry.ts'
import { CSS_COLOR_RESOLVER_SRC } from '../themes/iui-daisy.ts'
import { BUNDLED_MODELS, BUNDLED_MODELS_DIR } from './model-catalog.ts'
import { IUI_VERSION } from './version.ts'

/** Pinned commit of KhronosGroup/glTF-Sample-Assets (immutable URLs, jsDelivr-cacheable). */
export const KHRONOS_SAMPLE_COMMIT = '15cd02d304e54cb42a4db4eefe719f76190f4b68'

/** Hosts the stage fetches models from (sandbox connect-src). jsDelivr is already a CDN origin. */
export const MODEL_CONNECT_ORIGINS: readonly string[] = [
  'https://api.polyhaven.com',
  'https://dl.polyhaven.org',
  'https://raw.githubusercontent.com',
  'https://media.githubusercontent.com',
]

export const STAGE3D_SHAPES = ['torusKnot', 'sphere', 'box', 'icosahedron', 'torus', 'cone', 'cylinder', 'capsule'] as const

export type ModelRef =
  | { kind: 'polyhaven'; id: string }
  | { kind: 'khronos'; id: string; urls: string[] }
  | { kind: 'url'; url: string }

/** Same parsing as the in-frame resolver (kept in sync by tests). */
export function parseModelRef(ref: string): ModelRef | null {
  const s = String(ref ?? '').trim()
  let m = /^polyhaven:([A-Za-z0-9_-]{1,80})$/.exec(s)
  if (m) return { kind: 'polyhaven', id: m[1]! }
  m = /^khronos:([A-Za-z0-9_-]{1,80})$/.exec(s)
  if (m) {
    const path = `/Models/${m[1]}/glTF-Binary/${m[1]}.glb`
    return {
      kind: 'khronos',
      id: m[1]!,
      urls: [
        `${KHRONOS_ASSETS_CDN}${KHRONOS_SAMPLE_COMMIT}${path}`,
        `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${KHRONOS_SAMPLE_COMMIT}${path}`,
      ],
    }
  }
  if (/^(?:https:|blob:|data:)/i.test(s) || /^[./]/.test(s)) return { kind: 'url', url: s }
  return null
}

/** True when a page (or a streaming shell that may still receive markup) should carry the stage runtime. */
export function pageWants3d(source: string, streaming: boolean): boolean {
  return streaming || /data-iui-3d(?!-)|iuiStage3d/.test(source)
}

/** R5-3b: published copy of the bundled models (same files as the plugin's asset route). */
export const BUNDLED_MODEL_NPM = '@losebird/iui'

/**
 * Ordered folders (ending in `/`) the stage tries for a bundled model: the plugin's own asset
 * route first (same machine, works offline / behind the GFW), then the published npm package on
 * npmmirror and jsDelivr (jsDelivr first for the `global` CDN preset).
 */
export function bundledModelBases(assetBase?: string): string[] {
  const local = assetBase ? `${assetBase.replace(/\/+$/, '')}/vendor/${BUNDLED_MODELS_DIR}/` : null
  const file = `lib/assets/vendor/${BUNDLED_MODELS_DIR}/`
  const npmm = `${VENDOR_CDN_PREFIX.npmmirror}${BUNDLED_MODEL_NPM}/${IUI_VERSION}/files/${file}`
  const jsd = `${VENDOR_CDN_PREFIX.jsdelivr}${BUNDLED_MODEL_NPM}@${IUI_VERSION}/${file}`
  const mirrors = getVendorSource().preset === 'global' ? [jsd, npmm] : [npmm, jsd]
  return local ? [local, ...mirrors] : mirrors
}

export interface Stage3dRuntimeOptions {
  /** Plugin asset route (bundled models + the `/proxy` for hosts outside connect-src). */
  assetBase?: string | undefined
  /** Abort a model download after this long without new bytes (default 15 s). */
  stallMs?: number
  /** Abort a model download after this long in total (default 90 s). */
  totalMs?: number
}

/** Config object the in-frame runtime reads (exported for tests). */
export function stage3dRuntimeConfig(opts: Stage3dRuntimeOptions = {}): { bundled: Record<string, string>; bases: string[]; proxy: string; direct: string[]; stallMs: number; totalMs: number } {
  const local = vendorBaseOrigin(opts.assetBase)
  const direct = [...new Set([...MODEL_CONNECT_ORIGINS, ...VENDOR_CDN_HOSTS.map((h) => `https://${h}`), ...(local ? [local] : [])])]
  return {
    bundled: Object.fromEntries(BUNDLED_MODELS.map((b) => [b.ref.toLowerCase(), b.file])),
    bases: bundledModelBases(opts.assetBase),
    proxy: local && opts.assetBase ? `${opts.assetBase.replace(/\/+$/, '')}/proxy` : '',
    direct,
    stallMs: opts.stallMs ?? 15_000,
    totalMs: opts.totalMs ?? 90_000,
  }
}

export function buildStage3dRuntimeScript(opts: Stage3dRuntimeOptions = {}): string {
  const cfg = JSON.stringify(stage3dRuntimeConfig(opts)).replace(/</g, '\\u003c')
  return `<script>
(function () {
  if (window.iuiStage3d) return;
  var CFG = ${cfg};
  var KHR = '${KHRONOS_SAMPLE_COMMIT}';
  var KHR_CDN = '${KHRONOS_ASSETS_CDN}';
  var ZH = /^zh/i.test(document.documentElement.lang || navigator.language || '');
  var T = ZH
    ? { loading: '3D 模型加载中…', failed: '3D 模型加载失败', fallback: '已显示示意形状', pause: '暂停旋转', play: '自动旋转', reset: '重置视角', wheel: '按住 Ctrl 再滚动可缩放', canvas: '3D 模型：拖动或方向键旋转，+ / - 缩放', model: '模型' }
    : { loading: 'Loading 3D model…', failed: '3D model failed to load', fallback: 'showing a placeholder shape', pause: 'Pause rotation', play: 'Auto-rotate', reset: 'Reset view', wheel: 'Hold Ctrl and scroll to zoom', canvas: '3D model: drag or use arrow keys to rotate, + / - to zoom', model: 'Model' };
  var SHAPES = ['torusKnot', 'sphere', 'box', 'icosahedron', 'torus', 'cone', 'cylinder', 'capsule'];
  function reduce() {
    try { return window.__iuiReducedMotion ? window.__iuiReducedMotion() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function css() {
    if (document.getElementById('iui-3d-css')) return;
    var s = document.createElement('style');
    s.id = 'iui-3d-css';
    s.textContent = [
      ':where(.iui-3d-stage){position:relative;display:block;width:100%;aspect-ratio:4/3;min-height:240px;max-height:460px;border-radius:var(--border-radius-xl,16px);overflow:hidden;isolation:isolate;background:radial-gradient(120% 90% at 50% 20%,var(--color-background-primary),var(--color-background-tertiary,var(--color-background-secondary)));border:0.5px solid var(--color-border-tertiary)}',
      '.iui-3d-stage>canvas.iui-3d-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;z-index:1;touch-action:pan-y;outline:none}',
      '.iui-3d-stage>canvas.iui-3d-canvas:focus-visible{box-shadow:inset 0 0 0 2px var(--accent-fill,#185FA5)}',
      '.iui-3d-stage>[data-iui-3d-layer]{position:absolute;inset:0;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none}',
      '.iui-3d-stage>[data-iui-3d-layer=back]{z-index:0}.iui-3d-stage>[data-iui-3d-layer=front]{z-index:2}',
      '.iui-3d-stage [data-iui-3d-layer] a,.iui-3d-stage [data-iui-3d-layer] button{pointer-events:auto}',
      '.iui-3d-pins{position:absolute;inset:0;z-index:3;pointer-events:none}',
      '.iui-3d-pin{position:absolute;left:0;top:0;pointer-events:auto;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 12px 4px 4px;border:0;border-radius:999px;background:color-mix(in srgb,var(--color-background-primary) 88%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.18);color:var(--color-text-primary);font:inherit;font-size:var(--fs-xs,12px);line-height:1.2;white-space:nowrap;cursor:pointer;transition:opacity .2s ease;will-change:transform}',
      '.iui-3d-pin>b{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--accent-fill,#185FA5);color:#fff;font-weight:600;font-size:12px}',
      '.iui-3d-pin.is-hidden-side{opacity:.4}.iui-3d-pin[aria-pressed=true]{box-shadow:0 0 0 2px var(--accent-fill,#185FA5),0 2px 10px rgba(0,0,0,.18)}.iui-3d-pin[hidden]{display:none}',
      '.iui-3d-tools{position:absolute;right:10px;bottom:10px;z-index:4;display:flex;gap:6px}',
      '.iui-3d-tools>button{width:32px;height:32px;min-height:32px;min-width:32px;padding:0;border-radius:999px;display:grid;place-items:center;border:0.5px solid var(--color-border-tertiary);background:color-mix(in srgb,var(--color-background-primary) 88%,transparent);color:var(--color-text-primary);cursor:pointer}',
      '.iui-3d-tools svg{width:16px;height:16px}',
      '.iui-3d-status{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;padding:16px;text-align:center;font-size:var(--fs-xs,12px);color:var(--color-text-secondary);pointer-events:none;transition:opacity .25s ease}',
      '.iui-3d-status::before{content:"";width:28px;height:28px;border-radius:50%;border:3px solid var(--color-border-tertiary);border-top-color:var(--accent-fill,#185FA5);animation:iuiSpin .9s linear infinite}',
      '.iui-3d-stage[data-iui-3d-ready]>.iui-3d-status{opacity:0}.iui-3d-stage[data-iui-3d-error]>.iui-3d-status::before{display:none}',
      '.iui-3d-stage[data-iui-3d-error][data-iui-3d-ready]>.iui-3d-status{opacity:1;inset:auto 0 auto 0;top:10px;height:auto}',
      '.iui-3d-caption{position:absolute;left:12px;top:12px;z-index:4;max-width:min(62%,320px);padding:10px 12px;border-radius:var(--border-radius-lg,12px);background:color-mix(in srgb,var(--color-background-primary) 90%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.14);font-size:var(--fs-sm,13px);color:var(--color-text-primary)}',
      '.iui-3d-caption[hidden]{display:none}.iui-3d-caption>strong{display:block;margin-bottom:2px}',
      '.iui-3d-credit{position:absolute;left:10px;bottom:8px;z-index:4;font-size:11px;color:var(--color-text-secondary);opacity:.8;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.iui-3d-credit a{color:inherit}',
      '.iui-3d-hint{position:absolute;left:50%;bottom:52px;z-index:4;transform:translateX(-50%);padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font-size:12px;pointer-events:none;opacity:0;transition:opacity .2s ease}',
      '.iui-3d-hint.on{opacity:1}',
      '@keyframes iuiSpin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion: reduce){.iui-3d-status::before{animation:none}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }
  var ICON = {
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
  };
  function readOpts(el, given) {
    var o = {};
    var raw = el.getAttribute('data-iui-3d');
    if (raw && raw.trim()) {
      var t = raw.trim();
      if (t.charAt(0) === '{') { try { o = JSON.parse(t) || {}; } catch (e) { o = { __bad: String(e && e.message || e) }; } }
      else if (t !== '1' && t !== 'true') o = SHAPES.indexOf(t) >= 0 ? { shape: t } : { model: t };
    }
    if (given && typeof given === 'object') for (var k in given) if (Object.prototype.hasOwnProperty.call(given, k)) o[k] = given[k];
    return o;
  }
  function threeRoot() {
    try {
      var m = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports || {};
      return m['three/'] || '';
    } catch (e) { return ''; }
  }
  function creditFor(s) {
    var m = /^(polyhaven|khronos):([A-Za-z0-9_-]{1,80})$/.exec(s);
    if (!m) return null;
    return m[1] === 'polyhaven'
      ? { name: m[2], by: 'Poly Haven', license: 'CC0', href: 'https://polyhaven.com/a/' + m[2] }
      : { name: m[2], by: 'Khronos glTF Sample Assets', license: 'CC0', href: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/' + m[2] };
  }
  // Hosts outside the frame's connect-src go through the plugin's same-origin model proxy.
  function route(u) {
    if (!CFG.proxy || !/^https?:/i.test(u)) return u;
    try { if (CFG.direct.indexOf(new URL(u).origin) >= 0) return u; } catch (e) { return u; }
    return CFG.proxy + '?kind=model&u=' + encodeURIComponent(u);
  }
  // Remote candidates (Poly Haven needs its files API to find the 1k glTF + textures).
  async function resolveModel(ref) {
    var s = String(ref || '').trim();
    var m = /^polyhaven:([A-Za-z0-9_-]{1,80})$/.exec(s);
    if (m) {
      var id = m[1];
      var r = await fetchBuf(route('https://api.polyhaven.com/files/' + encodeURIComponent(id)), null);
      var j = JSON.parse(new TextDecoder().decode(r));
      var res = j && j.gltf ? (j.gltf['1k'] || j.gltf['2k'] || j.gltf[Object.keys(j.gltf)[0]]) : null;
      var g = res && res.gltf;
      if (!g || !g.url) throw new Error('Poly Haven: no glTF for ' + id);
      var base = g.url.slice(0, g.url.lastIndexOf('/') + 1), map = {};
      Object.keys(g.include || {}).forEach(function (k) { if (g.include[k] && g.include[k].url) map[base + k] = g.include[k].url; });
      return { urls: [g.url], modifier: function (u) { return map[u] || u; } };
    }
    m = /^khronos:([A-Za-z0-9_-]{1,80})$/.exec(s);
    if (m) {
      var n = m[1], path = '/Models/' + n + '/glTF-Binary/' + n + '.glb';
      return { urls: [KHR_CDN + KHR + path, 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/' + KHR + path] };
    }
    if (!/^(https:|blob:|data:)/i.test(s) && !/^[./]/.test(s)) throw new Error('model must be https URL, polyhaven:ID or khronos:Name');
    return { urls: [s] };
  }
  // Download with a stall timer (no new bytes) and an overall cap, reporting progress.
  async function fetchBuf(url, onProg) {
    var ctl = new AbortController(), why = '', stall = 0;
    function arm() { clearTimeout(stall); stall = setTimeout(function () { why = 'stalled'; ctl.abort(); }, CFG.stallMs); }
    var total = setTimeout(function () { why = 'timeout'; ctl.abort(); }, CFG.totalMs);
    arm();
    try {
      var r = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var len = Number(r.headers.get('content-length')) || 0;
      if (!r.body || !r.body.getReader) return await r.arrayBuffer();
      var rd = r.body.getReader(), chunks = [], got = 0;
      for (;;) {
        var x = await rd.read();
        if (x.done) break;
        arm();
        chunks.push(x.value); got += x.value.byteLength;
        if (onProg) onProg(got, len);
      }
      var out = new Uint8Array(got), off = 0;
      for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].byteLength; }
      return out.buffer;
    } catch (e) {
      throw why ? new Error(why + ' · ' + String(url).slice(0, 80)) : e;
    } finally { clearTimeout(stall); clearTimeout(total); }
  }
  ${CSS_COLOR_RESOLVER_SRC}
  function cssColor(THREE, v, fb) {
    try {
      var s = String(v || '').trim();
      if (/^--/.test(s)) s = getComputedStyle(document.documentElement).getPropertyValue(s).trim();
      if (!s) return new THREE.Color(fb);
      var c = __iuiCssColor(s);
      if (/^#[0-9a-f]{6}$/i.test(c)) return new THREE.Color().setStyle(c, THREE.SRGBColorSpace);
      var mm = /rgba?[(]([0-9.]+)[, ]+([0-9.]+)[, ]+([0-9.]+)/.exec(c);
      if (mm) return new THREE.Color().setRGB(mm[1] / 255, mm[2] / 255, mm[3] / 255, THREE.SRGBColorSpace);
      return new THREE.Color(s);
    } catch (e) { return new THREE.Color(fb); }
  }
  function shapeGeometry(THREE, name) {
    switch (name) {
      case 'sphere': return new THREE.SphereGeometry(1, 64, 48);
      case 'box': return new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4);
      case 'icosahedron': return new THREE.IcosahedronGeometry(1.1, 0);
      case 'torus': return new THREE.TorusGeometry(0.9, 0.34, 48, 160);
      case 'cone': return new THREE.ConeGeometry(0.9, 1.8, 64);
      case 'cylinder': return new THREE.CylinderGeometry(0.8, 0.8, 1.6, 64);
      case 'capsule': return new THREE.CapsuleGeometry(0.6, 1, 12, 48);
      default: return new THREE.TorusKnotGeometry(0.8, 0.28, 220, 32);
    }
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function deg(v, d) { var n = Number(v); return (isFinite(n) ? n : d) * Math.PI / 180; }

  async function mount(el, given) {
    css();
    var o = readOpts(el, given);
    el.classList.add('iui-3d-stage');
    el.removeAttribute('data-iui-3d-error');
    var status = document.createElement('div');
    status.className = 'iui-3d-status';
    status.setAttribute('role', 'status');
    status.textContent = T.loading;
    el.appendChild(status);
    var stage = { el: el, options: o, error: null, clips: [], hotspots: [] };
    var still = reduce();
    // visual(③ ⑤): look presets — clay (default: matte, warm soft light), toon (3-step shading +
    // outline), data (neutral, quiet), studio (the old glossy accent look).
    var preset = ['clay', 'toon', 'data', 'studio'].indexOf(o.look) >= 0 ? o.look : 'clay';
    stage.look = preset;
    var THREE, OC, mods, outlineIdx = -1;
    try {
      var want = [import('three'), import('three/addons/controls/OrbitControls.js'), o.env === 'none' ? null : import('three/addons/environments/RoomEnvironment.js')];
      if (o.model) want.push(import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'), import('three/addons/libs/meshopt_decoder.module.js'));
      if (preset === 'toon') { outlineIdx = want.length; want.push(import('three/addons/effects/OutlineEffect.js').catch(function () { return null; })); }
      mods = await Promise.all(want);
      THREE = mods[0];
      OC = mods[1].OrbitControls;
    } catch (e) {
      el.setAttribute('data-iui-3d-error', '1');
      status.textContent = T.failed + ' · ' + (e && e.message ? e.message : e);
      stage.error = e;
      return stage;
    }
    var w = el.clientWidth || 480, h = el.clientHeight || 360;
    var small = w < 480;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = preset === 'toon' ? THREE.NoToneMapping : (preset === 'studio' ? THREE.ACESFilmicToneMapping : (THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping));
    renderer.toneMappingExposure = Number(o.exposure) > 0 ? Number(o.exposure) : 1;
    var shadows = o.shadow !== false && o.ground !== 'none';
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var cv = renderer.domElement;
    cv.className = 'iui-3d-canvas';
    cv.setAttribute('tabindex', '0');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', o.label ? String(o.label) + ' · ' + T.canvas : T.canvas);
    el.insertBefore(cv, el.firstChild);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(Number(o.fov) > 0 ? Number(o.fov) : 35, w / h, 0.01, 100);
    if (mods[2] && mods[2].RoomEnvironment) {
      try {
        var pm = new THREE.PMREMGenerator(renderer);
        scene.environment = pm.fromScene(new mods[2].RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = preset === 'clay' ? 0.55 : (preset === 'data' ? 0.5 : (preset === 'toon' ? 0.2 : 0.75));
        pm.dispose();
      } catch (eEnv) {}
    }
    var LP = {
      clay: { sky: 0xffffff, gnd: 0xd8d2c8, hemi: 0.6, key: 2.2, keyColor: 0xfff4e8, pos: [3, 7, 4], fill: 0.25, rim: 0.5, ground: 0.18 },
      data: { sky: 0xffffff, gnd: 0xeeeeee, hemi: 0.7, key: 1.8, keyColor: 0xffffff, pos: [-3, 8, 5], fill: 0.2, rim: 0.3, ground: 0.12 },
      toon: { sky: 0xffffff, gnd: 0xffffff, hemi: 0.7, key: 1.6, keyColor: 0xffffff, pos: [-5, 6, 2], fill: 0, rim: 0, ground: 0.06 },
      studio: { sky: 0xffffff, gnd: 0x8a8070, hemi: scene.environment ? 0.35 : 0.6, key: 2.2, keyColor: 0xffffff, pos: [4, 6, 3], fill: 0.6, rim: 1.1, ground: 0.22 }
    }[preset];
    scene.add(new THREE.HemisphereLight(LP.sky, LP.gnd, LP.hemi));
    var key = new THREE.DirectionalLight(LP.keyColor, LP.key);
    key.position.set(LP.pos[0], LP.pos[1], LP.pos[2]);
    key.castShadow = shadows;
    key.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
    key.shadow.radius = preset === 'toon' ? 1 : 4;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    var sc = key.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 0.5; sc.far = 20;
    var fill = new THREE.DirectionalLight(preset === 'studio' ? 0xdbe8ff : 0xffffff, LP.fill); fill.position.set(-5, 2.5, 2);
    var rim = new THREE.DirectionalLight(0xffffff, LP.rim); rim.position.set(-2, 4, -5);
    scene.add(key, fill, rim);

    // Subject: GLB / glTF model, or a primitive shape. Normalised to a 2-unit box sitting on y=0.
    var pivot = new THREE.Group();
    scene.add(pivot);
    var subject = null, gltf = null, credit = null;
    var accent = preset === 'studio' ? cssColor(THREE, o.color || '--accent-fill', 0x185FA5)
      : preset === 'toon' ? cssColor(THREE, o.color || '--iui-chart-3', 0x2563eb)
      : preset === 'data' ? (o.color ? cssColor(THREE, o.color, 0xd4d4d8) : new THREE.Color(0xd4d4d8))
      : (o.color ? cssColor(THREE, o.color, 0xd9cfc1) : new THREE.Color(0xd9cfc1));
    var toonRamp = null;
    function ramp() {
      if (toonRamp) return toonRamp;
      toonRamp = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
      toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
      toonRamp.needsUpdate = true;
      return toonRamp;
    }
    function makeShape(failed) {
      var flat = o.shape === 'icosahedron';
      var mat = failed ? new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9aa3ad), roughness: 0.6, metalness: 0, flatShading: flat })
        : preset === 'toon' ? new THREE.MeshToonMaterial({ color: accent, gradientMap: ramp() })
        : preset === 'clay' ? new THREE.MeshStandardMaterial({ color: accent, roughness: 0.92, metalness: 0, flatShading: flat })
        : preset === 'data' ? new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0, flatShading: flat })
        : new THREE.MeshStandardMaterial({ color: accent, roughness: 0.32, metalness: 0.18, flatShading: flat });
      return new THREE.Mesh(shapeGeometry(THREE, o.shape), mat);
    }
    if (o.model) {
      try {
        var spec = String(o.model).trim(), mkey = spec.toLowerCase();
        credit = o.credit === false ? null : (typeof o.credit === 'string' ? { text: o.credit } : creditFor(spec));
        var mapFn = null;
        var manager = new THREE.LoadingManager();
        manager.setURLModifier(function (u) { return route(mapFn ? mapFn(u) : u); });
        var loader = new mods[3].GLTFLoader(manager);
        try {
          var root = threeRoot();
          if (root) { var dl = new mods[4].DRACOLoader(); dl.setDecoderPath(root + 'examples/jsm/libs/draco/gltf/'); loader.setDRACOLoader(dl); }
          if (mods[5] && mods[5].MeshoptDecoder) loader.setMeshoptDecoder(mods[5].MeshoptDecoder);
        } catch (eDec) {}
        var onProg = function (got, len) {
          status.textContent = T.loading + (len ? ' ' + Math.min(100, Math.round(got / len * 100)) + '%' : ' ' + (got / 1048576).toFixed(1) + ' MB');
        };
        var tryUrl = async function (u) {
          var buf = await fetchBuf(route(u), onProg);
          var dir = /^https?:/i.test(u) ? u.slice(0, u.split(/[?#]/)[0].lastIndexOf('/') + 1) : '';
          return await new Promise(function (res, rej) { loader.parse(buf, dir, res, rej); });
        };
        // Order: offline-export inline copy → bundled copy (plugin route, npm mirrors) → original host.
        var cands = [], inl = window.__iuiModelInline || {};
        if (inl[spec] || inl[mkey]) cands.push(inl[spec] || inl[mkey]);
        var bfile = CFG.bundled[mkey];
        if (bfile) CFG.bases.forEach(function (b) { cands.push(b + bfile); });
        var lastErr = null;
        for (var ci = 0; ci < cands.length && !gltf; ci++) {
          try { gltf = await tryUrl(cands[ci]); stage.source = ci === 0 && cands[0].indexOf('data:') === 0 ? 'inline' : 'bundled'; } catch (eB) { lastErr = eB; }
        }
        if (!gltf) {
          var ref = await resolveModel(spec);
          mapFn = ref.modifier || null;
          for (var ui = 0; ui < ref.urls.length && !gltf; ui++) {
            try { gltf = await tryUrl(ref.urls[ui]); stage.source = 'remote'; } catch (eL) { lastErr = eL; }
          }
        }
        if (!gltf) throw lastErr || new Error('load failed');
        subject = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      } catch (eM) {
        stage.error = eM;
        subject = null;
      }
    }
    if (!subject) subject = makeShape(!!stage.error);
    subject.traverse(function (m) {
      if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = false; if (m.material && 'envMapIntensity' in m.material && !scene.environment) m.material.envMapIntensity = 1; }
      // toon: loaded models keep their colours / textures on the 3-step ramp.
      if (m.isMesh && gltf && preset === 'toon' && m.material && !Array.isArray(m.material) && !m.material.isMeshToonMaterial) {
        var om = m.material;
        m.material = new THREE.MeshToonMaterial({ color: om.color || 0xffffff, map: om.map || null, gradientMap: ramp(), transparent: !!om.transparent, opacity: om.opacity == null ? 1 : om.opacity, side: om.side });
        try { om.dispose(); } catch (eOm) {}
      }
    });
    var holder = new THREE.Group();
    holder.add(subject);
    if (o.rotate && o.rotate.length === 3) subject.rotation.set(deg(o.rotate[0], 0), deg(o.rotate[1], 0), deg(o.rotate[2], 0));
    holder.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(holder);
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 1;
    var s = 2 / maxDim;
    holder.scale.setScalar(s);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    var ctr = box.getCenter(new THREE.Vector3());
    var lift = 0;
    var ground = o.ground === 'none' ? 'none' : (o.ground === 'plinth' ? 'plinth' : 'shadow');
    if (ground === 'plinth') {
      var plinthColor = cssColor(THREE, '--color-background-secondary', 0xd9d4ca);
      var pl = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.65, 0.22, 72), new THREE.MeshStandardMaterial({ color: plinthColor, roughness: 0.85 }));
      pl.position.y = 0.11; pl.receiveShadow = true; pl.castShadow = shadows;
      pivot.add(pl);
      lift = 0.22;
    }
    holder.position.set(-ctr.x, -box.min.y + lift, -ctr.z);
    pivot.add(holder);
    if (ground !== 'none') {
      var gr = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.ShadowMaterial({ opacity: LP.ground }));
      gr.material.userData.outlineParameters = { visible: false };
      gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true;
      scene.add(gr);
    }
    var outline = null;
    if (outlineIdx >= 0 && mods[outlineIdx] && mods[outlineIdx].OutlineEffect) {
      try { outline = new mods[outlineIdx].OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0.09, 0.09, 0.11] }); } catch (eOut) { outline = null; }
    }
    function draw() { if (outline) outline.render(scene, camera); else renderer.render(scene, camera); }
    pivot.updateMatrixWorld(true);
    var mbox = new THREE.Box3().setFromObject(holder);
    var center = mbox.getCenter(new THREE.Vector3());
    var half = mbox.getSize(new THREE.Vector3()).multiplyScalar(0.5);

    // Camera fit: project sampled vertices so the silhouette fills the fill fraction of the frame (boxes are too loose).
    var pts = [];
    pivot.traverse(function (m) {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) return;
      if (m.isSkinnedMesh) {
        var b = new THREE.Box3().setFromObject(m);
        for (var bi = 0; bi < 8; bi++) pts.push(new THREE.Vector3(bi & 1 ? b.max.x : b.min.x, bi & 2 ? b.max.y : b.min.y, bi & 4 ? b.max.z : b.min.z));
        return;
      }
      var a = m.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 1500));
      for (var i = 0; i < a.count && pts.length < 9000; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld));
    });
    var view = o.view && o.view.length >= 2 ? o.view : [35, 18];
    function dirOf(az, el2) {
      var a = deg(az, 35), e = deg(el2, 18);
      return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
    }
    var fillFrac = Number(o.fill) > 0.2 && Number(o.fill) <= 1 ? Number(o.fill) : 0.8;
    var home = { pos: new THREE.Vector3(), target: center.clone(), dist: 4 };
    function fit() {
      // Iterate: project the samples, re-aim at the silhouette's screen centre (perspective makes the box centre sit
      // off-centre), then dolly until the larger half-extent equals the fill fraction.
      var dir = dirOf(view[0], view[1]);
      var d = 4, p = new THREE.Vector3(), aim = center.clone();
      for (var k = 0; k < 6; k++) {
        camera.position.copy(aim).addScaledVector(dir, d);
        camera.lookAt(aim);
        camera.near = d / 100; camera.far = d * 30; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        var x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        for (var n = 0; n < pts.length; n++) {
          p.copy(pts[n]).project(camera);
          if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        }
        var ext = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
        if (!(ext > 0) || !isFinite(ext)) break;
        var az = p.copy(aim).project(camera).z;
        aim.copy(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, az).unproject(camera));
        d *= ext / fillFrac;
      }
      home.pos.copy(aim).addScaledVector(dir, d);
      home.target.copy(aim);
      home.dist = d;
    }
    fit();
    camera.position.copy(home.pos);
    camera.near = home.dist / 100; camera.far = home.dist * 30; camera.updateProjectionMatrix();

    var controls = new OC(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.target.copy(home.target);
    controls.minDistance = home.dist * 0.35;
    controls.maxDistance = home.dist * 2.5;
    if (ground !== 'none') controls.maxPolarAngle = Math.PI * 0.5;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    var look = o.cursor === 'look' || o.cursor === 'tilt';
    controls.autoRotate = !still && o.autoRotate !== false && !look;
    controls.autoRotateSpeed = Number(o.rotateSpeed) || 1.2;
    controls.update();
    cv.style.touchAction = 'pan-y';

    // Animation clips.
    var mixer = null, action = null;
    if (gltf && gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(subject);
      stage.clips = gltf.animations.map(function (c) { return c.name || ''; });
    }
    function play(name) {
      if (!mixer) return false;
      var clips = gltf.animations, c = null;
      if (typeof name === 'number') c = clips[name] || null;
      else if (typeof name === 'string' && name) { c = THREE.AnimationClip.findByName(clips, name); if (!c) for (var i = 0; i < clips.length; i++) if ((clips[i].name || '').toLowerCase().indexOf(name.toLowerCase()) >= 0) { c = clips[i]; break; } }
      else c = clips[0];
      if (!c) return false;
      if (action) action.fadeOut(0.3);
      action = mixer.clipAction(c);
      action.reset().fadeIn(0.3).play();
      return true;
    }
    function stop() { if (action) action.fadeOut(0.3); action = null; }
    if (mixer && o.animation !== false && !still) play(o.animation === true || o.animation == null ? 0 : o.animation);

    // Hotspots: at = [x,y,z] in -1..1 of the model box, or node = mesh/node name.
    var pinsBox = null, caption = null, active = null;
    var hs = Array.isArray(o.hotspots) ? o.hotspots.slice(0, 12) : [];
    function hotspotLocal(spec) {
      if (spec.node) {
        var nd = subject.getObjectByName(String(spec.node));
        if (!nd) { var want = String(spec.node).toLowerCase(); subject.traverse(function (x) { if (!nd && x.name && x.name.toLowerCase().indexOf(want) >= 0) nd = x; }); }
        if (nd) { var nb = new THREE.Box3().setFromObject(nd); if (!nb.isEmpty()) return { node: nd, local: nd.worldToLocal(nb.getCenter(new THREE.Vector3())) }; }
      }
      var at = spec.at && spec.at.length === 3 ? spec.at : [0, 0.6, 0.6];
      var wp = new THREE.Vector3(center.x + half.x * Number(at[0] || 0), center.y + half.y * Number(at[1] || 0), center.z + half.z * Number(at[2] || 0));
      return { node: pivot, local: pivot.worldToLocal(wp) };
    }
    if (hs.length) {
      pinsBox = document.createElement('div');
      pinsBox.className = 'iui-3d-pins';
      el.appendChild(pinsBox);
      caption = document.createElement('div');
      caption.className = 'iui-3d-caption';
      caption.setAttribute('aria-live', 'polite');
      caption.hidden = true;
      el.appendChild(caption);
      hs.forEach(function (spec, i) {
        var id = spec.id != null ? String(spec.id) : String(i + 1);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'iui-3d-pin';
        b.setAttribute('data-id', id);
        b.setAttribute('aria-pressed', 'false');
        var num = document.createElement('b');
        num.textContent = String(i + 1);
        b.appendChild(num);
        if (spec.label) b.appendChild(document.createTextNode(String(spec.label)));
        else b.setAttribute('aria-label', id);
        b.addEventListener('click', function () { focus(id); });
        pinsBox.appendChild(b);
        var loc = hotspotLocal(spec);
        stage.hotspots.push({ id: id, spec: spec, el: b, node: loc.node, local: loc.local, world: new THREE.Vector3(), index: i });
      });
    }
    var fly = null;
    function flyTo(pos, target, ms) {
      if (still || ms === 0) { camera.position.copy(pos); controls.target.copy(target); controls.update(); fly = null; return; }
      fly = { t0: performance.now(), ms: ms || 900, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos.clone(), q1: target.clone() };
    }
    function findSpot(id) { for (var i = 0; i < stage.hotspots.length; i++) if (stage.hotspots[i].id === String(id)) return stage.hotspots[i]; return null; }
    function focus(id) {
      var hsp = findSpot(id);
      if (!hsp) return false;
      controls.autoRotate = false; syncTools();
      hsp.node.updateMatrixWorld(true);
      var pt = hsp.node.localToWorld(hsp.local.clone());
      var dir;
      if (hsp.spec.view && hsp.spec.view.length >= 2) dir = dirOf(hsp.spec.view[0], hsp.spec.view[1]);
      else {
        var out = pt.clone().sub(center); out.y = Math.max(out.y, 0.25 * out.length());
        var cur = camera.position.clone().sub(controls.target).normalize();
        dir = out.lengthSq() > 1e-6 ? out.normalize().multiplyScalar(0.65).add(cur.multiplyScalar(0.35)).normalize() : cur;
      }
      var dist = home.dist * (Number(hsp.spec.zoom) > 0 ? Number(hsp.spec.zoom) : 0.6);
      if (!(Number(hsp.spec.zoom) > 0) && hsp.node !== pivot) {
        // Node hotspot: frame the part itself (its bounding sphere fills ~60% of the short side), so a big
        // part (a lid, a seat) is never cropped and a tiny one is not flown into; 0.5–1.2 × the home distance.
        var sph = new THREE.Box3().setFromObject(hsp.node).getBoundingSphere(new THREE.Sphere());
        var halfFov = Math.min(camera.fov, 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 180 / Math.PI) * Math.PI / 360;
        var need = sph.radius / Math.sin(halfFov) / 0.6;
        dist = Math.min(home.dist * 1.2, Math.max(home.dist * 0.5, isFinite(need) ? need : 0));
      }
      flyTo(pt.clone().addScaledVector(dir, dist), pt, 900);
      active = hsp.id;
      stage.hotspots.forEach(function (x) { x.el.setAttribute('aria-pressed', x.id === active ? 'true' : 'false'); });
      if (caption) {
        if (hsp.spec.text || hsp.spec.title) {
          caption.innerHTML = '';
          var st = document.createElement('strong'); st.textContent = String(hsp.spec.title || hsp.spec.label || ''); caption.appendChild(st);
          if (hsp.spec.text) caption.appendChild(document.createTextNode(String(hsp.spec.text)));
          caption.hidden = false;
        } else caption.hidden = true;
      }
      try { el.dispatchEvent(new CustomEvent('iui3d:hotspot', { bubbles: true, detail: { id: hsp.id, index: hsp.index, label: hsp.spec.label || '', spec: hsp.spec } })); } catch (eEv) {}
      return true;
    }
    function reset() {
      active = null;
      stage.hotspots.forEach(function (x) { x.el.setAttribute('aria-pressed', 'false'); });
      if (caption) caption.hidden = true;
      flyTo(home.pos, home.target, 700);
    }

    // Toolbar (rotate toggle + reset), keyboard, cooperative wheel, hint.
    var tools = null, spinBtn = null;
    function syncTools() {
      if (!spinBtn) return;
      var on = controls.autoRotate;
      spinBtn.innerHTML = on ? ICON.pause : ICON.play;
      spinBtn.setAttribute('aria-label', on ? T.pause : T.play);
      spinBtn.title = on ? T.pause : T.play;
      spinBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (o.toolbar !== false) {
      tools = document.createElement('div');
      tools.className = 'iui-3d-tools';
      if (!look) {
        spinBtn = document.createElement('button');
        spinBtn.type = 'button';
        spinBtn.addEventListener('click', function () { controls.autoRotate = !controls.autoRotate; syncTools(); });
        tools.appendChild(spinBtn);
      }
      var rb = document.createElement('button');
      rb.type = 'button';
      rb.innerHTML = ICON.reset;
      rb.setAttribute('aria-label', T.reset);
      rb.title = T.reset;
      rb.addEventListener('click', reset);
      tools.appendChild(rb);
      el.appendChild(tools);
      syncTools();
    }
    controls.addEventListener('start', function () { if (controls.autoRotate) { controls.autoRotate = false; syncTools(); } fly = null; });
    var hint = document.createElement('div');
    hint.className = 'iui-3d-hint';
    hint.textContent = T.wheel;
    el.appendChild(hint);
    var hintTimer = 0;
    el.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) return;
      e.stopPropagation();
      hint.classList.add('on');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hint.classList.remove('on'); }, 1200);
    }, { capture: true });
    function orbitBy(dAz, dEl, scale) {
      var off = camera.position.clone().sub(controls.target);
      var sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += dAz; sph.phi = Math.min(Math.max(sph.phi - dEl, 0.15), ground !== 'none' ? Math.PI * 0.5 : Math.PI - 0.15);
      sph.radius = Math.min(Math.max(sph.radius * (scale || 1), controls.minDistance), controls.maxDistance);
      off.setFromSpherical(sph);
      camera.position.copy(controls.target).add(off);
      controls.update();
    }
    cv.addEventListener('keydown', function (e) {
      var k = e.key, step = Math.PI / 12, used = true;
      if (k === 'ArrowLeft') orbitBy(-step, 0);
      else if (k === 'ArrowRight') orbitBy(step, 0);
      else if (k === 'ArrowUp') orbitBy(0, step / 2);
      else if (k === 'ArrowDown') orbitBy(0, -step / 2);
      else if (k === '+' || k === '=') orbitBy(0, 0, 0.85);
      else if (k === '-' || k === '_') orbitBy(0, 0, 1.18);
      else if (k === 'Home' || k === 'Escape') reset();
      else used = false;
      if (used) { e.preventDefault(); if (controls.autoRotate) { controls.autoRotate = false; syncTools(); } }
    });

    // Cursor look: the model turns a little toward the pointer; touch screens use tilt or a slow drift.
    var lookYaw = 0, lookPitch = 0, gotTilt = false;
    if (look) {
      var maxYaw = deg(o.lookRange || 22, 22);
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.getBoundingClientRect();
        lookYaw = ((e.clientX - r.left) / r.width - 0.5) * 2 * maxYaw;
        lookPitch = ((e.clientY - r.top) / r.height - 0.5) * maxYaw * 0.5;
      });
      el.addEventListener('pointerleave', function () { lookYaw = 0; lookPitch = 0; });
      try {
        window.addEventListener('deviceorientation', function (e) {
          if (e.gamma == null) return;
          gotTilt = true;
          lookYaw = Math.max(-1, Math.min(1, e.gamma / 30)) * maxYaw;
          lookPitch = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 30)) * maxYaw * 0.5;
        });
      } catch (eT) {}
    }
    var drift = look && !still && window.matchMedia && matchMedia('(hover: none)').matches;

    // Credit line (CC0 needs none, but say where the model came from).
    if (credit) {
      var cr = document.createElement('div');
      cr.className = 'iui-3d-credit';
      if (credit.href) {
        var a = document.createElement('a');
        a.href = credit.href; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = T.model + ' · ' + credit.by + ' · ' + credit.license;
        a.title = credit.name;
        cr.appendChild(a);
      } else cr.textContent = String(credit.text || '');
      el.appendChild(cr);
    }

    // Render loop only while visible.
    var clock = new THREE.Clock(), visible = true, running = false, frame = 0;
    var ray = new THREE.Raycaster(), meshes = [];
    subject.traverse(function (m) { if (m.isMesh) meshes.push(m); });
    var tmp = new THREE.Vector3();
    function placePins() {
      if (!stage.hotspots.length) return;
      var W = cv.clientWidth, H = cv.clientHeight;
      var occl = frame % 8 === 0;
      for (var i = 0; i < stage.hotspots.length; i++) {
        var x = stage.hotspots[i];
        x.world.copy(x.local);
        x.node.localToWorld(x.world);
        tmp.copy(x.world).project(camera);
        if (tmp.z > 1 || tmp.z < -1) { x.el.hidden = true; continue; }
        x.el.hidden = false;
        var px = (tmp.x * 0.5 + 0.5) * W, py = (-tmp.y * 0.5 + 0.5) * H;
        x.el.style.transform = 'translate(' + Math.round(px - 16) + 'px,' + Math.round(py - 16) + 'px)';
        if (occl && meshes.length) {
          var dir = x.world.clone().sub(camera.position), dist = dir.length();
          ray.set(camera.position, dir.normalize());
          ray.far = dist;
          var hits = ray.intersectObjects(meshes, false), hit = null;
          for (var hi = 0; hi < hits.length && !hit; hi++) {
            var ob = hits[hi].object, own = false;
            if (x.node !== pivot) { while (ob) { if (ob === x.node) { own = true; break; } ob = ob.parent; } }
            if (!own) hit = hits[hi];
          }
          x.el.classList.toggle('is-hidden-side', !!hit && hit.distance < dist - 0.04);
        }
      }
    }
    function loop() {
      if (!el.isConnected) { dispose(); return; }
      var dt = Math.min(clock.getDelta(), 0.1);
      frame++;
      if (fly) {
        var t = Math.min(1, (performance.now() - fly.t0) / fly.ms), e2 = ease(t);
        camera.position.lerpVectors(fly.p0, fly.p1, e2);
        controls.target.lerpVectors(fly.q0, fly.q1, e2);
        if (t >= 1) fly = null;
      }
      controls.update();
      if (mixer) mixer.update(dt);
      if (look) {
        var ty = lookYaw, tp = lookPitch;
        if (drift && !gotTilt) { var tt = performance.now() / 1000; ty = Math.sin(tt * 0.5) * 0.25; tp = Math.sin(tt * 0.35) * 0.06; }
        pivot.rotation.y += (ty - pivot.rotation.y) * Math.min(1, dt * 6);
        pivot.rotation.x += (tp - pivot.rotation.x) * Math.min(1, dt * 6);
      }
      draw();
      placePins();
    }
    function run(on) {
      on = !!on && !document.hidden;
      if (on === running) return;
      running = on;
      if (on) clock.getDelta();
      renderer.setAnimationLoop(on ? loop : null);
    }
    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (ents) { visible = ents[ents.length - 1].isIntersecting; run(visible); }, { rootMargin: '120px' });
      io.observe(el);
    }
    function onVis() { run(visible); }
    document.addEventListener('visibilitychange', onVis);
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        var W = el.clientWidth, H = el.clientHeight;
        if (!W || !H) return;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        if (!running) { draw(); placePins(); }
      });
      ro.observe(el);
    }
    var disposed = false;
    function dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls.dispose();
      scene.traverse(function (m) {
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt) { for (var k in mt) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose(); });
      });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (eF) {}
      el.__iui3d = null;
    }
    draw();
    placePins();
    run(true);
    el.setAttribute('data-iui-3d-ready', '1');
    if (stage.error) {
      el.setAttribute('data-iui-3d-error', '1');
      status.textContent = T.failed + '（' + T.fallback + '）';
      if (o.poster) { var im = document.createElement('img'); im.src = String(o.poster); im.alt = String(o.label || ''); im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;background:inherit'; el.appendChild(im); }
    } else status.textContent = '';
    stage.THREE = THREE; stage.scene = scene; stage.camera = camera; stage.renderer = renderer; stage.controls = controls;
    stage.model = subject; stage.pivot = pivot; stage.mixer = mixer; stage.credit = credit;
    stage.focus = focus; stage.reset = reset; stage.play = play; stage.stop = stop; stage.dispose = dispose;
    stage.setAutoRotate = function (on) { controls.autoRotate = !!on && !still; syncTools(); };
    stage.render = function () { draw(); placePins(); };
    try { el.dispatchEvent(new CustomEvent('iui3d:ready', { bubbles: true, detail: { stage: stage, error: stage.error ? String(stage.error.message || stage.error) : null } })); } catch (eR) {}
    return stage;
  }
  window.iuiStage3d = function (el, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el || el.nodeType !== 1) return Promise.reject(new Error('iuiStage3d: element not found'));
    if (!el.__iui3d) el.__iui3d = mount(el, opts);
    return el.__iui3d;
  };
  window.iuiStage3d.shapes = SHAPES.slice();
  // Auto-mount [data-iui-3d]. Streaming shells replace the DOM on every chunk, so wait until the page settles.
  var timer = 0;
  function settled() {
    var M = window.__iuiMotion;
    if (!M || !M.streaming) return true;
    var p = window.__iuiAuthorPipeline;
    return !!(p && (p.phase === 'authorSettled' || p.phase === 'live' || p.phase === 'failed'));
  }
  function scan() {
    timer = 0;
    if (!settled()) { schedule(400); return; }
    var list = document.querySelectorAll('[data-iui-3d]');
    for (var i = 0; i < list.length; i++) if (!list[i].__iui3d) window.iuiStage3d(list[i]);
  }
  function schedule(ms) { if (!timer) timer = setTimeout(scan, ms); }
  function start() {
    schedule(30);
    try { new MutationObserver(function () { schedule(settled() ? 60 : 400); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
<\/script>`
}
