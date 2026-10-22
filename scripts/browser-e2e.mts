#!/usr/bin/env tsx
/**
 * F15 browser regression: real Chromium, real srcdoc.
 *
 *   pnpm run test:browser            (needs playwright: PLAYWRIGHT_PATH or node_modules)
 *
 * Checks that re-running author JS 3× converges: same DOM node count, no
 * duplicate intervals / listeners (zone stats stable), no failure strip, and
 * pages without CDN libs settle without waiting for them.
 */
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildHtmlSandboxSrcdoc, HTML_SANDBOX_STARTERS, type HtmlSandboxSpec } from '../src/shared/html-sandbox.ts'
import { visualScoreCase } from './visual-score.mts'
import { buildTestGlb } from './test-glb.mts'

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    '/vercel/sandbox/node_modules/playwright/index.mjs',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (!existsSync(c)) continue
    try {
      const mod = await import(pathToFileURL(c).href)
      if (mod.chromium) return mod
    } catch { /* next */ }
  }
  return await import('playwright' as string)
}

interface Case { name: string; spec: HtmlSandboxSpec }

const CASES: Case[] = [
  {
    name: 'timers+listeners+appended nodes',
    spec: {
      title: 'rerun',
      html: '<main><h1>Counter</h1><div id="n">0</div><ul id="log"></ul><button id="b" data-iui-action="ignore">+</button></main>',
      css: 'main{padding:12px}',
      js: [
        'let ticks = 0;',
        'const log = document.getElementById("log");',
        'for (let i = 0; i < 5; i++) { const li = document.createElement("li"); li.textContent = "row " + i; log.appendChild(li); }',
        'document.body.appendChild(Object.assign(document.createElement("p"), { className: "extra", textContent: "x" }));',
        'setInterval(function () { ticks++; document.getElementById("n").textContent = String(ticks); }, 30);',
        'setTimeout(function nested() { setTimeout(nested, 40); }, 40);',
        'requestAnimationFrame(function loop() { requestAnimationFrame(loop); });',
        'window.addEventListener("resize", function () {});',
        'document.addEventListener("keydown", function () {});',
        'document.addEventListener("DOMContentLoaded", function () { document.body.dataset.ready = "1"; });',
        'document.getElementById("b").addEventListener("click", function () { ticks += 100; });',
      ].join('\n'),
    },
  },
  {
    name: 'function declarations + const re-run safe',
    spec: {
      title: 'hoist',
      html: '<div id="out"></div>',
      css: '',
      js: 'const items = [1,2,3];\nfunction paint(){ document.getElementById("out").textContent = items.join(","); }\nclass Box { constructor(v){ this.v = v } }\npaint(); new Box(1);',
    },
  },
]

// CDN-backed case (skipped with IUI_BROWSER_OFFLINE=1): Leaflet must load once,
// the re-run must not re-judge it as missing, and exactly one map must remain.
if (process.env.IUI_BROWSER_OFFLINE !== '1') {
  CASES.push({
    name: 'leaflet map (CDN lib)',
    spec: {
      title: 'map',
      html: '<div id="map" style="height:240px"></div>',
      css: '',
      js: 'const map = L.map("map").setView([39.9, 116.4], 10);\nL.marker([39.9, 116.4]).addTo(map);\nwindow.addEventListener("resize", function () { map.invalidateSize(); });',
    },
  })
}

