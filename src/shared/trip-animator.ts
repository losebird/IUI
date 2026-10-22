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
  var elapsed = 0, lastTime = null, frameId = null, playing = false, disposed = false;
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function emit() {
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
    onFrame({
      progress: progress, fromIndex: fromIndex, toIndex: fromIndex + 1, fraction: fraction,
      activeStop: pinIndex, pinIndex: pinIndex, pinProgress: pinProgress
    });
  }
  function pause() {
    if (disposed) return;
    playing = false; lastTime = null;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (onState) onState(elapsed >= duration ? "complete" : "paused");
  }
  function tick(time) {
    if (!playing || disposed) return;
    if (lastTime !== null) elapsed = Math.min(duration, elapsed + Math.max(0, time - lastTime));
    lastTime = time;
    emit();
    if (elapsed >= duration) pause();
    else frameId = requestAnimationFrame(tick);
  }
  function play() {
    if (disposed || playing) return;
    if (reduceMotion()) { elapsed = duration; emit(); if (onState) onState("complete"); return; }
    if (elapsed >= duration) return;
    playing = true; lastTime = null;
    if (onState) onState("playing");
    frameId = requestAnimationFrame(tick);
  }
  function seek(stop) {
    if (disposed) return;
    if (!Number.isInteger(stop) || stop < 0 || stop >= stopCount)
      throw new Error("Stop index is outside this trip.");
    pause();
    elapsed = stop === stopCount - 1 ? duration : duration * (stop + 0.6) / stopCount;
    emit();
    if (onState) onState(elapsed >= duration ? "complete" : "paused");
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
  function replay() {
    if (disposed) return;
    pause(); elapsed = 0; emit();
    refreshMaps();
    play();
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
