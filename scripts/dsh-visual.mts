/**
 * visual(⑥): visual regression inside the REAL dsh host.
 *
 *   pnpm run test:dsh-visual                       capture + compare (report only)
 *   pnpm run test:dsh-visual -- --gate             fail on diff > tolerance / missing baseline / score drop
 *   pnpm run test:dsh-visual -- --update-baseline  copy this run's shots into scripts/golden/dsh-visual/
 *   options: --out <dir> (default .e2e-artifacts/dsh-visual) · --only id,id · --keep · --port N
 *   env: DSH_BIN (else `dsh` on PATH) · PLAYWRIGHT_PATH · CHROMIUM_PATH
 *
 * The plugin is linked into a throw-away DSH_HOME; fixed conversations
 * (dsh-visual/fixtures.mts) are written as session logs and opened in
 * `dsh web`, so the host's own markdown pipeline, tokens and layout render
 * them — no model involved. Each item is shot in three modes (light 1280 →
 * ~680px chat column, dark, 390 phone), pixel-diffed against the committed
 * baseline (in-browser canvas, no PNG deps) and, for iui-html pages, scored
 * by visual-score.mts on the srcdoc the host actually built. Baselines must be
 * produced on CI (fonts / Chromium differ locally): run once without --gate,
 * download the artifact, commit it, then turn --gate on.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ITEMS, SESSIONS, type Item } from './dsh-visual/fixtures.mts'
import { seedSessions } from './dsh-visual/seed.mts'
import { PAGE_FLOOR, RULE_DROP, RULES, scoreSrcdoc, type VisualScore } from './visual-score.mts'

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..')
const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const GATE = argv.includes('--gate')
const UPDATE = argv.includes('--update-baseline')
const KEEP = argv.includes('--keep')
const PORT = Number(arg('--port') ?? 3197)
const OUT = resolve(arg('--out') ?? join(REPO, '.e2e-artifacts/dsh-visual'))
const ONLY = arg('--only') ? new Set(arg('--only')!.split(',')) : null
const GOLDEN = join(REPO, 'scripts/golden/dsh-visual')
const SCORE_BASELINE = join(REPO, 'scripts/golden/visual-baseline.json')
const DEFAULT_TOLERANCE = 0.005
/** Host chrome that floats over tall messages (composer seat, jump-to-bottom) — not under test. */
const HIDE_DURING_SHOT = '[data-composer-seat],button[aria-label="回到底部"]{visibility:hidden !important}'

export const MODES = [
  // Tall windows: the chat scrolls inside its own container, so a message taller than the window
  // would be captured half-painted. Width sets the layout (688px chat column / 390 phone).
  { id: 'light-688', viewport: { width: 1280, height: 2400 }, colorScheme: 'light' },
  { id: 'dark-688', viewport: { width: 1280, height: 2400 }, colorScheme: 'dark' },
  { id: 'light-390', viewport: { width: 390, height: 2400 }, colorScheme: 'light' },
] as const

const log = (m: string): void => console.log(`· ${m}`)

function dshBin(): string {
  if (process.env.DSH_BIN) return process.env.DSH_BIN
  const w = spawnSync('which', ['dsh'], { encoding: 'utf8' }).stdout?.trim()
  if (!w) throw new Error('dsh not found: install @deepseek-ai/dsh or set DSH_BIN')
  return w
}

async function loadPlaywright(): Promise<any> {
  for (const p of [process.env.PLAYWRIGHT_PATH, join(REPO, 'node_modules/playwright/index.mjs'), 'playwright']) {
    if (!p) continue
    try { return await import(p) } catch { /* next */ }
  }
  throw new Error('playwright not found (set PLAYWRIGHT_PATH)')
}

/** 1×1 grey PNG — stands in for map tiles and remote photos so shots are deterministic. */
const GREY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12PoAgAAjACL8tblGQAAAABJRU5ErkJggg==', 'base64')

