#!/usr/bin/env node
/**
 * IUI golden-prompt regression (live Muse + fixture failure strip).
 *
 * Usage:
 *   node scripts/golden-regression.mjs --url 'http://127.0.0.1:3081/?token=...' --out /workspace/uploads/iui-golden
 *   node scripts/golden-regression.mjs --url ... --only g1-billing,f1-author-fail
 *   node scripts/golden-regression.mjs --fixture-only
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scoreSrcdoc } from './visual-score.mts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PW = process.env.PLAYWRIGHT_PATH || '/home/box/.claude/skills/guizang-social-card-skill/node_modules/playwright/index.mjs'
const CHROME = process.env.CHROME_PATH || '/opt/google/chrome/chrome'

function parseArgs(argv) {
  const out = { url: '', outDir: '/workspace/uploads/iui-golden', only: null, fixtureOnly: false, skipLive: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') out.url = argv[++i] || ''
    else if (a === '--out') out.outDir = argv[++i] || out.outDir
    else if (a === '--only') out.only = new Set((argv[++i] || '').split(',').filter(Boolean))
    else if (a === '--fixture-only') out.fixtureOnly = true
    else if (a === '--skip-live') out.skipLive = true
  }
  return out
}

const args = parseArgs(process.argv)
const manifest = JSON.parse(readFileSync(join(__dirname, 'golden/manifest.json'), 'utf8'))
const releaseVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
mkdirSync(args.outDir, { recursive: true })
mkdirSync(join(args.outDir, 'fixtures'), { recursive: true })

const { chromium } = await import(PW)

async function buildFailFixture() {
  const { buildHtmlSandboxSrcdoc } = await import('../src/shared/html-sandbox.ts')
  const badJs = [
    "function okHandler(){ window.__ok = 1; }",
    "throw new Error('golden intentional author fail');",
    "document.getElementById('go').onclick = okHandler;",
  ].join('\n')

  const html = buildHtmlSandboxSrcdoc({
    title: 'golden-author-fail',
    height: 360,
    css: '.box{padding:16px} canvas{max-height:180px}',
    html: '<div class="box"><canvas id="c" width="280" height="160"></canvas><button id="go" type="button">Go</button></div>',
    js: badJs,
    stages: ['css', 'html', 'js'],
    partial: false,
    cssComplete: true,
    htmlComplete: true,
    jsComplete: true,
  }, { deferAuthorJs: false, frameId: 'golden-f1' })
  const path = join(args.outDir, 'fixtures/f1-author-fail.html')
  writeFileSync(path, html)
  return path
}

async function verifyFixture(page, fixturePath, shotPath) {
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => {
    const strip = document.querySelector('[data-iui-author-fail]')
    const rerun = document.querySelector('[data-iui-rerun-author]')
    const host = document.querySelector('[data-iui-host-fail]')
    return {
      authorFail: !!strip,
      authorText: strip?.textContent?.slice(0, 200) || '',
      rerun: !!rerun,
      hostFail: !!host,
      pipelineMissing: /author pipeline missing/i.test(document.body.innerText),
    }
  })
  await page.screenshot({ path: shotPath, fullPage: true })
  const pass = info.authorFail && info.rerun && !info.pipelineMissing
  return {
    pass,
    checks: {
      iframeReady: true,
      noRawFence: true,
      expectFailStrip: info.authorFail && info.rerun,
      pipelineLive: !info.pipelineMissing && !info.hostFail,
    },
    detail: info,
  }
}

async function shootLive(page, url, prompt, shotPath, expect) {
  const errs = []
  page.removeAllListeners('pageerror')
  page.on('pageerror', (e) => errs.push(String(e.message || e)))

  // Fresh navigation each case — avoids leftover sandboxes fooling readiness.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
  const ns = page.getByText('新会话', { exact: false }).first()
  if (await ns.isVisible().catch(() => false)) {
    await ns.click().catch(() => {})
    await page.waitForTimeout(1200)
  }
  await page.waitForFunction(() => {
    const i = document.querySelector('[data-composer-input]')
    return i && i.isContentEditable && !i.closest('[inert]')
  }, undefined, { timeout: 60000 })

  const beforeCount = await page.evaluate(() => document.querySelectorAll('[data-iui-html-sandbox]').length)

  const c = page.locator('[data-composer-input]')
  await c.click()
  await c.fill('')
  await c.fill(prompt)
  await c.press('Enter')
  const T0 = Date.now()

  const timeoutSec = expect.timeoutSec || 180
  let ready = false
  for (let i = 0; i < timeoutSec; i++) {
    await page.waitForTimeout(1000)
    const status = await page.evaluate((prev) => {
      const all = [...document.querySelectorAll('[data-iui-html-sandbox]')]
      const s = all[all.length - 1]
      const busy = /深度求索中|思考中|生成中|正在生成/.test(document.body.innerText)
      const rateLimited = /429|RATE_LIMIT|rate-limited|exhausted|额度用尽/i.test(document.body.innerText.slice(-8000))
      const state = s?.getAttribute('data-iui-html-sandbox') || null
      const grew = all.length > prev
      return { count: all.length, grew, state, busy, rateLimited }
    }, beforeCount)
    if (status.rateLimited) {
      return { pass: false, rateLimited: true, checks: {}, detail: { reason: 'rate_limited', ...status }, seconds: Math.round((Date.now() - T0) / 1000) }
    }
    // Require a NEW sandbox that reached ready and model is not busy.
    if (status.grew && status.state === 'ready' && !status.busy) {
      ready = true
      break
    }
  }
  await page.waitForTimeout(5000)

  // Use Playwright frame API (sandbox attr blocks contentDocument in page.evaluate).
  let chartOk = false
  let mapOk = false
  let tileOk = false
  let iframeProbe = { ok: false }
  try {
    const handles = await page.$$('[data-chat-flow-kind="assistant-step"] iframe, [data-iui-html-sandbox] iframe')
    const handle = handles.length ? handles[handles.length - 1] : null
    const fr = handle ? await handle.contentFrame() : null
    if (fr) {
      iframeProbe.ok = true
      if (expect.expectMap) {
        try { await fr.waitForSelector('.leaflet-container', { timeout: 20000 }) } catch {}
        try { await fr.waitForSelector('.leaflet-tile-loaded, .leaflet-marker-icon', { timeout: 12000 }) } catch {}
      }
      if (expect.expectChart) {
        try { await fr.waitForSelector('canvas', { timeout: 15000 }) } catch {}
      }
      await page.waitForTimeout(2000)
      const probe = await fr.evaluate(() => {
        const canvases = [...document.querySelectorAll('canvas')]
        const chartOk = canvases.some((cv) => {
          try {
            if (cv.width > 20 && cv.height > 20) return true
            return false
          } catch { return false }
        }) || !!(window).Chart && canvases.length > 0
        const mapOk = !!document.querySelector('.leaflet-container')
        const tileOk = !!document.querySelector('.leaflet-tile-loaded, .leaflet-marker-icon')
        const authorFail = !!document.querySelector('[data-iui-author-fail]')
        const hostFail = !!document.querySelector('[data-iui-host-fail]')
        return {
          chartOk,
          mapOk,
          tileOk,
          authorFail,
          hostFail,
          canvasCount: canvases.length,
          bodyHead: (document.body?.innerText || '').slice(0, 200),
        }
      })
      chartOk = !!probe.chartOk
      mapOk = !!probe.mapOk
      tileOk = !!probe.tileOk
      iframeProbe = { ...iframeProbe, ...probe }
    }
  } catch (e) {
    iframeProbe = { ok: false, error: String(e) }
  }

  const info = await page.evaluate((prev) => {
    const steps = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')]
    const sandboxes = [...document.querySelectorAll('[data-iui-html-sandbox]')]
    const last = sandboxes[sandboxes.length - 1]
    const frames = [...document.querySelectorAll('[data-iui-html-sandbox] iframe, [data-chat-flow-kind="assistant-step"] iframe')]
    const f = frames[frames.length - 1]
    if (f) f.scrollIntoView({ block: 'center' })
    const txt = steps.map((s) => s.innerText).join('\n')
    const hostFailHost = !!document.querySelector('[data-iui-host-fail]')
    const authorFailHost = !!document.querySelector('[data-iui-author-fail]')
    const state = last?.getAttribute('data-iui-html-sandbox') || null
    const rawCss = /"css"\s*:/.test(txt) && frames.length === 0
    const rawDiv = frames.length === 0 && /```iui-html/.test(txt)
    const pipelineMissing = /author pipeline missing/i.test(txt)
    return {
      iframes: frames.length,
      sandboxCount: sandboxes.length,
      grew: sandboxes.length > prev,
      state,
      rawCss,
      rawDiv,
      hostFailHost,
      authorFailHost,
      pipelineMissing,
      rateLimited: /429|RATE_LIMIT|rate-limited|exhausted/i.test(document.body.innerText.slice(-6000)),
      textHead: txt.replace(/\s+/g, ' ').slice(0, 280),
    }
  }, beforeCount)

  const r2 = await page.evaluate(() => {
    const f = [...document.querySelectorAll('[data-iui-html-sandbox] iframe')].pop()
      || [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] iframe')].pop()
    const r = f?.closest('[data-iui-html-sandbox]')?.getBoundingClientRect() || f?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
  })
  if (r2 && r2.width > 10 && r2.height > 10) {
    const pad = 40
    const x = Math.max(0, Math.floor(r2.x - pad))
    const y = Math.max(0, Math.floor(r2.y - 80))
    const width = Math.max(1, Math.min(1280 - x, Math.ceil(r2.width + pad * 2)))
    const height = Math.max(1, Math.min(1100 - y, Math.ceil(Math.min(r2.height + 100, 900))))
    await page.screenshot({ path: shotPath, clip: { x, y, width, height } })
  } else {
    await page.screenshot({ path: shotPath, fullPage: false })
  }

  // F25: score the rendered page (informational — does not flip pass/fail).
  let visual = null
  try {
    const srcdoc = await page.evaluate(() => {
      const f = [...document.querySelectorAll('[data-iui-html-sandbox] iframe')].pop()
      return f?.getAttribute('srcdoc') || null
    })
    if (srcdoc) visual = await scoreSrcdoc(page.context().browser(), srcdoc)
  } catch (e) {
    visual = { error: String(e?.message || e) }
  }

  const authorFail = !!(iframeProbe.authorFail || info.authorFailHost)
  const hostFail = !!(iframeProbe.hostFail || info.hostFailHost)
  const iframeReady = info.iframes > 0 && info.grew && info.state === 'ready'
  const noRawFence = info.iframes > 0 && !info.rawCss && !info.rawDiv
  const pipelineLive = !info.pipelineMissing && !hostFail
  const chartPass = !expect.expectChart || chartOk
  const mapPass = !expect.expectMap || mapOk
  const failStripPass = !expect.expectFailStrip || authorFail

  const pass = iframeReady && noRawFence && pipelineLive && chartPass && mapPass && failStripPass && !info.rateLimited

  return {
    pass,
    rateLimited: !!info.rateLimited,
    visual,
    seconds: Math.round((Date.now() - T0) / 1000),
    checks: {
      iframeReady,
      noRawFence,
      chart: chartPass,
      map: mapPass,
      pipelineLive,
      failStrip: failStripPass,
    },
    detail: {
      ...info,
      chartOk,
      mapOk,
      tileOk,
      authorFail,
      hostFail,
      iframeProbe,
      readyWaitOk: ready,
      errs: errs.slice(0, 5),
    },
  }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })

const results = []
let cases = manifest.cases
if (args.only) cases = cases.filter((c) => args.only.has(c.id))
if (args.fixtureOnly || args.skipLive) cases = cases.filter((c) => c.mode === 'fixture')

for (const c of cases) {
  const shotPath = join(args.outDir, `${c.id}.png`)
  process.stderr.write(`→ ${c.id} (${c.mode})…\n`)
  let result
  try {
    if (c.mode === 'fixture') {
      const fixturePath = await buildFailFixture()
      result = await verifyFixture(page, fixturePath, shotPath)
    } else {
      if (!args.url) throw new Error('--url required for live goldens')
      const prompt = readFileSync(join(__dirname, 'golden', c.promptFile), 'utf8')
      result = await shootLive(page, args.url, prompt, shotPath, c)
    }
  } catch (e) {
    result = { pass: false, checks: {}, detail: { error: String(e?.stack || e) } }
  }
  const row = { id: c.id, mode: c.mode, pass: !!result.pass, ...result, shot: shotPath }
  results.push(row)
  console.log(JSON.stringify({ id: c.id, pass: row.pass, checks: row.checks, visual: row.visual?.total, seconds: row.seconds, rateLimited: row.rateLimited }))
}

await browser.close()

const summary = {
  version: releaseVersion,
  ranAt: new Date().toISOString(),
  url: args.url || null,
  outDir: args.outDir,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results,
}
writeFileSync(join(args.outDir, 'manifest.json'), JSON.stringify(summary, null, 2))
writeFileSync(join(args.outDir, 'REPORT.zh-CN.md'), [
  `# IUI 黄金问句回归报告`,
  ``,
  `- 版本目标：${releaseVersion}`,
  `- 时间：${summary.ranAt}`,
  `- URL：${summary.url || '(fixture-only)'}`,
  `- 通过：${summary.passed} / 失败：${summary.failed}`,
  ``,
  `| id | mode | pass | visual | notes |`,
  `|----|------|------|--------|-------|`,
  ...results.map((r) => {
    const notes = r.rateLimited ? 'rate_limited' : (r.checks ? Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(',') || 'ok' : (r.detail?.error || ''))
    const v = r.visual?.total !== undefined
      ? `${r.visual.total}${Object.entries(r.visual.scores || {}).filter(([, n]) => n < 75).map(([k, n]) => ` 🔴${k} ${n}`).join('')}`
      : (r.visual?.error ? 'err' : '—')
    return `| ${r.id} | ${r.mode} | ${r.pass ? 'PASS' : 'FAIL'} | ${v} | ${notes} |`
  }),
  ``,
].join('\n'))

const exitCode = results.every((r) => r.pass) ? 0 : 2
process.exit(exitCode)
