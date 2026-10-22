/**
 * IUI plugin — sandbox-first: teach ```iui-html (free HTML/CSS/JS pages).
 * Catalog packs / DIL / Gateway deleted in 0.13.0-iui.0.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeFileSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { getSessionSnapshot, subscribeSessionBindings } from './binding-bridge.ts'
import { installFenceFeedback, setLegacyFencesEnabled } from './fence-feedback.ts'
import type { IuiPluginConfig } from '../config/types.ts'
import { DEFAULT_THEME_ID } from '../config/defaults.ts'
import { resolveThemeId } from '../config/resolve.ts'
import { listThemePacks } from '../themes/index.ts'
import { Config, resolveLiveConfig, type IuiConfigResolved } from './config-schema.ts'
import type { UiEagerness } from '../config/referee-rules.ts'
import { GENUI_SECTION_TEXT } from './section-text.ts'
import { formatRouterStatus } from './format-router.ts'
import {
  buildIuiResponseFormat,
  probeStructuredOutputSupport,
  resolveStructuredOutputsStatus,
  structuredOutputsRuntimePayload,
  type StructuredOutputsMode,
} from '../shared/structured-outputs.ts'
import { getFenceOpsSnapshot } from '../shared/fence-ops.ts'
import { createGetTripStopImagesTool, createGetPlaceImagesTool } from './trip-images-tool.ts'
import { serveResourceProxy } from './resource-proxy.ts'
import { ensureNetworkProbe, getNetworkProbe } from '../shared/network-probe.ts'
export { GENUI_SECTION_TEXT } from './section-text.ts'
export { Config }

const ASSET_ROUTE_PATH = '/plugins/@losebird/iui/assets'

type RuntimeConfigPayload = Omit<
  IuiConfigResolved,
  'jevApiKey' | 'structuredOutputsProbeKey'
> & {
  themes: Array<{ id: string; label: string; description?: string }>
  packs: Array<{ id: string; label: string }>
  formatRouter?: ReturnType<typeof formatRouterStatus>
  structuredOutputs?: ReturnType<typeof resolveStructuredOutputsStatus>
  responseFormat?: ReturnType<typeof buildIuiResponseFormat> | null
  jevKeyConfigured?: boolean
  structuredOutputsProbeKeyConfigured?: boolean
  productPath: 'sandbox-html'
}

function buildRuntimeConfig(live: IuiConfigResolved): RuntimeConfigPayload {
  const {
    jevApiKey: _jevKey,
    structuredOutputsProbeKey: _probeKey,
    ...publicLive
  } = live
  const soMode = live.structuredOutputsMode as StructuredOutputsMode
  const soStatus = resolveStructuredOutputsStatus({ mode: soMode })
  const soPayload = structuredOutputsRuntimePayload(soStatus)
  return {
    ...publicLive,
    themeId: resolveThemeId(live.themeId),
    themes: listThemePacks().map((t) => ({
      id: t.id,
      label: t.label,
      ...(t.description ? { description: t.description } : {}),
    })),
    packs: [{ id: 'sandbox', label: 'Sandbox HTML' }],
    formatRouter: formatRouterStatus({
      jevEnabled: live.jevEnabled,
      jevApiKey: live.jevApiKey,
      ...(live.jevBaseUrl.trim() ? { jevBaseUrl: live.jevBaseUrl.trim() } : {}),
      ...(live.jevModel.trim() ? { jevModel: live.jevModel.trim() } : {}),
    }),
    structuredOutputs: soPayload.structuredOutputs,
    responseFormat: soPayload.responseFormat,
    jevKeyConfigured: live.jevApiKey.trim().length > 0,
    structuredOutputsProbeKeyConfigured: live.structuredOutputsProbeKey.trim().length > 0,
    productPath: 'sandbox-html',
  }
}

let runtimeConfig: RuntimeConfigPayload = buildRuntimeConfig({
  themeId: DEFAULT_THEME_ID,
  fenceFeedback: true,
  formatReferee: true,
  strictImagePolicy: false,
  legacyFences: false,
  cdnPreset: 'auto',
  mapTiles: 'auto',
  cdnTemplate: '',
  uiEagerness: 'balanced',
  customTokensJson: '',
  pageStyleJson: '',
  userTemplatesJson: '',
  jevEnabled: false,
  jevApiKey: '',
  jevBaseUrl: '',
  jevModel: 'jev-latest',
  structuredOutputsMode: 'auto',
  structuredOutputsProbeUrl: '',
  structuredOutputsProbeKey: '',
})

function publishRuntimeConfig(live: IuiConfigResolved): void {
  runtimeConfig = buildRuntimeConfig(live)
  const probeUrl = live.structuredOutputsProbeUrl.trim()
  if (live.structuredOutputsMode !== 'off' && probeUrl.length > 0) {
    void probeStructuredOutputSupport({
      baseUrl: probeUrl,
      ...(live.structuredOutputsProbeKey.trim()
        ? { apiKey: live.structuredOutputsProbeKey.trim() }
        : {}),
    }).then(() => {
      runtimeConfig = buildRuntimeConfig(live)
    }).catch(() => { /* soft */ })
  }
}

