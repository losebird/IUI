/**
 * Register IUI into Host Settings — same pattern as dsh-xai / ui-settings-models:
 * hard-require slots + locale + configForms on the client fiber, then
 * slots.inject('settings.section') directly (no nested inject that can hang).
 *
 * package.json `dsh.client.inject` must list runtime + ui-settings + locale
 * so configForms is composed onto this fiber. cordis.patch.yml must `insert`
 * id `iui` so configForms.get('iui') resolves to this plugin's Config schema.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createElement, type ComponentType, type ReactNode } from 'react'
import type { SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'
import { IuiSettingsCardController, IuiSettingsSection, settingsPrimitivesAvailable, type IuiSettingsSectionValue } from './IuiSettingsSection.tsx'
import { setActiveIuiFormScope } from './config-bridge.ts'

const SETTINGS_NS = 'settings.iui'
/** Profile entry id from cordis.patch.yml insert (`id: iui`). */
export const IUI_SETTINGS_NAMESPACE = 'iui'

const en = {
  nav: "IUI",
  title: "IUI",
  description: "Interactive pages in chat: appearance, generation, libraries, privacy and templates.",
  intro: "IUI turns visual asks into interactive ```iui-html pages inside the reply. Appearance and templates apply immediately; the other settings apply to new messages after Save.",
  upgradeHost: "This dsh version is too old for the IUI settings page (missing settings-form primitives). Update dsh to configure IUI here; pages keep working with their defaults.",
  // 外观
  groupAppearance: "Appearance",
  groupAppearanceHint: "Default look of every page — accent, density, text size, corners and light/dark. Changes are pushed to pages already open and saved automatically.",
  appearanceSaved: "Saved as your default style.",
  appearanceSavedLocal: "Saved in this browser (the deployment is read-only).",
  appearanceReset: "Reset to default",
  previewLight: "Light",
  previewDark: "Dark",
  previewHint: "Live preview — a real sandbox page with the current settings.",
  // 生成
  groupGeneration: "Generation",
  uiEagerness: "Page generation",
  uiEagernessHint: "Restrained: pages only when you ask for one. Balanced: explanations and comparisons are answered in text with a “Make it an interactive page” button. Eager: visualise whenever it helps.",
  uiEagernessRestrained: "Restrained",
  uiEagernessBalanced: "Balanced (default)",
  uiEagernessEager: "Eager",
  fenceFeedback: "Auto repair",
  fenceFeedbackHint: "When a page fails to render or is left unfinished, ask the model to fix it in the same reply. Each repair is one more model call (extra tokens).",
  formatReferee: "Format correction",
  formatRefereeHint: "When a visual ask (dashboard, form, comparison, map…) gets plain Markdown, steer the model to a page in the same reply. Also adds the short per-page-type hints. Each correction is one more model call.",
  repairStats: "Since the service started: {repairs} auto repairs · {formats} format corrections.",
  repairStatsNone: "No repairs or corrections yet since the service started.",
  // 网络与资源
  groupNetwork: "Network & libraries",
  cdnSourceHint: "Page libraries (maps, charts, tables, diagrams, 3D, animation) ship with the plugin and need no internet. Mirrors, basemap and photos adapt to your network automatically.",
  netAdvanced: "Advanced: choose manually",
  cdnPresetAuto: "Automatic (recommended): plugin built-in → fastest reachable mirror",
  mapTiles: "Map basemap",
  mapTilesAuto: "Automatic (recommended): AMap on mainland-China networks, otherwise Esri / OpenStreetMap",
  mapTilesAmap: "AMap (高德)",
  mapTilesGlobal: "Esri / OpenStreetMap",
  mapTilesHint: "AMap tiles use China's GCJ-02 coordinates; IUI shifts markers automatically. Commercial use of AMap tiles needs AMap's permission.",
  netAutoLibs: "Libraries: plugin built-in → {order}",
  netAutoTiles: "Basemap: {tiles}",
  netAutoPhotos: "Trip photos: {photos}",
  netAutoTilesAmap: "AMap (auto)",
  netAutoTilesDefault: "Esri / OpenStreetMap",
  netAutoPhotosWiki: "Wikimedia",
  netAutoPhotosMap: "map thumbnails (Wikimedia unreachable)",
  "netProbe.zstatic": "Zstatic",
  "netProbe.staticfile": "staticfile",
  "netProbe.amap": "AMap tiles",
  cdnPreset: "Library source",
  cdnPresetLocal: "Plugin built-in → jsDelivr → npmmirror",
  cdnPresetChina: "China mirror: plugin built-in → npmmirror → jsDelivr",
  cdnPresetGlobal: "Global CDN: jsDelivr → unpkg → plugin built-in",
  cdnPresetCustom: "Custom template",
  cdnTemplate: "Custom template",
  cdnTemplateHint: "https only; {name} {version} {file} are replaced, e.g. https://cdn.example.com/npm/{name}@{version}/{file}. Falls back to the built-in copy.",
  cdnTemplateInvalid: "Needs an https:// URL containing {name} and {file}.",
  netProbeTitle: "Connectivity",
  netProbeChecking: "Checking…",
  netProbeFailed: "Could not reach the plugin to run the check.",
  netProbeNone: "Not checked yet.",
  netProbeAt: "Checked from the plugin at {time} (cached for 1 h).",
  netProbeDown: "unreachable",
  netProbeRecheck: "Re-check",
  "netProbe.jsdelivr": "jsDelivr",
  "netProbe.npmmirror": "npmmirror",
  "netProbe.unpkg": "unpkg",
  "netProbe.wikipedia": "Wikipedia",
  "netProbe.wikimedia": "Wikimedia images",
  "netProbe.tiles": "Esri tiles",
  "netProbe.models": "Poly Haven models",
  "netProbeAdvice.switch-china": "jsDelivr is unreachable but npmmirror works — switch the source to “China mirror”.",
  "netProbeAdvice.switch-global": "npmmirror is unreachable but jsDelivr works — switch the source to “Plugin built-in” or “Global CDN”.",
  "netProbeAdvice.cdn-all-down": "No public mirror is reachable — pages use the plugin's built-in copies (keep “Automatic” or “Plugin built-in”).",
  "netProbeAdvice.no-wikimedia": "Wikipedia / Wikimedia are unreachable — trip photos show a place-name map card right away instead of waiting.",
  "netProbeAdvice.no-tiles": "The map tile server is unreachable — maps may show markers without a basemap.",
  // 隐私与安全
  groupPrivacy: "Privacy & security",
  strictImagePolicy: "Strict image policy",
  strictImagePolicyHint: "Sandbox pages may only load data:/blob: images and allowlisted image hosts (Wikimedia, map tiles). Blocks image-URL data exfiltration; arbitrary web images will not load.",
  pageStorage: "Page storage",
  pageStorageHint: "Interactive pages remember their state (forms, to-dos, localStorage) per conversation in this browser for 90 days.",
  pageStorageClear: "Clear",
  pageStorageCleared: "All saved page state was cleared.",
  feedbackStats: "Feedback stats",
  feedbackEmpty: "No page feedback yet. Rate pages from the ⋯ menu (👍/👎).",
  feedbackDigest: "{pages} pages · 👍 {up} · 👎 {down} · {serious} with layout issues",
  feedbackPrivacy: "Stored only in this browser: a page hash, its type, your vote and self-check counts — never page content or prompts.",
  feedbackConsent: "I agree to export this anonymous summary to share with the IUI maintainers",
  feedbackExport: "Export JSON",
  feedbackExported: "Exported — attach the JSON to a GitHub issue if you like.",
  feedbackExportFailed: "Export failed.",
  feedbackClear: "Clear",
  feedbackCleared: "Feedback stats cleared.",
  "feedbackReason.ugly": "Looks bad",
  "feedbackReason.unreadable": "Hard to read",
  "feedbackReason.broken": "Broken",
  "feedbackReason.notWanted": "Not wanted",
  "feedbackCheck.smallText": "Small text",
  "feedbackCheck.lowContrast": "Low contrast",
  "feedbackCheck.overflowX": "Overflow",
  "feedbackCheck.blankCanvas": "Blank chart",
  "feedbackCheck.brokenImage": "Broken image",
  "feedbackCheck.consoleError": "Script error",
  "feedbackCheck.blankArea": "Blank area",
  // 模板
  groupTemplates: "Templates",
  templatesHint: "Pages you saved with “Save as template” in a page’s ⋯ menu. They show under My templates in the template drawer. Changes here are saved immediately.",
  templateEmpty: "No templates yet. Open a page’s ⋯ menu and choose “Save as template”.",
  templateUse: "Insert into composer",
  templateDelete: "Delete",
  templateImport: "Import",
  templateExport: "Export",
  templateImported: "Imported {count} templates.",
  templateImportFailed: "Import failed: {error}",
  templateInserted: "Inserted into the composer — add your request and send.",
  templateCopied: "Composer unavailable — copied to clipboard.",
  templateInsertFailed: "Could not insert or copy the template.",
  templateSkipped: "{count} entries skipped: {first}",
  // 开发者
  groupDeveloper: "Developer",
  groupDeveloperHint: "Rarely needed. Wrong values here can make pages look broken.",
  customTokensJson: "Custom CSS tokens (JSON)",
  customTokensJsonHint: "Overrides theme variables, e.g. {\"--color-primary\":\"#0f766e\"}. Allowed: accent, radius, density, font size ({examples} …). Prefer the Appearance controls above.",
  customTokensInvalidJson: "Not valid JSON — nothing is applied.",
  customTokensUnknown: "Not on the allowed list, ignored: {keys}",
  customTokensRejected: "Ignored (bad name or unsafe value): {keys}",
  legacyFences: "Legacy fences (deprecated)",
  legacyFencesHint: "Render old ```iui / ```dsh-ui fences from earlier conversations. Off: they show as code with a “Render as page” button. Removed in 0.14.",
  templatesJson: "Templates JSON",
  templatesJsonHint: "[{id, name, description?, source}] — source is the ```iui-html page body. Saved with the Save button.",
  formatRouter: "Experimental: Jev format router",
  jevEnabled: "Enable Jev router",
  jevEnabledHint: "Privacy: when on (and a key is set), the text of each user message is sent to the third-party TypeSafe System One service to pick a format. Off by default. Failures fall back to local rules.",
  jevWarning: "Your questions will be sent to the third-party TypeSafe service.",
  jevApiKey: "TypeSafe API key",
  jevApiKeyHint: "Stored as a secret. Empty keeps Jev off.",
  jevBaseUrl: "TypeSafe base URL",
  jevModel: "Jev model",
  structuredOutputsMode: "Structured Outputs",
  structuredOutputsModeHint: "Not supported by the current host (dsh cannot attach response_format) — this does not affect page generation.",
  structuredOutputsAuto: "Auto (probe + degrade)",
  structuredOutputsPrefer: "Prefer (advertise schema)",
  structuredOutputsOff: "Off",
  structuredOutputsProbeUrl: "Probe base URL",
  structuredOutputsProbeKey: "Probe API key",
  debugLog: "Debug dump: start dsh with IUI_DEBUG=1 to write the IUI system-prompt section to the temp folder.",
  // form chrome
  unavailable: "IUI is not loaded, so it cannot be configured right now.",
  readOnly: "This deployment stores settings read-only.",
  save: "Save",
  saving: "Saving…",
  saveFailed: "The deployment did not accept these values; they were left for you to correct.",
  previewCaption: "Live preview · a real sandbox page with the current settings",
  discard: "Discard",
  unsavedCount: "{count} unsaved changes · apply to new messages",
  unsavedOne: "1 unsaved change · applies to new messages",
  netProbeSummary: "{ok} / {total} reachable",
  templatesCount: "My templates · {count}",
  saveScope: "Saved settings apply to new messages; pages already in the chat keep their content.",
}