async function main(): Promise<void> {
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  })
  let failures = 0
  try {
    for (const c of CASES) {
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', (e: Error) => errors.push(e.message))
      await page.setContent(buildHtmlSandboxSrcdoc(c.spec, { uiLang: 'en' }), { waitUntil: 'load' })
      await page.waitForFunction(() => (window as any).__iuiAuthorJsRan === true && ['authorSettled', 'live'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 20000 })
      await page.waitForTimeout(150)
      const snap = () => page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        strips: document.querySelectorAll('[data-iui-fail-strip],.iui-fail-strip').length,
        stats: (window as any).__iuiAuthorZone?.stats?.() ?? null,
        phase: (window as any).__iuiAuthorPipeline?.phase,
        maps: document.querySelectorAll('.leaflet-container').length,
        markers: document.querySelectorAll('.leaflet-marker-icon').length,
      }))
      const first = await snap()
      const runs = [first]
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => (window as any).__iuiAuthorPipeline.rerunAuthorJs())
        await page.waitForFunction(() => (window as any).__iuiAuthorJsRan === true && ['authorSettled', 'live'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 20000 })
        await page.waitForTimeout(150)
        runs.push(await snap())
      }
      const problems: string[] = []
      for (const r of runs.slice(1)) {
        if (r.nodes !== first.nodes) problems.push(`node count ${first.nodes} → ${r.nodes}`)
        if (r.maps !== first.maps || r.markers !== first.markers) problems.push(`leaflet ${first.maps}/${first.markers} → ${r.maps}/${r.markers}`)
        if (r.strips) problems.push(`failure strip visible (${r.strips})`)
        // Intervals and persistent listeners must not pile up; one-shot
        // timeouts / rAFs are transient (Leaflet tile fades) and may vary.
        const persist = (x: any) => x && JSON.stringify({ intervals: x.intervals, listeners: x.listeners })
        if (persist(r.stats) !== persist(first.stats)) problems.push(`zone stats ${JSON.stringify(first.stats)} → ${JSON.stringify(r.stats)}`)
      }
      if (!first.stats) problems.push('zone missing')
      if (first.strips) problems.push('failure strip on first run')
      if (c.name.startsWith('leaflet') && first.maps !== 1) problems.push(`expected 1 map, got ${first.maps}`)
      if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`)
      const ok = problems.length === 0
      if (!ok) failures++
      console.log(`${ok ? '✓' : '✗'} ${c.name}  nodes=${first.nodes} stats=${JSON.stringify(first.stats)}${ok ? '' : '\n    ' + [...new Set(problems)].join('\n    ')}`)
      await page.close()
    }
    failures += await bridgeDelegationCase(browser)
    failures += await narrowOverflowCase(browser)
    failures += await keyboardAuditCase(browser)
    failures += await visualScoreCase(browser)
    failures += await themingGesturesCase(browser)
    failures += await batchCCase(browser)
    failures += await stage3dCase(browser)
  } finally {
    await browser.close()
  }
  if (failures) {
    console.error(`${failures} browser case(s) failed`)
    process.exit(1)
  }
  console.log('browser e2e: all passed')
  process.exit(0)
}

/**
 * Batch C (G11/G12/G15) in a real `sandbox="allow-scripts"` iframe: the summary
 * button fills (not sends) a readable summary, the page rasterises itself to a
 * PNG, and the layout self-check flags a broken page while every starter stays clean.
 */
async function batchCCase(browser: any): Promise<number> {
  const problems: string[] = []
  const html = '<div class="iui-sandbox-card" style="padding:16px"><h2>订座</h2>'
    + '<label>人数 <input name="people" value="4"></label> <label>日期 <input name="date" value="2025-05-01"></label>'
    + '<button data-iui-send="summary" id="sum">确认并发送</button>'
    + '<p class="tiny">小字一</p><p class="tiny">小字二</p><p class="tiny">小字三</p><div class="wide"></div><canvas width="200" height="80"></canvas></div>'
  const css = '.tiny{font-size:10px}.wide{width:1400px;height:12px;background:#eee}'
  const doc = buildHtmlSandboxSrcdoc({ html, css, js: 'window.ok = 1;' } as HtmlSandboxSpec, { frameId: 'gc', uiLang: 'zh' })
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  await page.setContent(`<iframe id="fr" sandbox="allow-scripts" style="width:720px;height:600px;border:0"></iframe><script>
window.got = [];
addEventListener('message', function (e) { var d = e.data; if (!d || d.source !== 'iui-html') return;
  if (d.type === 'sendPrompt' || d.type === 'selfCheck' || d.type === 'image') got.push(d); });
