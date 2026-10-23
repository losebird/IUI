/**
 * F25: score pages by how they actually look (real Chromium + screenshots).
 *
 *   pnpm run test:visual                    score all starters, compare with the baseline
 *   pnpm run test:visual -- --update-baseline
 *   pnpm run test:visual -- --out dir       also write visual-score.json / .md there
 *
 * Six rules, each 0–100 (100 = no problem):
 *   minFont    share of visible text ≥ 12px
 *   contrast   share of visible text meeting WCAG AA (4.5:1, large text 3:1)
 *   overflow   no horizontal overflow at 720px (chat column)
 *   narrow     no horizontal overflow at 360px (phone)
 *   whitespace screenshot cells that carry content (blank share ≤ 60% = 100)
 *   hero       one dominant visual (largest chart / map / image / big number ≥ 20% of first screen)
 * A rule falling more than {@link RULE_DROP} points below the committed
 * baseline (or a page below {@link PAGE_FLOOR} overall) is a regression: red in
 * the report and a non-zero exit. The live golden set reuses {@link scoreSrcdoc}.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
export const BASELINE_PATH = join(REPO_ROOT, 'scripts/golden/visual-baseline.json')
export const RULES = ['minFont', 'contrast', 'overflow', 'narrow', 'whitespace', 'hero'] as const
export type Rule = typeof RULES[number]
export type VisualScore = { scores: Record<Rule, number>; total: number; notes: string[]; heroFill?: number }
/** Allowed per-rule drop vs baseline before a rule turns red. */
export const RULE_DROP = 8
/** Every built-in template must reach this total (D: 模板必须通过 F25 评分才能入库). */
export const PAGE_FLOOR = 75

/** D: per-template admission rules on top of the six scores. */
export const TEMPLATE_GATES: Record<string, (s: VisualScore) => string[]> = {
  // 3D scene: the subject (object + shadow) fills ≥ 40% of the canvas.
  'scene-3d': (s) => (s.heroFill !== undefined && s.heroFill < 0.4 ? [`hero subject ${(s.heroFill * 100).toFixed(0)}% < 40%`] : []),
  // Meeting-room board: the occupancy timeline is a real hero.
  'meeting-rooms': (s) => (s.scores.hero < 80 ? [`hero ${s.scores.hero} < 80`] : []),
}

const SHIM = 'window.__name = window.__name || function (f) { return f }'

/** In-page text metrics: min font + contrast, weighted by visible text length. */
async function textMetrics(page: any): Promise<{ minFont: number; contrast: number; notes: string[] }> {
  await page.evaluate(SHIM)
  return await page.evaluate(() => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
      return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 1 : p[3]!]
    }
    const lum = (c: number[]): number => {
      const ch = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
      return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
    }
    const blend = (top: number[], under: number[]): number[] => {
      const a = top[3]!
      return [top[0]! * a + under[0]! * (1 - a), top[1]! * a + under[1]! * (1 - a), top[2]! * a + under[2]! * (1 - a), 1]
    }
    const rootBg = (() => {
      for (const el of [document.body, document.documentElement]) {
        const c = parse(getComputedStyle(el).backgroundColor)
        if (c && c[3]! > 0.5) return c
      }
      return [255, 255, 255, 1]
    })()
    /** Effective background; null when an image/gradient sits behind the text. */
    const bgOf = (el: Element): number[] | null => {
      const layers: number[][] = []
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
        const c = parse(cs.backgroundColor)
        if (c && c[3]! > 0) { layers.push(c); if (c[3]! >= 0.99) break }
      }
      let out = layers.length && layers[layers.length - 1]![3]! >= 0.99 ? layers.pop()! : rootBg
      while (layers.length) out = blend(layers.pop()!, out)
      return out
    }
    let total = 0; let small = 0; let checked = 0; let low = 0
    const smallest: string[] = []; const worst: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set<Element>()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent || '').trim()
      if (!text) continue
      const el = n.parentElement
      if (!el || seen.has(el)) continue
      seen.add(el)
      if (el.closest('script,style,template,noscript,svg,.leaflet-control-attribution,[aria-hidden="true"],.sr-only,[hidden]')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) continue
      const w = Math.min(200, text.length)
      const fs = parseFloat(cs.fontSize)
      total += w
      if (fs < 11.5) { small += w; if (smallest.length < 3) smallest.push(`${fs}px "${text.slice(0, 16)}"`) }
      const fg = parse(cs.color)
      const bg = bgOf(el)
      if (!fg || !bg) continue
      const color = fg[3]! < 1 ? blend(fg, bg) : fg
      const a = lum(color); const b = lum(bg)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700)
      checked += w
      if (ratio < (large ? 3 : 4.5) - 0.05) { low += w; if (worst.length < 3) worst.push(`${ratio.toFixed(2)}:1 "${text.slice(0, 16)}"`) }
    }
    const notes: string[] = []
    if (smallest.length) notes.push(`small text: ${smallest.join(', ')}`)
    if (worst.length) notes.push(`low contrast: ${worst.join(', ')}`)
    return {
      minFont: total ? Math.round(100 * (1 - small / total)) : 100,
      contrast: checked ? Math.round(100 * (1 - low / checked)) : 100,
      notes,
    }
  })
}

