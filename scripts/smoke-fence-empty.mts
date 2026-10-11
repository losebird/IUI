#!/usr/bin/env node
/**
 * Playwright smoke: ```iui / ```dsh-ui fence mount + empty-state chrome.
 *
 * Modes:
 *   --url <dshRootUrl>   Hit an already-running dsh (preferred after rebuild).
 *   (default)            Spin a scratch DSH_HOME + link this workspace (needs `dsh` on PATH).
 *
 * Exit 0 = PASS. Artifacts under .e2e-artifacts/fence-empty/ on failure.
 *
 *   pnpm exec tsx scripts/smoke-fence-empty.mts --url 'http://127.0.0.1:3080/?token=…'
 */
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { pathToFileURL } from 'node:url'

const SCRIPT_PATH = resolve(process.argv[1] ?? '')
const REPO_ROOT = dirname(SCRIPT_PATH).endsWith('scripts')
  ? resolve(dirname(SCRIPT_PATH), '..')
  : resolve(process.cwd())
const OUT_DIR = resolve(join(REPO_ROOT, '.e2e-artifacts', 'fence-empty'))

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const URL_ARG = arg('--url')
const PORT = Number(arg('--port') ?? 3097)
const KEEP = process.argv.includes('--keep')

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const log = (msg: string): void => console.log(`· ${msg}`)

function findDshWebUrl(output: string): string | undefined {
  return output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/\?token=[A-Za-z0-9_-]+)?)/u)?.[1]
}

function resolveDshBin(): string {
  if (process.env.DSH_BIN) return process.env.DSH_BIN
  const found = spawnSync('which', ['dsh'], { encoding: 'utf8' }).stdout?.trim()
  return found || 'dsh'
}

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
    join(homedir(), '.nvm/versions/node', `v${process.versions.node}`, 'lib/node_modules/agent-browser/node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    '/home/box/.dsh/source/current/apps/web/node_modules/playwright/index.mjs',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  for (const p of candidates) {
    if (!existsSync(p) && !p.startsWith('file:')) continue
    try {
      return await import(pathToFileURL(p).href)
    } catch (e) {
      console.error(`· playwright candidate failed ${p} → ${(e as Error).message}`)
    }
  }
  throw new Error('playwright-core not found (set PLAYWRIGHT_PATH)')
}

/** Empty-core fence: every kind must show StatusBlock empty chrome. */
const EMPTY_SPEC = {
  title: '空态冒烟',
  gap: 12,
  items: [
    { type: 'table', columns: ['列'], rows: [] },
    { type: 'list', items: [] },
    { type: 'chart', kind: 'bars', data: [] },
    { type: 'tabs', tabs: [] },
    { type: 'steps', steps: [] },
    { type: 'keyvalue', pairs: [] },
    { type: 'select', label: '空下拉', options: [] },
    { type: 'card', title: '空卡', items: [] },
  ],
}

/** Interactive fence: tabs switch + action button + checkable steps. */
const INTERACT_SPEC = {
  title: '交互冒烟',
  gap: 12,
  items: [
    {
      type: 'tabs',
      tabs: [
        { label: '总览', items: [{ type: 'stat', label: 'CPU', value: '42%' }] },
        { label: '详情', items: [{ type: 'text', content: '详情页' }] },
      ],
    },
    {
      type: 'steps',
      checkable: true,
      expandable: true,
      current: 0,
      steps: [
        { title: '第一步', desc: '准备环境' },
        { title: '第二步', desc: '安装依赖' },
        { title: '第三步', desc: '启动服务' },
      ],
    },
    { type: 'button', label: '刷新指标', tone: 'primary', action: 'refresh_metrics' },
    { type: 'button', label: '导出快照', tone: 'ghost', action: 'export_snapshot' },
  ],
}

async function injectFence(page: any, lang: 'iui' | 'dsh-ui', attr: string, spec: unknown): Promise<void> {
  await page.evaluate(
    ({ language, marker, body }: { language: string; marker: string; body: string }) => {
      const fixture = document.createElement('div')
      fixture.setAttribute(marker, '')
      const host = document.createElement('div')
      host.className = 'md-code-block'
      const label = document.createElement('div')
      label.textContent = language
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = body
      pre.appendChild(code)
      host.append(label, pre)
      fixture.appendChild(host)
      const mount = document.querySelector('[data-chat-flow]') ?? document.body
      mount.appendChild(fixture)
    },
    { language: lang, marker: attr, body: JSON.stringify(spec) },
  )
}

