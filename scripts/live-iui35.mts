#!/usr/bin/env node
/**
 * Live Ace test for 0.12.0-iui.35:
 *   本机资源 / 北京天气 / 需求表单 → expect [data-genui] + Chinese screenshots
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

const URL_ARG =
  arg('--url') ??
  'http://127.0.0.1:3080/?token=pZdfzIWlbLcNvLcjpJeT6vlz44BzaNSleLD11Mr4ohY'
const TIMEOUT_S = Number(arg('--timeout-s') ?? 150)
const OUT_DIR = resolve(arg('--out') ?? '/workspace/uploads/iui35-live-shots')

const CASES = [
  {
    id: '01-resource',
    prompt: '给我看一下本机资源占用情况，用可视化界面展示 CPU、内存、磁盘。',
    expectHints: ['cpu', '内存', '磁盘', '资源', 'ring', '%'],
  },
  {
    id: '02-weather',
    prompt: '北京今天和未来几天的天气怎么样？给我可视化天气面板。',
    expectHints: ['天气', '北京', '°', '温', '晴', '雨', '云'],
  },
  {
    id: '03-intake',
    prompt: '帮我做一个需求收集表单，要有分段单选和说明项，用来整理一份博士论文相关需求。',
    expectHints: ['需求', '表单', '选', '提交', '单选'],
  },
]

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const log = (msg: string): void => console.log(`· ${msg}`)

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
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
  throw new Error('playwright-core not found')
}

await mkdir(OUT_DIR, { recursive: true })
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 2,
})
const pageErrors: string[] = []
page.on('pageerror', (e: Error) => pageErrors.push(e.message))

const results: Array<Record<string, unknown>> = []

async function waitComposer() {
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-composer-input]')
    return input instanceof HTMLElement && input.isContentEditable && !input.closest('[inert]')
  }, undefined, { timeout: 90000 })
}

async function clickNewSession() {
  // Try several UI affordances
  const candidates = [
    page.getByRole('button', { name: /新会话|新建|New chat|New session/i }).first(),
    page.locator('[data-new-session], [aria-label*="新会话"], [title*="新会话"]').first(),
    page.getByText('新会话', { exact: false }).first(),
  ]
  for (const loc of candidates) {
    if (await loc.isVisible().catch(() => false)) {
      await loc.click().catch(() => {})
      await page.waitForTimeout(1000)
      return true
    }
  }
  // Sidebar + button fallback via evaluate
  const clicked = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    const hit = nodes.find((n) => /新会话|新建对话|New chat/i.test(n.textContent || '') || /新会话/.test(n.getAttribute('aria-label') || ''))
    if (hit instanceof HTMLElement) {
      hit.click()
      return true
    }
    return false
  })
  if (clicked) await page.waitForTimeout(1000)
  return clicked
}

async function genuiInfo() {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-genui]'))
    const last = nodes[nodes.length - 1]
    const text = (last?.textContent || '').slice(0, 1200)
    const html = (last?.innerHTML || '').slice(0, 500)
    const hasFenceCode = !!document.querySelector('pre code.language-iui, code.language-iui, [data-language="iui"]')
    const assistantSteps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]').length
    const lastStep = (() => {
      const steps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
      return steps.length ? (steps[steps.length - 1].textContent || '').slice(0, 1500) : ''
    })()
    const streaming = !!document.querySelector('[data-streaming]')
    return {
      count: nodes.length,
      text,
      htmlLen: html.length,
      hasFenceCode,
      assistantSteps,
      lastStep,
      streaming,
    }
  })
}

try {
  log(`打开 ${URL_ARG}`)
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitComposer()
  const ns = await clickNewSession()
  log(`新会话点击: ${ns ? 'ok' : 'skip/not found'}`)
  await waitComposer()
  await page.screenshot({ path: join(OUT_DIR, '00-ready.png'), fullPage: true })

  for (const c of CASES) {
    log(`—— 用例 ${c.id}: ${c.prompt.slice(0, 40)}…`)
    // New session between cases so cards don't bleed
    await clickNewSession()
    await waitComposer()
    await page.waitForTimeout(600)

    const before = await genuiInfo()
    const composer = page.locator('[data-composer-input]')
    await composer.click()
    // clear
    await page.keyboard.press('Meta+A').catch(() => {})
    await page.keyboard.press('Control+A').catch(() => {})
    await page.keyboard.press('Backspace').catch(() => {})
    await composer.fill(c.prompt)
    await composer.press('Enter')
    log('已发送，等待 [data-genui]…')

    let info = before
    let got = false
    for (let i = 0; i < TIMEOUT_S; i++) {
      info = await genuiInfo()
      if (info.count > before.count) {
        // wait a bit for stream settle
        if (!info.streaming) {
          got = true
          break
        }
        // if streaming but already has genui, give it more time then accept
        if (i > 8) {
          got = true
          // keep waiting up to +20s for settle
          for (let j = 0; j < 20; j++) {
            await page.waitForTimeout(1000)
            info = await genuiInfo()
            if (!info.streaming) break
          }
          break
        }
      }
      await page.waitForTimeout(1000)
    }

    await page.waitForTimeout(800)
    info = await genuiInfo()
    const shot = join(OUT_DIR, `${c.id}.png`)
    await page.screenshot({ path: shot, fullPage: true })

    // Also crop last genui if present
    const box = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-genui]')
      const last = nodes[nodes.length - 1] as HTMLElement | undefined
      if (!last) return null
      const r = last.getBoundingClientRect()
      return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }
    })
    if (box && box.width > 40 && box.height > 40) {
      await page.screenshot({
        path: join(OUT_DIR, `${c.id}-card.png`),
        clip: {
          x: Math.max(0, box.x - 8),
          y: Math.max(0, box.y - 8),
          width: Math.min(box.width + 16, 1400),
          height: Math.min(box.height + 16, 1600),
        },
      }).catch(() => {})
    }

    const blob = `${info.text}\n${info.lastStep}`.toLowerCase()
    const hintHit = c.expectHints.filter((h) => blob.includes(h.toLowerCase()))
    const passed = got && info.count > before.count
    const row = {
      id: c.id,
      prompt: c.prompt,
      passed,
      genuiBefore: before.count,
      genuiAfter: info.count,
      hintHits: hintHit,
      streaming: info.streaming,
      lastStepTail: info.lastStep.slice(-500),
      cardTextTail: info.text.slice(0, 400),
      screenshot: shot,
    }
    results.push(row)
    await writeFile(join(OUT_DIR, `${c.id}.json`), JSON.stringify(row, null, 2))
    console.log(passed ? `✓ PASS ${c.id} (genui ${before.count}→${info.count}, hints=${hintHit.join(',') || '—'})` : `✗ FAIL ${c.id} (no new [data-genui] in ${TIMEOUT_S}s)`)
    if (!passed) {
      await writeFile(join(OUT_DIR, `${c.id}-fail-reply.txt`), info.lastStep || info.text || '(empty)')
    }
  }

  const summary = {
    version: '0.12.0-iui.35',
    url: URL_ARG,
    at: new Date().toISOString(),
    pageErrors: pageErrors.slice(0, 10),
    results,
    allPassed: results.every((r) => r.passed),
  }
  await writeFile(join(OUT_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2))
  console.log('\n==== SUMMARY ====')
  console.log(JSON.stringify(summary, null, 2))
  await browser.close()
  process.exit(summary.allPassed ? 0 : 2)
} catch (e) {
  await page.screenshot({ path: join(OUT_DIR, 'fail-exception.png'), fullPage: true }).catch(() => {})
  console.error('✗ live exception:', e)
  await writeFile(join(OUT_DIR, 'EXCEPTION.txt'), String(e))
  await browser.close().catch(() => {})
  process.exit(1)
}
