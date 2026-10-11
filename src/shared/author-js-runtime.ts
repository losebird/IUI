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
  var state = { phase: 'boot', ran: false };

  function post(msg) {
    try {
      var fid = window.__iuiFrameId || 'iui-html';
      parent.postMessage(Object.assign({ source: 'iui-html', frameId: fid }, msg), '*');
    } catch (e) {}
  }

  function setPhase(p) { state.phase = p; }

  function softHarden(src) {
    if (typeof src !== 'string') return '';
    var q = String.fromCharCode;
    var out = src
      .split(q(0x2018)).join("'").split(q(0x2019)).join("'").split(q(0x2032)).join("'")
      .split(q(0x201C)).join('"').split(q(0x201D)).join('"').split(q(0x2033)).join('"');
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

  function showChunkError(index, total, err) {
    try {
      var banner = document.createElement('pre');
      banner.className = 'iui-sandbox-muted';
      banner.setAttribute('data-iui-error', '1');
      banner.setAttribute('data-iui-chunk', String(index));
      banner.textContent = '脚本第 ' + (index + 1) + '/' + total + ' 片失败：' + String(err && err.message ? err.message : err);
      document.body.appendChild(banner);
    } catch (e) {}
    try {
      post({ type: 'error', message: 'chunk ' + (index + 1) + '/' + total + ': ' + String(err && err.message ? err.message : err) });
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
          console.error('[iui-html] chunk', p, err);
          showChunkError(p, total, err);
        }
      }
      var list = Array.isArray(exprs) ? exprs.slice(0, 64) : [];
      for (var e = 0; e < list.length; e++) {
        try { (0, eval)(softHarden(list[e])); }
        catch (err2) {
          failed++;
          console.error('[iui-html] expr', e, err2);
          showChunkError(total + e, total + list.length, err2);
        }
      }
    });
    setPhase('authorSettled');
    try { post({ type: 'authorSettled', ok: failed === 0, failedChunks: failed }); } catch (e) {}
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
        ensureScript(LEAFLET_JS, function () {
          waitGlobal(function () { return typeof L !== 'undefined'; }, function () { next(); });
        });
      });
    } else if (wantsLeaflet(probe)) {
      chain.push(function (next) {
        waitGlobal(function () { return typeof L !== 'undefined'; }, function () { next(); });
      });
    }
    if (wantsChart(probe) && typeof Chart === 'undefined') {
      chain.push(function (next) {
        ensureScript(CHART_JS, function () {
          waitGlobal(function () { return typeof Chart !== 'undefined'; }, function () { next(); });
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
    if (state.ran) return;
    state.ran = true;
    window.__iuiAuthorJsRan = true;
    var fnSrc = softHarden(typeof opts.jsFunctions === 'string' ? opts.jsFunctions : '');
    var body = softHarden(typeof opts.js === 'string' ? opts.js : '');
    var exprs = Array.isArray(opts.jsExpressions) ? opts.jsExpressions : [];
    var preChunks = Array.isArray(opts.jsChunks) ? opts.jsChunks : null;
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

  return {
    get phase() { return state.phase; },
    ensureLibsThenRun: ensureLibsThenRun,
    softHarden: softHarden,
    wantsLeaflet: wantsLeaflet,
    wantsChart: wantsChart
  };
})();
`
}

/** Escape a JS string for embedding inside a classic <script> as JSON. */
export function jsonEmbed(value: string): string {
  return JSON.stringify(value)
}