</script>`)
  await page.evaluate((d: string) => { (document.getElementById('fr') as HTMLIFrameElement).srcdoc = d }, doc)
  const frameEl = page.frameLocator('#fr')
  await frameEl.locator('#sum').waitFor()
  await page.waitForFunction(() => (window as any).got.some((d: any) => d.type === 'selfCheck'), null, { timeout: 15000 }).catch(() => {})
  await frameEl.locator('#sum').click()
  await page.waitForTimeout(400)
  await page.evaluate(() => (document.getElementById('fr') as HTMLIFrameElement).contentWindow!.postMessage({ source: 'iui-html-host', type: 'requestImage', frameId: 'gc', background: '#ffffff' }, '*'))
  await page.waitForFunction(() => (window as any).got.some((d: any) => d.type === 'image'), null, { timeout: 30000 }).catch(() => {})
  const got: any[] = await page.evaluate(() => (window as any).got)
  const sum = got.find((d) => d.type === 'sendPrompt')
  if (!sum || sum.summary !== true || !/4/.test(sum.text) || !/2025-05-01/.test(sum.text)) problems.push(`summary ${JSON.stringify(sum ?? null).slice(0, 200)}`)
  const img = got.find((d) => d.type === 'image')
  if (!img || !String(img.dataUrl).startsWith('data:image/png') || img.dataUrl.length < 2000) problems.push(`image ${img ? `${img.reason ?? ''} len=${String(img.dataUrl).length}` : 'missing'}`)
  const check = got.find((d) => d.type === 'selfCheck')
  const serious = new Set((check?.issues ?? []).filter((x: any) => x.serious).map((x: any) => x.kind))
  for (const kind of ['smallText', 'overflowX', 'blankCanvas']) if (!serious.has(kind)) problems.push(`self-check missed ${kind} (${JSON.stringify(check?.issues ?? null)})`)
  await page.close()
  const clean = await browser.newPage({ viewport: { width: 720, height: 900 } })
  for (const starter of HTML_SANDBOX_STARTERS) {
    await clean.goto('about:blank')
    await clean.setContent(buildHtmlSandboxSrcdoc(starter.spec, { frameId: `gc-${starter.id}`, uiLang: 'zh' }), { waitUntil: 'load' })
    await clean.waitForFunction(() => ['authorSettled', 'live', 'failed'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
    await clean.waitForFunction(() => !document.querySelector('[data-iui-3d]:not([data-iui-3d-ready])'), null, { timeout: 20000 }).catch(() => {})
    await clean.waitForTimeout(300)
    const issues: any[] = await clean.evaluate(() => (window as any).__iuiSelfCheck())
    const bad = issues.filter((x) => x.serious)
    if (bad.length) problems.push(`starter ${starter.id} self-check: ${JSON.stringify(bad)}`)
  }
  await clean.close()
  console.log(`${problems.length ? '✗' : '✓'} batch C: summary fill · save as image · self-check (${HTML_SANDBOX_STARTERS.length} starters clean)${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}

/**
 * R5-3: host 3D stage in real Chromium — primitive + plinth + pins, fixture GLB (node pin, clip list),
 * failing URL → fallback; plain wheel scrolls (no zoom), Ctrl+wheel zooms, pin click flies + fires
 * iui3d:hotspot, arrow keys orbit. GLBs are served by page.route (no network for models).
 */
