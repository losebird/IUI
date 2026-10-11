#!/usr/bin/env node
/** Continue Ace live test: 订票界面 + 需求表单 (本机资源 already PASS). */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCRIPT_PATH = resolve(process.argv[1] ?? '')
const REPO_ROOT = dirname(SCRIPT_PATH).endsWith('scripts')
  ? resolve(dirname(SCRIPT_PATH), '..')
  : resolve(process.cwd())

const URL_ARG =
  'http://127.0.0.1:3080/?token=pZdfzIWlbLcNvLcjpJeT6vlz44BzaNSleLD11Mr4ohY'
const TIMEOUT_S = 150
const OUT_DIR = '/workspace/uploads/iui35-live-shots'

const CASES = [
  {
    id: '02-booking',
    prompt: '给我做一个订票界面，从南京到上海，可选日期和车次，要可视化表单和结果列表。',
    expectHints: ['订', '票', '南京', '上海', '车次', '日期', '选'],
  },
  {
    id: '03-intake',
    prompt: '帮我做一个需求收集表单，要有分段单选和说明项，用来整理一份博士论文相关需求。',
    expectHints: ['需求', '表单', '选', '提交', '单选'],
  },
]

const log = (m: string) => console.log(`· ${m}`)

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    '/home/box/.dsh/source/current/apps/web/node_modules/playwright/index.mjs',
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      return await import(pathToFileURL(p).href)
    } catch {}
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

async function waitComposer() {
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-composer-input]')
    return input instanceof HTMLElement && input.isContentEditable && !input.closest('[inert]')
  }, undefined, { timeout: 90000 })
}

async function clickNewSession() {
  const clicked = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    const hit = nodes.find((n) =>
      /新会话|新建对话|New chat/i.test(n.textContent || '') ||
      /新会话/.test(n.getAttribute('aria-label') || ''),
    )
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
    const last = nodes[nodes.length - 1] as HTMLElement | undefined
    const text = (last?.textContent || '').slice(0, 1200)
    const steps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
    const lastStep = steps.length ? (steps[steps.length - 1].textContent || '').slice(0, 1500) : ''
    const streaming = !!document.querySelector('[data-streaming]')
    return { count: nodes.length, text, lastStep, streaming }
  })
}

const results: Array<Record<string, unknown>> = []

try {
  // Keep prior resource result
  try {
    const prev = JSON.parse(readFileSync(join(OUT_DIR, '01-resource.json'), 'utf8'))
    results.push(prev)
    log(`沿用已过用例 01-resource (passed=${prev.passed})`)
  } catch {
    log('无 01-resource.json，仅跑剩余两例')
  }

  log(`打开 ${URL_ARG}`)
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitComposer()
  await clickNewSession()
  await waitComposer()

  for (const c of CASES) {
    log(`—— 用例 ${c.id}: ${c.prompt.slice(0, 36)}…`)
    await clickNewSession()
    await waitComposer()
    await page.waitForTimeout(600)

    const before = await genuiInfo()
    const composer = page.locator('[data-composer-input]')
    await composer.click()
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
        if (!info.streaming || i > 8) {
          got = true
          for (let j = 0; j < 25; j++) {
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

    const box = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-genui]')
      const last = nodes[nodes.length - 1] as HTMLElement | undefined
      if (!last) return null
      const r = last.getBoundingClientRect()
      return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }
    })
    if (box && box.width > 40 && box.height > 40) {
      await page
        .screenshot({
          path: join(OUT_DIR, `${c.id}-card.png`),
          clip: {
            x: Math.max(0, box.x - 8),
            y: Math.max(0, box.y - 8),
            width: Math.min(box.width + 16, 1400),
            height: Math.min(box.height + 16, 1600),
          },
        })
        .catch(() => {})
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
    if (!passed) {
      await writeFile(join(OUT_DIR, `${c.id}-fail-reply.txt`), info.lastStep || info.text || '(empty)')
    }
    console.log(
      passed
        ? `✓ PASS ${c.id} (genui ${before.count}→${info.count}, hints=${hintHit.join(',') || '—'})`
        : `✗ FAIL ${c.id} (no new [data-genui] in ${TIMEOUT_S}s)`,
    )
  }

  const summary = {
    version: '0.12.0-iui.35',
    url: URL_ARG,
    at: new Date().toISOString(),
    cases: ['本机资源', '订票界面', '需求表单'],
    skipped: ['北京天气'],
    pageErrors: pageErrors.slice(0, 10),
    results,
    allPassed: results.every((r) => r.passed === true),
  }
  await writeFile(join(OUT_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2))
  console.log('\n==== SUMMARY ====')
  console.log(JSON.stringify(summary, null, 2))
  await browser.close()
  process.exit(summary.allPassed ? 0 : 2)
} catch (e) {
  await page.screenshot({ path: join(OUT_DIR, 'fail-exception.png'), fullPage: true }).catch(() => {})
  await writeFile(join(OUT_DIR, 'EXCEPTION.txt'), String(e))
  console.error('✗', e)
  await browser.close().catch(() => {})
  process.exit(1)
}