async function settle(page: any): Promise<void> {
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll('[data-iui-html-sandbox]')]
    return s.every((e) => !/^(streaming|loading|pending)$/.test(e.getAttribute('data-iui-html-sandbox') ?? ''))
  }, null, { timeout: 60000 }).catch(() => log('sandbox not settled in 60s'))
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue
    await f.waitForFunction(() => { const p = (window as any).__iuiAuthorPipeline?.phase; return !p || ['authorSettled', 'live', 'failed'].includes(p) }, null, { timeout: 30000 }).catch(() => {})
    await f.waitForFunction(() => !document.querySelector('[data-iui-3d]:not([data-iui-3d-ready])'), null, { timeout: 45000 }).catch(() => {})
    await f.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  }
  await page.evaluate(() => (document as any).fonts?.ready)
  // Frames report their height after layout; wait until every frame height holds for ~1.5s.
  let last = ''; let stable = 0
  for (let i = 0; i < 40 && stable < 3; i++) {
    await page.waitForTimeout(500)
    const h = await page.evaluate(() => [...document.querySelectorAll('.genui-dom-fence iframe')].map((f) => Math.round(f.getBoundingClientRect().height)).join(','))
    stable = h === last ? stable + 1 : 0; last = h
  }
  await page.waitForTimeout(1000)
}

/** First-run dialogs (preview notice, plugin onboarding) — click through, then log anything left. */
async function dismissOverlays(page: any): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const b = page.locator('[role="dialog"] button, [role="presentation"] button').filter({ hasText: /^(继续|稍后再说|我知道了|跳过|关闭|完成)$/ })
    if (!(await b.count())) break
    await b.first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
  }
  const left = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="presentation"]')].map((d) => (d.textContent ?? '').trim().slice(0, 80)).filter(Boolean))
  if (left.length) log(`overlay still open: ${left.join(' | ')}`)
}

async function openSession(page: any, id: string): Promise<void> {
  const row = page.locator(`[data-row-key="session:${id}"]`)
  if (!(await row.isVisible().catch(() => false))) {
    const open = page.getByRole('button', { name: '打开侧边栏' })
    if (await open.count()) { await open.first().click(); await page.waitForTimeout(600) }
  }
  // The sidebar folds a workspace after five sessions.
  if (!(await row.isVisible().catch(() => false))) {
    const more = page.getByText(/^展开其余/)
    if (await more.count()) { await more.first().click(); await page.waitForTimeout(500) }
  }
  await row.click({ timeout: 20000 }).catch(async (e: Error) => { await page.screenshot({ path: join(OUT, `row-missing-${id}.png`) }).catch(() => {}); throw e })
  await page.waitForTimeout(800)
  // Phone layout: the sidebar overlays the chat — close it again.
  const close = page.getByRole('button', { name: '收起侧边栏' })
  if (page.viewportSize().width < 600 && await close.isVisible().catch(() => false)) { await close.click(); await page.waitForTimeout(400) }
  await page.locator('[data-chat-flow-kind="assistant-step"]').first().waitFor({ timeout: 30000 }).catch(async (e: Error) => {
    await page.screenshot({ path: join(OUT, `open-failed-${id}.png`) }).catch(() => {})
    throw e
  })
}

function target(page: any, item: Item): any {
  const msg = page.locator('[data-chat-flow-kind="assistant-step"]').last()
  return 'message' in item.pick ? msg : msg.locator('.genui-dom-fence').nth(item.pick.fence)
}

async function act(page: any, el: any, item: Item): Promise<any> {
  await page.mouse.move(1, 1)
  if (!item.act) return el
  await el.scrollIntoViewIfNeeded()
  await el.hover()
  await page.waitForTimeout(300)
  if (item.act === 'hover') return el
  await el.getByRole('button', { name: '更多' }).first().click()
  await page.waitForTimeout(400)
  if (item.act === 'menu') return el
  await page.getByRole('menuitem', { name: /外观/ }).first().click()
  await page.waitForTimeout(500)
  return el
}