const zh: typeof en = {
  nav: "IUI",
  title: "IUI",
  description: "聊天里的交互页面：外观、生成、资源、隐私与模板。",
  intro: "IUI 会把适合可视化的问题渲染成回复里的 ```iui-html 交互页面。外观和模板改动立即生效；其余设置点「保存」后对新消息生效。",
  upgradeHost: "当前 dsh 版本过旧，缺少设置表单组件，无法在这里配置 IUI。升级 dsh 后即可使用；页面会按默认设置继续工作。",
  groupAppearance: "外观",
  groupAppearanceHint: "所有页面的默认样式：强调色、密度、字号、圆角和深浅色。改动会立即推送给已打开的页面，并自动保存。",
  appearanceSaved: "已保存为默认风格。",
  appearanceSavedLocal: "已保存在本浏览器（本部署设置为只读）。",
  appearanceReset: "恢复默认",
  previewLight: "浅色",
  previewDark: "深色",
  previewHint: "实时预览：用当前设置渲染的真实沙箱页面。",
  groupGeneration: "生成",
  uiEagerness: "界面生成积极度",
  uiEagernessHint: "克制：只有你明确要求时才生成页面。均衡：解释、对比类问题先用文字回答，并在下方提供“做成可交互页面”按钮。积极：能可视化就直接生成页面。",
  uiEagernessRestrained: "克制",
  uiEagernessBalanced: "均衡（默认）",
  uiEagernessEager: "积极",
  fenceFeedback: "自动修复",
  fenceFeedbackHint: "页面渲染失败或没写完时，在同一条回复里让模型修好。每次修复会多一轮模型调用（额外消耗 token）。",
  formatReferee: "格式纠偏",
  formatRefereeHint: "看板、表单、对比、地图等适合页面的问题却只回了 Markdown 时，在同一条回复里引导模型改成页面；同时附带简短的页面类型提示。每次纠偏会多一轮模型调用。",
  repairStats: "服务启动以来：自动修复 {repairs} 次 · 格式纠偏 {formats} 次。",
  repairStatsNone: "服务启动以来还没有发生自动修复或格式纠偏。",
  groupNetwork: "网络与资源",
  cdnSourceHint: "地图、图表、表格、脑图、3D、动画等库都随插件自带，不用联网。镜像、地图底图和照片会按你的网络自动选择。",
  netAdvanced: "高级：手动指定",
  cdnPresetAuto: "自动（推荐）：插件自带 → 最快的可用镜像",
  mapTiles: "地图底图",
  mapTilesAuto: "自动（推荐）：中国大陆网络用高德，其他用 Esri / OpenStreetMap",
  mapTilesAmap: "高德地图",
  mapTilesGlobal: "Esri / OpenStreetMap",
  mapTilesHint: "高德瓦片使用 GCJ-02 坐标，IUI 会自动校正标记位置。商业用途需获得高德授权。",
  netAutoLibs: "库：插件自带 → {order}",
  netAutoTiles: "地图底图：{tiles}",
  netAutoPhotos: "行程照片：{photos}",
  netAutoTilesAmap: "高德（自动）",
  netAutoTilesDefault: "Esri / OpenStreetMap",
  netAutoPhotosWiki: "Wikimedia",
  netAutoPhotosMap: "地名地图卡（Wikimedia 不可达）",
  "netProbe.zstatic": "Zstatic",
  "netProbe.staticfile": "staticfile",
  "netProbe.amap": "高德瓦片",
  cdnPreset: "资源源",
  cdnPresetLocal: "插件自带 → jsDelivr → npmmirror",
  cdnPresetChina: "国内镜像：插件自带 → npmmirror → jsDelivr",
  cdnPresetGlobal: "海外 CDN：jsDelivr → unpkg → 插件自带",
  cdnPresetCustom: "自定义模板",
  cdnTemplate: "自定义模板",
  cdnTemplateHint: "仅 https；{name} {version} {file} 会被替换，例如 https://cdn.example.com/npm/{name}@{version}/{file}。失败时回退到插件自带。",
  cdnTemplateInvalid: "需要 https:// 开头，并包含 {name} 和 {file}。",
  netProbeTitle: "连通性",
  netProbeChecking: "检测中…",
  netProbeFailed: "无法连接插件进行检测。",
  netProbeNone: "尚未检测。",
  netProbeAt: "插件于 {time} 检测（缓存 1 小时）。",
  netProbeDown: "不可达",
  netProbeRecheck: "重新检测",
  "netProbe.jsdelivr": "jsDelivr",
  "netProbe.npmmirror": "npmmirror",
  "netProbe.unpkg": "unpkg",
  "netProbe.wikipedia": "Wikipedia",
  "netProbe.wikimedia": "Wikimedia 图片",
  "netProbe.tiles": "Esri 瓦片",
  "netProbe.models": "Poly Haven 模型",
  "netProbeAdvice.switch-china": "jsDelivr 不可达而 npmmirror 可用：建议把资源源切换为「国内镜像」。",
  "netProbeAdvice.switch-global": "npmmirror 不可达而 jsDelivr 可用：建议切换为「插件自带」或「海外 CDN」。",
  "netProbeAdvice.cdn-all-down": "公共镜像都不可达：页面库使用插件自带的副本（保持「自动」或「插件自带」即可）。",
  "netProbeAdvice.no-wikimedia": "Wikipedia / Wikimedia 不可达：行程照片直接显示地名地图卡，不再等待。",
  "netProbeAdvice.no-tiles": "地图瓦片服务器不可达：地图可能只有标记、没有底图。",
  groupPrivacy: "隐私与安全",
  strictImagePolicy: "严格图片策略",
  strictImagePolicyHint: "沙箱页面只能加载 data:/blob: 图片和白名单图床（Wikimedia、地图瓦片）。可防止页面脚本借图片 URL 外传数据；任意网络图片将无法显示。",
  pageStorage: "页面存储",
  pageStorageHint: "交互页面会按对话在本浏览器中记住状态（表单、待办、localStorage），保留 90 天。",
  pageStorageClear: "清除",
  pageStorageCleared: "已清除所有页面保存的状态。",
  feedbackStats: "反馈统计",
  feedbackEmpty: "还没有页面反馈。可在页面 ⋯ 菜单里点 👍/👎。",
  feedbackDigest: "{pages} 个页面 · 👍 {up} · 👎 {down} · {serious} 个有排版问题",
  feedbackPrivacy: "只存在本浏览器：页面哈希、页面类型、你的评价和自检计数，不含页面内容或提问。",
  feedbackConsent: "我同意导出这份匿名统计，用于反馈给 IUI 维护者",
  feedbackExport: "导出 JSON",
  feedbackExported: "已导出，可附在 GitHub issue 里。",
  feedbackExportFailed: "导出失败。",
  feedbackClear: "清除",
  feedbackCleared: "已清除反馈统计。",
  "feedbackReason.ugly": "难看",
  "feedbackReason.unreadable": "看不清",
  "feedbackReason.broken": "不能用",
  "feedbackReason.notWanted": "不是我要的",
  "feedbackCheck.smallText": "字太小",
  "feedbackCheck.lowContrast": "对比度低",
  "feedbackCheck.overflowX": "横向溢出",
  "feedbackCheck.blankCanvas": "空白图表",
  "feedbackCheck.brokenImage": "图片失败",
  "feedbackCheck.consoleError": "脚本报错",
  "feedbackCheck.blankArea": "大片空白",
  groupTemplates: "模板",
  templatesHint: "在页面 ⋯ 菜单里「保存为模板」的页面，会出现在模板抽屉的「我的模板」里。这里的改动立即保存。",
  templateEmpty: "还没有模板。打开任意页面的 ⋯ 菜单，选「保存为模板」。",
  templateUse: "填入输入框",
  templateDelete: "删除",
  templateImport: "导入",
  templateExport: "导出",
  templateImported: "已导入 {count} 个模板。",
  templateImportFailed: "导入失败：{error}",
  templateInserted: "已填入输入框，补充你的需求后发送。",
  templateCopied: "输入框不可用，已复制到剪贴板。",
  templateInsertFailed: "无法填入或复制模板。",
  templateSkipped: "跳过 {count} 条：{first}",
  groupDeveloper: "开发者",
  groupDeveloperHint: "一般用不到；这里填错可能让页面显示异常。",
  customTokensJson: "自定义 CSS token（JSON）",
  customTokensJsonHint: "覆盖主题变量，例如 {\"--color-primary\":\"#0f766e\"}。只开放强调色、圆角、密度、字号（{examples} 等）。日常调整请用上面的「外观」。",
  customTokensInvalidJson: "不是有效的 JSON，不会生效。",
  customTokensUnknown: "不在可改范围内，已忽略：{keys}",
  customTokensRejected: "已忽略（名称不合法或值不安全）：{keys}",
  legacyFences: "旧版围栏兼容（已弃用）",
  legacyFencesHint: "渲染早期对话里的 ```iui / ```dsh-ui 围栏。关闭时显示为代码，并提供「渲染为页面」按钮。0.14 起移除。",
  templatesJson: "模板 JSON",
  templatesJsonHint: "[{id, name, description?, source}]，source 是 ```iui-html 页面正文。点「保存」后生效。",
  formatRouter: "实验：Jev 格式路由",
  jevEnabled: "启用 Jev 路由",
  jevEnabledHint: "隐私提示：开启且填了 Key 后，每条用户消息的文字会发送给第三方 TypeSafe System One 服务来选择输出格式。默认关闭；失败时回落本地规则。",
  jevWarning: "会把你的问题发送给第三方 TypeSafe。",
  jevApiKey: "TypeSafe API Key",
  jevApiKeyHint: "按密钥保存。留空则 Jev 不启用。",
  jevBaseUrl: "TypeSafe 根地址",
  jevModel: "Jev 模型",
  structuredOutputsMode: "Structured Outputs",
  structuredOutputsModeHint: "当前宿主不支持（dsh 无法附加 response_format），不影响页面生成。",
  structuredOutputsAuto: "自动（探测 + 降级）",
  structuredOutputsPrefer: "优先（暴露 schema）",
  structuredOutputsOff: "关闭",
  structuredOutputsProbeUrl: "探测 base URL",
  structuredOutputsProbeKey: "探测 API Key",
  debugLog: "调试导出：用 IUI_DEBUG=1 启动 dsh，会把 IUI 系统提示段写到临时目录。",
  unavailable: "IUI 当前未加载，暂时无法配置。",
  readOnly: "本部署的设置为只读。",
  save: "保存",
  saving: "保存中…",
  saveFailed: "本部署没有接受这些值，已保留供你修改。",
  previewCaption: "实时预览 · 用当前设置渲染真实沙箱页面",
  discard: "放弃",
  unsavedCount: "{count} 项改动未保存 · 对新消息生效",
  unsavedOne: "1 项改动未保存 · 对新消息生效",
  netProbeSummary: "{ok} / {total} 可用",
  templatesCount: "我的模板 · {count} 个",
  saveScope: "保存后对新消息生效；聊天里已有的页面内容不变。",
}

