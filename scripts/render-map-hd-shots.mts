#!/usr/bin/env node
/**
 * HD Chinese shots: rings / charts / compare first, then real Leaflet/OSM map.
 * Avoid form-heavy frames. Static GenUI chrome (2×) — no model needed.
 *
 *   pnpm exec tsx scripts/render-map-hd-shots.mts
 *   pnpm exec tsx scripts/render-map-hd-shots.mts --out /workspace/uploads/iui-map-real-shots-hd
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { compileDilLite } from '../src/shared/dil-lite.ts'
import { buildOsmEmbedUrl, buildLeafletMapSrcdoc } from '../src/shared/map-embed.ts'

const SCRIPT_PATH = resolve(process.argv[1] ?? '')
const REPO_ROOT = dirname(SCRIPT_PATH).endsWith('scripts')
  ? resolve(dirname(SCRIPT_PATH), '..')
  : resolve(process.cwd())
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const OUT_DIR = resolve(arg('--out') ?? '/workspace/uploads/iui-map-real-shots-hd')

async function loadPlaywright(): Promise<{ chromium: any }> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(REPO_ROOT, 'node_modules/playwright-core/index.mjs'),
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    '/home/box/.dsh/source/current/apps/web/node_modules/playwright/index.mjs',
    join(homedir(), '.claude/skills/guizang-social-card-skill/node_modules/playwright-core/index.mjs'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      return await import(pathToFileURL(p).href)
    } catch { /* next */ }
  }
  throw new Error('playwright not found')
}

type Shot = { id: string; title: string; lead: string; bodyHtml: string }