/** Download through the fence ⋯ menu; returns the saved path. */
async function download(page: any, el: any, label: RegExp, to: string): Promise<string> {
  await el.scrollIntoViewIfNeeded(); await el.hover(); await page.waitForTimeout(300)
  await el.getByRole('button', { name: '更多' }).first().click()
  await page.waitForTimeout(400)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: label }).first().click()])
  mkdirSync(dirname(to), { recursive: true })
  const ext = extname(dl.suggestedFilename()) || extname(to)
  const file = to.replace(/\.[a-z]+$/, '') + ext
  await dl.saveAs(file)
  return file
}

/** Page-level plugin UI (template drawer / settings): returns the element to shoot. */
async function openPluginUi(page: any, what: 'drawer' | 'settings'): Promise<any> {
  if (what === 'drawer') {
    await page.locator('[data-composer-input]').click()
    await page.keyboard.type('/panel'); await page.waitForTimeout(800)
    // First Enter picks the menu entry (chip), the second submits it.
    const panel = page.locator('[data-slot="conversation.input.dock"] [class*="_panel"]').first()
    for (let n = 0; n < 3 && !(await panel.isVisible().catch(() => false)); n++) { await page.keyboard.press('Enter'); await page.waitForTimeout(800) }
    await panel.waitFor({ timeout: 10000 }).catch(async (e: Error) => { await page.screenshot({ path: join(OUT, 'drawer-failed.png') }); throw e })
    await page.waitForTimeout(1500)
    return panel
  }
  if (page.viewportSize().width < 600) {
    const open = page.getByRole('button', { name: '打开侧边栏' })
    if (await open.count()) { await open.first().click(); await page.waitForTimeout(600) }
  }
  await page.getByText('更多', { exact: true }).last().click(); await page.waitForTimeout(500)
  await page.getByRole('menuitem', { name: /设置/ }).first().click(); await page.waitForTimeout(1000)
  const dlg = page.locator('[role="dialog"]').last()
  await dlg.getByText(/^IUI$/).first().click(); await page.waitForTimeout(2500)
  return dlg
}

async function closeTransient(page: any): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.move(1, 1)
}

/** In-browser pixel diff: share of pixels whose max channel delta > 24; writes a red overlay. */
async function diffPng(page: any, a: string, b: string, out: string): Promise<{ ratio: number; size: string }> {
  // Plain string (not a TS function): tsx/esbuild keepNames would inject `__name(...)` into
  // nested helpers, which does not exist in the page ("ReferenceError: __name is not defined").
  const r = await page.evaluate(`(async ([A, B]) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
    const [ia, ib] = await Promise.all([load(A), load(B)])
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height)
    const ctx = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h) }
    const da = ctx(ia).data, db = ctx(ib).data
    const c = document.createElement('canvas'); c.width = w; c.height = h; const o = c.getContext('2d'); o.drawImage(ib, 0, 0)
    const ov = o.getImageData(0, 0, w, h); let bad = 0
    for (let p = 0; p < da.length; p += 4) {
      const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]))
      if (d > 24) { bad++; ov.data[p] = 255; ov.data[p + 1] = 0; ov.data[p + 2] = 0; ov.data[p + 3] = 255 }
    }
    o.putImageData(ov, 0, 0)
    return { ratio: bad / (w * h), size: ia.width + 'x' + ia.height + ' → ' + ib.width + 'x' + ib.height, png: c.toDataURL('image/png') }
  })(${JSON.stringify([`data:image/png;base64,${readFileSync(a).toString('base64')}`, `data:image/png;base64,${readFileSync(b).toString('base64')}`])})`) as { ratio: number; size: string; png: string }
  writeFileSync(out, Buffer.from(r.png.split(',')[1], 'base64'))
  return { ratio: r.ratio, size: r.size }
}

type Row = { item: string; mode: string; file: string; diff?: number; size?: string; tolerance: number; status: 'ok' | 'diff' | 'new' | 'error'; note?: string }

