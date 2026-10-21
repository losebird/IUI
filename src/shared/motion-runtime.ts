/**
 * R5-1 motion runtime (inline in every iui-html sandbox; zero author tokens).
 *
 * 1. Clickable marking — when author JS binds click/pointer handlers (or `.onclick`) on a
 *    non-native element, it gets `data-iui-clickable="card" | "1"` so the polish CSS gives it
 *    a pointer, hover lift and press feedback (F23 then adds keyboard access via cursor).
 * 2. Entrance — blocks fade/rise in once, staggered. Keys are DOM paths, so streaming
 *    re-renders (root.innerHTML = …) never replay an entrance; only new blocks animate.
 * 3. Swap — DOM changed within 600ms of a click/input eases in (`.iui-swap-in`), and numbers
 *    that changed tween from the old to the new value.
 * 4. Count-up — on an atomic first paint (complete document, not a streaming shell) hero/stat
 *    numbers count up once.
 * Everything is skipped under prefers-reduced-motion and for `[data-iui-no-motion]` subtrees.
 * Source deliberately avoids backslashes (it is embedded in a template literal).
 */
export function buildMotionRuntimeScript(opts: { streaming: boolean }): string {
  return `<script>
(function () {
  if (window.__iuiMotion) return;
  var M = window.__iuiMotion = { seen: Object.create(null), lastUser: 0, streaming: ${opts.streaming ? 'true' : 'false'}, passes: 0 };
  function reduce() {
    try { return window.__iuiReducedMotion ? window.__iuiReducedMotion() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function rootEl() { return document.getElementById('iui-preview-root'); }
  var raf = window.requestAnimationFrame ? function (f) { return requestAnimationFrame(f); } : function (f) { return setTimeout(f, 16); };
  var NATIVE = { A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, SUMMARY: 1, OPTION: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, HTML: 1, BODY: 1 };
  function skipZone(el) {
    try { return !!(el.closest && el.closest('.leaflet-container,[data-iui-no-motion],.iui-3d-stage,[contenteditable]')); } catch (e) { return true; }
  }

  // 1. clickable marking
  var CLICKY = { click: 1, pointerup: 1, pointerdown: 1, mouseup: 1, mousedown: 1, touchend: 1 };
  var pending = [], markTimer = 0;
  function note(el) {
    if (!el || el.nodeType !== 1 || NATIVE[el.tagName] || el.id === 'iui-preview-root') return;
    if (pending.length < 3000) pending.push({ el: el, tries: 0 });
    if (!markTimer) markTimer = setTimeout(classifyAll, 120);
  }
  function classify(el) {
    if (el.hasAttribute('data-iui-clickable') || skipZone(el)) return true;
    if (!(el instanceof HTMLElement)) { el.setAttribute('data-iui-clickable', '1'); return true; }
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // Delegation containers / wrappers with real controls inside are not "a card".
    if (el.querySelector('button,a[href],input,select,textarea')) return true;
    var root = rootEl();
    var rr = root ? root.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
    if (r.height > 360 || (r.width >= rr.width * 0.97 && r.height > 160)) return true;
    el.setAttribute('data-iui-clickable', r.width >= 72 && r.height >= 44 ? 'card' : '1');
    return true;
  }
  function classifyAll() {
    markTimer = 0;
    var keep = [];
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      var done = false;
      try { done = p.el.isConnected ? classify(p.el) : false; } catch (e) { done = true; }
      if (!done && ++p.tries < 6) keep.push(p);
    }
    pending = keep;
    if (pending.length && !markTimer) markTimer = setTimeout(classifyAll, 400);
  }
  try {
    var origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opt) {
      try { if (CLICKY[type] && this && this.nodeType === 1) note(this); } catch (e) {}
      return origAdd.call(this, type, fn, opt);
    };
    var desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onclick');
    if (desc && desc.set && desc.configurable) {
      Object.defineProperty(HTMLElement.prototype, 'onclick', {
        configurable: true, enumerable: desc.enumerable, get: desc.get,
        set: function (v) { try { if (v) note(this); } catch (e) {} desc.set.call(this, v); }
      });
    }
  } catch (e) {}

  // Number helpers (count-up + swap tween)
  function parseNum(t) {
    var s = String(t == null ? '' : t).trim();
    if (!s || s.length > 32) return null;
    var m = /^([^0-9-]{0,4})(-?[0-9][0-9,]*(?:[.][0-9]+)?)([^0-9]{0,6})$/.exec(s);
    if (!m) return null;
    var raw = m[2];
    var v = parseFloat(raw.split(',').join(''));
    if (!isFinite(v)) return null;
    var dot = raw.indexOf('.');
    return { pre: m[1], suf: m[3], v: v, dec: dot < 0 ? 0 : raw.length - dot - 1, comma: raw.indexOf(',') >= 0 };
  }
  function fmt(n, v) {
    var s = v.toFixed(n.dec);
    if (n.comma) {
      var parts = s.split('.');
      var neg = parts[0].charAt(0) === '-';
      var ip = neg ? parts[0].slice(1) : parts[0];
      var out = '';
      while (ip.length > 3) { out = ',' + ip.slice(-3) + out; ip = ip.slice(0, -3); }
      s = (neg ? '-' : '') + ip + out + (parts[1] ? '.' + parts[1] : '');
    }
    return n.pre + s + n.suf;
  }
  function tween(el, from, to, ms) {
    if (el.__iuiTween) el.__iuiTween.stop = true;
    var job = { stop: false };
    el.__iuiTween = job;
    var t0 = 0, last = fmt(to, from);
    el.__iuiW = last;
    el.textContent = last;
    function step(ts) {
      if (job.stop) return;
      if (el.textContent !== last) return; // someone else wrote the value: stop quietly
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms);
      var e = 1 - Math.pow(1 - k, 3);
      last = k >= 1 ? fmt(to, to.v) : fmt(to, from + (to.v - from) * e);
      el.__iuiW = last;
      el.textContent = last;
      if (k < 1) raf(step); else el.__iuiTween = null;
    }
    raf(step);
  }
  var NUM_SEL = '.iui-hero-value,.iui-stat-value,.iui-sandbox-kpi .value,.iui-kpi-value,[data-countup]';
  function countUp(scope) {
    try {
      var els = scope.querySelectorAll(NUM_SEL);
      for (var i = 0; i < els.length && i < 24; i++) {
        var el = els[i];
        if (el.children.length || skipZone(el) || el.__iuiCounted) continue;
        el.__iuiCounted = true;
        var n = parseNum(el.textContent);
        if (!n || Math.abs(n.v) < 2) continue;
        tween(el, 0, n, 800);
      }
    } catch (e) {}
  }

  // 2. entrance
  function units(root) {
    var lvl = root, guard = 0;
    while (lvl && lvl.children.length === 1 && guard++ < 3) lvl = lvl.children[0];
    return lvl;
  }
  function keyOf(el, root) {
    var parts = [];
    var cur = el;
    while (cur && cur !== root && parts.length < 12) {
      var i = 0, s = cur;
      while ((s = s.previousElementSibling)) i++;
      parts.push(cur.tagName + i);
      cur = cur.parentElement;
    }
    return parts.reverse().join('/');
  }
  function animatable(el) {
    if (!(el instanceof HTMLElement) || skipZone(el)) return false;
    var tn = el.tagName;
    if (tn === 'SCRIPT' || tn === 'STYLE' || tn === 'BR' || tn === 'TEMPLATE') return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents' || cs.display === 'inline') return false;
    if (cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') return false;
    if (cs.animationName && cs.animationName !== 'none') return false;
    return el.getClientRects().length > 0;
  }
  function enter(el, idx) {
    el.style.setProperty('--iui-enter-delay', Math.min(idx, 8) * 45 + 'ms');
    el.classList.add('iui-enter');
    var done = function () { el.classList.remove('iui-enter'); el.style.removeProperty('--iui-enter-delay'); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
    setTimeout(done, 1200);
  }
  // A block that wraps already-visible content (the tree regrouped mid-stream) must not fade in again.
  function seenInside(k) {
    var pre = k + '/';
    for (var s in M.seen) if (s.indexOf(pre) === 0) return true;
    return false;
  }
  function entrancePass() {
    var root = rootEl();
    if (!root) return;
    M.passes++;
    segScan();
    var motion = !reduce();
    var top = units(root);
    var idx = 0;
    var list = top === root ? root.children : top.children;
    for (var i = 0; i < list.length && i < 80; i++) {
      var u = list[i];
      var k = keyOf(u, root);
      var isNew = !M.seen[k] && !seenInside(k);
      M.seen[k] = 1;
      if (isNew && motion && animatable(u)) { enter(u, idx++); }
      var kids = u.children;
      for (var j = 0; j < kids.length && j < 60; j++) {
        var c = kids[j];
        var kk = keyOf(c, root);
        var cNew = !M.seen[kk] && !seenInside(kk);
        M.seen[kk] = 1;
        if (cNew && !isNew && motion && animatable(c)) enter(c, idx++);
      }
    }
  }

  // 3. swap after interaction
  var burst = new WeakMap();
  function swap(el, oldText) {
    if (!(el instanceof HTMLElement) || skipZone(el) || el === rootEl()) return;
    var now = Date.now();
    var b = burst.get(el) || { n: 0, t: now };
    if (now - b.t > 700) { b.n = 0; b.t = now; }
    b.n++;
    burst.set(el, b);
    if (b.n > 3 || el.hasAttribute('data-iui-live')) { el.setAttribute('data-iui-live', '1'); return; }
    if (oldText != null && !el.children.length) {
      var a = parseNum(oldText), z = parseNum(el.textContent);
      if (a && z && a.pre === z.pre && a.suf === z.suf && a.v !== z.v) { tween(el, a.v, z, 450); return; }
    }
    if (el.classList.contains('iui-swap-in')) return;
    el.classList.add('iui-swap-in');
    var off = function () { el.classList.remove('iui-swap-in'); el.removeEventListener('animationend', off); };
    el.addEventListener('animationend', off);
    setTimeout(off, 800);
  }
  ['pointerdown', 'click', 'input', 'change', 'keydown'].forEach(function (t) {
    try { document.addEventListener(t, function () { M.lastUser = Date.now(); }, true); } catch (e) {}
  });
  var entranceQueued = false, lastPass = 0;
  function queueEntrance() {
    if (entranceQueued) return;
    entranceQueued = true;
    var wait = Math.max(0, 120 - (Date.now() - lastPass));
    setTimeout(function () { raf(function () { entranceQueued = false; lastPass = Date.now(); try { entrancePass(); } catch (e) {} }); }, wait);
  }
  function own(el) { return !!el && (el.__iuiTween || (el.__iuiW != null && el.__iuiW === el.textContent)); }
  function onMutations(list) {
    // Ignore churn inside maps / opted-out zones and our own number writes.
    var relevant = [];
    for (var r = 0; r < list.length && r < 200; r++) {
      var t = list[r].target.nodeType === 1 ? list[r].target : list[r].target.parentElement;
      if (!t || own(t) || skipZone(t)) continue;
      relevant.push({ m: list[r], el: t });
    }
    if (!relevant.length) return;
    var user = Date.now() - M.lastUser < 600;
    if (!user) { queueEntrance(); return; }
    if (reduce()) return;
    var done = [];
    for (var i = 0; i < relevant.length && i < 60; i++) {
      var m = relevant[i].m;
      var el = relevant[i].el;
      if (done.indexOf(el) >= 0) continue;
      done.push(el);
      var old = null;
      if (m.type === 'characterData') old = m.oldValue;
      else if (m.removedNodes && m.removedNodes.length === 1 && m.removedNodes[0].nodeType === 3) old = m.removedNodes[0].data;
      try { swap(el, old); } catch (e) {}
    }
    // Keep entrance keys in sync so a later streaming pass does not replay swapped blocks.
    try { var root = rootEl(); if (root) { var top = units(root); var l = top.children; for (var q = 0; q < l.length && q < 80; q++) M.seen[keyOf(l[q], root)] = 1; } } catch (e) {}
  }
  // 2b. toggle groups → segmented control. A parent whose children are 2–6 short buttons, one of which
  // carries a pressed / selected / active state, gets data-iui-seg (styled by the polish layer).
  var SEG_ON = '[aria-pressed],[aria-selected=true],[aria-current=true],button.active,button.selected,button.on,button.is-active,button.current';
  function segScan() {
    try {
      var hits = document.body.querySelectorAll(SEG_ON);
      for (var i = 0; i < hits.length && i < 80; i++) {
        var b = hits[i];
        if (b.tagName !== 'BUTTON') continue;
        var p = b.parentElement;
        if (!p || p.hasAttribute('data-iui-seg') || p.__iuiSegNo || skipZone(p)) continue;
        if (p.matches('.iui-actions,.iui-sandbox-tabbar,.iui-map-chrome,.iui-cards-strip,[role=tablist],form') || p === rootEl()) { p.__iuiSegNo = 1; continue; }
        var kids = p.children, ok = kids.length >= 2 && kids.length <= 6;
        for (var k = 0; ok && k < kids.length; k++) {
          var c = kids[k];
          var txt = (c.textContent || '').trim();
          if (c.tagName !== 'BUTTON' || !txt || txt.length > 10 || c.children.length > 1) ok = false;
        }
        if (ok) p.setAttribute('data-iui-seg', '1'); else p.__iuiSegNo = 1;
      }
    } catch (e) {}
  }
  var segQueued = false;
  function queueSeg() { if (segQueued) return; segQueued = true; setTimeout(function () { segQueued = false; segScan(); }, 60); }

  // 3b. panels revealed by a click (tabs / segmented views toggling hidden, data-active, class…)
  function strip(c) { return String(c || '').split(' ').filter(function (x) { return x && x.indexOf('iui-') !== 0; }).sort().join(' '); }
  function shown(el) { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  var attrObs = null;
  function onAttrs(list) {
    queueSeg();
    if (Date.now() - M.lastUser >= 600 || reduce()) return;
    var hit = 0, done = [];
    for (var i = 0; i < list.length && i < 40 && hit < 6; i++) {
      var m = list[i], el = m.target;
      if (!(el instanceof HTMLElement) || done.indexOf(el) >= 0 || skipZone(el) || own(el)) continue;
      var name = m.attributeName, old = m.oldValue, cur = el.getAttribute(name);
      if (name === 'class' && strip(old) === strip(cur)) continue;
      if (old === cur) continue;
      done.push(el);
      if (!shown(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 72 || r.height < 32 || el.matches('button,a,input,select,textarea,label,[role=tab],[role=button]')) continue;
      var was;
      try {
        if (old == null) el.removeAttribute(name); else el.setAttribute(name, old);
        was = shown(el);
      } finally {
        if (cur == null) el.removeAttribute(name); else el.setAttribute(name, cur);
        if (attrObs) attrObs.takeRecords();
      }
      if (was) continue;
      hit++;
      try { swap(el, null); } catch (e) {}
    }
  }
  function boot() {
    var root = rootEl();
    if (!root) { setTimeout(boot, 50); return; }
    try { entrancePass(); } catch (e) {}
    if (!M.streaming && !reduce()) setTimeout(function () { countUp(root); }, 60);
    try {
      new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
      attrObs = new MutationObserver(onAttrs);
      attrObs.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'class', 'style', 'data-active', 'data-state', 'data-tab', 'aria-hidden', 'open'] });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
<\/script>`
}
