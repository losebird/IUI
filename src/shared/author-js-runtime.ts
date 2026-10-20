/**
 * Author JS readiness + chunked execution (P0 structural fix).
 * Host-side splitter is tested in Node; iframe pipeline mirrors a compact
 * version so preview-shell and final srcdoc share one readiness path.
 */

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
  var LEAFLET_JS = VND.leafletJs || 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = VND.leafletCss || 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  var CHART_JS = VND.chartJs || 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var AGGRID_JS = VND.agGridJs || 'https://cdn.jsdelivr.net/npm/ag-grid-community@32.3.3/dist/ag-grid-community.min.js';
  var AGGRID_CSS = VND.agGridCss || 'https://cdn.jsdelivr.net/npm/ag-grid-community@32.3.3/styles/ag-grid.css';
  var AGGRID_THEME = VND.agGridTheme || 'https://cdn.jsdelivr.net/npm/ag-grid-community@32.3.3/styles/ag-theme-quartz.css';
  var MERMAID_JS = VND.mermaidJs || 'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js';
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

  function wantsLeaflet(src) {
    src = String(src || '');
    return src.indexOf('L.map') !== -1
      || src.indexOf('L.tileLayer') !== -1
      || src.indexOf('L.marker') !== -1
      || src.indexOf('L.polyline') !== -1
      || src.indexOf('L.divIcon') !== -1
      || src.indexOf('L.circleMarker') !== -1
      || src.indexOf('createTripAnimator') !== -1
      || src.indexOf('iui-map-wrap') !== -1
      || !!(hq('.iui-map-wrap, #map, [id="map"]'));
  }

  function wantsAgGrid(src) {
    src = String(src || '');
    return src.indexOf('agGrid') !== -1
      || src.indexOf('ag-grid-community') !== -1
      || src.indexOf('ag-theme-') !== -1
      || !!(hq('[class*="ag-theme"]'));
  }
  function wantsMermaid(src) {
    src = String(src || '');
    return src.indexOf('mermaid.run') !== -1
      || src.indexOf('mermaid.initialize') !== -1
      || src.indexOf('iui-mindmap') !== -1
      || !!(hq('.mermaid, .iui-mindmap'));
  }

  function wantsChart(src) {
    src = String(src || '');
    var hasCanvas = !!(hq('canvas'));
    return src.indexOf('new Chart') !== -1
      || src.indexOf('iuiCreateChart') !== -1
      || src.indexOf('iui-weather-chart') !== -1
      || src.indexOf('wxChart') !== -1
      || src.indexOf('__iuiChartMod') !== -1
      || src.indexOf('Chart.getChart') !== -1
      || src.indexOf('chart.js') !== -1
      || (src.indexOf('Chart') !== -1 && /line|bar|doughnut|pie|radar|polarArea/i.test(src))
      || (hasCanvas && /Chart|chart\\.js|doughnut|pie|radar|bar|line/i.test(src));
  }

  function ensureCss(href) {
    if (hq('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
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

  function showFailureStrip(opts) {
    opts = opts || {};
    var kind = opts.kind === 'host' ? 'host' : 'author';
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
    if (kind === 'host') {
      title.textContent = zh
        ? '宿主 / 插件失败（不是模型作者 JS）'
        : 'Host / plugin failure (not model author JS)';
    } else if (index >= 0 && total > 0) {
      title.textContent = zh
        ? ('模型作者 JS 第 ' + (index + 1) + '/' + total + ' 片失败')
        : ('Model author JS chunk ' + (index + 1) + '/' + total + ' failed');
    } else {
      title.textContent = zh ? '模型作者 JS 失败' : 'Model author JS failed';
    }
    var detail = document.createElement('div');
    detail.textContent = (name ? name + ': ' : '') + msg;
    var meta = document.createElement('div');
    meta.className = 'iui-fail-meta';
    var missingEl = kind === 'author' && /of null|null is not an object|is null\b/.test(msg);
    meta.textContent = missingEl
      ? (zh
        ? '页面脚本找不到某个元素：JS 里的 id / 选择器和 HTML 对不上。可点「重新生成」让模型修正。'
        : 'Page script could not find an element: an id/selector in the JS does not match the HTML. Regenerate to let the model fix it.')
      : zh
      ? (kind === 'host'
        ? '这是 IUI 沙箱宿主问题。可点「重新加载」整页，或「重跑作者 JS」再试。'
        : '这是模型写出的脚本问题。其它分片仍可能已执行；可只重跑作者 JS，无需整页刷新。')
      : (kind === 'host'
        ? 'This is an IUI host/plugin issue. Reload the page, or re-run author JS.'
        : 'This is model-authored script. Other chunks may still have run; re-run author JS without a full reload.');
    body.appendChild(title);
    body.appendChild(detail);
    body.appendChild(meta);
    strip.appendChild(body);

    if (kind === 'author') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-iui-rerun-author', '1');
      btn.textContent = zh ? '重跑作者 JS' : 'Re-run author JS';
      btn.addEventListener('click', function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        try { api.rerunAuthorJs(); } catch (e2) {
          try { post({ type: 'error', message: String(e2 && e2.message ? e2.message : e2), kind: 'host' }); } catch (e3) {}
        }
      });
      strip.appendChild(btn);
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
        kind: kind
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
    withDomReplay(function () {
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
    });
    setPhase('authorSettled');
    try {
      post({ type: 'authorSettled', ok: failed === 0, failedChunks: failed });
    } catch (e) {}
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
        ensureScript(LEAFLET_JS, function (ok) {
          if (!ok) {
            showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'Leaflet CDN failed to load' } });
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
        ensureScript(CHART_JS, function (ok) {
          if (!ok) {
            showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'Chart.js CDN failed to load' } });
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
        ensureScript(AGGRID_JS, function (ok) {
          if (!ok) showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'AG Grid CDN failed to load' } });
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
        ensureScript(MERMAID_JS, function (ok) {
          if (!ok) showFailureStrip({ kind: 'host', err: { name: 'HostError', message: 'Mermaid CDN failed to load' } });
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
    var i = 0;
    function step() {
      if (i >= chain.length) {
        setPhase('libsReady');
        try { post({ type: 'libsReady' }); } catch (e) {}
        done();
        return;
      }
      chain[i++](step);
    }
    step();
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