async function main(): Promise<number> {
  const bin = dshBin()
  const home = mkdtempSync(join(tmpdir(), 'dsh-visual-home-'))
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-visual-work-')))
  // A well-formed placeholder key makes the official route list its models (discovery does not
  // call the API), so the composer accepts the client-side /panel command. Nothing is ever sent.
  const env = { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'sk-' + '0'.repeat(32) }
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(join(OUT, 'shots'), { recursive: true }); mkdirSync(join(OUT, 'diff'), { recursive: true }); mkdirSync(join(OUT, 'pages'), { recursive: true })
  let child: ReturnType<typeof spawn> | null = null
  let browser: any = null
  const rows: Row[] = []
  const scores: Array<{ item: string; mode: string; starter: string; score: VisualScore; problems: string[] }> = []
  try {
    log(`dsh ${spawnSync(bin, ['--version'], { encoding: 'utf8' }).stdout.trim()} · plugin link:${REPO}`)
    const add = spawnSync(bin, ['plugin', '--profile', 'web', 'add', `link:${REPO}`], { env, encoding: 'utf8' })
    if (add.status !== 0) throw new Error(`plugin add failed:\n${add.stdout}\n${add.stderr}`)
    // No model is configured in CI: switch off the first-run credential dialog and the preview notice
    // through the profile patch layer (a fresh profile only holds `[]` there).
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
      '- id: ui-settings-models', "  name: '@deepseek-ai/dsh-client-ui-settings-models'", '  config:', '    credentialOnboarding: false',
      '- id: ui-settings-general', "  name: '@deepseek-ai/dsh-client-ui-settings-general'", '  config:', '    welcomeNoticeVersion: 2026-09-28.1', '',
    ].join('\n'))
    const keys = Object.keys(SESSIONS)
    const ids = Object.fromEntries(seedSessions(home, work, keys.map((k) => SESSIONS[k]!)).map((id, i) => [keys[i]!, id]))
    log(`seeded ${keys.length} sessions`)
    let output = ''
    child = spawn(bin, ['--profile', 'web', '--port', String(PORT), '--no-open'], { env, cwd: work, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout!.on('data', (c: Buffer) => { output += String(c) })
    child.stderr!.on('data', (c: Buffer) => { output += String(c) })
    let url = ''
    for (let i = 0; i < 120 && !url; i++) { url = /dsh web: (http\S+)/.exec(output)?.[1] ?? ''; if (!url) await new Promise((r) => setTimeout(r, 1000)) }
    if (!url) throw new Error(`dsh web did not start:\n${output.slice(-2000)}`)
    log('dsh web ready')

    const { chromium } = await loadPlaywright()
    browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] })
    const items = ITEMS.filter((it) => !ONLY || ONLY.has(it.id))
    const sessionOrder = [...new Set(items.map((it) => it.session))]
    for (const mode of MODES) {
      const ctx = await browser.newContext({ viewport: mode.viewport, colorScheme: mode.colorScheme, reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', deviceScaleFactor: 1 })
      // Old GenUI fences are opt-in (F16); the legacy fixture needs them on.
      await ctx.route('**/runtime-config.json*', async (route: any) => {
        const res = await route.fetch(); let body = await res.text()
        try { const j = JSON.parse(body); j.legacyFences = true; body = JSON.stringify(j) } catch { /* keep */ }
        await route.fulfill({ response: res, body })
      })
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)[^/]+\/.*\.(png|jpe?g|webp|avif)(\?.*)?$/i, (route: any) => route.fulfill({ status: 200, contentType: 'image/png', body: GREY_PNG }))
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('pageerror', (e: Error) => errors.push(e.message))
      // Frame console warnings / errors (iframes included) — CI-only failures need a trail.
      let current = ''
      const consoleLog = join(OUT, `console-${mode.id}.txt`)
      page.on('console', (m: any) => {
        const t = m.type()
        if (t !== 'warning' && t !== 'error') return
        try { appendFileSync(consoleLog, `[${current}] ${t}: ${String(m.text()).slice(0, 500)}\n`) } catch { /* best effort */ }
      })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(3000)
      await dismissOverlays(page)
      for (const key of sessionOrder) {
        current = key
        await openSession(page, ids[key]!)
        await settle(page)
        await page.screenshot({ path: join(OUT, 'pages', `${key}-${mode.id}.png`), style: HIDE_DURING_SHOT }).catch(() => {})
        for (const item of items.filter((it) => it.session === key)) {
          const file = `${item.id}-${mode.id}.png`
          const row: Row = { item: item.id, mode: mode.id, file, tolerance: item.tolerance ?? DEFAULT_TOLERANCE, status: 'new' }
          try {
            const shotPath = join(OUT, 'shots', file)
            if (item.act === 'export-html' || item.act === 'export-png') {
              const el = target(page, item)
              const saved = await download(page, el, item.act === 'export-html' ? /下载离线版/ : /保存为图片/, join(OUT, 'exports', `${item.id}-${mode.id}.${item.act === 'export-html' ? 'html' : 'png'}`))
              if (item.act === 'export-png') copyFileSync(saved, shotPath)
              else {
                // The offline page as a reader opens it: same scheme, phone width at 390.
                const off = await ctx.newPage()
                await off.setViewportSize({ width: mode.viewport.width < 600 ? 390 : 760, height: 900 })
                await off.goto(pathToFileURL(saved).href, { waitUntil: 'load', timeout: 60000 })
                await off.waitForTimeout(3000)
                await off.screenshot({ path: shotPath, fullPage: true, animations: 'disabled', caret: 'hide' })
                await off.close()
              }
              rows.push(row); await closeTransient(page); continue
            }
            if (item.act === 'drawer' || item.act === 'settings') {
              const el = await openPluginUi(page, item.act)
              // The drawer keeps a live resize handle, so element screenshots never see it "stable": clip instead.
              const b = await el.boundingBox()
              if (!b) throw new Error(`${item.act} not visible`)
              await page.screenshot({ path: shotPath, animations: 'disabled', caret: 'hide', timeout: 20000, style: item.act === 'drawer' ? '' : HIDE_DURING_SHOT, clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.round(b.width), height: Math.round(b.height) } })
              rows.push(row); await closeTransient(page); continue
            }
            const el = await act(page, target(page, item), item)
            const shot = { path: join(OUT, 'shots', file), animations: 'disabled', caret: 'hide', timeout: 20000, style: HIDE_DURING_SHOT }
            // Menus / the appearance panel can overhang the fence (they do at 390): capture the union.
            const pop = item.act === 'menu' || item.act === 'appearance' ? await page.locator('[role="menu"]:visible, [role="dialog"]:visible').last().boundingBox().catch(() => null) : null
            const box = pop ? await el.boundingBox() : null
            if (pop && box) {
              const vp = page.viewportSize()
              const x = Math.max(0, Math.min(box.x, pop.x)); const y = Math.max(0, Math.min(box.y, pop.y))
              const r = Math.min(vp.width, Math.max(box.x + box.width, pop.x + pop.width)); const b = Math.min(vp.height, Math.max(box.y + box.height, pop.y + pop.height))
              await page.screenshot({ ...shot, clip: { x, y, width: Math.round(r - x), height: Math.round(b - y) } })
            } else await el.screenshot(shot)
            if (item.score && !item.act) {
              const srcdoc: string | null = await el.locator('iframe').first().getAttribute('srcdoc').catch(() => null)
              if (srcdoc) {
                const canvas: string = await el.evaluate((n: Element) => {
                  for (let p: Element | null = n; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return c }
                  return 'rgb(255, 255, 255)'
                })
                mkdirSync(join(OUT, 'srcdoc'), { recursive: true })
                writeFileSync(join(OUT, 'srcdoc', `${item.id}-${mode.id}.html`), `<!-- host canvas: ${canvas} -->\n${srcdoc}`)
                scores.push({ item: item.id, mode: mode.id, starter: item.score, score: await scoreSrcdoc(browser, srcdoc, { colorScheme: mode.colorScheme, canvas }), problems: [] })
              }
            }
          } catch (e) {
            row.status = 'error'; row.note = String((e as Error).message ?? e).split('\n')[0]
          }
          await closeTransient(page)
          rows.push(row)
        }
      }
      if (errors.length) log(`${mode.id} page errors: ${errors.slice(0, 3).join(' | ')}`)
      await ctx.close()
    }

    // Compare.
    const cmp = await browser.newPage()
    for (const row of rows) {
      if (row.status === 'error') continue
      const base = join(GOLDEN, row.file)
      if (!existsSync(base)) continue
      const d = await diffPng(cmp, base, join(OUT, 'shots', row.file), join(OUT, 'diff', row.file))
      row.diff = d.ratio; row.size = d.size
      row.status = d.ratio > row.tolerance ? 'diff' : 'ok'
    }
    await cmp.close()
    if (UPDATE) {
      mkdirSync(GOLDEN, { recursive: true })
      for (const row of rows) if (row.status !== 'error') copyFileSync(join(OUT, 'shots', row.file), join(GOLDEN, row.file))
      log(`baseline written: ${rows.filter((r) => r.status !== 'error').length} shots → ${GOLDEN}`)
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ } }
    if (!KEEP) { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) } else log(`kept ${home} ${work}`)
  }

  // Scores vs the starter baseline (same rules as test:visual).
  const sb = existsSync(SCORE_BASELINE) ? JSON.parse(readFileSync(SCORE_BASELINE, 'utf8')) : {}
  for (const s of scores) {
    const b = sb[s.starter]?.scores
    if (s.score.total < PAGE_FLOOR) s.problems.push(`total ${s.score.total} < ${PAGE_FLOOR}`)
    if (b) for (const r of RULES) if (s.score.scores[r] < b[r] - RULE_DROP) s.problems.push(`${r} ${b[r]} → ${s.score.scores[r]}`)
  }

  const fails = rows.filter((r) => r.status === 'diff' || r.status === 'error' || (GATE && r.status === 'new'))
  const scoreFails = scores.filter((s) => s.problems.length)
  const lines = ['# dsh visual regression', '', `gate: ${GATE ? 'on' : 'off (report only)'} · shots: ${rows.length} · diff/error: ${fails.length} · score problems: ${scoreFails.length}`, '',
    '| item | mode | status | diff | tolerance | note |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.item} | ${r.mode} | ${r.status} | ${r.diff === undefined ? '' : (r.diff * 100).toFixed(2) + '%'} | ${(r.tolerance * 100).toFixed(1)}% | ${r.note ?? r.size ?? ''} |`),
    '', '| page | mode | total | ' + RULES.join(' | ') + ' | problems |', '|---|---|---|' + RULES.map(() => '---|').join('') + '---|',
    ...scores.map((s) => `| ${s.item} | ${s.mode} | ${s.score.total} | ${RULES.map((r) => s.score.scores[r]).join(' | ')} | ${s.problems.join('; ')} |`)]
  writeFileSync(join(OUT, 'report.md'), lines.join('\n') + '\n')
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ gate: GATE, rows, scores }, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' })
  for (const r of rows) console.log(`${r.status === 'ok' ? '✓' : r.status === 'new' ? '○' : '✗'} ${r.item} · ${r.mode}${r.diff !== undefined ? ` · ${(r.diff * 100).toFixed(2)}%` : ''}${r.note ? ` · ${r.note}` : ''}`)
  for (const s of scoreFails) console.log(`✗ score ${s.item} · ${s.mode}: ${s.problems.join('; ')}`)
  console.log(`report: ${join(OUT, 'report.md')}`)
  if (!GATE) return 0
  return fails.length || scoreFails.length ? 1 : 0
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1) })
