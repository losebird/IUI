import { chromium } from '/vercel/sandbox/node_modules/playwright/index.mjs'
const [base, out, only] = process.argv.slice(2)
const modes = [['light-688', 688, false], ['dark-688', 688, true], ['light-390', 390, false]]
const scenes = {
  contrast: async (p) => { await p.waitForTimeout(3600) },
}
const hashOf = { contrast: 'contrast' }
const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] })
for (const [mode, w, dark] of modes) {
  for (const [id, act] of Object.entries(scenes)) {
    if (only && !only.split(',').includes(id)) continue
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => console.error(id, mode, 'pageerror', String(e).slice(0, 200)))
    await p.goto(`${base}/index.html#${hashOf[id]}${dark ? '-dark' : ''}`)
    await p.waitForTimeout(2200)
    try { await act(p) } catch (e) { console.error(id, mode, 'act', String(e).slice(0, 200)) }
    const fullH = await p.evaluate(() => document.documentElement.scrollHeight)
    if (fullH > 900) { await p.setViewportSize({ width: w, height: fullH }); await p.waitForTimeout(300) }
    await p.screenshot({ path: `${out}/${id}-${mode}.png`, fullPage: true })
    await ctx.close()
  }
}
await browser.close()
process.exit(0)