/** Horizontal overflow in px (element boxes, ignoring scroll/clip containers). */
async function overflowPx(page: any): Promise<number> {
  await page.evaluate(SHIM)
  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox !== 'visible') return true
      }
      return false
    }
    let over = 0
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest('script,style,template,.leaflet-container,[aria-hidden="true"]')) continue
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue
      if (getComputedStyle(el).position === 'fixed' || clipped(el)) continue
      over = Math.max(over, Math.round(r.right - vw))
    }
    return over
  })
}

/** Largest dominant visual / first-screen area. */
async function heroRatio(page: any): Promise<{ ratio: number; what: string; rect: { x: number; y: number; w: number; h: number } | null }> {
  await page.evaluate(SHIM)
  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    let content = 0
    for (const el of Array.from(document.body.querySelectorAll('*'))) { const r = el.getBoundingClientRect(); if (r.width && r.height && getComputedStyle(el).position !== 'fixed') content = Math.max(content, r.bottom) }
    const screenH = Math.min(Math.max(120, content), 900)
    const area = vw * Math.max(1, screenH)
    let best = 0; let what = 'none'; let rect: { x: number; y: number; w: number; h: number } | null = null
    const consider = (el: Element, label: string): void => {
      const r = el.getBoundingClientRect()
      const top = Math.max(0, r.top); const bottom = Math.min(screenH, r.bottom)
      const a = Math.max(0, Math.min(r.right, vw) - Math.max(0, r.left)) * Math.max(0, bottom - top)
      if (a > best) { best = a; what = label; rect = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height } }
    }
    for (const el of Array.from(document.querySelectorAll('canvas,img,video,.leaflet-container,.ag-root-wrapper,[data-iui-hero],.iui-weather-hero,table,pre.mermaid,.mermaid svg'))) consider(el, el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : ''))
    for (const el of Array.from(document.querySelectorAll('svg'))) { if (!el.closest('button,a,[role=button]') && el.getBoundingClientRect().height >= 60) consider(el, 'svg') }
    // A big number / headline block counts with its card.
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 28 || !(el.textContent || '').trim() || el.children.length > 3) continue
      const card = el.closest('[class*="hero"]') ?? el.closest('.iui-stats') ?? el.closest('.iui-stat,.iui-tier,.iui-sandbox-card,[class*="card"]') ?? el
      consider(card, `big ${Math.round(fs)}px text`)
    }
    return { ratio: best / area, what, rect }
  })
}

/**
 * Share of 24px screenshot cells that are a single flat colour (no content),
 * plus how much of the hero box differs from its corner colour (subject fill).
 */