export async function stage3dCase(browser: any): Promise<number> {
  const problems: string[] = []
  const glb = Buffer.from(buildTestGlb())
  const spec = (html: string, js = ''): HtmlSandboxSpec => ({ title: '3d', css: '', html, js, stages: ['html', 'js'], partial: false, cssComplete: true, htmlComplete: true, jsComplete: true }) as HtmlSandboxSpec
  const cases = [
    { name: 'shape', html: `<div data-iui-3d='{"shape":"torusKnot","ground":"plinth","hotspots":[{"id":"a","label":"A","at":[0.6,0.6,0.6]},{"id":"b","label":"B","at":[0,-0.9,0.9]}]}'><h2 data-iui-3d-layer="back">BACK</h2></div><div style="height:1200px"></div>`, js: "window.hs=[];document.addEventListener('iui3d:hotspot',function(e){hs.push(e.detail.id)})" },
    { name: 'glb', html: `<div data-iui-3d='{"model":"https://raw.githubusercontent.com/iui-test/box.glb","animation":true,"hotspots":[{"id":"lid","label":"Lid","node":"Lid"}]}'></div>` },
    { name: 'bad', html: `<div data-iui-3d='{"model":"https://raw.githubusercontent.com/iui-test/missing.glb"}'></div>` },
  ]
  const stage = (pg: any) => pg.evaluate(async () => {
    const el = document.querySelector('[data-iui-3d]') as any
    const st = el.__iui3d ? await el.__iui3d : null
    const cv = el.querySelector('canvas') as HTMLCanvasElement | null
    let lit = 0
    if (cv) { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d')!; x.drawImage(cv, 0, 0, 64, 48); const d = x.getImageData(0, 0, 64, 48).data; for (let i = 3; i < d.length; i += 4) if (d[i]! > 10) lit++ }
    return { ready: el.hasAttribute('data-iui-3d-ready'), error: el.hasAttribute('data-iui-3d-error'), clips: st?.clips ?? null, lit: lit / (64 * 48), pins: el.querySelectorAll('.iui-3d-pin').length, dist: st ? st.camera.position.distanceTo(st.controls.target) : 0, cam: st ? st.camera.position.toArray().map((v: number) => v.toFixed(3)).join(',') : '', layer: !!el.querySelector('[data-iui-3d-layer]') }
  })
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 720, height: 700 }, reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', (e: any) => errors.push(String(e).slice(0, 160)))
    await page.route('https://raw.githubusercontent.com/iui-test/**', (r: any) => r.request().url().endsWith('box.glb')
      ? r.fulfill({ status: 200, body: glb, headers: { 'content-type': 'model/gltf-binary', 'access-control-allow-origin': '*' } })
      : r.fulfill({ status: 404, body: 'no', headers: { 'access-control-allow-origin': '*' } }))
    await page.setContent(buildHtmlSandboxSrcdoc(spec(c.html, c.js ?? ''), { frameId: `r53-${c.name}`, uiLang: 'zh' }), { waitUntil: 'load' })
    await page.waitForSelector('[data-iui-3d-ready]', { timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(400)
    const s0 = await stage(page)
    if (!s0.ready) problems.push(`${c.name}: not ready`)
    if (s0.lit < 0.08) problems.push(`${c.name}: canvas looks blank (${(s0.lit * 100).toFixed(0)}% lit)`)
    if (c.name === 'bad' ? !s0.error : s0.error) problems.push(`${c.name}: error flag ${s0.error}`)
    if (errors.length) problems.push(`${c.name}: page errors ${errors.join(' | ')}`)
    if (c.name === 'glb') {
      if (JSON.stringify(s0.clips) !== '["Spin"]') problems.push(`glb: clips ${JSON.stringify(s0.clips)}`)
      if (s0.pins !== 1) problems.push(`glb: node pin missing (${s0.pins})`)
    }
    if (c.name === 'shape') {
      if (s0.pins !== 2 || !s0.layer) problems.push(`shape: pins ${s0.pins} layer ${s0.layer}`)
      const box = await page.locator('canvas.iui-3d-canvas').boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 240); await page.waitForTimeout(300)
      const s1 = await stage(page)
      const scrolled = await page.evaluate(() => scrollY)
      if (Math.abs(s1.dist - s0.dist) > 1e-3) problems.push(`shape: plain wheel zoomed (${s0.dist.toFixed(2)} → ${s1.dist.toFixed(2)})`)
      if (scrolled < 50) problems.push(`shape: plain wheel did not scroll the page (${scrolled})`)
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100)
      const box2 = await page.locator('canvas.iui-3d-canvas').boundingBox()
      await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2)
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -240); await page.keyboard.up('Control'); await page.waitForTimeout(400)
      const s2 = await stage(page)
      if (!(s2.dist < s0.dist - 0.05)) problems.push(`shape: ctrl+wheel did not zoom (${s0.dist.toFixed(2)} → ${s2.dist.toFixed(2)})`)
      await page.click('.iui-3d-pin'); await page.waitForTimeout(1200)
      const hs = await page.evaluate(() => (window as any).hs)
      const pressed = await page.locator('.iui-3d-pin').first().getAttribute('aria-pressed')
      if (JSON.stringify(hs) !== '["a"]' || pressed !== 'true') problems.push(`shape: pin click event ${JSON.stringify(hs)} pressed=${pressed}`)
      await page.focus('canvas.iui-3d-canvas')
      const k0 = (await stage(page)).cam
      await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150)
      if ((await stage(page)).cam === k0) problems.push('shape: ArrowLeft did not orbit')
    }
    await page.close()
  }
  console.log(`${problems.length ? '✗' : '✓'} R5-3 3D stage: primitive + pins · fixture GLB (clip, node pin) · fallback · wheel/Ctrl-zoom · keys${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}

/**
 * F18: inside a real `sandbox="allow-scripts"` iframe, a submit button fires
 * the author's submit handler + iui:submit, Enter submits a button-less form,
 * blob/data download links and iuiSandbox.copy reach the host, and a call
 * without a user gesture is refused with a toast.
 */
async function bridgeDelegationCase(browser: any): Promise<number> {
  const html = '<form id="f1"><input name="q" value="hi" required><button id="go">Go</button></form>'
    + '<form id="f2"><input id="solo" name="solo" value="s"></form>'
    + '<button id="dl">DL</button><button id="cp">CP</button><button id="late">LATE</button><a id="dla" download="n.txt">a</a>'
  const js = [
    "window.log = [];",
    "document.getElementById('dla').setAttribute('href', 'data:text/plain;base64,aGVsbG8=');",
    "document.getElementById('f1').addEventListener('submit', function (e) { e.preventDefault(); log.push('submit:' + (e.submitter && e.submitter.id)); });",
    "document.addEventListener('iui:submit', function (e) { log.push('iui:' + e.target.id + ':' + JSON.stringify(e.detail.data)); });",
    "document.getElementById('dl').onclick = function () { var u = URL.createObjectURL(new Blob(['a,b'], { type: 'text/csv' })); var a = document.createElement('a'); a.href = u; a.download = 't.csv'; a.click(); URL.revokeObjectURL(u); };",
    "document.getElementById('cp').onclick = function () { iuiSandbox.copy('x').then(function (ok) { log.push('copy:' + ok); }); };",
    "document.getElementById('late').onclick = function () { setTimeout(function () { iuiSandbox.download('late.txt', 'x').then(function (ok) { log.push('late:' + ok); }); }, 5500); };",
  ].join('\n')
  const doc = buildHtmlSandboxSrcdoc({ html, css: '', js } as HtmlSandboxSpec, { frameId: 'f18', uiLang: 'en' })
  const page = await browser.newPage()
  await page.setContent(`<iframe id="fr" sandbox="allow-scripts" style="width:600px;height:400px"></iframe><script>
window.got = [];
addEventListener('message', function (e) { var d = e.data; if (!d || d.source !== 'iui-html' || (d.type !== 'download' && d.type !== 'copyText')) return;
  var ok = !navigator.userActivation || navigator.userActivation.isActive; got.push(d.type + ':' + (d.filename || '') + ':' + ok);
  if (d.reqId) e.source.postMessage({ source: 'iui-html-host', type: 'hostResult', frameId: 'f18', reqId: d.reqId, ok: ok, reason: ok ? undefined : 'gesture' }, '*'); });
</script>`)
  await page.evaluate((d: string) => { (document.getElementById('fr') as HTMLIFrameElement).srcdoc = d }, doc)
  const frameEl = page.frameLocator('#fr')
  await frameEl.locator('#go').waitFor()
  await page.waitForTimeout(500)
  await frameEl.locator('#go').click()
  await frameEl.locator('#solo').press('Enter')
  await frameEl.locator('#dl').click()
  await frameEl.locator('#cp').click()
  await frameEl.locator('#dla').click()
  await frameEl.locator('#late').click()
  await page.waitForTimeout(6500)
  const frame = page.frames().find((f: any) => f !== page.mainFrame())
  const log: string[] = await frame.evaluate(() => (window as any).log)
  const toast: string | null = await frame.evaluate(() => document.querySelector('[data-iui-toast]')?.textContent ?? null)
  const got: string[] = await page.evaluate(() => (window as any).got)
  const want = {
    log: ['submit:go', 'iui:f1:{"q":"hi"}', 'iui:f2:{"solo":"s"}', 'copy:true', 'late:false'],
    got: ['download:t.csv:true', 'copyText::true', 'download:n.txt:true', 'download:late.txt:false'],
  }
  const problems: string[] = []
  if (JSON.stringify(log) !== JSON.stringify(want.log)) problems.push(`frame log ${JSON.stringify(log)}`)
  if (JSON.stringify(got) !== JSON.stringify(want.got)) problems.push(`host got ${JSON.stringify(got)}`)
  if (!toast || !/click/i.test(toast)) problems.push(`gesture toast missing (${toast})`)
  await page.close()
  console.log(`${problems.length ? '✗' : '✓'} bridge delegation (forms / download / copy)${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}

/**
 * F22: every built-in starter renders at 360px (phone) and 720px (chat column)
 * without horizontal overflow. Overflow = page scrollWidth wider than the
 * viewport, reported with the widest offending elements.
 */
export async function measureOverflow(page: any): Promise<{ overflow: number; culprits: string[] }> {
  // tsx keeps function names via an injected __name helper that the page lacks.
  await page.evaluate('window.__name = window.__name || function (f) { return f }')
  return await page.evaluate(() => {
    // html/body use overflow-x:clip, so scrollWidth hides overflow: measure element boxes,
    // skipping descendants of their own scroll/clip containers (tables, carousels, maps).
    const vw = document.documentElement.clientWidth
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.id === 'iui-preview-root') continue
        const ox = getComputedStyle(p).overflowX
        if (ox !== 'visible' && ox !== 'clip') return true
        if (ox === 'clip') return true
      }
      return false
    }
    let overflow = 0
    const culprits: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest('script,style,template,.leaflet-container,[aria-hidden="true"]')) continue
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue
      const pos = getComputedStyle(el).position
      if (pos === 'fixed') continue
      if (clipped(el)) continue
      const parent = el.parentElement
      const parentOver = parent && parent !== document.body && parent.getBoundingClientRect().right > vw + 1 && !clipped(parent)
      overflow = Math.max(overflow, Math.round(r.right - vw))
      if (!parentOver && culprits.length < 4) {
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''
        culprits.push(`${el.tagName.toLowerCase()}${cls} → ${Math.round(r.right)}px`)
      }
    }
    return { overflow, culprits }
  })
}

