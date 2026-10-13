/**
 * Author JS readiness + chunked execution (P0 structural fix).
 * Host-side splitter is tested in Node; iframe pipeline mirrors a compact
 * version so preview-shell and final srcdoc share one readiness path.
 */

/**
 * Split author JS into top-level statement chunks (brace/string/comment aware).
 * One SyntaxError or throw in a later chunk must not prevent earlier bindings.
 */
export function splitAuthorJsChunks(source: string): string[] {
  if (!source || !source.trim()) return []
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
  return chunks.length > 0 ? chunks : [source.trim()]
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
  var LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  var CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var state = { phase: 'boot', ran: false, lastOpts: null };

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
      || !!(document.querySelector && document.querySelector('.iui-map-wrap, #map, [id="map"]'));
  }

  function wantsChart(src) {
    src = String(src || '');
    var hasCanvas = !!(document.querySelector && document.querySelector('canvas'));
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
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  function ensureScript(src, done) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (typeof L !== 'undefined' && src.indexOf('leaflet') !== -1) { done(true); return; }
      if (typeof Chart !== 'undefined' && src.indexOf('chart') !== -1) { done(true); return; }
      var n0 = 0;
      var t0 = setInterval(function () {
        if ((src.indexOf('leaflet') !== -1 && typeof L !== 'undefined')
          || (src.indexOf('chart') !== -1 && typeof Chart !== 'undefined')
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
    meta.textContent = zh
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

  var NULL_NODE = (function () {
    var n = { nodeType: 1, style: {}, classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
      setAttribute: function () {}, getAttribute: function () { return null; }, removeAttribute: function () {},
      appendChild: function (c) { return c; }, insertBefore: function (c) { return c; }, removeChild: function (c) { return c; },
      querySelector: function () { return n; }, querySelectorAll: function () { return []; },
      addEventListener: function () {}, removeEventListener: function () {},
      closest: function () { return n; }, matches: function () { return false; },
      getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
      innerHTML: '', textContent: '', value: '', src: '', href: '', alt: '', id: '', className: '',
      parentNode: null, firstChild: null, isConnected: false };
    try {
      ['src', 'href', 'alt', 'textContent', 'innerHTML', 'value', 'id', 'className'].forEach(function (k) {
        Object.defineProperty(n, k, { configurable: true, enumerable: true, get: function () { return ''; }, set: function () {} });
      });
    } catch (eN) {}
    return n;
  })();
  var origQS = Document.prototype.querySelector;
  var origEQS = Element.prototype.querySelector;
  function ensureLiveImg() {
    var root = origGEBI ? origGEBI('iui-preview-root') : document.getElementById('iui-preview-root');
    if (!root) root = document.body;
    var img = origEQS.call(root, 'img');
    if (img) return img;
    var slot = origEQS.call(root, '.photo') || origEQS.call(root, '.cover') || origEQS.call(root, '.iui-gallery') || root;
    img = document.createElement('img');
    img.setAttribute('data-iui-live-img', '1');
    try { slot.insertBefore(img, slot.firstChild); } catch (e) {
      try { slot.appendChild(img); } catch (e2) {}
    }
    return img;
  }
  var origGEBI = document.getElementById.bind(document);
  function installNullSafeQuery() {
    if (document.__iuiNullSafe) return;
    document.__iuiNullSafe = true;
    Document.prototype.querySelector = function (sel) {
      var el = origQS.call(this, sel);
      if (el) return el;
      var s = String(sel || '');
      if (s === 'img' || s.indexOf('img') !== -1) return ensureLiveImg();
      return NULL_NODE;
    };
    Element.prototype.querySelector = function (sel) {
      var el = origEQS.call(this, sel);
      if (el) return el;
      var s = String(sel || '');
      if (s === 'img' || s.indexOf('img') !== -1) return ensureLiveImg();
      return NULL_NODE;
    };
    document.getElementById = function (id) {
      var el = origGEBI(id);
      if (el) return el;
      if (String(id || '').toLowerCase().indexOf('img') !== -1 || String(id || '') === 'photo') return ensureLiveImg();
      return NULL_NODE;
    };
  }
  function runChunkList(parts, exprs) {
    setPhase('authorRunning');
    var failed = 0;
    installNullSafeQuery();
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
    ensureLibs(probe, function () {
      waitDomRoot(function () {
        setPhase('domPainted');
        // Author JS must not run before libsReady — gate is ensureLibs above.
        runChunkList(parts, exprs);
        setPhase('live');
      });
    });
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
