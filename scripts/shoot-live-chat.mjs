#!/usr/bin/env node
// Real dsh chat shots with automatic pass check (iframe present, no raw fence text in bubble).
// node scripts/shoot-live-chat.mjs <url> <outPng> <promptFile>
import { readFileSync } from 'node:fs'
const PW = process.env.PLAYWRIGHT_PATH || '/home/box/.claude/skills/guizang-social-card-skill/node_modules/playwright/index.mjs'
const { chromium } = await import(PW)
const [URL, OUT, PFILE] = process.argv.slice(2)
const PROMPT = readFileSync(PFILE, 'utf8')
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox'], headless: true })
const p = await b.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
const ns = p.getByText('新会话', { exact: false }).first()
if (await ns.isVisible().catch(() => false)) { await ns.click().catch(() => {}); await p.waitForTimeout(800) }
await p.waitForFunction(() => { const i = document.querySelector('[data-composer-input]'); return i && i.isContentEditable && !i.closest('[inert]') }, undefined, { timeout: 60000 })
const c = p.locator('[data-composer-input]'); await c.click(); await c.fill(PROMPT); await c.press('Enter'); const T0 = Date.now()
await p.waitForTimeout(3000)
for (let i = 0; i < 170; i++) {
  await p.waitForTimeout(1000)
  const done = await p.evaluate(() => { const s = [...document.querySelectorAll('[data-iui-html-sandbox]')].pop(); return !!s && s.getAttribute('data-iui-html-sandbox') === 'ready' && !/深度求索中/.test(document.body.innerText) })
  if (done) break
}
await p.waitForTimeout(6000)
const info = await p.evaluate(() => {
  const steps = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')]
  const frames = steps.flatMap(s => [...s.querySelectorAll('iframe')])
  const txt = steps.map(s => s.innerText).join('\n')
  const f = frames[frames.length - 1]
  if (f) f.scrollIntoView({ block: 'center' })
  const r = f ? f.closest('[data-iui-html-sandbox]')?.getBoundingClientRect() : null
  return { iframes: frames.length, rawCss: txt.includes('"css":'), rawDiv: txt.includes('<div class='), text: txt.slice(0, 300), rect: r && { x: r.x, y: r.y, w: r.width, h: r.height } }
})
// Fill empty inputs (use placeholder digits / sensible defaults) then click start/calc.
let clicked = null
try {
  const h = await p.$$('[data-chat-flow-kind="assistant-step"] iframe'); const fr = h.length ? await h[h.length - 1].contentFrame() : null
  if (fr) {
    const inputs = await fr.$$('input')
    for (const inp of inputs) {
      try {
        const v = await inp.inputValue()
        if (v && v.trim()) continue
        const ph = (await inp.getAttribute('placeholder')) || ''
        const m = ph.match(/-?\d+(?:\.\d+)?/)
        const type = (await inp.getAttribute('type')) || 'text'
        if (m) await inp.fill(m[0])
        else if (type === 'number' || /金额|利率|年限|loan|rate|year/i.test((await inp.getAttribute('id')) || '') + ph)
          await inp.fill(/利率|rate/i.test(ph) ? '4.9' : (/年|year/i.test(ph) ? '30' : '100'))
      } catch {}
    }
    // Wait briefly for auto-calc on input if any
    await p.waitForTimeout(800)
    const btn = fr.locator('button').filter({ hasText: /开始|生成|运行|播放|计算|start|run|play|查找/i }).first()
    if (await btn.count()) { clicked = (await btn.textContent())?.trim(); await btn.click({ timeout: 3000 }); await p.waitForTimeout(3500) }
    // Leaflet tiles
    try { await fr.waitForSelector('.leaflet-tile-loaded, .leaflet-marker-icon', { timeout: 12000 }) } catch {}
    await p.waitForTimeout(1500)
  }
} catch {}
info.clicked = clicked
await p.waitForTimeout(1500)
const r2 = await p.evaluate(() => { const f = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] iframe')].pop(); const r = f?.closest('[data-iui-html-sandbox]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null })
if (r2) {
  const pad = 40
  const x = Math.max(0, Math.floor(r2.x - pad))
  const y = Math.max(0, Math.floor(r2.y - 80))
  const width = Math.max(1, Math.min(1280 - x, Math.ceil(r2.width + pad * 2)))
  const height = Math.max(1, Math.min(1100 - y, Math.ceil(Math.min(r2.height + 100, 900))))
  await p.screenshot({ path: OUT, clip: { x, y, width, height } })
}
else await p.screenshot({ path: OUT })
const rawFence = await p.evaluate(() => [...document.querySelectorAll('[data-genui-rendered] pre')].map(e => e.textContent).pop() || '')
const { writeFileSync } = await import('node:fs'); writeFileSync(OUT.replace(/\.png$/, '.fence.txt'), rawFence)
const t1 = Date.now(); info.seconds = Math.round((t1 - T0) / 1000)
info.rateLimited = await p.evaluate(() => /429|RATE_LIMIT|rate-limited|exhausted/i.test(document.body.innerText.slice(-6000)))
const pass = info.iframes > 0 && !info.rawCss && !info.rawDiv
console.log(JSON.stringify({ pass, ...info, errs: errs.slice(0, 3) }))
await b.close(); process.exit(pass ? 0 : (info.rateLimited ? 3 : 2))
