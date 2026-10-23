/**
 * Author JS readiness + chunked execution (P0 structural fix).
 * Host-side splitter is tested in Node; iframe pipeline mirrors a compact
 * version so preview-shell and final srcdoc share one readiness path.
 */

import { VENDOR_LIBS, vendorCdnUrl } from './vendor-registry.ts'

/**
 * Split author JS into top-level statement chunks (brace/string/comment aware).
 * One SyntaxError or throw in a later chunk must not prevent earlier bindings.
 */
export function splitAuthorJsChunks(input: string): string[] {
  if (!input || !input.trim()) return []
  // F1: each chunk runs in its own indirect eval, so top-level const/let/class
  // would be scoped to that chunk ("x is not defined" in later chunks).
  // Hoist them to var so bindings are shared across chunks like one script.
  const source = hoistTopLevelLexical(input)
  const cuts = new Set<number>()

  // Cut AFTER top-level semicolons.
  scanTopLevel(source, (i, ch, depth) => {
    if (ch === ';' && depth.brace === 0 && depth.paren === 0 && depth.bracket === 0 && depth.template === 0) {
      cuts.add(i + 1)
    }
  })

  // Cut BEFORE top-level declarations (function/var/let/const/class).
  const re = /(?:^|[\n;])\s*(async\s+function\b|function\b|class\b|const\b|let\b|var\b)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const kw = m[1]!
    const at = source.indexOf(kw, m.index)
    if (at > 0 && isTopLevelAt(source, at)) cuts.add(at)
  }

  if (cuts.size === 0) return [source.trim()]

  const ordered = [...cuts].sort((a, b) => a - b)
  const chunks: string[] = []
  let start = 0
  for (const cut of ordered) {
    if (cut <= start || cut > source.length) continue
    const piece = source.slice(start, cut).trim()
    if (piece) chunks.push(piece)
    start = cut
  }
  const tail = source.slice(start).trim()
  if (tail) chunks.push(tail)
  if (chunks.length === 0) return [source.trim()]
  // `if (a) b(); else c();` / `try{}catch{}` continuations: a top-level `;`
  // cut before `else`/`catch`/`finally` would leave an orphan clause that is a
  // SyntaxError on its own (seen live: "Unexpected token 'else'"). Re-join.
  for (let i = chunks.length - 1; i > 0; i--) {
    const head = chunks[i]!.replace(LEADING_TRIVIA, '')
    if (/^(?:else|catch|finally)\b/.test(head)) {
      chunks[i - 1] = `${chunks[i - 1]}\n${chunks[i]}`
      chunks.splice(i, 1)
    }
  }
  // One script hoists every function declaration before any statement runs;
  // isolated chunks do not ("refreshFooter is not defined" when a callback
  // fires synchronously inside an earlier chunk). Peel each leading top-level
  // function declaration into its own chunk and run those first — declarations
  // have no side effects, so this restores single-script order.
  const decls: string[] = []
  const rest: string[] = []
  for (const chunk of chunks) {
    const end = functionDeclarationEnd(chunk)
    if (end < 0) { rest.push(chunk); continue }
    decls.push(chunk.slice(0, end).trim())
    const tailPart = chunk.slice(end).replace(LEADING_TRIVIA, '').replace(/^;+/, '').trim()
    if (tailPart) rest.push(tailPart)
  }
  if (decls.length === 0) return chunks
  return [...decls, ...rest]
}

const LEADING_TRIVIA = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/
const FUNCTION_DECL_HEAD = /^(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(/

/** Index just past the closing `}` when `chunk` starts with a top-level function declaration, else -1. */
export function functionDeclarationEnd(chunk: string): number {
  const lead = LEADING_TRIVIA.exec(chunk)?.[0].length ?? 0
  const body = chunk.slice(lead)
  if (!FUNCTION_DECL_HEAD.test(body)) return -1
  let sawBody = false
  let end = -1
  scanTopLevel(body, (i, ch, depth) => {
    if (end >= 0) return
    if (ch === '{' && depth.paren === 0 && depth.brace === 1) sawBody = true
    else if (ch === '}' && sawBody && depth.brace === 0 && depth.paren === 0) end = i
  })
  return end < 0 ? -1 : lead + end + 1
}

/** True when `chunk` is exactly one top-level function declaration (plus comments / `;`). */
export function isPureFunctionDeclaration(chunk: string): boolean {
  const end = functionDeclarationEnd(chunk)
  return end >= 0 && chunk.slice(end).replace(LEADING_TRIVIA, '').replace(/^[;\s]*/, '').replace(LEADING_TRIVIA, '') === ''
}

/**
 * Rewrite top-level `const`/`let` → `var` and `class X` → `var X = class X`
 * (string/comment/template/regex-light aware). Nested scopes are untouched.
 */
export function hoistTopLevelLexical(src: string): string {
  let out = ''
  let depth = 0
  let str: string | null = null
  let esc = false
  let lineComment = false
  let blockComment = false
  const tpl: number[] = []
  const isIdent = (ch: string | undefined): boolean => ch !== undefined && /[\w$]/.test(ch)
  const kwAt = (i: number, w: string): boolean =>
    src.startsWith(w, i) && !isIdent(src[i - 1]) && src[i - 1] !== '.' && /\s/.test(src[i + w.length] ?? '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    const n = src[i + 1]
    if (lineComment) { out += c; if (c === '\n') lineComment = false; continue }
    if (blockComment) { out += c; if (c === '*' && n === '/') { out += n; i++; blockComment = false } continue }
    if (str) {
      out += c
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (str === '`' && c === '$' && n === '{') { out += n; i++; tpl.push(depth); depth++; str = null; continue }
      if (c === str) str = null
      continue
    }
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === depth - 1) { depth--; tpl.pop(); out += c; str = '`'; continue }
    if (c === '/' && n === '/') { lineComment = true; out += c; continue }
    if (c === '/' && n === '*') { blockComment = true; out += c; continue }
    if (c === '"' || c === "'" || c === '`') { str = c; out += c; continue }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1)
    if (depth === 0) {
      if (kwAt(i, 'const')) { out += 'var  '; i += 4; continue }
      if (kwAt(i, 'let')) { out += 'var'; i += 2; continue }
      if (src.startsWith('class', i) && !isIdent(src[i - 1]) && src[i - 1] !== '.') {
        const m = /^class\s+([A-Za-z_$][\w$]*)/.exec(src.slice(i, i + 200))
        if (m) {
          // Only declarations (statement position), not `x = class Foo {}`.
          const before = out.replace(/\s+$/, '')
          const prev = before[before.length - 1]
          if (prev === undefined || (!'=(,:?[!&|+-*/%<>~^'.includes(prev) && !/(?:return|new|typeof|void|yield|await)$/.test(before))) {
            out += `var ${m[1]} = class ${m[1]}`
            i += m[0].length - 1
            continue
          }
        }
      }
    }
    out += c
  }
  return out
}

