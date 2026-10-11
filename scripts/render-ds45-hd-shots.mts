#!/usr/bin/env node
/**
 * HD (2×) shots for 0.12.0-iui.45 design-system deepen:
 * - MUI / Ant / Chakra / shadcn token surfaces (CSS vars from packBrandCssVars)
 * - iui-html ds-kit starter srcdoc
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { packBrandCssVars, getPackBrand } from '../src/packs/shared/brand-map.ts'
import { cssVarsToInline } from '../src/themes/tokens.ts'
import { buildHtmlSandboxSrcdoc, getHtmlSandboxStarter } from '../src/shared/html-sandbox.ts'
import { brandHeroBackground } from '../src/packs/shared/library-theme.ts'

const OUT = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1]! : '/workspace/uploads/iui45-hd-shots')
const REPO = resolve(dirname(process.argv[1] ?? ''), '..')

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    join(REPO, 'node_modules/playwright-core/index.mjs'),
    join(REPO, 'node_modules/playwright/index.mjs'),
    '/home/box/.dsh/source/current/apps/web/node_modules/playwright/index.mjs',
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try { return await import(pathToFileURL(p).href) } catch { /* next */ }
  }
  throw new Error('playwright not found')
}

function packShowcaseHtml(packId: string): string {
  const brand = getPackBrand(packId)
  const vars = packBrandCssVars(packId)
  const hero = brandHeroBackground(packId)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
:root{${cssVarsToInline(vars)}}
*{box-sizing:border-box}
body{margin:0;padding:24px;font:13px/1.45 ${brand.fontFamily};color:var(--iui-pack-fg);background:#f4f4f5;letter-spacing:-0.011em}
.wrap{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:var(--iui-pack-gap)}
.tag{font-size:11px;font-weight:650;color:var(--iui-pack-muted-fg);text-transform:uppercase;letter-spacing:.04em}
.hero{padding:var(--iui-pack-pad);border-radius:var(--iui-pack-radius);background:${hero};border:1px solid var(--iui-pack-border);box-shadow:var(--iui-pack-elev)}
.hero h1{margin:0;font-size:var(--iui-pack-font-stat);letter-spacing:-.02em}
.hero p{margin:4px 0 0;color:var(--iui-pack-muted-fg);font-size:var(--iui-pack-font-sm)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--iui-pack-gap)}
.card{padding:var(--iui-pack-pad);border-radius:var(--iui-pack-radius);border:1px solid var(--iui-pack-border);background:var(--iui-pack-surface);box-shadow:var(--iui-pack-elev)}
.card .label{font-size:var(--iui-pack-font-sm);color:var(--iui-pack-muted-fg)}
.card .value{font-size:var(--iui-pack-font-stat);font-weight:700;letter-spacing:-.02em}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:650;background:var(--iui-pack-tint);color:var(--iui-pack-accent);border:1px solid color-mix(in srgb,var(--iui-pack-accent) 22%,transparent)}
button{cursor:pointer;border-radius:var(--iui-pack-radius-control);border:1px solid color-mix(in srgb,var(--iui-pack-accent) 35%,var(--iui-pack-border));background:var(--iui-pack-accent);color:var(--iui-pack-on-accent);padding:8px 12px;min-height:var(--iui-pack-control-h);font-weight:600;font:inherit}
button.sec{background:var(--iui-pack-surface);color:var(--iui-pack-accent)}
input{border:1px solid var(--iui-pack-border);border-radius:var(--iui-pack-radius-control);padding:8px 10px;min-height:var(--iui-pack-control-h);width:100%;background:var(--iui-pack-surface)}
.swatches{display:flex;gap:8px}.sw{width:36px;height:36px;border-radius:10px;border:1px solid var(--iui-pack-border)}
</style></head><body><div class="wrap">
<div class="tag">${brand.label} · token surfaces</div>
<div class="hero"><h1>${brand.label}</h1><p>accent ${brand.accent} · radius ${brand.radius} · 密度来自 IUI_TOKEN_CATALOG</p></div>
<div class="grid">
  <div class="card"><div class="label">CPU</div><div class="value">34%</div></div>
  <div class="card"><div class="label">内存</div><div class="value">62%</div></div>
  <div class="card"><div class="label">磁盘</div><div class="value">41%</div></div>
</div>
<div class="card">
  <div class="row" style="margin-bottom:10px"><span class="badge">派生 secondary</span><span class="badge">tint</span><span class="badge">on-accent</span></div>
  <div class="swatches">
    <div class="sw" style="background:var(--iui-pack-accent)" title="accent"></div>
    <div class="sw" style="background:var(--iui-pack-secondary)" title="secondary"></div>
    <div class="sw" style="background:var(--iui-pack-tint)" title="tint"></div>
    <div class="sw" style="background:var(--iui-pack-ok)" title="ok"></div>
    <div class="sw" style="background:var(--iui-pack-warn)" title="warn"></div>
    <div class="sw" style="background:var(--iui-pack-danger)" title="danger"></div>
  </div>
  <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
    <input placeholder="控件高度 / 圆角来自 catalog"/>
    <div class="row"><button type="button">主按钮</button><button type="button" class="sec">次按钮</button></div>
  </div>
</div>
</div></body></html>`
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    executablePath: process.env.PLAYWRIGHT_CHROME || undefined,
  }).catch(async () => chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME || '/usr/bin/google-chrome',
  }))
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 1100 } })
  const manifest: Array<{ id: string; file: string; pack?: string }> = []

  for (const id of ['mui', 'antd', 'chakra', 'shadcn'] as const) {
    const html = packShowcaseHtml(id)
    const file = join(OUT, `pack-${id}.html`)
    await writeFile(file, html)
    await page.setContent(html, { waitUntil: 'networkidle' })
    const shot = join(OUT, `pack-${id}.png`)
    await page.screenshot({ path: shot, fullPage: true, type: 'png' })
    manifest.push({ id: `pack-${id}`, file: shot, pack: id })
    console.log('✓', id)
  }

  const starter = getHtmlSandboxStarter('ds-kit')!
  for (const brandId of ['mui', 'antd', 'chakra'] as const) {
    const srcdoc = buildHtmlSandboxSrcdoc(starter.spec, { brandId, frameId: `ds-${brandId}` })
    const shell = `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f5;padding:16px">
<iframe id="f" style="width:100%;height:520px;border:0;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)"></iframe>
<script>document.getElementById('f').srcdoc = ${JSON.stringify(srcdoc)}</script>
</body></html>`
    await page.setViewportSize({ width: 900, height: 700 })
    await page.setContent(shell, { waitUntil: 'networkidle' })
    await page.waitForTimeout(200)
    const shot = join(OUT, `sandbox-dskit-${brandId}.png`)
    await page.screenshot({ path: shot, fullPage: true, type: 'png' })
    manifest.push({ id: `sandbox-dskit-${brandId}`, file: shot, pack: brandId })
    console.log('✓ sandbox', brandId)
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ version: '0.12.0-iui.45', shots: manifest }, null, 2))
  await browser.close()
  console.log('OUT', OUT)
}

main().catch((err) => { console.error(err); process.exit(1) })
