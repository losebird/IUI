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