async function narrowOverflowCase(browser: any): Promise<number> {
  const widths = [360, 720]
  const problems: string[] = []
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    for (const starter of HTML_SANDBOX_STARTERS) {
      await page.goto('about:blank') // fresh window: setContent reuses globals
      await page.setContent(buildHtmlSandboxSrcdoc(starter.spec, { frameId: `f22-${starter.id}`, uiLang: 'zh' }), { waitUntil: 'load' })
      await page.waitForFunction(() => ['authorSettled', 'live', 'failed'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(250)
      const { overflow, culprits } = await measureOverflow(page)
      if (overflow > 1) problems.push(`${starter.id} @${width}px overflows by ${overflow}px: ${culprits.join(', ')}`)
    }
    await page.close()
  }
  console.log(`${problems.length ? '✗' : '✓'} narrow widths 360/720 · ${HTML_SANDBOX_STARTERS.length} starters without horizontal overflow${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}

/**
 * F23: keyboard audit of every starter — each click target (native control or
 * outermost cursor:pointer element) is reachable with Tab, shows a visible focus
 * ring, and controls are at least 32px tall. Run with reduced motion emulated.
 */
export async function auditKeyboard(page: any): Promise<string[]> {
  await page.evaluate('window.__name = window.__name || function (f) { return f }')
  const targets: { key: string; label: string }[] = await page.evaluate(() => {
    const out: { key: string; label: string }[] = []
    let n = 0
    const root = document.getElementById('iui-preview-root') ?? document.body
    for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
      // Composite widgets (grids, listboxes, tablists…) use roving tabindex + arrow keys.
      if (el.closest('.leaflet-container,[aria-hidden="true"],[inert],[role=grid],[role=treegrid],[role=listbox],[role=tree],[role=menu],[role=menubar],[role=tablist],[role=radiogroup]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      const native = el.matches('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,summary')
      const pointer = cs.cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') && !el.closest('label')
      if (!native && !pointer) continue
      if (!native && el.closest('a[href],button,summary')) continue
      const key = `k${n++}`
      el.setAttribute('data-e2e-key', key)
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''
      out.push({ key, label: `${el.tagName.toLowerCase()}${cls}「${(el.textContent ?? '').trim().slice(0, 12)}」` })
    }
    return out
  })
  const problems: string[] = []
  const visited = new Set<string>()
  const ringed = new Set<string>()
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.() })
  for (let i = 0; i < targets.length + 8; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      if (!a || a === document.body) return null
      const host = a.closest('[data-e2e-key]') as HTMLElement | null
      const cs = getComputedStyle(a)
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) || cs.boxShadow !== 'none'
      return { key: host?.getAttribute('data-e2e-key') ?? null, ring }
    })
    if (!info) continue
    if (info.key) {
      visited.add(info.key)
      // A date input takes several Tab stops (fields + picker); one ringed stop is enough.
      if (info.ring) ringed.add(info.key)
    }
  }
  for (const t of targets) {
    if (!visited.has(t.key)) problems.push(`not reachable by Tab: ${t.label}`)
    else if (!ringed.has(t.key)) problems.push(`no focus ring: ${t.label}`)
  }
  const small: string[] = await page.evaluate(() => {
    const out: string[] = []
    const root = document.getElementById('iui-preview-root') ?? document.body
    for (const el of Array.from(root.querySelectorAll('button,select,[role="button"],input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=color])')) as HTMLElement[]) {
      if (el.closest('.leaflet-container,svg')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 31.5 || (el.tagName === 'BUTTON' && r.width < 31.5)) out.push(`${el.tagName.toLowerCase()}「${(el.textContent ?? '').trim().slice(0, 12)}」${Math.round(r.width)}×${Math.round(r.height)}`)
    }
    return out
  })
  for (const s of small.slice(0, 4)) problems.push(`target < 32px: ${s}`)
  return problems
}

export async function keyboardAuditCase(browser: any): Promise<number> {
  const problems: string[] = []
  const page = await browser.newPage({ viewport: { width: 720, height: 900 }, reducedMotion: 'reduce' })
  for (const starter of HTML_SANDBOX_STARTERS) {
    await page.goto('about:blank') // fresh window: setContent reuses globals
    await page.setContent(buildHtmlSandboxSrcdoc(starter.spec, { frameId: `f23-${starter.id}`, uiLang: 'zh' }), { waitUntil: 'load' })
    await page.waitForFunction(() => ['authorSettled', 'live', 'failed'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)
    for (const p of await auditKeyboard(page)) problems.push(`${starter.id}: ${p}`)
  }
  // Author-built click targets: div cards, a data-iui-action span, an SVG bar.
  const spec = {
    title: 'kbd', css: '.card{cursor:pointer;padding:12px;border:1px solid #ddd}.card b{display:block}',
    html: '<div class="card" id="c1"><b>北京</b><span>晴 23°</span></div><div class="card" id="c2"><b>上海</b></div><span id="act" data-iui-action="noop">更多</span><svg width="120" height="40"><rect id="bar" x="0" y="0" width="100" height="30" style="cursor:pointer"/></svg><p id="log"></p>',
    js: 'var log=document.getElementById("log");["c1","c2","bar"].forEach(function(id){document.getElementById(id).addEventListener("click",function(){log.textContent+=id+";"})});',
  } as HtmlSandboxSpec
  await page.goto('about:blank')
  await page.setContent(buildHtmlSandboxSrcdoc(spec, { frameId: 'f23-kbd', uiLang: 'zh' }), { waitUntil: 'load' })
  await page.waitForFunction(() => ['authorSettled', 'live'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
  for (const p of await auditKeyboard(page)) problems.push(`author click targets: ${p}`)
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); document.getElementById('log')!.textContent = '' })
  await page.focus('#c1'); await page.keyboard.press('Enter')
  await page.focus('#c2'); await page.keyboard.press(' ')
  await page.focus('#bar'); await page.keyboard.press('Enter')
  const kbd = await page.evaluate(() => ({ log: document.getElementById('log')!.textContent, role: document.getElementById('c1')!.getAttribute('role'), act: document.getElementById('act')!.getAttribute('tabindex') }))
  if (kbd.log !== 'c1;c2;bar;') problems.push(`Enter/Space did not click author targets: ${JSON.stringify(kbd)}`)
  if (kbd.role !== 'button' || kbd.act !== '0') problems.push(`auto role/tabindex missing: ${JSON.stringify(kbd)}`)
  const motion = await page.evaluate(() => ({ rm: (window as any).iuiSandbox.reducedMotion, dur: getComputedStyle(document.body, null).transitionDuration }))
  if (motion.rm !== true) problems.push('iuiSandbox.reducedMotion should be true under emulated reduce')
  await page.close()
  console.log(`${problems.length ? '✗' : '✓'} keyboard audit · ${HTML_SANDBOX_STARTERS.length} starters (Tab reach, focus ring, 32px targets)${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1) })
}