/** F4: the `session` query parameter of a bindings request ('' when absent/invalid). */
function bindingSessionOf(url: string | undefined): string {
  try {
    const value = (new URL(url ?? '/', 'http://x').searchParams.get('session') ?? '').trim()
    return value.length > 0 && value.length <= 200 ? value : ''
  } catch {
    return ''
  }
}

const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
// F1: `vendor/iui-esm/<pkg>@<version>[-helpers].mjs` = generated ESM wrappers over the UMD builds.
const VENDOR_FILE_RE = /^vendor\/(?:(?:@[a-z0-9-]+\/)?[a-z0-9.-]+@\d[\w.-]*\/[A-Za-z0-9._/-]+|iui-esm\/[a-z0-9.-]+@\d[\w.-]*)\.(js|mjs|css|png|svg|woff2?|ttf|json)$/i
const VENDOR_MIME: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  json: 'application/json; charset=utf-8',
}

async function serveGenuiAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  const rel = pathname.startsWith(`${ASSET_ROUTE_PATH}/`) ? pathname.slice(ASSET_ROUTE_PATH.length) : null
  if (rel === null) {
    res.writeHead(404)
    res.end()
    return
  }
  const file = rel.slice(1)

  // G12: image-export resource proxy (public http(s) images / CSS only).
  if (file === 'proxy') {
    await serveResourceProxy(req, res)
    return
  }

  if (file === 'response-format.json') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    const body = JSON.stringify(buildIuiResponseFormat(), null, 2)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    if (req.method !== 'HEAD') res.write(body)
    res.end()
    return
  }

  if (file === 'format-router.json') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    const body = JSON.stringify({
      formatRouter: runtimeConfig.formatRouter,
      jevKeyConfigured: runtimeConfig.jevKeyConfigured === true,
      structuredOutputs: runtimeConfig.structuredOutputs,
      defaultPath: 'dsh→FreeLLMAPI→iui-html sandbox',
      productPath: 'sandbox-html',
    }, null, 2)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    if (req.method !== 'HEAD') res.write(body)
    res.end()
    return
  }

  if (file === 'fence-ops.json') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    const out = Buffer.from(JSON.stringify({
      ok: true,
      plugin: '@losebird/iui',
      fenceOps: getFenceOpsSnapshot(),
      productPath: 'sandbox-html',
    }), 'utf8')
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    if (req.method !== 'HEAD') res.end(out)
    else res.end()
    return
  }

  // C10: connectivity probe (cached 1 h). runtime-config carries the last
  // result and kicks a background refresh; network-probe.json?refresh=1 waits
  // for a fresh one (Settings →「重新检测」).
  if (file === 'network-probe.json') {
    let refresh = false
    try { refresh = new URL(req.url ?? '/', 'http://x').searchParams.get('refresh') === '1' } catch { /* ignore */ }
    const snap = await ensureNetworkProbe({ force: refresh }).catch(() => getNetworkProbe())
    const body = Buffer.from(JSON.stringify({ networkProbe: snap }), 'utf8')
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    if (req.method !== 'HEAD') res.end(body)
    else res.end()
    return
  }

  if (file === 'runtime-config.json') {
    if (!(typeof process !== 'undefined' && process.env.VITEST)) void ensureNetworkProbe().catch(() => { /* soft */ })
    const body = Buffer.from(JSON.stringify({ ...runtimeConfig, networkProbe: getNetworkProbe() }), 'utf8')
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    if (req.method !== 'HEAD') res.end(body)
    else res.end()
    return
  }

  if (file === 'bindings.json' || file === 'bindings.sse') {
    // F4: session is REQUIRED (no "latest" fallback), and cross-site pages may
    // not read bindings even if the host ever adds permissive CORS.
    const fetchSite = String(req.headers?.['sec-fetch-site'] ?? '')
    if (fetchSite === 'cross-site') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('cross-site bindings request refused')
      return
    }
    if (bindingSessionOf(req.url) === '') {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('missing session parameter')
      return
    }
  }

  if (file === 'bindings.json') {
    const sessionId = bindingSessionOf(req.url)
    const snap = getSessionSnapshot(sessionId)
    const body = Buffer.from(JSON.stringify({ bindings: snap.bindings, appData: snap.appData, sessionId }), 'utf8')
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    if (req.method !== 'HEAD') res.end(body)
    else res.end()
    return
  }

  if (file === 'bindings.sse') {
    const sessionId = bindingSessionOf(req.url)
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    const send = (
      sid: string,
      map: Record<string, string | number>,
      meta?: { appData?: Record<string, unknown> },
    ): void => {
      if (sid !== sessionId) return
      const payload = JSON.stringify({
        bindings: map,
        appData: meta?.appData ?? {},
        sessionId: sid,
      })
      res.write(`data: ${payload}\n\n`)
    }
    const initial = getSessionSnapshot(sessionId)
    send(sessionId, initial.bindings, { appData: initial.appData })
    const unsub = subscribeSessionBindings((sid, map, meta) => send(sid, map, meta))
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n') } catch { /* closed */ }
    }, 15000)
    const cleanup = (): void => {
      clearInterval(heartbeat)
      unsub()
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
    return
  }

  // C6: pinned third-party libraries for the iui-html sandbox (copied from
  // node_modules by scripts/vendor-assets.mjs). Immutable: the path carries
  // the version. CORS * so module/fetch loads from the null-origin srcdoc work.
  const vendor = VENDOR_FILE_RE.exec(file)
  if (vendor) {
    const ext = vendor[1]!.toLowerCase()
    if (file.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const dir = fileURLToPath(new URL('./assets/', import.meta.url))
      const body = await readFile(join(dir, file))
      res.writeHead(200, {
        'content-type': VENDOR_MIME[ext] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      res.writeHead(404)
      res.end()
    }
    return
  }

  if (!ASSET_FILE_RE.test(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    const dir = fileURLToPath(new URL('./assets/', import.meta.url))
    const body = await readFile(join(dir, file))
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}

function isHtmlPageWrite(args: unknown): boolean {
  if (args === null || typeof args !== 'object') return false
  const record = args as Record<string, unknown>
  const hasContent = ['content', 'contents', 'text', 'new_string', 'newText', 'edits', 'patch'].some((key) => key in record)
  if (!hasContent) return false
  for (const key of ['path', 'file_path', 'filePath', 'file', 'filename', 'target']) {
    const value = record[key]
    if (typeof value === 'string' && /\.(?:html?|xhtml)$/iu.test(value.trim())) return true
  }
  return false
}

export const name = '@losebird/iui'
export const inject = ['systemPrompt']

const BUNDLED_SKILL_RANK = 600
const BUNDLED_SKILL_PROVIDER = 'iui'
const BUNDLED_SKILL_DESCRIPTION =
  'IUI ```iui-html sandbox reference (free HTML/CSS/JS pages). Preserve conversation language for all user-visible text.'
const BUNDLED_SKILL_INVOCATION = { modelInvocable: true, userInvocable: true } as const

function bundledSkillProvider(): SkillProvider {
  const moduleDirectory = dirname(fileURLToPath(new URL(import.meta.url)))
  const path = basename(moduleDirectory) === 'plugin'
    ? resolve(moduleDirectory, '../../SKILL.md')
    : resolve(moduleDirectory, '../SKILL.md')
  const raw = readFileSync(path, 'utf8')
  const end = raw.indexOf('\n---\n', 4)
  if (!raw.startsWith('---\n') || end < 0) throw new Error('iui SKILL.md has invalid frontmatter')
  return {
    name: BUNDLED_SKILL_PROVIDER,
    list: () => Promise.resolve([{
      name: 'iui',
      description: BUNDLED_SKILL_DESCRIPTION,
      invocation: BUNDLED_SKILL_INVOCATION,
      source: 'bundled',
      provider: BUNDLED_SKILL_PROVIDER,
      path,
      resourceBase: { kind: 'directory', path: dirname(path) },
      rank: BUNDLED_SKILL_RANK,
      locator: path,
    }]),
    get: () => Promise.resolve({
      name: 'iui',
      description: BUNDLED_SKILL_DESCRIPTION,
      invocation: BUNDLED_SKILL_INVOCATION,
      source: 'bundled',
      provider: BUNDLED_SKILL_PROVIDER,
      path,
      resourceBase: { kind: 'directory', path: dirname(path) },
      content: raw.slice(end + 5),
    }),
  }
}

/** @deprecated Use IuiPluginConfig */
export type GenuiPluginConfig = IuiPluginConfig

export function apply(ctx: Context, config?: IuiPluginConfig): void {
  const feedbackOptions: {
    fenceFeedback: boolean
    formatReferee: boolean
    uiEagerness: UiEagerness
    pageStyleJson: string
    getFormatRouterConfig: () => {
      jevEnabled: boolean
      jevApiKey: string
      jevBaseUrl?: string
      jevModel?: string
    }
  } = {
    fenceFeedback: true,
    formatReferee: true,
    uiEagerness: 'balanced',
    pageStyleJson: '',
    getFormatRouterConfig: () => ({ jevEnabled: false, jevApiKey: '' }),
  }
  const syncFromConfig = () => {
    const live = resolveLiveConfig(config ?? {})
    publishRuntimeConfig(live)
    feedbackOptions.fenceFeedback = live.fenceFeedback !== false
    feedbackOptions.formatReferee = live.formatReferee !== false
    feedbackOptions.uiEagerness = live.uiEagerness
    feedbackOptions.pageStyleJson = live.pageStyleJson
    setLegacyFencesEnabled(live.legacyFences === true)
    feedbackOptions.getFormatRouterConfig = () => ({
      jevEnabled: live.jevEnabled,
      jevApiKey: live.jevApiKey,
      ...(live.jevBaseUrl.trim() ? { jevBaseUrl: live.jevBaseUrl.trim() } : {}),
      ...(live.jevModel.trim() ? { jevModel: live.jevModel.trim() } : {}),
    })
  }
  syncFromConfig()
  const hostEvents = ctx as unknown as { on(event: string, listener: () => void): void }
  hostEvents.on('loader/volatile-update', syncFromConfig)

  ctx.inject(['settings'], (settingsCtx) => {
    const settings = (settingsCtx as Context & {
      settings: { configure(presentation: { auto?: boolean }, owner?: unknown): () => void }
    }).settings
    settingsCtx.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      'iui: settings presentation (custom page)',
    )
  })

  ctx.systemPrompt.section({
    name: 'iui:fence',
    order: ctx.systemPrompt.getSectionOrder('STRUCTURED_OUTPUT'),
    text: GENUI_SECTION_TEXT,
  })
  // S8: debug dump only when asked for (IUI_DEBUG=1), never on every start.
  if (typeof process !== 'undefined' && /^(1|true|yes)$/i.test(process.env.IUI_DEBUG ?? '')) {
    try { writeFileSync(join(tmpdir(), 'iui-system-section.txt'), GENUI_SECTION_TEXT) } catch { /* debug dump only */ }
  }
  // Sandbox-first gate: weak models "build the page" by writing .html files the
  // user never sees. Deny those writes and redirect to the inline fence.
  const toolEvents = ctx as unknown as {
    on(event: 'tools/pre-execute', listener: (exec: { name: string; arguments: unknown }, next: () => Promise<unknown>) => Promise<unknown>): void
  }
  toolEvents.on('tools/pre-execute', async (exec, next) => {
    if (isHtmlPageWrite(exec.arguments)) {
      return {
        kind: 'deny',
        reason: 'IUI: do NOT write HTML/web pages to files — the user cannot see them. Put the whole page (css/html/js) in ONE closed ```iui-html fence in your reply body NOW, e.g. ```iui-html\ntitle: …\nheight: 420\n---css\n…\n---html\n…\n---js\n…\n```',
      }
    }
    return next()
  })
  installFenceFeedback(ctx, feedbackOptions)
  // Sandbox-first: no catalog render_ui. Register trip photo tool when tools service is present.
  ctx.inject(['tools'], (toolsCtx) => {
    try {
      const tools = (toolsCtx as Context & { tools: { register(tool: unknown): unknown } }).tools
      tools.register(createGetTripStopImagesTool())
      tools.register(createGetPlaceImagesTool())
    } catch (err) {
      toolsCtx.logger?.warn?.(
        `iui: trip/place image tools register failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  ctx.inject(['skills'], (skillCtx) => {
    skillCtx.skills.registerProvider(() => bundledSkillProvider())
  })

  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.reflect.get('webServer') as { register(route: unknown): () => void }
    webCtx.effect(
      () => webServer.register({ kind: 'prefix', path: ASSET_ROUTE_PATH, handler: serveGenuiAsset }),
      'iui: asset route',
    )
  })
}