async function blankShare(page: any, decoder: any, hero: { x: number; y: number; w: number; h: number } | null): Promise<{ blank: number; fill: number | null }> {
  // Content height (what the auto-height frame shows), not the 900px viewport.
  const content = await page.evaluate(`(() => { let b = 0; for (const el of document.body.querySelectorAll('*')) { if (el.closest('script,style,template')) continue; const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.display === 'none') continue; const r = el.getBoundingClientRect(); if (r.width && r.height) b = Math.max(b, r.bottom + window.scrollY); } return Math.ceil(b + 12); })()`) as number
  const height = Math.max(40, Math.min(2400, content))
  const width = await page.evaluate('document.documentElement.clientWidth') as number
  const png: Buffer = await page.screenshot({ clip: { x: 0, y: 0, width, height }, type: 'png' })
  await decoder.evaluate(SHIM)
  return await decoder.evaluate(async ({ b64, hero }: { b64: string; hero: { x: number; y: number; w: number; h: number } | null }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth; cv.height = img.naturalHeight
    const g = cv.getContext('2d')!
    g.drawImage(img, 0, 0)
    const { data, width: w, height: h } = g.getImageData(0, 0, cv.width, cv.height)
    const cell = Math.max(8, Math.round(24 * (w / Math.max(1, cv.width))))
    let cells = 0; let flat = 0
    for (let y = 0; y + cell <= h; y += cell) {
      for (let x = 0; x + cell <= w; x += cell) {
        let min = 765; let max = 0
        for (let yy = y; yy < y + cell; yy += 3) {
          for (let xx = x; xx < x + cell; xx += 3) {
            const i = (yy * w + xx) * 4
            const v = data[i]! + data[i + 1]! + data[i + 2]!
            if (v < min) min = v
            if (v > max) max = v
          }
        }
        cells++
        if (max - min < 18) flat++
      }
    }
    let fill: number | null = null
    if (hero && hero.w > 20 && hero.h > 20) {
      const x0 = Math.max(0, Math.floor(hero.x)); const y0 = Math.max(0, Math.floor(hero.y))
      const x1 = Math.min(w, Math.floor(hero.x + hero.w)); const y1 = Math.min(h, Math.floor(hero.y + hero.h))
      const ci = (y0 * w + x0) * 4
      const bg = [data[ci]!, data[ci + 1]!, data[ci + 2]!]
      let n = 0; let diff = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4
          n++
          if (Math.abs(data[i]! - bg[0]!) + Math.abs(data[i + 1]! - bg[1]!) + Math.abs(data[i + 2]! - bg[2]!) > 36) diff++
        }
      }
      fill = n ? diff / n : null
    }
    return { blank: cells ? flat / cells : 0, fill }
  }, { b64: png.toString('base64'), hero })
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