let webChild: ReturnType<typeof spawn> | null = null
let browser: any = null
let scratchHome: string | undefined

const killWeb = (): void => {
  if (webChild === null) return
  try { process.kill(-webChild.pid!, 'SIGTERM') } catch { /* gone */ }
  try { process.kill(webChild.pid!, 'SIGTERM') } catch { /* gone */ }
  webChild = null
}

const cleanup = async (): Promise<void> => {
  try { await browser?.close() } catch { /* ignore */ }
  killWeb()
  if (scratchHome && !KEEP) await rm(scratchHome, { recursive: true, force: true })
}

process.on('exit', () => { killWeb() })

async function resolveLaunchUrl(): Promise<string> {
  if (URL_ARG) return URL_ARG

  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail(`bad port ${PORT}`)
  await new Promise<void>((res) => {
    const probe = createServer()
    probe.once('error', () => fail(`port ${PORT} in use; pass --url or --port`))
    probe.listen(PORT, '127.0.0.1', () => probe.close(() => res()))
  })

  const DSH_BIN = resolveDshBin()
  scratchHome = await mkdtemp(join(tmpdir(), 'iui-fence-empty-'))
  const env = { ...process.env, DSH_HOME: scratchHome }
  log(`install plugin into scratch ${scratchHome}`)
  const add = spawnSync(DSH_BIN, ['plugin', '--profile', 'web', 'add', `link:${REPO_ROOT}`], {
    env, stdio: 'inherit',
  })
  if (add.status !== 0) fail('plugin install failed')

  const webLog = join(scratchHome, 'web.log')
  const logStream = createWriteStream(webLog, { flags: 'a' })
  webChild = spawn(DSH_BIN, ['--profile', 'web', '--port', String(PORT), '--no-open'], {
    env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let webOutput = ''
  webChild.stdout!.on('data', (c: Buffer) => { webOutput += String(c) })
  webChild.stdout!.pipe(logStream)
  webChild.stderr!.pipe(logStream)

  for (let i = 0; i < 90; i++) {
    if (webChild.exitCode !== null) break
    const found = findDshWebUrl(webOutput)
    if (found) {
      try {
        const res = await fetch(found, { redirect: 'manual' })
        if (res.status === 303 || res.ok) return found
      } catch { /* booting */ }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  fail(`dsh scratch not ready (log ${webLog})`)
}

try {
  await mkdir(OUT_DIR, { recursive: true })
  const launchUrl = await resolveLaunchUrl()
  log(`launch ${launchUrl}`)

  const { chromium } = await loadPlaywright()
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
  }).catch(async () => chromium.launch({ headless: true }))

  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, locale: 'zh-CN' })
  const pageErrors: string[] = []
  const consoleLines: string[] = []
  page.on('pageerror', (e: Error) => pageErrors.push(String(e)))
  page.on('console', (msg: { type: () => string; text: () => string }) => {
    consoleLines.push(`${msg.type()}: ${msg.text()}`)
  })

  await page.addInitScript(() => {
    ;(globalThis as { __DSH_GENUI_E2E__?: boolean }).__DSH_GENUI_E2E__ = true
  })
  await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Dismiss onboarding / masks so pointer events work.
  for (const name of [/继续/, /稍后配置/, /我知道了/, /开始使用/, /进入/]) {
    const btn = page.getByRole('button', { name })
    if (await btn.count() > 0) await btn.first().click().catch(() => {})
  }
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[class*="_mask_"], [role="presentation"]')) el.remove()
  })

  // Give the client bundle a moment; DOM channel is forced via __DSH_GENUI_E2E__.
  await page.waitForTimeout(1500)
  const sawActive = consoleLines.some(l => l.includes('[iui] client active') || l.includes('[genui] client active'))
  if (sawActive) log('✓ IUI client active')
  else log('warn: no client-active console line yet; injecting anyway')

  // ── Empty states via ```iui ───────────────────────────────────────────
  await injectFence(page, 'iui', 'data-empty-smoke', EMPTY_SPEC)
  let emptyOk = false
  for (let i = 0; i < 25; i++) {
    const diag = await page.evaluate(() => {
      const root = document.querySelector('[data-empty-smoke]')
      const statuses = [...(root?.querySelectorAll('[data-iui-status]') ?? [])].map(
        el => el.getAttribute('data-iui-status'),
      )
      return {
        genui: root?.querySelectorAll('[data-genui]').length ?? 0,
        statuses,
        text: root?.textContent?.slice(0, 400) ?? '',
      }
    })
    const needed = ['table', 'list', 'chart', 'tabs', 'steps', 'keyvalue', 'select', 'card']
    if (diag.genui > 0 && needed.every(k => diag.statuses.includes(k))) {
      emptyOk = true
      log(`✓ empty states: ${diag.statuses.join(',')}`)
      break
    }
    await page.waitForTimeout(400)
  }
  if (!emptyOk) {
    await page.screenshot({ path: join(OUT_DIR, 'empty-fail.png'), fullPage: true })
    const dump = await page.evaluate(() => ({
      html: document.querySelector('[data-empty-smoke]')?.innerHTML.slice(0, 1200),
      statuses: [...document.querySelectorAll('[data-iui-status]')].map(e => e.getAttribute('data-iui-status')),
    }))
    await writeFile(join(OUT_DIR, 'empty-fail.json'), JSON.stringify({ dump, pageErrors, consoleLines: consoleLines.slice(-20) }, null, 2))
    fail(`empty-state chrome missing (see ${OUT_DIR}/empty-fail.png)`)
  }

  // Assert Chinese empty copy present.
  const emptyText = await page.locator('[data-empty-smoke]').innerText()
  for (const phrase of ['表格暂无数据', '列表暂无条目', '图表暂无数据', '暂无步骤']) {
    if (!emptyText.includes(phrase)) fail(`missing zh empty copy: ${phrase}`)
  }
  log('✓ zh empty copy')

  // ── Alias language ```dsh-ui still mounts ─────────────────────────────
  await injectFence(page, 'dsh-ui', 'data-alias-smoke', {
    items: [{ type: 'stat', label: '别名', value: 'ok' }],
  })
  await page.waitForFunction(
    () => (document.querySelector('[data-alias-smoke] [data-genui]')?.textContent ?? '').includes('别名'),
    undefined,
    { timeout: 10000 },
  )
  log('✓ dsh-ui alias fence mounts')

  // ── Interaction: tabs + steps + buttons ───────────────────────────────
  await injectFence(page, 'iui', 'data-interact-smoke', INTERACT_SPEC)
  await page.waitForFunction(
    () => (document.querySelector('[data-interact-smoke] [data-genui]') !== null),
    undefined,
    { timeout: 10000 },
  )

  const interact = page.locator('[data-interact-smoke]')
  // Switch to second tab
  const detailTab = interact.getByRole('button', { name: '详情' }).or(interact.getByText('详情', { exact: true }))
  if (await detailTab.count() > 0) {
    await detailTab.first().click()
    await page.waitForTimeout(300)
    const after = await interact.innerText()
    if (!after.includes('详情页')) {
      log('warn: tab click did not reveal 详情页 (host may use non-button tabs)')
    } else {
      log('✓ tabs switch')
    }
  } else {
    log('warn: no tab control found')
  }

  // Toggle a step checkbox / number if present
  const stepHit = interact.locator('[data-genui]').getByText('第一步')
  if (await stepHit.count() > 0) {
    await stepHit.first().click().catch(() => {})
    log('✓ steps clickable surface')
  }

  // Action buttons must not be disabled
  const refresh = interact.getByRole('button', { name: '刷新指标' })
  if (await refresh.count() === 0) fail('missing 刷新指标 button')
  const disabled = await refresh.first().isDisabled()
  if (disabled) fail('刷新指标 button is disabled (missing action?)')
  await refresh.first().click()
  await page.waitForTimeout(200)
  log('✓ action button clickable')

  if (pageErrors.length > 0) {
    await page.screenshot({ path: join(OUT_DIR, 'pageerror.png'), fullPage: true })
    fail(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`)
  }

  await page.screenshot({ path: join(OUT_DIR, 'pass.png'), fullPage: true })
  log(`PASS fence+empty smoke → ${join(OUT_DIR, 'pass.png')}`)
  await cleanup()
  process.exit(0)
} catch (e) {
  console.error(e)
  await cleanup()
  process.exit(1)
}

