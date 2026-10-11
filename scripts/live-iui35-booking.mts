#!/usr/bin/env node
/** Retry 订票界面 only — verify user bubble before waiting for fence. */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(resolve(process.argv[1] ?? '')), '..')
const URL_ARG = 'http://127.0.0.1:3080/?token=pZdfzIWlbLcNvLcjpJeT6vlz44BzaNSleLD11Mr4ohY'
const OUT_DIR = '/workspace/uploads/iui35-live-shots'
const TIMEOUT_S = 180
const PROMPT = '给我做一个订票界面，从南京到上海，可选日期和车次，要可视化表单和结果列表。不要搜索，直接用 ```iui 围栏画出界面。'

const log = (m: string) => console.log(`· ${m}`)

async function loadPlaywright(): Promise<{ chromium: any }> {
  for (const p of [
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    '/home/box/.dsh/source/current/apps/web/node_modules/playwright/index.mjs',
  ]) {
    if (!existsSync(p)) continue
    try { return await import(pathToFileURL(p).href) } catch {}
  }
  throw new Error('playwright not found')
}

await mkdir(OUT_DIR, { recursive: true })
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 })

async function waitComposer() {
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-composer-input]')
    return input instanceof HTMLElement && input.isContentEditable && !input.closest('[inert]')
  }, undefined, { timeout: 90000 })
}

try {
  await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitComposer()

  // New session
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    const hit = nodes.find((n) => /新会话|新建对话|New chat/i.test(n.textContent || ''))
    if (hit instanceof HTMLElement) hit.click()
  })
  await page.waitForTimeout(1200)
  await waitComposer()

  const composer = page.locator('[data-composer-input]')
  await composer.click()
  await page.waitForTimeout(200)
  // Use type for contenteditable reliability
  await page.keyboard.type(PROMPT, { delay: 8 })
  await page.waitForTimeout(300)
  // Prefer click send button if present
  const sent = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const send = btns.find((b) => /发送|Send/i.test(b.getAttribute('aria-label') || '') || b.querySelector('svg'))
    // last blue round button near composer
    const near = document.querySelector('[data-composer-input]')?.closest('form, [class*="composer"], [data-composer]') 
    const candidates = near ? Array.from(near.querySelectorAll('button')) : btns.slice(-5)
    const hit = candidates.reverse().find((b) => !(b as HTMLButtonElement).disabled)
    if (hit) { (hit as HTMLElement).click(); return 'click' }
    return 'none'
  })
  if (sent === 'none') await composer.press('Enter')
  log(`send via ${sent === 'none' ? 'Enter' : sent}`)

  // Wait for user bubble containing 订票
  let userSeen = false
  for (let i = 0; i < 30; i++) {
    userSeen = await page.evaluate(() => {
      const text = document.body.innerText || ''
      return text.includes('订票界面') || text.includes('南京到上海')
    })
    if (userSeen) break
    await page.waitForTimeout(500)
  }
  log(`user bubble: ${userSeen ? 'ok' : 'MISSING'}`)
  await page.screenshot({ path: join(OUT_DIR, '02-booking-after-send.png'), fullPage: true })

  if (!userSeen) {
    // fallback: fill + Enter again
    await composer.click()
    await composer.fill(PROMPT)
    await composer.press('Enter')
    await page.waitForTimeout(2000)
  }

  let got = false
  let info = { count: 0, text: '', lastStep: '', streaming: false }
  for (let i = 0; i < TIMEOUT_S; i++) {
    info = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-genui]'))
      const last = nodes[nodes.length - 1] as HTMLElement | undefined
      const steps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
      return {
        count: nodes.length,
        text: (last?.textContent || '').slice(0, 1200),
        lastStep: steps.length ? (steps[steps.length - 1].textContent || '').slice(0, 1500) : '',
        streaming: !!document.querySelector('[data-streaming]'),
        bodyHasIui: /```iui/.test(document.body.innerText || '') || !!document.querySelector('[data-genui]'),
        assistantText: (() => {
          const steps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
          return steps.length ? (steps[steps.length - 1].textContent || '').slice(0, 800) : (document.body.innerText || '').slice(-800)
        })(),
      }
    })
    if (info.count > 0) {
      got = true
      if (!info.streaming) break
      if (i > 10) {
        for (let j = 0; j < 20; j++) {
          await page.waitForTimeout(1000)
          info = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('[data-genui]'))
            const last = nodes[nodes.length - 1] as HTMLElement | undefined
            const steps = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
            return {
              count: nodes.length,
              text: (last?.textContent || '').slice(0, 1200),
              lastStep: steps.length ? (steps[steps.length - 1].textContent || '').slice(0, 1500) : '',
              streaming: !!document.querySelector('[data-streaming]'),
            }
          })
          if (!info.streaming) break
        }
        break
      }
    }
    if (i % 15 === 14) log(`…waiting ${i + 1}s genui=${info.count} streaming=${info.streaming}`)
    await page.waitForTimeout(1000)
  }

  await page.screenshot({ path: join(OUT_DIR, '02-booking.png'), fullPage: true })
  const box = await page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-genui]')
    const last = nodes[nodes.length - 1] as HTMLElement | undefined
    if (!last) return null
    const r = last.getBoundingClientRect()
    return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }
  })
  if (box && box.width > 40) {
    await page.screenshot({
      path: join(OUT_DIR, '02-booking-card.png'),
      clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.width + 16, 1400), height: Math.min(box.height + 16, 1600) },
    }).catch(() => {})
  }

  const blob = `${info.text}\n${info.lastStep}`.toLowerCase()
  const hints = ['订', '票', '南京', '上海', '车次', '日期', '选'].filter((h) => blob.includes(h))
  const row = {
    id: '02-booking',
    prompt: PROMPT,
    passed: got && info.count > 0,
    genuiBefore: 0,
    genuiAfter: info.count,
    hintHits: hints,
    streaming: info.streaming,
    lastStepTail: (info.lastStep || '').slice(-500),
    cardTextTail: (info.text || '').slice(0, 400),
    screenshot: join(OUT_DIR, '02-booking.png'),
    retried: true,
  }
  await writeFile(join(OUT_DIR, '02-booking.json'), JSON.stringify(row, null, 2))
  if (!row.passed) {
    const dump = await page.evaluate(() => (document.body.innerText || '').slice(-2500))
    await writeFile(join(OUT_DIR, '02-booking-fail-reply.txt'), dump)
  }
  console.log(row.passed ? `✓ PASS 02-booking (genui=${info.count}, hints=${hints.join(',')})` : `✗ FAIL 02-booking`)

  // Rebuild SUMMARY
  const results: any[] = []
  for (const id of ['01-resource', '02-booking', '03-intake']) {
    try {
      results.push(JSON.parse(readFileSync(join(OUT_DIR, `${id}.json`), 'utf8')))
    } catch {}
  }
  // overwrite booking with fresh
  const bi = results.findIndex((r) => r.id === '02-booking')
  if (bi >= 0) results[bi] = row
  else results.splice(1, 0, row)

  const summary = {
    version: '0.12.0-iui.35',
    url: URL_ARG,
    at: new Date().toISOString(),
    cases: ['本机资源', '订票界面', '需求表单'],
    skipped: ['北京天气'],
    results,
    allPassed: results.every((r) => r.passed === true),
  }
  await writeFile(join(OUT_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  await browser.close()
  process.exit(summary.allPassed ? 0 : 2)
} catch (e) {
  await page.screenshot({ path: join(OUT_DIR, '02-booking-exception.png'), fullPage: true }).catch(() => {})
  console.error(e)
  await browser.close().catch(() => {})
  process.exit(1)
}
