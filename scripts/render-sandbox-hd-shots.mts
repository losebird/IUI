#!/usr/bin/env tsx
/**
 * HD shots for ```iui-html starters.
 * Live dsh DOM preferred; static srcdoc fallback so Ace still gets PNGs.
 *
 *   pnpm exec tsx scripts/render-sandbox-hd-shots.mts --url 'http://127.0.0.1:3080/?token=…'
 *   pnpm exec tsx scripts/render-sandbox-hd-shots.mts --static-only
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import {
  buildHtmlSandboxSrcdoc,
  listHtmlSandboxStarters,
  mergeSandboxDesignTokens,
  starterToFenceBody,
  type HtmlSandboxStarter,
} from '../src/shared/html-sandbox.ts'

const SCRIPT_PATH = resolve(process.argv[1] ?? '')
const REPO_ROOT = dirname(SCRIPT_PATH).endsWith('scripts')
  ? resolve(dirname(SCRIPT_PATH), '..')
  : resolve(process.cwd())
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const URL_ARG = arg('--url')
const STATIC_ONLY = process.argv.includes('--static-only')
const OUT = resolve(arg('--out') ?? '/workspace/uploads/iui13-sandbox-hd')

mkdirSync(OUT, { recursive: true })

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright/index.mjs'),
    join(homedir(), '.local/lib/node_modules/playwright/index.mjs'),
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (!existsSync(c) && !c.endsWith('.mjs')) continue
    try {
      const mod = await import(pathToFileURL(c).href)
      if (mod.chromium) return mod
    } catch { /* try next */ }
  }
  // bare import last
  try {
    return await import('playwright')
  } catch {
    throw new Error('playwright not found')
  }
}

const PICK_IDS = [
  'sort-viz', 'bento-dash', 'particle', 'leaflet-map', 'echarts-mini',
  'ds-kit', 'compare-cards', 'tabs-panel', 'counter', 'kpi-grid',
]

function pickStarters(): HtmlSandboxStarter[] {
  const all = listHtmlSandboxStarters()
  const picked = PICK_IDS.map((id) => all.find((s) => s.id === id)).filter(Boolean) as HtmlSandboxStarter[]
  return picked.length >= 8 ? picked : all.slice(0, 10)
}

function staticPage(starter: HtmlSandboxStarter): string {
  const srcdoc = buildHtmlSandboxSrcdoc(starter.spec, {
    designTokens: mergeSandboxDesignTokens({}, 'sandbox'),
    frameId: `shot-${starter.id}`,
    brandId: 'sandbox',
    mergePackTokens: false,
  })
  const escaped = srcdoc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${starter.title}</title>
<style>body{margin:0;padding:24px;background:#f8fafc;font:14px/1.4 system-ui}h1{font-size:16px;margin:0 0 12px}iframe{width:100%;height:520px;border:1px solid #e5e7eb;border-radius:16px;background:#fff}</style>
</head><body><h1>${starter.title} · ${starter.summary}</h1>
<iframe sandbox="allow-scripts" srcdoc="${escaped}"></iframe></body></html>`
}

async function main() {
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  const starters = pickStarters()
  const results: Array<{ id: string; path: string; mode: string }> = []

  let live = false
  if (!STATIC_ONLY && URL_ARG) {
    try {
      await page.goto(URL_ARG, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(1200)
      live = true
    } catch (err) {
      console.warn('live navigate failed, static fallback', err)
    }
  }

  for (const starter of starters) {
    const shot = join(OUT, `${starter.id}.png`)
    if (live && URL_ARG) {
      const body = starterToFenceBody(starter)
      await page.evaluate((code) => {
        const root = document.querySelector('[data-conversation], main, #root') || document.body
        let host = document.getElementById('iui-shot-host')
        if (!host) {
          host = document.createElement('div')
          host.id = 'iui-shot-host'
          host.style.cssText = 'padding:24px;max-width:920px;margin:0 auto;background:#fff;'
          root.appendChild(host)
        }
        host.innerHTML = ''
        const pre = document.createElement('pre')
        pre.className = 'language-iui-html'
        pre.setAttribute('data-language', 'iui-html')
        const c = document.createElement('code')
        c.className = 'language-iui-html'
        c.textContent = code
        pre.appendChild(c)
        host.appendChild(pre)
      }, body)
      await page.waitForTimeout(2800)
      const el = await page.$('#iui-shot-host')
      if (el) await el.screenshot({ path: shot, type: 'png' })
      else await page.screenshot({ path: shot, type: 'png' })
      results.push({ id: starter.id, path: shot, mode: 'live' })
    } else {
      const htmlPath = join(OUT, `${starter.id}.html`)
      writeFileSync(htmlPath, staticPage(starter))
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: shot, type: 'png', fullPage: true })
      results.push({ id: starter.id, path: shot, mode: 'static' })
    }
    console.log('shot', starter.id, shot)
  }

  writeFileSync(join(OUT, 'index.json'), JSON.stringify({
    version: '0.13.0-iui.3',
    url: URL_ARG ?? null,
    results,
  }, null, 2))
  await browser.close()
  console.log('done', results.length, OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