function cardShell(inner: string, lead: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{--bg:#fafafa;--fg:#0a0a0b;--muted:#71717a;--border:#e4e4e7;--card:#fff;--accent:#18181b;--radius:16px}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.45 ui-sans-serif,system-ui,"PingFang SC","Noto Sans SC",sans-serif;background:var(--bg);color:var(--fg)}
  .bubble{max-width:720px;margin:24px auto;padding:8px 16px 28px}
  .lead{color:var(--muted);margin:0 0 12px;font-size:14px}
  .root{display:flex;flex-direction:column;gap:12px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:0 1px 3px rgb(0 0 0/.04);position:relative;min-height:110px}
  .stat .label{font-size:12px;color:var(--muted);font-weight:600}
  .stat .value{font-size:28px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
  .stat .hint{font-size:11px;color:var(--muted);margin-top:4px}
  .ring{position:absolute;right:12px;top:14px;width:52px;height:52px}
  .ring svg{transform:rotate(-90deg)}
  .ring circle{fill:none;stroke-width:6}
  .ring .track{stroke:#e4e4e7}
  .ring .val{stroke:#18181b;stroke-linecap:round}
  .ring.danger .val{stroke:#dc2626}
  .ring.warn .val{stroke:#d97706}
  .spark{display:block;margin-top:8px;height:28px;width:100%}
  .compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .opt{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:0 1px 3px rgb(0 0 0/.04)}
  .opt h3{margin:0 0 8px;font-size:15px}
  .pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#f4f4f5;margin-left:6px}
  .metric{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f4f4f5}
  .chart-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:0 1px 3px rgb(0 0 0/.04)}
  .chart-card h3{margin:0 0 8px;font-size:14px}
  .range-row{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:12px;color:var(--muted)}
  .range-bar{flex:1;height:8px;background:#f4f4f5;border-radius:999px;position:relative}
  .range-fill{position:absolute;height:100%;border-radius:999px;background:linear-gradient(90deg,#93c5fd,#2563eb)}
  .map-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;box-shadow:0 1px 3px rgb(0 0 0/.04);display:flex;flex-direction:column;gap:10px}
  .map-label{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--muted);text-transform:uppercase}
  .map-title{font-size:16px;font-weight:650}
  .map-addr{font-size:13px;color:var(--muted)}
  .map-frame{border-radius:12px;overflow:hidden;border:1px solid var(--border);aspect-ratio:16/10;min-height:220px;background:#f4f4f5}
  .map-frame iframe{width:100%;height:100%;border:0;display:block}
  .links{display:flex;flex-wrap:wrap;gap:8px}
  .links a{display:inline-flex;align-items:center;gap:4px;padding:8px 12px;border-radius:10px;border:1px solid var(--border);text-decoration:none;color:var(--fg);font-size:13px;font-weight:600;background:#fff}
</style></head><body>
<div class="bubble">
  <p class="lead">${lead}</p>
  <div class="root" data-genui>${inner}</div>
</div>
</body></html>`
}

function ringSvg(pct: number, tone = ''): string {
  const c = 2 * Math.PI * 18
  const dash = `${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`
  return `<div class="ring ${tone}"><svg viewBox="0 0 44 44" width="52" height="52"><circle class="track" cx="22" cy="22" r="18"/><circle class="val" cx="22" cy="22" r="18" stroke-dasharray="${dash}"/></svg></div>`
}

function sparkPath(vals: number[]): string {
  const max = Math.max(...vals, 1)
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1 || 1)) * 120
    const y = 28 - (v / max) * 24
    return `${x},${y}`
  }).join(' ')
  return `<svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none"><polyline fill="none" stroke="#18181b" stroke-width="2" points="${pts}"/></svg>`
}

const SHOTS: Shot[] = []

// 01 rings
SHOTS.push({
  id: '01-resource-rings',
  title: '资源圆环',
  lead: '本机资源概览如下。',
  bodyHtml: cardShell(`<div class="grid">
    <div class="stat">${ringSvg(34)}<div class="label">CPU</div><div class="value">34%</div><div class="hint">正常</div>${sparkPath([20,28,32,34,30,36,34])}</div>
    <div class="stat">${ringSvg(62, 'warn')}<div class="label">内存</div><div class="value">62%</div><div class="hint">偏高</div>${sparkPath([40,48,55,60,62,58,62])}</div>
    <div class="stat">${ringSvg(41)}<div class="label">磁盘</div><div class="value">41%</div><div class="hint">充足</div>${sparkPath([30,32,35,38,40,41,41])}</div>
  </div>`, '本机资源概览如下。'),
})

// 02 weather chart
SHOTS.push({
  id: '02-weather-chart',
  title: '天气折线',
  lead: '上海今天的气温走势。',
  bodyHtml: cardShell(`<div class="chart-card">
    <h3>上海 · 多云 · 体感 21°</h3>
    <svg viewBox="0 0 320 100" width="100%" height="100" style="display:block">
      <polyline fill="none" stroke="#2563eb" stroke-width="2.5" points="10,70 70,55 130,40 190,35 250,45 310,60"/>
      <g fill="#71717a" font-size="10" font-family="system-ui">
        <text x="10" y="95">10</text><text x="70" y="95">12</text><text x="130" y="95">14</text><text x="190" y="95">16</text><text x="250" y="95">18</text><text x="300" y="95">20</text>
      </g>
    </svg>
    <div class="range-row"><span>周一</span><div class="range-bar"><div class="range-fill" style="left:20%;width:45%"></div></div><span>14–23°</span></div>
    <div class="range-row"><span>周二</span><div class="range-bar"><div class="range-fill" style="left:22%;width:48%"></div></div><span>15–24°</span></div>
    <div class="range-row"><span>周三</span><div class="range-bar"><div class="range-fill" style="left:18%;width:42%"></div></div><span>13–21°</span></div>
  </div>`, '上海今天的气温走势。'),
})

// 03 compare cards
SHOTS.push({
  id: '03-compare-cards',
  title: '方案对比',
  lead: '两个方案并排对比。',
  bodyHtml: cardShell(`<div class="compare">
    <div class="opt"><h3>方案甲<span class="pill">推荐</span></h3>
      <div class="metric"><span>成本</span><strong>35%</strong></div>
      <div class="metric"><span>速度</span><strong>80%</strong></div>
      <div class="metric"><span>维护</span><strong>中</strong></div>
    </div>
    <div class="opt"><h3>方案乙</h3>
      <div class="metric"><span>成本</span><strong>55%</strong></div>
      <div class="metric"><span>速度</span><strong>60%</strong></div>
      <div class="metric"><span>维护</span><strong>低</strong></div>
    </div>
  </div>`, '两个方案并排对比。'),
})

// 04 dashboard bento
SHOTS.push({
  id: '04-dashboard-bento',
  title: '看板 bento',
  lead: '今日关键指标。',
  bodyHtml: cardShell(`<div class="grid">
    <div class="stat">${ringSvg(88)}<div class="label">可用性</div><div class="value">99.9%</div>${sparkPath([90,92,91,95,94,96,99])}</div>
    <div class="stat">${ringSvg(24)}<div class="label">错误率</div><div class="value">0.2%</div>${sparkPath([5,4,6,3,4,2,2])}</div>
    <div class="stat">${ringSvg(71)}<div class="label">吞吐</div><div class="value">1.2k</div>${sparkPath([40,50,55,60,65,70,71])}</div>
  </div>
  <div class="chart-card"><h3>近 7 日请求</h3>
    <svg viewBox="0 0 320 80" width="100%" height="80"><rect x="20" y="40" width="28" height="30" fill="#18181b" rx="4"/><rect x="60" y="28" width="28" height="42" fill="#18181b" rx="4"/><rect x="100" y="20" width="28" height="50" fill="#18181b" rx="4"/><rect x="140" y="32" width="28" height="38" fill="#18181b" rx="4"/><rect x="180" y="16" width="28" height="54" fill="#18181b" rx="4"/><rect x="220" y="24" width="28" height="46" fill="#18181b" rx="4"/><rect x="260" y="12" width="28" height="58" fill="#18181b" rx="4"/></svg>
  </div>`, '今日关键指标。'),
})

// 05 real map — OSM embed with coords (deterministic for screenshot)
const osm = buildOsmEmbedUrl(32.0439, 118.7881, 15)
const mapCompiled = compileDilLite({
  dil: 'map-card',
  title: '珠江路',
  address: '江苏省南京市玄武区珠江路',
  query: '南京珠江路',
  lat: 32.0439,
  lng: 118.7881,
  provider: 'osm',
  zoom: 15,
  facts: ['地铁沿线商圈', '可外链打开高德 / 百度 / OSM'],
})
SHOTS.push({
  id: '05-map-osm',
  title: '真地图 OSM',
  lead: '目的地已在地图上标出。',
  bodyHtml: cardShell(`<div class="map-card" data-iui-map data-iui-map-mode="osm">
    <div class="map-label">目的地</div>
    <div class="map-title">珠江路</div>
    <div class="map-addr">江苏省南京市玄武区珠江路</div>
    <div class="map-frame"><iframe src="${osm}" title="地图" loading="eager"></iframe></div>
    <ul style="margin:0;padding-left:18px;font-size:13px"><li>地铁沿线商圈</li><li>可外链打开高德 / 百度 / OSM</li></ul>
    <div class="links">
      <a href="https://uri.amap.com/search?keyword=%E5%8D%97%E4%BA%AC%E7%8F%A0%E6%B1%9F%E8%B7%AF" target="_blank">高德地图 ↗</a>
      <a href="https://www.openstreetmap.org/search?query=%E5%8D%97%E4%BA%AC%E7%8F%A0%E6%B1%9F%E8%B7%AF" target="_blank">OpenStreetMap ↗</a>
    </div>
  </div>
  <!-- dil: ${JSON.stringify(mapCompiled.value).slice(0, 120)}… -->`, '目的地已在地图上标出。'),
})

// 06 leaflet srcdoc (may geocode; for shot we pin coords in srcdoc)
const leaflet = buildLeafletMapSrcdoc({
  lat: 32.0439,
  lng: 118.7881,
  zoom: 15,
  title: '珠江路',
  query: '南京珠江路',
})
const leafletDoc = leaflet.replace(/"/g, '&quot;')
SHOTS.push({
  id: '06-map-leaflet',
  title: '真地图 Leaflet',
  lead: '交互地图（Leaflet · OSM 瓦片）。',
  bodyHtml: cardShell(`<div class="map-card" data-iui-map data-iui-map-mode="leaflet">
    <div class="map-label">导航</div>
    <div class="map-title">珠江路</div>
    <div class="map-addr">江苏省南京市玄武区珠江路 · 32.0439, 118.7881</div>
    <div class="map-frame"><iframe srcdoc="${leafletDoc}" title="Leaflet 地图" sandbox="allow-scripts allow-popups"></iframe></div>
    <div class="links">
      <a href="https://uri.amap.com/search?keyword=%E5%8D%97%E4%BA%AC%E7%8F%A0%E6%B1%9F%E8%B7%AF" target="_blank">高德地图 ↗</a>
      <a href="https://map.baidu.com/search/%E5%8D%97%E4%BA%AC%E7%8F%A0%E6%B1%9F%E8%B7%AF" target="_blank">百度地图 ↗</a>
    </div>
  </div>`, '交互地图（Leaflet · OSM 瓦片）。'),
})

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const manifest: Array<{ id: string; title: string; png: string; html: string }> = []
  for (const shot of SHOTS) {
    const htmlPath = join(OUT_DIR, `${shot.id}.html`)
    const pngPath = join(OUT_DIR, `${shot.id}.png`)
    await writeFile(htmlPath, shot.bodyHtml, 'utf8')
    const page = await browser.newPage({
      viewport: { width: 900, height: 720 },
      deviceScaleFactor: 2,
    })
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Let OSM/Leaflet paint
    await page.waitForTimeout(shot.id.includes('map') ? 3500 : 400)
    const bubble = page.locator('.bubble')
    await bubble.screenshot({ path: pngPath, type: 'png' })
    await page.close()
    manifest.push({ id: shot.id, title: shot.title, png: pngPath, html: htmlPath })
    console.log(`✓ ${shot.id}`)
  }
  await browser.close()
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify({ version: '0.12.0-iui.38', shots: manifest }, null, 2))
  console.log(`→ ${OUT_DIR} (${manifest.length} shots)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