type Depth = { brace: number; paren: number; bracket: number; template: number }

function scanTopLevel(
  source: string,
  onChar: (i: number, ch: string, depth: Depth) => void,
): void {
  const depth: Depth = { brace: 0, paren: 0, bracket: 0, template: 0 }
  let inStr: '"' | "'" | '`' | null = null
  let escape = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    const next = source[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (inStr === '`' && ch === '$' && next === '{') {
        depth.template++
        inStr = null
        depth.brace++
        i++
        continue
      }
      if (ch === inStr && depth.template === 0) inStr = null
      continue
    }

    if (depth.template > 0 && ch === '}' && depth.brace === 1) {
      depth.brace--
      depth.template--
      inStr = '`'
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch
      continue
    }

    if (ch === '{') depth.brace++
    else if (ch === '}') depth.brace = Math.max(0, depth.brace - 1)
    else if (ch === '(') depth.paren++
    else if (ch === ')') depth.paren = Math.max(0, depth.paren - 1)
    else if (ch === '[') depth.bracket++
    else if (ch === ']') depth.bracket = Math.max(0, depth.bracket - 1)

    onChar(i, ch, depth)
  }
}

function isTopLevelAt(source: string, index: number): boolean {
  const depth: Depth = { brace: 0, paren: 0, bracket: 0, template: 0 }
  let inStr: '"' | "'" | '`' | null = null
  let escape = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = 0; i < index; i++) {
    const ch = source[i]!
    const next = source[i + 1]
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (inStr === '`' && ch === '$' && next === '{') {
        depth.template++
        inStr = null
        depth.brace++
        i++
        continue
      }
      if (ch === inStr && depth.template === 0) inStr = null
      continue
    }
    if (depth.template > 0 && ch === '}' && depth.brace === 1) {
      depth.brace--
      depth.template--
      inStr = '`'
      continue
    }
    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '{') depth.brace++
    else if (ch === '}') depth.brace = Math.max(0, depth.brace - 1)
    else if (ch === '(') depth.paren++
    else if (ch === ')') depth.paren = Math.max(0, depth.paren - 1)
    else if (ch === '[') depth.bracket++
    else if (ch === ']') depth.bracket = Math.max(0, depth.bracket - 1)
  }
  return depth.brace === 0 && depth.paren === 0 && depth.bracket === 0 && depth.template === 0
}

/**
 * Iframe-side author pipeline (string body, no <script> wrapper).
 * Defines window.__iuiAuthorPipeline used by bridge runAuthorJs and final embed.
 */
