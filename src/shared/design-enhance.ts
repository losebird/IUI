/**
 * D4 / D6 / D8: in-frame progressive enhancement (ES5 string, no eval).
 *
 * - D4 horizontal scrollers get edge fade masks + a thin position indicator
 * - D8 <pre> blocks get 换行 / 复制 tools (copy falls back to the host)
 * - D6 Leaflet markers closer than ~24px are spread on a small ring (CSS
 *   `translate`, so Leaflet's own transform and the trip animator are untouched)
 *
 * Expects `post(msg)` and `measure()` from the bridge closure.
 */
export const DESIGN_ENHANCE_JS = String.raw`
  var __iuiEnhTimer = 0;
  var SCROLLER_SEL = '.iui-cards-strip, .iui-hscroll, .iui-scroll-x, [data-iui-scroll-x], #iui-preview-root [style*="overflow-x"], #iui-preview-root [style*="overflow: auto"], #iui-preview-root [style*="overflow:auto"]';
  function iuiZh() {
    try {
      var lang = String(document.documentElement.lang || navigator.language || '');
      if (/^zh/i.test(lang)) return true;
      var root = document.getElementById('iui-preview-root');
      return !!(root && /[\u3400-\u9fff]/.test(String(root.textContent || '').slice(0, 2000)));
    } catch (e) { return false; }
  }
  function updateScroller(el) {
    try {
      var sw = el.scrollWidth, cw = el.clientWidth;
      if (!cw || sw - cw <= 2) {
        if (el.hasAttribute('data-iui-scroll-fade')) el.removeAttribute('data-iui-scroll-fade');
        if (el.getAttribute('data-iui-scroll-ind') === '1') el.style.setProperty('--iui-scroll-w', '0%');
        return;
      }
      var max = sw - cw, x = Math.max(0, Math.min(max, el.scrollLeft));
      var v = (x > 2 ? 'l' : '') + (x < max - 2 ? (x > 2 ? ' r' : 'r') : '');
      if (el.getAttribute('data-iui-scroll-fade') !== v) el.setAttribute('data-iui-scroll-fade', v);
      if (el.getAttribute('data-iui-scroll-ind') === '1') {
        el.style.setProperty('--iui-scroll-w', (Math.max(8, cw / sw * 100)).toFixed(2) + '%');
        el.style.setProperty('--iui-scroll-x', (x / max * 100).toFixed(2) + '%');
      }
    } catch (e) {}
  }
  function bindScrollers() {
    var list;
    try { list = document.querySelectorAll(SCROLLER_SEL); } catch (e) { return; }
    for (var i = 0; i < list.length && i < 40; i++) {
      var el = list[i];
      if (!el.__iuiScroll) {
        el.__iuiScroll = 1;
        try {
          var cs = getComputedStyle(el);
          if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') { el.__iuiScroll = 2; continue; }
          if (cs.backgroundImage === 'none' && !el.hasAttribute('data-iui-no-indicator')) el.setAttribute('data-iui-scroll-ind', '1');
          if (typeof ResizeObserver !== 'undefined') {
            (function (node) { new ResizeObserver(function () { updateScroller(node); }).observe(node); })(el);
          }
        } catch (e1) {}
      }
      if (el.__iuiScroll === 1) updateScroller(el);
    }
  }
  try {
    document.addEventListener('scroll', function (ev) {
      var t = ev.target;
      if (t && t.__iuiScroll === 1) updateScroller(t);
    }, { capture: true, passive: true });
  } catch (e) {}

  function copyText(text, btn) {
    var zh = iuiZh();
    function done(ok) {
      if (!btn) return;
      btn.textContent = ok ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy');
      setTimeout(function () { btn.textContent = zh ? '复制' : 'Copy'; }, 1400);
    }
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { ok = false; }
    // Opaque-origin frames usually cannot write the clipboard; the host copies (needs the same click).
    if (!ok) { try { post({ type: 'copyText', text: String(text).slice(0, 200000) }); ok = true; } catch (e2) {} }
    done(ok);
  }
  function enhanceCode() {
    var pres;
    try { pres = document.querySelectorAll('#iui-preview-root pre'); } catch (e) { return; }
    var zh = iuiZh();
    for (var i = 0; i < pres.length && i < 30; i++) {
      var pre = pres[i];
      if (pre.__iuiCode) continue;
      pre.__iuiCode = 1;
      try {
        if (pre.classList.contains('mermaid') || pre.closest('[data-iui-no-tools], [data-iui-error], .iui-code-wrap, svg, .mermaid')) continue;
        var txt = String(pre.textContent || '');
        if (txt.trim().length < 20 && txt.indexOf('\n') < 0) continue;
        var wrap = document.createElement('div');
        wrap.className = 'iui-code-wrap';
        wrap.setAttribute('data-wrap', '0');
        var bar = document.createElement('div');
        bar.className = 'iui-code-tools';
        var bWrap = document.createElement('button');
        bWrap.type = 'button'; bWrap.setAttribute('data-iui-code', 'wrap'); bWrap.setAttribute('aria-pressed', 'false');
        bWrap.textContent = zh ? '换行' : 'Wrap';
        var bCopy = document.createElement('button');
        bCopy.type = 'button'; bCopy.setAttribute('data-iui-code', 'copy');
        bCopy.textContent = zh ? '复制' : 'Copy';
        bar.appendChild(bWrap); bar.appendChild(bCopy);
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(bar);
        wrap.appendChild(pre);
      } catch (e1) {}
    }
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var btn = t && t.closest ? t.closest('.iui-code-tools > button[data-iui-code]') : null;
    if (!btn) return;
    var wrap = btn.closest('.iui-code-wrap');
    var pre = wrap && wrap.querySelector('pre');
    if (!pre) return;
    ev.preventDefault();
    if (btn.getAttribute('data-iui-code') === 'wrap') {
      var on = wrap.getAttribute('data-wrap') !== '1';
      wrap.setAttribute('data-wrap', on ? '1' : '0');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      measure();
    } else {
      copyText(String(pre.innerText || pre.textContent || ''), btn);
    }
  }, true);

  // D6: spread markers that would overlap (same/similar coordinates) on a small ring.
  function declutterMap(map) {
    try {
      if (!map || !map._loaded || typeof map.latLngToLayerPoint !== 'function') return;
      var items = [];
      map.eachLayer(function (layer) {
        if (!layer || !layer._icon || typeof layer.getLatLng !== 'function') return;
        if (layer.options && layer.options.iuiNoDeclutter) return;
        var p = map.latLngToLayerPoint(layer.getLatLng());
        items.push({ layer: layer, x: p.x, y: p.y, g: -1 });
      });
      if (items.length < 2 || items.length > 400) return;
      var R = 24, groups = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].g >= 0) continue;
        var g = [items[i]]; items[i].g = groups.length;
        for (var j = i + 1; j < items.length; j++) {
          if (items[j].g >= 0) continue;
          for (var k = 0; k < g.length; k++) {
            var dx = items[j].x - g[k].x, dy = items[j].y - g[k].y;
            if (dx * dx + dy * dy < R * R) { items[j].g = groups.length; g.push(items[j]); break; }
          }
        }
        groups.push(g);
      }
      for (var gi = 0; gi < groups.length; gi++) {
        var grp = groups[gi], n = grp.length;
        var cx = 0, cy = 0;
        for (var a = 0; a < n; a++) { cx += grp[a].x; cy += grp[a].y; }
        cx /= n; cy /= n;
        var ring = n > 1 ? Math.max(18, 9 * n / Math.PI + 10) : 0;
        for (var b = 0; b < n; b++) {
          var it = grp[b], tx = 0, ty = 0;
          if (n > 1) {
            var ang = -Math.PI / 2 + b * 2 * Math.PI / n;
            tx = Math.round(cx + ring * Math.cos(ang) - it.x);
            ty = Math.round(cy + ring * Math.sin(ang) - it.y);
          }
          var val = (tx || ty) ? tx + 'px ' + ty + 'px' : '';
          var icon = it.layer._icon;
          if (val) icon.setAttribute('data-iui-declutter', '1');
          else if (icon.hasAttribute('data-iui-declutter')) icon.removeAttribute('data-iui-declutter');
          if (icon.style.translate !== val) icon.style.translate = val;
          try {
            var tip = it.layer.getTooltip && it.layer.getTooltip();
            if (tip && tip._container) tip._container.style.translate = val;
          } catch (eT) {}
        }
      }
    } catch (e) {}
  }
  var __iuiMaps = [];
  window.__iuiTrackDeclutter = function (map) {
    if (!map || map.__iuiDeclutter) return;
    map.__iuiDeclutter = true;
    __iuiMaps.push(map);
    var timer = 0;
    function later() { clearTimeout(timer); timer = setTimeout(function () { declutterMap(map); }, 60); }
    try {
      map.on('zoomend', later); map.on('viewreset', later); map.on('layeradd', later); map.on('tooltipopen', later);
      map.whenReady(later);
    } catch (e) {}
  };

  function enhanceAll() {
    bindScrollers();
    enhanceCode();
    for (var i = 0; i < __iuiMaps.length; i++) declutterMap(__iuiMaps[i]);
  }
  window.__iuiEnhance = function () {
    clearTimeout(__iuiEnhTimer);
    __iuiEnhTimer = setTimeout(enhanceAll, 90);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__iuiEnhance);
  else window.__iuiEnhance();
  window.addEventListener('load', window.__iuiEnhance);
`