type LocaleT = (key: string) => string

type SettingsHostCtx = Context & {
  locale: {
    bind(ns: string): LocaleT
    register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void
  }
  configForms: {
    get(namespace: string): SettingsFormScope<IuiSettingsSectionValue>
    whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void
  }
  slots: {
    inject(name: string, factory: () => () => void): () => void
    register(options: Record<string, unknown>, component: ComponentType<never> | ((props: never) => ReactNode)): () => void
  }
  effect(factory: () => (() => void) | void, name?: string): void
}

type PluginsItemProps = {
  view?: 'summary' | 'page'
  t: LocaleT
  useIuiSettings: (select: (s: unknown) => unknown) => unknown
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

function IuiPluginsItem(props: PluginsItemProps): ReactNode {
  if (props.view === 'summary') return props.t('description')
  return createElement(IuiSettingsSection, {
    t: props.t,
    useIuiSettings: props.useIuiSettings as never,
    edit: props.edit,
    resetField: props.resetField,
    save: props.save,
    discard: props.discard,
  })
}

/**
 * Services the settings page needs on the client fiber (cordis hard inject).
 * Declared on the client module export so apply() only runs once they bind —
 * same gate models/xAI use. Do NOT nest another inject for these three.
 */
export const SETTINGS_INJECT = ['locale', 'configForms'] as const

export { writeIuiConfigField } from './config-bridge.ts'

/**
 * Install Settings → IUI. Caller must hard-inject locale + configForms
 * (see SETTINGS_INJECT + client `export const inject`).
 */
export function installIuiSettings(ctx: Context): () => void {
  const scope = ctx as SettingsHostCtx
  const t = scope.locale.bind(SETTINGS_NS)
  const disposeLocale = scope.locale.register(SETTINGS_NS, { zh, en })

  let card: IuiSettingsCardController
  // S5: an older host's primitives may lack the settings-form exports (they resolve to
  // undefined). Show a read-only "please update dsh" card instead of crashing the page.
  const primitivesOk = settingsPrimitivesAvailable()
  try {
    if (!primitivesOk) throw new Error('settings-form primitives missing')
    const formScope = scope.configForms.get(IUI_SETTINGS_NAMESPACE) as SettingsFormScope<IuiSettingsSectionValue>
    setActiveIuiFormScope(formScope as SettingsFormScope<unknown>)
    card = new IuiSettingsCardController(formScope)
  } catch (error) {
    console.error('[iui] settings form failed to bind; registering nav with error face', error)
    setActiveIuiFormScope(null)
    const disposeSection = scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'iui',
      order: 35,
      label: () => t('nav'),
    }, (() => createElement('div', { 'data-iui-settings-fallback': primitivesOk ? 'error' : 'upgrade', style: { padding: '12px 0', fontSize: 13, lineHeight: 1.6 } }, t(primitivesOk ? 'unavailable' : 'upgradeHost'))) as ComponentType<never>))
    console.info('[iui] settings.section registered (nav=IUI, form unavailable)')
    return () => {
      disposeSection()
      disposeLocale()
    }
  }

  const face = () => ({ t, ...card.inject() })

  const disposeSection = scope.slots.inject('settings.section', () => scope.slots.register({
    name: 'settings.section',
    id: 'iui',
    order: 35,
    label: () => t('nav'),
    locale: SETTINGS_NS,
    inject: face,
  }, IuiSettingsSection as ComponentType<never>))

  const disposePlugins = scope.configForms.whileServed([IUI_SETTINGS_NAMESPACE], () => scope.slots.inject('plugins.item', () => scope.slots.register({
    name: 'plugins.item',
    id: 'iui',
    order: 35,
    label: () => t('title'),
    locale: SETTINGS_NS,
    inject: face,
  }, IuiPluginsItem as ComponentType<never>)))

  console.info('[iui] settings.section registered (nav=IUI)')
  return () => {
    disposePlugins()
    disposeSection()
    card.dispose()
    setActiveIuiFormScope(null)
    disposeLocale()
  }
}
