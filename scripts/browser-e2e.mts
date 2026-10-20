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
import { buildHtmlSandboxSrcdoc, type HtmlSandboxSpec } from '../src/shared/html-sandbox.ts'

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

main().catch((e) => { console.error(e); process.exit(1) })