export function buildAuthorJsRuntimeSource(): string {
  return `
window.__iuiAuthorPipeline = window.__iuiAuthorPipeline || (function () {
  // C6: host-provided vendor map (local asset route first); CDN defaults otherwise.
  var VND = window.__iuiVendor || {};
  // C2: defaults come from the vendor registry (jsDelivr copy of each file).
  var LEAFLET_JS = VND.leafletJs || ${JSON.stringify(vendorCdnUrl('leaflet', VENDOR_LIBS.leaflet.js))};
  var LEAFLET_CSS = VND.leafletCss || ${JSON.stringify(vendorCdnUrl('leaflet', VENDOR_LIBS.leaflet.css[0]))};
  var CHART_JS = VND.chartJs || ${JSON.stringify(vendorCdnUrl('chart', VENDOR_LIBS.chart.js))};
  var AGGRID_JS = VND.agGridJs || ${JSON.stringify(vendorCdnUrl('agGrid', VENDOR_LIBS.agGrid.js))};
  var AGGRID_CSS = VND.agGridCss || ${JSON.stringify(vendorCdnUrl('agGrid', VENDOR_LIBS.agGrid.css[0]))};
  var AGGRID_THEME = VND.agGridTheme || ${JSON.stringify(vendorCdnUrl('agGrid', VENDOR_LIBS.agGrid.css[1]))};
  var MERMAID_JS = VND.mermaidJs || ${JSON.stringify(vendorCdnUrl('mermaid', VENDOR_LIBS.mermaid.js))};
  // C9: libraries the fence declared (plus what the host detected).
  var DECLARED = Array.isArray(VND.libs) ? VND.libs : [];
  function declared(id) { return DECLARED.indexOf(id) !== -1; }
  // C7: SRI for CDN copies (boot script defines __iuiSriFor).
  function applySri(el, url) {
    try {
      var h = typeof window.__iuiSriFor === 'function' ? window.__iuiSriFor(url) : '';
      if (h) { el.integrity = h; el.crossOrigin = 'anonymous'; }
    } catch (e) {}
  }
  // F19: every candidate for a library (active preset order); the loader tries
  // them in turn with a per-source timeout.
  function libList(list, first) {
    var out = Array.isArray(list) ? list.filter(function (u) { return typeof u === 'string' && u; }) : [];
    if (!out.length) out = [first];
    return out;
  }
  var LEAFLET_JS_LIST = libList(VND.leafletJsList, LEAFLET_JS);
  var CHART_JS_LIST = libList(VND.chartJsList, CHART_JS);
  var AGGRID_JS_LIST = libList(VND.agGridJsList, AGGRID_JS);
  var MERMAID_JS_LIST = libList(VND.mermaidJsList, MERMAID_JS);
  var LIB_SOURCE_TIMEOUT_MS = 8000;
  var state = { phase: 'boot', ran: false, lastOpts: null };
  // F2: host helpers use the DOM native captured before author code runs, so
  // an author (or a library) patching querySelector cannot fool library
  // detection / script de-dupe. Missing elements stay null, as in any page.
  var NQS = Document.prototype.querySelector;
  function hq(sel) { try { return NQS.call(document, sel); } catch (e) { return null; } }

  function post(msg) {
    try {
      var fid = window.__iuiFrameId || 'iui-html';
      parent.postMessage(Object.assign({ source: 'iui-html', frameId: fid }, msg), '*');
    } catch (e) {}
  }

  function setPhase(p) { state.phase = p; }

  // F2 step 5 / F15: rerun hygiene. Timers, animation frames and
  // window/document/body/root listeners created while author code runs (or
  // inside callbacks it scheduled) are tracked, so a re-run first tears them
  // down and restores the delivered HTML — 3 re-runs leave the same DOM and
  // no duplicate intervals. Host code (depth 0) is never tracked.
  var zone = window.__iuiAuthorZone || (function () {
    var z = { depth: 0, timeouts: {}, intervals: {}, rafs: {}, listeners: [] };
    var nST = window.setTimeout, nCT = window.clearTimeout;
    var nSI = window.setInterval, nCI = window.clearInterval;
    var nRAF = window.requestAnimationFrame, nCAF = window.cancelAnimationFrame;
    function run(fn, self, args) { z.depth++; try { return fn.apply(self, args); } finally { z.depth--; } }
    z.run = run;
    function rest(args, from) { var out = []; for (var i = from; i < args.length; i++) out.push(args[i]); return out; }
    window.setTimeout = function (cb, ms) {
      if (!z.depth || typeof cb !== 'function') return nST.apply(window, arguments);
      var extra = rest(arguments, 2);
      var id = nST.call(window, function () { delete z.timeouts[id]; run(cb, window, extra); }, ms);
      z.timeouts[id] = 1;
      return id;
    };
    window.clearTimeout = function (id) { delete z.timeouts[id]; return nCT.call(window, id); };
    window.setInterval = function (cb, ms) {
      if (!z.depth || typeof cb !== 'function') return nSI.apply(window, arguments);
      var extra = rest(arguments, 2);
      var id = nSI.call(window, function () { run(cb, window, extra); }, ms);
      z.intervals[id] = 1;
      return id;
    };
    window.clearInterval = function (id) { delete z.intervals[id]; return nCI.call(window, id); };
    if (typeof nRAF === 'function') {
      window.requestAnimationFrame = function (cb) {
        if (!z.depth || typeof cb !== 'function') return nRAF.call(window, cb);
        var id = nRAF.call(window, function (t) { delete z.rafs[id]; run(cb, window, [t]); });
        z.rafs[id] = 1;
        return id;
      };
      window.cancelAnimationFrame = function (id) { delete z.rafs[id]; return nCAF.call(window, id); };
    }
    var ET = window.EventTarget && window.EventTarget.prototype;
    var nAdd = ET && ET.addEventListener, nRem = ET && ET.removeEventListener;
    var wrapped = typeof WeakMap === 'function' ? new WeakMap() : null;
    function persistentTarget(t) {
      return t === window || t === document || t === document.documentElement || t === document.body
        || (t && t.id === 'iui-preview-root');
    }
    if (ET && nAdd && nRem && wrapped) {
      ET.addEventListener = function (type, listener, opts) {
        if (!z.depth || !listener || (typeof listener !== 'function' && typeof listener.handleEvent !== 'function')) {
          return nAdd.call(this, type, listener, opts);
        }
        var w = wrapped.get(listener);
        if (!w) {
          w = function (ev) {
            return typeof listener === 'function' ? run(listener, this, [ev]) : run(listener.handleEvent, listener, [ev]);
          };
          wrapped.set(listener, w);
        }
        if (persistentTarget(this)) z.listeners.push([this, type, w, opts]);
        return nAdd.call(this, type, w, opts);
      };
      ET.removeEventListener = function (type, listener, opts) {
        var w = listener && wrapped.get(listener);
        if (w) nRem.call(this, type, w, opts);
        return nRem.call(this, type, listener, opts);
      };
    }
    // Nodes author code appends straight to <body> (toasts, overlays, canvases)
    // live outside #iui-preview-root, so restoring the root alone would leave
    // one extra copy per re-run.
    z.bodyNodes = [];
    var NP = window.Node && window.Node.prototype;
    function trackBody(parent, node) {
      if (!z.depth || parent !== document.body || !node) return;
      if (node.nodeType === 11) {
        for (var c = node.firstChild; c; c = c.nextSibling) z.bodyNodes.push(c);
      } else z.bodyNodes.push(node);
    }
    if (NP && NP.appendChild && NP.insertBefore) {
      var nAppend = NP.appendChild, nInsert = NP.insertBefore;
      NP.appendChild = function (node) { trackBody(this, node); return nAppend.call(this, node); };
      NP.insertBefore = function (node, ref) { trackBody(this, node); return nInsert.call(this, node, ref); };
    }
    var EP = window.Element && window.Element.prototype;
    ['append', 'prepend'].forEach(function (m) {
      var native = EP && EP[m];
      if (typeof native !== 'function') return;
      EP[m] = function () {
        if (z.depth && this === document.body) {
          for (var a = 0; a < arguments.length; a++) if (arguments[a] && typeof arguments[a] === 'object') trackBody(this, arguments[a]);
        }
        return native.apply(this, arguments);
      };
    });
    z.reset = function () {
      for (var b = 0; b < z.bodyNodes.length; b++) {
        var nd = z.bodyNodes[b];
        try { if (nd.parentNode === document.body) document.body.removeChild(nd); } catch (eN) {}
      }
      z.bodyNodes = [];
      var k;
      for (k in z.timeouts) { try { nCT.call(window, Number(k)); } catch (e) {} }
      for (k in z.intervals) { try { nCI.call(window, Number(k)); } catch (e) {} }
      if (typeof nCAF === 'function') for (k in z.rafs) { try { nCAF.call(window, Number(k)); } catch (e) {} }
      z.timeouts = {}; z.intervals = {}; z.rafs = {};
      for (var i = 0; i < z.listeners.length; i++) {
        var l = z.listeners[i];
        try { nRem.call(l[0], l[1], l[2], l[3]); } catch (e) {}
      }
      z.listeners = [];
    };
    z.stats = function () {
      return {
        timeouts: Object.keys(z.timeouts).length,
        intervals: Object.keys(z.intervals).length,
        rafs: Object.keys(z.rafs).length,
        listeners: z.listeners.length,
        bodyNodes: z.bodyNodes.length
      };
    };
    window.__iuiAuthorZone = z;
    return z;
  })();

  function isSingleSmart(ch) {
    return ch === '\u2018' || ch === '\u2019' || ch === '\u2032';
  }
  function isDoubleSmart(ch) {
    return ch === '\u201C' || ch === '\u201D' || ch === '\u2033';
  }
  function rewriteSmartQuotes(src) {
    var out = '';
    var mode = 'out';
    var escape = false;
    var inLineComment = false;
    var inBlockComment = false;
    for (var i = 0; i < src.length; i++) {
      var code = src.charCodeAt(i);
      var ch = src.charAt(i);
      var next = src.charAt(i + 1);
      if (inLineComment) {
        out += ch;
        if (code === 10) inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        out += ch;
        if (ch === '*' && next === '/') { out += next; i++; inBlockComment = false; }
        continue;
      }
      if (mode !== 'out') {
        if (escape) { out += ch; escape = false; continue; }
        if (code === 92) { out += ch; escape = true; continue; }
        if (mode === 'sq' && ch === "'") { out += ch; mode = 'out'; continue; }
        if (mode === 'dq' && ch === '"') { out += ch; mode = 'out'; continue; }
        if (mode === 'tq' && code === 96) { out += ch; mode = 'out'; continue; }
        if (mode === 'smart-single' && (ch === "'" || isSingleSmart(ch))) { out += "'"; mode = 'out'; continue; }
        if (mode === 'smart-double' && (ch === '"' || isDoubleSmart(ch))) { out += '"'; mode = 'out'; continue; }
        out += ch;
        continue;
      }
      if (ch === '/' && next === '/') { out += ch; inLineComment = true; continue; }
      if (ch === '/' && next === '*') { out += ch; inBlockComment = true; continue; }
      if (ch === "'") { out += ch; mode = 'sq'; continue; }
      if (ch === '"') { out += ch; mode = 'dq'; continue; }
      if (code === 96) { out += ch; mode = 'tq'; continue; }
      if (isSingleSmart(ch)) { out += "'"; mode = 'smart-single'; continue; }
      if (isDoubleSmart(ch)) { out += '"'; mode = 'smart-double'; continue; }
      out += ch;
    }
    return out;
  }
  function softHarden(src) {
    if (typeof src !== 'string') return '';
    var out = rewriteSmartQuotes(src);
    var needle = 'import(';
    var idx = 0;
    while ((idx = out.indexOf(needle, idx)) !== -1) {
      var end = out.indexOf(')', idx);
      if (end === -1) break;
      var chunk = out.slice(idx, end + 1);
      if (chunk.indexOf('chart.js') !== -1) {
        out = out.slice(0, idx) + 'Promise.resolve(window.__iuiChartMod||{Chart:window.Chart,default:window.Chart,registerables:[]})' + out.slice(end + 1);
        idx += 80;
      } else idx = end + 1;
    }
    return out;
  }

  // C9: real API usage only (no '#map' / 'Chart + line' guesses).
  function wantsLeaflet(src) {
    src = String(src || '');
    return declared('leaflet')
      || src.indexOf('L.map') !== -1
      || src.indexOf('L.tileLayer') !== -1
      || src.indexOf('L.marker') !== -1
      || src.indexOf('L.polyline') !== -1
      || src.indexOf('L.divIcon') !== -1
      || src.indexOf('L.circleMarker') !== -1
      || src.indexOf('createTripAnimator') !== -1
      || src.indexOf('iui-map-wrap') !== -1
      || !!(hq('.iui-map-wrap'));
  }

  function wantsAgGrid(src) {
    src = String(src || '');
    return declared('agGrid')
      || src.indexOf('agGrid.') !== -1
      || src.indexOf('ag-grid-community') !== -1
      || src.indexOf('ag-theme-') !== -1
      || !!(hq('[class*="ag-theme"]'));
  }
  // ④: an ECharts tree also lives in .iui-mindmap — only text-only containers are Mermaid source.
  function mindmapSource() {
    try {
      var all = document.querySelectorAll('.iui-mindmap');
      for (var i = 0; i < all.length; i++) if (!all[i].children.length && /\S/.test(all[i].textContent || '')) return true;
    } catch (e) {}
    return false;
  }
  function wantsMermaid(src) {
    src = String(src || '');
    return declared('mermaid')
      || src.indexOf('mermaid.run') !== -1
      || src.indexOf('mermaid.initialize') !== -1
      || /\biui-mindmap\b[^"'>]*["'][^>]*>\s*[^\s<]/.test(src)
      || !!hq('.mermaid')
      || mindmapSource();
  }

  function wantsChart(src) {
    src = String(src || '');
    return declared('chart')
      || src.indexOf('new Chart') !== -1
      || src.indexOf('iuiCreateChart') !== -1
      || src.indexOf('iui-weather-chart') !== -1
      || src.indexOf('wxChart') !== -1
      || src.indexOf('__iuiChartMod') !== -1
      || src.indexOf('Chart.getChart') !== -1
      || src.indexOf('Chart.register') !== -1
      || src.indexOf('Chart.defaults') !== -1
      || src.indexOf("'chart.js'") !== -1
      || src.indexOf('"chart.js"') !== -1;
  }

  function ensureCss(href) {
    if (hq('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    applySri(link, href);
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  // F19: try each candidate URL (load → next on error / 8 s silence).
  function ensureScriptList(list, done) {
    var i = 0;
    var finished = false;
    function finish(ok, src) { if (finished) return; finished = true; done(ok, src); }
    (function attempt() {
      if (i >= list.length) { finish(false, list[list.length - 1]); return; }
      var src = list[i++];
      var timedOut = false;
      var timer = setTimeout(function () { timedOut = true; attempt(); }, LIB_SOURCE_TIMEOUT_MS);
      ensureScript(src, function (ok) {
        if (timedOut) return;
        clearTimeout(timer);
        if (ok) finish(true, src);
        else attempt();
      });
    })();
  }

  function ensureScript(src, done) {
    var existing = hq('script[src="' + src + '"]');
    if (existing) {
      if (typeof L !== 'undefined' && src.indexOf('leaflet') !== -1) { done(true); return; }
      var known = existing.getAttribute('data-iui-done');
      if (known === '0' || known === 'timeout') { done(false); return; }
      if (typeof Chart !== 'undefined' && src.indexOf('chart') !== -1) { done(true); return; }
      var n0 = 0;
      var t0 = setInterval(function () {
        if ((src.indexOf('leaflet') !== -1 && typeof L !== 'undefined')
          || (src.indexOf('chart') !== -1 && typeof Chart !== 'undefined')
          || (src.indexOf('ag-grid') !== -1 && typeof agGrid !== 'undefined')
          || (src.indexOf('mermaid') !== -1 && typeof mermaid !== 'undefined')
          || existing.getAttribute('data-iui-loaded') === '1') {
          clearInterval(t0); done(true);
        } else if (++n0 > 125) { clearInterval(t0); done(false); }
      }, 40);
      existing.addEventListener('load', function () {
        existing.setAttribute('data-iui-loaded', '1');
      });
      return;
    }
    var s = document.createElement('script');
    applySri(s, src);
    s.src = src;
    s.async = false;
    s.onload = function () { s.setAttribute('data-iui-loaded', '1'); done(true); };
    s.onerror = function () { done(false); };
    (document.head || document.documentElement).appendChild(s);
  }

  function waitGlobal(check, done) {
    if (check()) { done(true); return; }
    var n = 0;
    var t = setInterval(function () {
      if (check()) { clearInterval(t); done(true); }
      else if (++n > 125) { clearInterval(t); done(false); }
    }, 40);
  }

  function waitDomRoot(done) {
    if (document.getElementById('iui-preview-root')) { done(); return; }
    var n = 0;
    var t = setInterval(function () {
      if (document.getElementById('iui-preview-root')) { clearInterval(t); done(); }
      else if (++n > 50) {
        var root = document.createElement('div');
        root.id = 'iui-preview-root';
        document.body.appendChild(root);
        clearInterval(t);
        done();
      }
    }, 20);
  }

  function isZh() {
    try {
      var lang = (document.documentElement && document.documentElement.lang) || (navigator.language || '');
      return /^zh\\b/i.test(String(lang));
    } catch (e) { return true; }
  }

  function clearFailureStrips() {
    try {
      document.querySelectorAll('[data-iui-author-fail], [data-iui-host-fail]').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (e) {}
  }

  function ensureFailStyles() {
    if (document.getElementById('iui-fail-visible-css')) return;
    var style = document.createElement('style');
    style.id = 'iui-fail-visible-css';
    style.textContent = ''
      + '.iui-fail-strip{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;'
      + 'margin:8px 0;padding:10px 12px;border-radius:10px;font:12px/1.45 system-ui,sans-serif;'
      + 'white-space:pre-wrap;word-break:break-word;box-sizing:border-box;width:100%}'
      + '.iui-fail-strip[data-iui-author-fail]{color:#991b1b;background:rgba(239,68,68,.08);'
      + 'border:1px solid rgba(239,68,68,.35)}'
      + '.iui-fail-strip[data-iui-host-fail]{color:#9a3412;background:rgba(249,115,22,.10);'
      + 'border:1px solid rgba(249,115,22,.40)}'
      + '.iui-fail-strip .iui-fail-body{flex:1;min-width:160px}'
      + '.iui-fail-strip .iui-fail-title{font-weight:700;margin-bottom:4px}'
      + '.iui-fail-strip .iui-fail-meta{opacity:.85;font-size:11px;margin-top:4px}'
      + '.iui-fail-strip button{flex:0 0 auto;font:12px/1 system-ui,sans-serif;padding:6px 10px;'
      + 'border-radius:8px;border:1px solid rgba(0,0,0,.15);background:#fff;cursor:pointer;font-weight:600}'
      + '.iui-fail-strip button:hover{filter:brightness(.97)}';
    (document.head || document.documentElement).appendChild(style);
  }

  function sourceHost(src) {
    try { return new URL(String(src), location.href).host || 'local'; } catch (e) { return String(src || '').slice(0, 80); }
  }
  // F19: library failures name the library and the source, and offer to switch
  // to the next source preset instead of a blank card.
  function showLibFailure(label, src) {
    showFailureStrip({ kind: 'lib', lib: label, src: src, err: { name: 'LibError', message: label + ' failed to load from ' + sourceHost(src) } });
  }

  // F19: ESM libraries (three / gsap via importmap) fail as a rejected dynamic
  // import; name the library and offer the same switch-source strip.
  try {
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason;
      var m = String(r && r.message ? r.message : r || '');
      var hit = /(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)[^h]*(https?:[^\\s]+)?/i.exec(m);
      if (!hit) return;
      var url = hit[1] || '';
      var lib = /three/i.test(url) ? 'three.js' : /gsap/i.test(url) ? 'GSAP' : /d3/i.test(url) ? 'd3' : /chart/i.test(url) ? 'Chart.js' : 'ESM';
      if (document.querySelector('[data-iui-lib-fail="' + lib + '"]')) return;
      showLibFailure(lib, url || location.href);
    });
  } catch (eUR) {}

  function showFailureStrip(opts) {
    opts = opts || {};
    // F19: one surface per cause — after a library strip, "L is not defined"
    // style author errors are console-only.
    if (opts.kind !== 'lib' && opts.kind !== 'host' && document.querySelector('[data-iui-lib-fail]')) {
      var em = String(opts.err && opts.err.message ? opts.err.message : opts.err || '');
      if (/\\b(?:L|Chart|agGrid|mermaid|THREE|gsap|d3)\\b is not defined|Cannot read properties of undefined \\(reading '(?:map|createGrid|initialize|run)'\\)/.test(em)) {
        try { console.warn('[iui-html] suppressed (library failed):', em); } catch (eW) {}
        return;
      }
    }
    var isLib = opts.kind === 'lib';
    var kind = opts.kind === 'host' || isLib ? 'host' : 'author';
    var index = typeof opts.index === 'number' ? opts.index : -1;
    var total = typeof opts.total === 'number' ? opts.total : 0;
    var err = opts.err;
    var msg = String(err && err.message ? err.message : (err || 'unknown'));
    var name = err && err.name ? String(err.name) : '';
    ensureFailStyles();
    var zh = isZh();
    var strip = document.createElement('div');
    strip.className = 'iui-fail-strip';
    strip.setAttribute(kind === 'host' ? 'data-iui-host-fail' : 'data-iui-author-fail', '1');
    strip.setAttribute('role', 'alert');
    if (index >= 0) strip.setAttribute('data-iui-chunk', String(index));
    strip.setAttribute('data-iui-fail-kind', kind);

    var body = document.createElement('div');
    body.className = 'iui-fail-body';
    var title = document.createElement('div');
    title.className = 'iui-fail-title';
    if (isLib) {
      strip.setAttribute('data-iui-lib-fail', String(opts.lib || ''));
      title.textContent = zh
        ? (opts.lib + ' 库加载失败（可能是网络原因）')
        : (opts.lib + ' failed to load (probably the network)');
    } else if (kind === 'host') {
      title.textContent = zh
        ? '插件出错（不是页面脚本的问题）'
        : 'Plugin error (not the page script)';
    } else if (index >= 0 && total > 0) {
      title.textContent = zh
        ? ('页面脚本第 ' + (index + 1) + '/' + total + ' 段出错')
        : ('Page script part ' + (index + 1) + '/' + total + ' failed');
    } else {
      title.textContent = zh ? '页面脚本出错' : 'Page script failed';
    }
    var detail = document.createElement('div');
    detail.textContent = (name ? name + ': ' : '') + msg;
    var meta = document.createElement('div');
    meta.className = 'iui-fail-meta';
    var missingEl = kind === 'author' && /of null|null is not an object|is null\b/.test(msg);
    var curPreset = String(VND.preset || 'local');
    var nextPreset = curPreset === 'china' ? 'global' : 'china';
    meta.textContent = isLib
      ? (zh
        ? ('当前资源源：' + sourceHost(opts.src) + '。可在 设置 → IUI → 资源源 切换（国内网络选「国内镜像」），或直接点「' + (nextPreset === 'china' ? '切换国内源并重试' : '切换海外源并重试') + '」。')
        : ('Source: ' + sourceHost(opts.src) + '. Switch in Settings → IUI → Library source, or use the button to switch and retry.'))
      : missingEl
      ? (zh
        ? '页面脚本找不到某个元素：JS 里的 id / 选择器和 HTML 对不上。可点「重新生成」让模型修正。'
        : 'Page script could not find an element: an id/selector in the JS does not match the HTML. Regenerate to let the model fix it.')
      : zh
      ? (kind === 'host'
        ? '这是 IUI 插件的问题。可点「重新加载」整页，或「重跑页面脚本」再试。'
        : '这是页面里的脚本问题。其它部分可能已正常运行；可只重跑页面脚本，无需整页刷新。')
      : (kind === 'host'
        ? 'This is an IUI plugin issue. Reload the page, or re-run the page script.'
        : 'This is a problem in the page script. Other parts may still have run; re-run the page script without a full reload.');
    body.appendChild(title);
    body.appendChild(detail);
    body.appendChild(meta);
    strip.appendChild(body);

    if (kind === 'author') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-iui-rerun-author', '1');
      btn.textContent = zh ? '重跑页面脚本' : 'Re-run page script';
      btn.addEventListener('click', function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        try { api.rerunAuthorJs(); } catch (e2) {
          try { post({ type: 'error', message: String(e2 && e2.message ? e2.message : e2), kind: 'host' }); } catch (e3) {}
        }
      });
      strip.appendChild(btn);
    }
    // F17: the strip is the ONLY error surface (host chrome stays quiet), so
    // it carries the reload / regenerate actions the meta text refers to.
    var stripDetail = ((name ? name + ': ' : '') + msg).slice(0, 2000);
    var addStripAction = function (action, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-iui-strip-action', action);
      b.textContent = label;
      b.addEventListener('click', function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        try { post({ type: 'stripAction', action: action, detail: stripDetail }); } catch (e2) {}
      });
      strip.appendChild(b);
    };
    if (isLib) {
      stripDetail = nextPreset;
      addStripAction('switchCdn', zh
        ? (nextPreset === 'china' ? '切换国内源并重试' : '切换海外源并重试')
        : (nextPreset === 'china' ? 'Use China mirror & retry' : 'Use global CDN & retry'));
      addStripAction('reload', zh ? '重新加载' : 'Reload');
    } else {
      addStripAction('reload', zh ? '重新加载' : 'Reload');
      addStripAction('reask', zh ? '重新生成' : 'Regenerate');
    }

    try {
      var root = document.getElementById('iui-preview-root');
      if (root && root.parentNode) root.parentNode.insertBefore(strip, root);
      else (document.body || document.documentElement).appendChild(strip);
    } catch (e) {
      try { document.body.appendChild(strip); } catch (e2) {}
    }

    try {
      var payload = {
        type: 'error',
        message: (kind === 'host' ? '[host] ' : '[author] ')
          + (index >= 0 && total > 0 ? ('chunk ' + (index + 1) + '/' + total + ': ') : '')
          + msg,
        kind: kind,
        strip: true
      };
      if (index >= 0) payload.chunkIndex = index;
      if (total > 0) payload.chunkTotal = total;
      post(payload);
    } catch (e2) {}
  }

  function withDomReplay(fn) {
    var origDocAdd = document.addEventListener.bind(document);
    var origWinAdd = window.addEventListener.bind(window);
    document.addEventListener = function (type, listener, opts) {
      if ((type === 'DOMContentLoaded' || type === 'readystatechange') && document.readyState !== 'loading') {
        try { listener.call(document, new Event(type)); } catch (e) {}
        return;
      }
      return origDocAdd(type, listener, opts);
    };
    window.addEventListener = function (type, listener, opts) {
      if (type === 'load' && document.readyState === 'complete') {
        try { listener.call(window, new Event(type)); } catch (e) {}
        return;
      }
      return origWinAdd(type, listener, opts);
    };
    try { fn(); } finally {
      document.addEventListener = origDocAdd;
      window.addEventListener = origWinAdd;
    }
  }

  function runChunkList(parts, exprs) {
    setPhase('authorRunning');
    var failed = 0;
    var rootEl = document.getElementById('iui-preview-root');
    if (rootEl && typeof state.baseHtml !== 'string') state.baseHtml = rootEl.innerHTML;
    zone.depth++;
    try { withDomReplay(function () {
      var total = parts.length;
      for (var p = 0; p < parts.length; p++) {
        try { (0, eval)(parts[p]); }
        catch (err) {
          failed++;
          console.error('[iui-html] author chunk', p, err);
          showFailureStrip({ kind: 'author', index: p, total: total, err: err });
        }
      }
      var list = Array.isArray(exprs) ? exprs.slice(0, 64) : [];
      for (var e = 0; e < list.length; e++) {
        try { (0, eval)(softHarden(list[e])); }
        catch (err2) {
          failed++;
          console.error('[iui-html] author expr', e, err2);
          showFailureStrip({ kind: 'author', index: total + e, total: total + list.length, err: err2 });
        }
      }
    }); } finally { zone.depth--; }
    setPhase('authorSettled');
    try {
      post({ type: 'authorSettled', ok: failed === 0, failedChunks: failed });
    } catch (e) {}
    // G15: one idle self-check per load once the author code has run.
    try { if (typeof window.__iuiScheduleSelfCheck === 'function') window.__iuiScheduleSelfCheck(); } catch (eSC) {}
    try {
      if (window.iuiSandbox && typeof window.iuiSandbox.resize === 'function') window.iuiSandbox.resize();
    } catch (e2) {}
    return failed === 0;
  }

  function ensureLibs(probe, done) {
    setPhase('libsLoading');
    var chain = [];
    if (wantsLeaflet(probe) && typeof L === 'undefined') {
      chain.push(function (next) {
        ensureCss(LEAFLET_CSS);
        ensureScriptList(LEAFLET_JS_LIST, function (ok, usedSrc) {
          if (!ok) {
            showLibFailure('Leaflet', usedSrc);
          }
          if (!ok) { next(); return; } // C4: one strip, no extra 5s wait
          waitGlobal(function () { return typeof L !== 'undefined'; }, function (ready) {
            if (!ready) {
              showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'Leaflet global L not ready' } });
            }
            next();
          });
        });
      });
    } else if (wantsLeaflet(probe)) {
      chain.push(function (next) {
        waitGlobal(function () { return typeof L !== 'undefined'; }, function () { next(); });
      });
    }
    if (wantsChart(probe) && typeof Chart === 'undefined') {
      chain.push(function (next) {
        ensureScriptList(CHART_JS_LIST, function (ok, usedSrc) {
          if (!ok) {
            showLibFailure('Chart.js', usedSrc);
          }
          if (!ok) { next(); return; } // C4: one strip, no extra 5s wait
          waitGlobal(function () { return typeof Chart !== 'undefined'; }, function (ready) {
            if (!ready) {
              showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'Chart global not ready' } });
            }
            next();
          });
        });
      });
    } else if (wantsChart(probe)) {
      chain.push(function (next) {
        waitGlobal(function () { return typeof Chart !== 'undefined'; }, function () { next(); });
      });
    }
    if (wantsAgGrid(probe) && typeof agGrid === 'undefined') {
      chain.push(function (next) {
        ensureCss(AGGRID_CSS);
        ensureCss(AGGRID_THEME);
        ensureScriptList(AGGRID_JS_LIST, function (ok, usedSrc) {
          if (!ok) showLibFailure('AG Grid', usedSrc);
          if (!ok) { next(); return; } // C4: one strip, no extra 5s wait
          waitGlobal(function () { return typeof agGrid !== 'undefined'; }, function (ready) {
            if (!ready) showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'agGrid global not ready' } });
            next();
          });
        });
      });
    } else if (wantsAgGrid(probe)) {
      chain.push(function (next) {
        waitGlobal(function () { return typeof agGrid !== 'undefined'; }, function () { next(); });
      });
    }
    if (wantsMermaid(probe) && typeof mermaid === 'undefined') {
      chain.push(function (next) {
        ensureScriptList(MERMAID_JS_LIST, function (ok, usedSrc) {
          if (!ok) showLibFailure('Mermaid', usedSrc);
          if (!ok) { next(); return; } // C4: one strip, no extra 5s wait
          waitGlobal(function () { return typeof mermaid !== 'undefined'; }, function (ready) {
            if (!ready) showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'mermaid global not ready' } });
            next();
          });
        });
      });
    } else if (wantsMermaid(probe)) {
      chain.push(function (next) {
        waitGlobal(function () { return typeof mermaid !== 'undefined'; }, function () { next(); });
      });
    }
    // F13: libraries load in parallel (each waits for its own global);
    // author JS runs once all of them have settled.
    var pending = chain.length;
    var finished = false;
    function settle() {
      if (finished) return;
      finished = true;
      setPhase('libsReady');
      try { post({ type: 'libsReady' }); } catch (e) {}
      done();
    }
    if (pending === 0) { settle(); return; }
    chain.forEach(function (fn) {
      var called = false;
      try {
        fn(function () {
          if (called) return;
          called = true;
          if (--pending === 0) settle();
        });
      } catch (e) {
        if (!called) { called = true; if (--pending === 0) settle(); }
      }
    });
  }

  function ensureLibsThenRun(opts) {
    opts = opts || {};
    var force = !!opts.force;
    if (state.ran && !force) return;
    state.ran = true;
    window.__iuiAuthorJsRan = true;
    state.lastOpts = {
      jsFunctions: typeof opts.jsFunctions === 'string' ? opts.jsFunctions : '',
      js: typeof opts.js === 'string' ? opts.js : '',
      jsExpressions: Array.isArray(opts.jsExpressions) ? opts.jsExpressions.slice(0, 64) : [],
      jsChunks: Array.isArray(opts.jsChunks) ? opts.jsChunks.slice(0, 256) : null
    };
    if (force) clearFailureStrips();
    var fnSrc = softHarden(state.lastOpts.jsFunctions);
    var body = softHarden(state.lastOpts.js);
    var exprs = state.lastOpts.jsExpressions;
    var preChunks = state.lastOpts.jsChunks;
    var parts = [];
    if (fnSrc && String(fnSrc).trim()) parts.push(String(fnSrc));
    if (preChunks && preChunks.length) {
      for (var c = 0; c < preChunks.length; c++) {
        var piece = softHarden(String(preChunks[c] || '')).trim();
        if (piece) parts.push(piece);
      }
    } else if (body && body.trim()) {
      parts.push(body);
    }
    var probe = parts.join('\\n');
    waitCdnScripts(function () { ensureLibs(probe, function () {
      waitDomRoot(function () {
        setPhase('domPainted');
        // Author JS must not run before libsReady — gate is ensureLibs above.
        runChunkList(parts, exprs);
        setPhase('live');
      });
    }); });
  }

  // C4: async CDN scripts (data-iui-cdn) get one shared deadline instead of
  // hanging forever / blocking window.load. Late arrivals still define globals.
  var CDN_TIMEOUT_MS = 10000;
  var CDN_SOURCE_TIMEOUT_MS = 4000;
  function waitCdnScripts(done) {
    var started = Date.now();
    var deadline = started + CDN_TIMEOUT_MS;
    setPhase('libsLoading');
    (function poll() {
      var list = document.querySelectorAll('script[data-iui-cdn]');
      var pending = [];
      var now = Date.now();
      for (var i = 0; i < list.length; i++) {
        var st = list[i].getAttribute('data-iui-done');
        if (st !== null) continue;
        // C5: a hung source (no load, no error) moves on to the next candidate.
        var t0 = Number(list[i].getAttribute('data-iui-t0') || started);
        if (now - t0 > CDN_SOURCE_TIMEOUT_MS && list[i].getAttribute('data-iui-fallback') && window.__iuiCdnNext) {
          window.__iuiCdnNext(list[i]);
          continue;
        }
        pending.push(list[i]);
      }
      if (!pending.length) { done(); return; }
      if (Date.now() >= deadline) {
        for (var k = 0; k < pending.length; k++) pending[k].setAttribute('data-iui-done', 'timeout');
        done();
        return;
      }
      setTimeout(poll, 50);
    })();
  }

  function rerunAuthorJs() {
    var prev = state.lastOpts;
    if (!prev) {
      showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'No author JS payload to re-run yet' } });
      return false;
    }
    clearFailureStrips();
    // Rerun hygiene: tear down timers/listeners the previous run created and
    // restore the delivered markup so N re-runs converge to the same DOM.
    try { zone.reset(); } catch (e0) {}
    try {
      var rootEl = document.getElementById('iui-preview-root');
      if (rootEl && typeof state.baseHtml === 'string') rootEl.innerHTML = state.baseHtml;
    } catch (e1) {}
    state.ran = false;
    window.__iuiAuthorJsRan = false;
    ensureLibsThenRun({
      force: true,
      js: prev.js,
      jsFunctions: prev.jsFunctions,
      jsExpressions: prev.jsExpressions,
      jsChunks: prev.jsChunks
    });
    return true;
  }

  function reportHostFailure(err) {
    showFailureStrip({ kind: 'host', err: err });
  }

  var api = {
    get phase() { return state.phase; },
    ensureLibsThenRun: ensureLibsThenRun,
    rerunAuthorJs: rerunAuthorJs,
    setBaseHtml: function (html) { if (typeof html === 'string') state.baseHtml = html; },
    clearFailureStrips: clearFailureStrips,
    reportHostFailure: reportHostFailure,
    softHarden: softHarden,
    wantsLeaflet: wantsLeaflet,
    wantsChart: wantsChart
  };
  return api;
})();
`
}

/** Escape a JS string for embedding inside a classic <script> as JSON. */
export function jsonEmbed(value: string): string {
  return JSON.stringify(value)
}
