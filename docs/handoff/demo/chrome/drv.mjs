// usage: node drv.mjs step.mjs   (step exports default async (page, ctx))
import { readFileSync } from 'node:fs'
const { chromium } = await import('/vercel/sandbox/node_modules/playwright/index.mjs')
const URL = readFileSync('/tmp/dsh-chrome/web.log', 'utf8').match(/dsh web: (http\S+)/g).pop().slice(9)
const scheme = process.env.SCHEME || 'light'
const b = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 900) }, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme: scheme })
const page = await ctx.newPage()
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
page.on('console', m => { if (/iui|genui/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)) })
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
for (const re of [/继续|我知道了|开始使用|进入|同意/]) { const btn = page.getByRole('button', { name: re }); if (await btn.count()) { await btn.first().click().catch(() => {}); await page.waitForTimeout(500) } }
const step = (await import(process.cwd() + '/' + process.argv[2])).default
try { await step(page, { URL, sleep: (ms) => page.waitForTimeout(ms) }) } catch (e) { console.log('STEP ERR', String(e).slice(0, 400)) }
console.log(errs.slice(0, 12).join('\n'))
await b.close(); process.exit(0)
