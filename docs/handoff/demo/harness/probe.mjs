import { chromium } from '/vercel/sandbox/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
const pages = JSON.parse(readFileSync(new URL('./starters.json', import.meta.url), 'utf8'))
const only = process.argv[2]
const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] })
for (const [id, raw] of Object.entries(pages)) {
  if (only && !only.split(',').includes(id)) continue
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 688, height: 900 } })
    await ctx.addInitScript((r) => sessionStorage.setItem('probe', r), raw)
    const p = await ctx.newPage()
    const msgs = []
    await p.exposeFunction('__note', (m) => msgs.push(m))
    await p.addInitScript(() => window.addEventListener('message', (e) => { if (e.data && e.data.type === 'selfCheck') window.__note(JSON.stringify(e.data.issues)) }))
    await p.goto(`http://127.0.0.1:8743/index.html#probe${dark ? '-dark' : ''}`)
    await p.waitForTimeout(6500)
    if (id === 'bad-contrast') {
      const fr = p.frames().find((f) => f !== p.mainFrame())
      try { await fr.click('#d2'); await p.waitForTimeout(2500) } catch (e) { console.log('click fail', String(e).slice(0, 100)) }
    }
    console.log(id, dark ? 'dark' : 'light', msgs.map((m) => m.slice(0, 700)).join(' || ') || '(no selfCheck)')
    await ctx.close()
  }
}
await browser.close(); process.exit(0)
