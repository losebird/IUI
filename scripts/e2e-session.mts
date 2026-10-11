#!/usr/bin/env node
/**
 * Live dsh session E2E: type → model → ```iui fence → click action → model.
 * Uses an already-running dsh web (--url). Needs FreeLLMAPI / model quota.
 *
 *   pnpm exec tsx scripts/e2e-session.mts --url 'http://127.0.0.1:3080/?token=…'
 *   # optional: --prompt '…' --timeout-s 180 --out .e2e-artifacts/session
 *
 * Exit 0 = PASS. Does not npm publish. No MCP.
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCRIPT_PATH = resolve(process.argv[1] ?? '')
const REPO_ROOT = dirname(SCRIPT_PATH).endsWith('scripts')
  ? resolve(dirname(SCRIPT_PATH), '..')
  : resolve(process.cwd())

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const URL_ARG = arg('--url')
const PROMPT =
  arg('--prompt') ??
  '请严格只输出下面这一段，不要搜索、不要解释、不要加其它 Markdown。第一行是围栏：\n```iui\n{"title":"会话闭环","gap":10,"items":[{"type":"hero","title":"会话闭环验收","subtitle":"点按钮把动作回传给模型","label":"E2E"},{"type":"text","content":"点「发送动作」完成 type→fence→click→model。","size":"caption"},{"type":"button","label":"发送动作","tone":"primary","action":"session_e2e_ping"}]}\n```'
const TIMEOUT_S = Number(arg('--timeout-s') ?? 180)
const OUT_DIR = resolve(arg('--out') ?? join(REPO_ROOT, '.e2e-artifacts', 'session'))

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const log = (msg: string): void => console.log(`· ${msg}`)

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
    if (!existsSync(p)) continue
    try {
      return await import(pathToFileURL(p).href)
    } catch (e) {
      console.error(`· playwright candidate failed ${p} → ${(e as Error).message}`)
    }
  }
  throw new Error('playwright-core not found (set PLAYWRIGHT_PATH)')
}

if (!URL_ARG) fail('需要 --url http://127.0.0.1:3080/?token=…')

await mkdir(OUT_DIR, { recursive: true })
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors: string[] = []
page.on('pageerror', (e: Error) => pageErrors.push(e.message))

try {
  log(`打开 ${URL_ARG}`)
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Prefer 新会话 so prior leftover cards do not confuse the loop.
  const newSession = page.getByText('新会话', { exact: false }).first()
  if (await newSession.isVisible().catch(() => false)) {
    await newSession.click().catch(() => {})
    await page.waitForTimeout(800)
  }

  await page.waitForFunction(() => {
    const input = document.querySelector('[data-composer-input]')
    return input instanceof HTMLElement && input.isContentEditable && !input.closest('[inert]')
  }, undefined, { timeout: 60000 })

  const composer = page.locator('[data-composer-input]')
  await composer.click()
  await composer.fill(PROMPT)
  await composer.press('Enter')
  log('prompt 已发送，等待 ```iui fence…')

  const genuiCount = () => page.evaluate(() => document.querySelectorAll('[data-genui]').length)
  const lastStepKey = () =>
    page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
      return nodes.length ? nodes[nodes.length - 1].getAttribute('data-chat-flow-key') : null
    })
  const stepSettled = async () =>
    page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
      if (nodes.length === 0) return false
      return nodes[nodes.length - 1].querySelector('[data-streaming]') === null
    })

  let blocks = 0
  for (let i = 0; i < TIMEOUT_S; i++) {
    blocks = await genuiCount()
    if (blocks > 0) break
    await page.waitForTimeout(1000)
  }
  if (blocks === 0) {
    const tail = ((await page.locator('[data-chat-flow-kind="assistant-step"]').last().textContent().catch(() => null)) ?? '无').slice(-2500)
    await page.screenshot({ path: join(OUT_DIR, 'fail-no-fence.png'), fullPage: true })
    await writeFile(join(OUT_DIR, 'fail-reply.txt'), tail)
    fail(`模型 ${TIMEOUT_S}s 内未渲染 [data-genui]（pageerrors: ${pageErrors.slice(0, 2).join(' | ') || '无'}）\n回复尾: ${tail.slice(0, 400)}`)
  }
  log(`✓ fence 渲染（${blocks} 块）`)
  await page.screenshot({ path: join(OUT_DIR, '01-fence.png') })

  const beforeKey = await lastStepKey()
  const actionBtn = page.getByRole('button', { name: '发送动作' }).first()
  await actionBtn.waitFor({ state: 'visible', timeout: 15000 })
  await actionBtn.click()
  log('已点击「发送动作」，等待 [genui-action]…')

  await page
    .locator('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]')
    .filter({ hasText: '[genui-action]' })
    .first()
    .waitFor({ state: 'attached', timeout: 30000 })
  log('✓ [genui-action] 已进入会话')

  let responded = false
  for (let i = 0; i < TIMEOUT_S; i++) {
    const key = await lastStepKey()
    const b2 = await genuiCount()
    if (b2 !== blocks) {
      responded = true
      blocks = b2
      break
    }
    if (key !== null && key !== beforeKey) {
      if (await stepSettled()) {
        responded = true
        break
      }
    }
    await page.waitForTimeout(1000)
  }
  if (!responded) {
    await page.screenshot({ path: join(OUT_DIR, 'fail-no-model-response.png'), fullPage: true })
    fail(`点击后 ${TIMEOUT_S}s 内无新的模型响应（本地 chip 不算）`)
  }

  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT_DIR, '02-after-action.png'), fullPage: true })
  await writeFile(
    join(OUT_DIR, 'PASS.json'),
    JSON.stringify({ ok: true, blocks, pageErrors, url: URL_ARG, at: new Date().toISOString() }, null, 2),
  )
  console.log('PASS session e2e: type → model → fence → click → model')
  await browser.close()
  process.exit(0)
} catch (e) {
  await page.screenshot({ path: join(OUT_DIR, 'fail-exception.png'), fullPage: true }).catch(() => {})
  console.error('✗ session e2e 异常:', e)
  await browser.close().catch(() => {})
  process.exit(1)
}