async function waitSettled(page: any): Promise<void> {
  await page.waitForFunction(() => ['authorSettled', 'live', 'failed'].includes((window as any).__iuiAuthorPipeline?.phase), null, { timeout: 15000 }).catch(() => {})
  // R5-3: host 3D stages load three + loaders asynchronously — score the rendered frame, not the spinner.
  await page.waitForFunction(() => !document.querySelector('[data-iui-3d]:not([data-iui-3d-ready])'), null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(600)
}

/**
 * Score one sandbox srcdoc. `browser` is a Playwright Browser; pages are created
 * and closed here (fresh window per width: setContent reuses globals).
 */
/**
 * `canvas` is the host background behind the frame (frames are transparent): without it a
 * dark-host srcdoc would be measured on white. `colorScheme` matches the host scheme.
 */
export async function scoreSrcdoc(browser: any, srcdoc: string, opts: { colorScheme?: 'light' | 'dark'; canvas?: string } = {}): Promise<VisualScore> {
  const page = await browser.newPage({ viewport: { width: 720, height: 900 }, reducedMotion: 'reduce', ...(opts.colorScheme ? { colorScheme: opts.colorScheme } : {}) })
  const paint = async (): Promise<void> => { if (opts.canvas) await page.addStyleTag({ content: `html{background:${opts.canvas} !important}` }) }
  const decoder = await browser.newPage()
  const notes: string[] = []
  try {
    await page.setContent(srcdoc, { waitUntil: 'load' })
    await paint()
    await waitSettled(page)
    const text = await textMetrics(page)
    notes.push(...text.notes)
    const over720 = await overflowPx(page)
    const hero = await heroRatio(page)
    const { blank, fill } = await blankShare(page, decoder, hero.rect)
    await page.goto('about:blank')
    await page.setViewportSize({ width: 360, height: 800 })
    await page.setContent(srcdoc, { waitUntil: 'load' })
    await paint()
    await waitSettled(page)
    const over360 = await overflowPx(page)
    if (over720 > 1) notes.push(`overflow @720: ${over720}px`)
    if (over360 > 1) notes.push(`overflow @360: ${over360}px`)
    notes.push(`blank ${(blank * 100).toFixed(0)}% · hero ${hero.what} ${(hero.ratio * 100).toFixed(0)}%${fill !== null ? ` (subject ${(fill * 100).toFixed(0)}%)` : ''}`)
    const scores: Record<Rule, number> = {
      minFont: text.minFont,
      contrast: text.contrast,
      overflow: over720 <= 1 ? 100 : clamp(100 - over720),
      narrow: over360 <= 1 ? 100 : clamp(100 - over360),
      whitespace: clamp(100 - Math.max(0, blank - 0.6) * (100 / 0.32)),
      hero: clamp((hero.ratio / 0.2) * 100),
    }
    const total = Math.round(RULES.reduce((n, r) => n + scores[r], 0) / RULES.length)
    return { scores, total, notes, ...(fill !== null ? { heroFill: fill } : {}) }
  } finally {
    await page.close()
    await decoder.close()
  }
}

export type Baseline = Record<string, { scores: Record<Rule, number>; total: number }>

export type ScoreRow = { id: string; score: VisualScore; regressions: string[] }

/** Rules that fell more than `drop` points (or a page below the floor). */
export function compareScore(id: string, score: VisualScore, baseline: Baseline | null, opts: { drop?: number; floor?: number } = {}): string[] {
  const drop = opts.drop ?? RULE_DROP
  const out: string[] = []
  const base = baseline?.[id]
  if (base) {
    for (const r of RULES) {
      const was = base.scores[r]
      if (was !== undefined && score.scores[r] < was - drop) out.push(`${r} ${was} → ${score.scores[r]}`)
    }
  }
  if (opts.floor !== undefined && score.total < opts.floor) out.push(`total ${score.total} < ${opts.floor}`)
  return out
}

export function readBaseline(path = BASELINE_PATH): Baseline | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as Baseline } catch { return null }
}

const RED = (s: string): string => (process.stdout.isTTY || process.env.CI ? `\u001b[31m${s}\u001b[0m` : s)

/** Markdown report (also appended to $GITHUB_STEP_SUMMARY in CI). */
export function scoreReportMarkdown(title: string, rows: readonly ScoreRow[], baseline: Baseline | null): string {
  const head = `| page | ${RULES.join(' | ')} | total |\n|---|${RULES.map(() => '---:').join('|')}|---:|`
  const lines = rows.map(({ id, score, regressions }) => {
    const base = baseline?.[id]
    const cell = (r: Rule): string => {
      const v = score.scores[r]
      const was = base?.scores[r]
      const red = regressions.some((x) => x.startsWith(`${r} `))
      const delta = was !== undefined && was !== v ? ` (${v > was ? '+' : ''}${v - was})` : ''
      return red ? `🔴 **${v}**${delta}` : `${v}${delta}`
    }
    const floorRed = regressions.some((x) => x.startsWith('total'))
    return `| ${id} | ${RULES.map(cell).join(' | ')} | ${floorRed ? `🔴 **${score.total}**` : score.total} |`
  })
  const bad = rows.filter((r) => r.regressions.length)
  return [`### ${title}`, '', bad.length ? `🔴 ${bad.length} page(s) regressed` : '✅ no visual regressions', '', head, ...lines, ''].join('\n')
}

