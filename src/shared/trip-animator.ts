/**
 * Trip pin-drop animator (window.createTripAnimator) for itinerary sandboxes.
 * Moved out of the retired OIU design-system module (visual ③).
 */
/**
 * Self-contained trip pin-drop animator for itinerary sandboxes.
 * Installed as window.createTripAnimator inside the sandbox.
 */
export function createTripAnimatorSource(): string {
  // Keep as a plain function body string so it serializes into the iframe.
  return `function createTripAnimator(options) {
  var stopCount = options.stopCount, onFrame = options.onFrame, onState = options.onState;
  var duration = options.durationMs != null ? options.durationMs : 6000;
  if (!Number.isInteger(stopCount) || stopCount < 2 || stopCount > 30)
    throw new Error("A trip needs 2–30 stops.");
  if (!Number.isFinite(duration) || duration < 1000 || duration > 120000)
    throw new Error("Trip duration must be between 1 and 120 seconds.");
  // Leaflet marker.getElement() is often still null on first paint. A truthy
  // pinElements array with holes must not throw. If the array is empty, adopt
  // .iui-pin-dot nodes already in the map pane.
  function resolvePins() {
    var out = [];
    var pins = options.pinElements;
    if (pins && typeof pins.forEach === 'function') {
      pins.forEach(function (pin) { if (pin) out.push(pin); });
    }
    if (out.length === 0) {
      var dots = document.querySelectorAll('.iui-pin-dot');
      for (var d = 0; d < dots.length; d++) out.push(dots[d]);
    }
    return out;
  }
  function eachPin(fn) {
    resolvePins().forEach(function (pin, index) {
      if (!pin) return;
      try { fn(pin, index); } catch (e) {}
    });
  }
  function showPins() {
    eachPin(function (pin, index) {
      if (!pin.textContent || !String(pin.textContent).trim()) pin.textContent = String(index + 1);
      if (pin.style) { pin.style.opacity = '1'; pin.style.transform = 'none'; }
    });
  }
  showPins();
  var elapsed = 0, lastTime = null, frameId = null, playing = false, disposed = false, frameFailed = false;
  var failStrip = null, failStyleOn = false;
  var stateLabel = { playing: "播放中", paused: "已暂停", complete: "已完成" };
  function publishState(state) {
    if (onState) onState(state, stateLabel[state]);
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function animatorFailStyle() {
    if (failStyleOn) return;
    failStyleOn = true;
    var style = document.createElement('style');
    style.id = 'iui-animator-fail-css';
    style.textContent = '.iui-fail-strip[data-iui-animator-fail]{display:block;margin:8px 0;padding:10px 12px;border-radius:10px;font:12px/1.45 system-ui,sans-serif;color:#991b1b;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.35);white-space:pre-wrap;word-break:break-word}'
      + '.iui-fail-strip[data-iui-animator-fail] .iui-fail-title{font-weight:700;margin-bottom:4px}'
      + '.iui-fail-strip[data-iui-animator-fail] .iui-fail-hint{margin-bottom:4px}'
      + '.iui-fail-strip[data-iui-animator-fail] .iui-fail-meta{opacity:.85;font-size:11px;margin-top:4px}';
    (document.head || document.documentElement).appendChild(style);
  }
  function reportOnFrameError(err) {
    frameFailed = true;
    playing = false;
    lastTime = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    console.error('[iui-html] trip animator onFrame', err);
    var msg = (err && err.name ? String(err.name) + ': ' : '') + (err && err.message ? String(err.message) : String(err));
    animatorFailStyle();
    if (!failStrip) {
      failStrip = document.createElement('div');
      failStrip.className = 'iui-fail-strip';
      failStrip.setAttribute('role', 'alert');
      failStrip.setAttribute('data-iui-animator-fail', '1');
      var root = document.getElementById('iui-preview-root');
      if (root && root.parentNode) root.parentNode.insertBefore(failStrip, root);
      else (document.body || document.documentElement).appendChild(failStrip);
    }
    var strip = failStrip;
    while (strip.firstChild) strip.removeChild(strip.firstChild);
    var title = document.createElement('div');
    title.className = 'iui-fail-title';
    title.textContent = '这段动画的代码出错了，动画已暂停。';
    var hint = document.createElement('div');
    hint.className = 'iui-fail-hint';
    hint.textContent = '可以点「重播」再试一次，或让 AI 重新生成这一页。';
    var meta = document.createElement('div');
    meta.className = 'iui-fail-meta';
    meta.textContent = msg;
    strip.appendChild(title);
    strip.appendChild(hint);
    strip.appendChild(meta);
    try {
      publishState(elapsed >= duration ? 'complete' : 'paused');
    } catch (stateErr) {
      console.error('[iui-html] trip animator onState', stateErr);
    }
  }
  function emit() {
    if (frameFailed || disposed) return;
    var progress = Math.min(1, elapsed / duration);
    var step = progress * (stopCount - 1);
    var fromIndex = Math.min(stopCount - 2, Math.floor(step));
    var travel = Math.min(1, (step - fromIndex) / 0.8);
    var fraction = travel * travel * (3 - 2 * travel);
    var pinStep = progress * stopCount;
    var pinIndex = Math.min(stopCount - 1, Math.floor(pinStep));
    var pinProgress = progress === 1 ? 1 : Math.min(1, (pinStep - pinIndex) / 0.55);
    eachPin(function (pin, index) {
      if (!pin.style) return;
      if (!playing && elapsed === 0) {
        pin.style.opacity = "1";
        pin.style.transform = "none";
        return;
      }
      var landing = index < pinIndex ? 1 : index === pinIndex ? pinProgress : 0;
      var t = landing - 1;
      var ease = 1 + 2.2 * t * t * t + 1.2 * t * t;
      pin.style.opacity = landing > 0 ? "1" : "0";
      pin.style.transform = "translateY(" + (-18 * (1 - ease)) + "px) scale(" + (0.72 + 0.28 * ease) + ")";
    });
    try {
      onFrame({
        progress: progress, fromIndex: fromIndex, toIndex: fromIndex + 1, fraction: fraction,
        activeStop: pinIndex, pinIndex: pinIndex, pinProgress: pinProgress
      });
    } catch (err) {
      reportOnFrameError(err);
    }
  }
  function pause() {
    if (disposed) return;
    playing = false; lastTime = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    publishState(elapsed >= duration ? "complete" : "paused");
  }
  function tick(time) {
    if (!playing || disposed) return;
    if (lastTime !== null) elapsed = Math.min(duration, elapsed + Math.max(0, time - lastTime));
    lastTime = time;
    emit();
    if (frameFailed) return;
    if (elapsed >= duration) pause();
    else frameId = requestAnimationFrame(tick);
  }
  function play() {
    if (disposed || playing || frameFailed) return;
    if (reduceMotion()) { elapsed = duration; emit(); publishState("complete"); return; }
    if (elapsed >= duration) return;
    playing = true; lastTime = null;
    publishState("playing");
    frameId = requestAnimationFrame(tick);
  }
  function seek(stop) {
    if (disposed) return;
    if (!Number.isInteger(stop) || stop < 0 || stop >= stopCount)
      throw new Error("Stop index is outside this trip.");
    pause();
    elapsed = stop === stopCount - 1 ? duration : duration * (stop + 0.6) / stopCount;
    emit();
    publishState(elapsed >= duration ? "complete" : "paused");
  }
  function refreshMaps() {
    try {
      if (options.map && typeof options.map.invalidateSize === 'function') {
        try { options.map.invalidateSize({ animate: false }); } catch (e0) { options.map.invalidateSize(); }
        try {
          options.map.eachLayer(function (layer) {
            if (layer && typeof layer.redraw === 'function') layer.redraw();
          });
        } catch (e1) {}
      }
    } catch (e) {}
    try {
      if (window.L && typeof L.iuiRefreshMaps === 'function') L.iuiRefreshMaps('animator-replay');
    } catch (e2) {}
  }
  function removeFailStrip() {
    var strip = failStrip;
    failStrip = null;
    if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
  }
  function replay() {
    if (disposed) return;
    frameFailed = false;
    pause(); elapsed = 0; emit();
    if (frameFailed) return;
    refreshMaps();
    play();
    if (!frameFailed) removeFailStrip();
    setTimeout(refreshMaps, 80);
    setTimeout(refreshMaps, 320);
    setTimeout(refreshMaps, 800);
  }
  function onVisibility() { if (document.hidden) pause(); }
  function dispose() {
    if (disposed) return;
    pause(); disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", dispose);
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", dispose);
  if (reduceMotion()) elapsed = duration;
  emit();
  setTimeout(showPins, 0);
  setTimeout(showPins, 160);
  setTimeout(showPins, 480);
  return { play: play, pause: pause, replay: replay, seek: seek, dispose: dispose };
}`
}

export function buildTripAnimatorScriptTag(): string {
  return `<script>window.createTripAnimator=${createTripAnimatorSource()};<\/script>`
}