/**
 * G2/G3/G8: Chart.js + ECharts pick up the host palette in light and dark, a declared
 * accent keeps its fill with AA ink, and a Leaflet map ignores a plain wheel (hint
 * shown) but zooms with Ctrl+wheel.
 */
async function themingGesturesCase(browser: any): Promise<number> {
  const problems: string[] = []
  const load = async (spec: any, opts: any = {}) => {
    const p = await browser.newPage({ viewport: { width: 720, height: 900 }, ...opts })
    await p.goto('about:blank')
    await p.setContent(buildHtmlSandboxSrcdoc(spec, { frameId: 'g3', uiLang: 'zh' }), { waitUntil: 'load' })
    await p.waitForFunction(() => ['authorSettled', 'live', 'failed'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
    await p.waitForTimeout(800)
    await p.evaluate('window.__name = window.__name || function (f) { return f }')
    return p
  }
  const chartSpec = { title: 'c', css: '', html: '<div style="height:220px"><canvas id="c"></canvas></div>', js: "new Chart(document.getElementById('c'),{type:'line',data:{labels:['a','b','c'],datasets:[{label:'x',data:[1,3,2]},{label:'y',data:[2,1,3]}]}})" }
  const seen: Record<string, any> = {}
  for (const scheme of ['light', 'dark']) {
    const p = await load(chartSpec, { colorScheme: scheme })
    const r = await p.evaluate(() => {
      const C = (window as any).__iuiChartOrig || (window as any).Chart
      const ch = C && C.getChart(document.getElementById('c'))
      return { color: C?.defaults.color, ds0: ch?.data.datasets[0].borderColor, ds1: ch?.data.datasets[1].borderColor }
    })
    seen[scheme] = r
    if (!r.ds0 || !r.ds1 || r.ds0 === r.ds1) problems.push(`chart ${scheme}: datasets not painted from palette ${JSON.stringify(r)}`)
    await p.close()
  }
  if (seen.light?.color && seen.light.color === seen.dark?.color) problems.push(`chart text colour identical in light/dark (${seen.light.color})`)
  {
    const p = await load({ title: 'e', css: '', html: '<div id="c" style="height:200px"></div>', js: 'echarts.init(document.getElementById("c")).setOption({xAxis:{data:[1,2]},yAxis:{},series:[{type:"bar",data:[1,2]}]})' })
    const r = await p.evaluate(() => { const e = (window as any).echarts; const i = e && e.getInstanceByDom(document.getElementById('c')); return { color0: i?.getOption().color?.[0] } })
    if (!r.color0 || !/^#185fa5$/i.test(String(r.color0))) problems.push(`echarts not on iui theme (color0=${r.color0})`)
    await p.close()
  }
  {
    const p = await load({ title: 'a', css: '', html: '<div style="display:flex;gap:8px"><button class="primary">主操作</button></div>', js: '', accent: '#F2C94C' })
    const r = await p.evaluate(() => { const bt = getComputedStyle(document.querySelector('button.primary')!); return { bg: bt.backgroundColor, ink: bt.color } })
    if (r.bg !== 'rgb(242, 201, 76)' || r.ink !== 'rgb(17, 17, 17)') problems.push(`accent button ${JSON.stringify(r)}`)
    await p.close()
  }
  {
    const st = HTML_SANDBOX_STARTERS.find((s) => s.id === 'leaflet-map')
    if (!st) problems.push('leaflet-map starter missing')
    else {
      const p = await load(st.spec)
      const box = await p.evaluate(() => { const r = document.querySelector('.leaflet-container')!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      const getZ = () => p.evaluate(() => (document.querySelector('.leaflet-container .leaflet-proxy') as HTMLElement | null)?.style.transform ?? '')
      await p.mouse.move(box.x, box.y)
      const z0 = await getZ()
      await p.mouse.wheel(0, -300); await p.waitForTimeout(500)
      const z1 = await getZ()
      const hint = await p.evaluate(() => document.querySelector('.iui-map-hint')?.hasAttribute('data-on') === true)
      await p.keyboard.down('Control'); await p.mouse.wheel(0, -300); await p.keyboard.up('Control'); await p.waitForTimeout(600)
      const z2 = await getZ()
      if (z0 !== z1) problems.push('plain wheel zoomed the map')
      if (!hint) problems.push('no Ctrl+wheel hint on plain wheel')
      if (z1 === z2) problems.push('Ctrl+wheel did not zoom')
      await p.close()
    }
  }
  console.log(`${problems.length ? '✗' : '✓'} chart/echarts theming light+dark, accent ink, map cooperative gestures${problems.length ? '\n    ' + problems.join('\n    ') : ''}`)
  return problems.length ? 1 : 0
}