/** Score every built-in starter; returns the number of failing cases (0/1). */
export async function visualScoreCase(browser: any, opts: { updateBaseline?: boolean; outDir?: string; only?: ReadonlySet<string> } = {}): Promise<number> {
  const { buildHtmlSandboxSrcdoc, HTML_SANDBOX_STARTERS } = await import('../src/shared/html-sandbox.ts')
  const baseline = opts.updateBaseline ? null : readBaseline()
  const rows: ScoreRow[] = []
  for (const starter of HTML_SANDBOX_STARTERS) {
    if (opts.only && !opts.only.has(starter.id)) continue
    const score = await scoreSrcdoc(browser, buildHtmlSandboxSrcdoc(starter.spec, { frameId: `f25-${starter.id}`, uiLang: 'zh' }))
    const regressions = compareScore(starter.id, score, baseline, { floor: PAGE_FLOOR })
    const gate = TEMPLATE_GATES[starter.id]
    if (gate) regressions.push(...gate(score))
    rows.push({ id: starter.id, score, regressions })
  }
  const md = scoreReportMarkdown('F25 visual score · starters', rows, baseline)
  if (process.env.GITHUB_STEP_SUMMARY) { try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n') } catch { /* optional */ } }
  if (opts.outDir) {
    mkdirSync(opts.outDir, { recursive: true })
    writeFileSync(join(opts.outDir, 'visual-score.json'), JSON.stringify(rows, null, 2))
    writeFileSync(join(opts.outDir, 'visual-score.md'), md)
  }
  if (opts.updateBaseline) {
    const next: Baseline = { ...(opts.only ? readBaseline() ?? {} : {}) }
    for (const r of rows) next[r.id] = { scores: r.score.scores, total: r.score.total }
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log(`baseline written: ${BASELINE_PATH}`)
  }
  const bad = rows.filter((r) => r.regressions.length)
  const avg = Math.round(rows.reduce((n, r) => n + r.score.total, 0) / Math.max(1, rows.length))
  console.log(`${bad.length ? '✗' : '✓'} visual score · ${rows.length} starters · avg ${avg}${bad.length ? '\n    ' + bad.map((r) => RED(`${r.id}: ${r.regressions.join(', ')}`) + `  [${r.score.notes.join(' · ')}]`).join('\n    ') : ''}`)
  if (process.env.IUI_VISUAL_VERBOSE === '1') for (const r of rows) console.log(`    ${r.id.padEnd(16)} ${RULES.map((k) => `${k}=${r.score.scores[k]}`).join(' ')} total=${r.score.total}  ${r.score.notes.join(' · ')}`)
  return bad.length ? 1 : 0
}

async function loadChromium(): Promise<any> {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    join(REPO_ROOT, 'node_modules/playwright/index.mjs'),
    '/vercel/sandbox/node_modules/playwright/index.mjs',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (!existsSync(c)) continue
    const mod = await import(pathToFileURL(c).href)
    if (mod.chromium) return mod.chromium
  }
  const spec = 'playwright' // variable specifier: keeps bundlers/vitest from resolving it eagerly
  return (await import(/* @vite-ignore */ spec)).chromium
}

export async function launchScoringBrowser(): Promise<any> {
  const chromium = await loadChromium()
  return await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2)
  const outIdx = argv.indexOf('--out')
  const onlyIdx = argv.indexOf('--only')
  const only = onlyIdx >= 0 && argv[onlyIdx + 1] ? new Set(argv[onlyIdx + 1]!.split(',')) : undefined
  const browser = await launchScoringBrowser()
  let failed = 1
  try {
    failed = await visualScoreCase(browser, { updateBaseline: argv.includes('--update-baseline'), ...(only ? { only } : {}), ...(outIdx >= 0 && argv[outIdx + 1] ? { outDir: argv[outIdx + 1]! } : {}) })
  } finally {
    await browser.close()
  }
  process.exit(failed && !argv.includes('--update-baseline') ? 1 : 0)
}
