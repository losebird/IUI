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
import { IuiSettingsCardController, IuiSettingsSection, type IuiSettingsSectionValue } from './IuiSettingsSection.tsx'

const SETTINGS_NS = 'settings.iui'
/** Profile entry id from cordis.patch.yml insert (`id: iui`). */
export const IUI_SETTINGS_NAMESPACE = 'iui'

const en = {
  nav: "IUI",
  title: "IUI",
  intro: "Choose a component pack for bubble ```iui fences. Packs ship real controls (not token-only skins). Save applies to new fences.",
  themeId: "Theme",
  themeIdHint: "Follows the selected pack automatically.",
  packId: "Component pack",
  packIdHint: "Each pack owns its own renderers for stats, cards, progress, buttons, inputs, tables, and charts. Theme tokens stay in sync.",
  appearance: "Appearance overrides",
  appearanceHint: "Optional tweaks on top of the pack theme. Leave fields on Inherit to keep pack defaults.",
  tokenAccent: "Accent color",
  tokenRadius: "Corner radius",
  tokenDensity: "Density",
  tokenInherit: "Inherit",
  radiusSm: "Small",
  radiusMd: "Medium",
  radiusLg: "Large",
  densityCompact: "Compact",
  densityComfortable: "Comfortable",
  behavior: "Behavior",
  fenceFeedback: "Fence repair feedback",
  fenceFeedbackHint: "Ask the model to repair a fence in the same turn when rendering fails.",
  formatReferee: "Format referee",
  formatRefereeHint: "When resource/weather/form/compare asks get Markdown-only or a weak fence, steer a same-turn ```iui repair.",
  strictImagePolicy: "Strict image policy",
  strictImagePolicyHint: "Sandbox pages may only load data:/blob: images and allowlisted image hosts (Wikimedia, map tiles). Blocks image-URL data exfiltration; arbitrary web images will not load.",
  pageStorage: "Page storage",
  pageStorageHint: "Interactive pages remember their state (forms, to-dos, localStorage) per conversation in this browser for 90 days.",
  pageStorageClear: "Clear page storage",
  pageStorageCleared: "All saved page state was cleared.",
  advancedTokens: "Advanced: raw CSS token JSON",
  customTokensJson: "Custom CSS tokens (JSON)",
  customTokensJsonHint: "Escape hatch for power users. Prefer the appearance controls above.",
  previewTitle: "Live preview",
  previewMeta: "pack={pack} · theme={theme}",
  maturityNative: "Native",
  maturityScaffold: "Scaffold",
  unavailable: "IUI is not loaded, so it cannot be configured right now.",
  readOnly: "This deployment stores settings read-only.",
  save: "Save",
  saving: "Saving…",
  saveFailed: "The deployment did not accept these values; they were left for you to correct.",
  templates: "Custom templates",
  templatesHint: "Save full ```iui specs. Preview, then Insert into composer (or clipboard) for a one-click try.",
  templateName: "Name",
  templateDesc: "Description",
  templateSave: "Save current preview as template",
  templateLoad: "Load into preview",
  templateDelete: "Delete",
  templateEmpty: "No custom templates yet.",
  templateInvalid: "Template JSON invalid — fix errors before saving.",
  templateNameRequired: "Enter a template name first.",
  templateSaved: "Template saved (click Save at the bottom to persist).",
  templateInsert: "Insert into composer",
  templateInsertPreview: "Insert preview fence",
  templateInserted: "Inserted into the composer — edit and send.",
  templateCopied: "Composer unavailable — fence copied to clipboard. Paste into chat.",
  templateInsertFailed: "Could not insert or copy the fence.",
  templateEditor: "Template JSON (advanced)",
  templateEditorHint: "Array of {id, name, description?, instruction?, demo}. demo must be a valid ```iui spec.",
  gateway: "Gateway",
  gatewayHint: "OpenUI-style validate/repair. Default stays in-process; sidecar is optional isolation (not MCP).",
  gatewayMode: "Transport",
  gatewayModeInProcess: "In-process (default)",
  gatewayModeSidecar: "HTTP sidecar",
  gatewayModeOff: "Off",
  gatewaySidecarUrl: "Sidecar URL",
  gatewaySidecarUrlHint: "e.g. http://127.0.0.1:3097 — only used when transport is sidecar.",
  gatewayHealthCheck: "Check health",
  gatewayHealthChecking: "Checking…",
  gatewayHealthOk: "Healthy · schema {schema} · {transport}",
  gatewayHealthFail: "Unreachable · {error}",
  fenceOps: "Fence ops (this process)",
  fenceOpsEmpty: "No fence ops recorded yet.",
  instanceStore: "Instance store",
  instanceStoreHint: "Optional JSONL persistence for IR instances (replay across restarts). Not a multi-region store.",
  instanceStorePersist: "Persist to disk",
  instanceStorePersistPath: "Persist path (JSONL)",
  instanceStorePersistPathHint: "e.g. /home/box/.dsh/profiles/web/iui-instance-store.jsonl",
  uiEagerness: "Page generation",
  uiEagernessHint: "Restrained: pages only when you ask for one. Balanced: explanations and comparisons are answered in text with a “Make it an interactive page” button. Eager: visualise whenever it helps.",
  uiEagernessRestrained: "Restrained",
  uiEagernessBalanced: "Balanced (default)",
  uiEagernessEager: "Eager",
  cdnSource: "Library source",
  cdnSourceHint: "Where page libraries (maps, charts, tables, diagrams, 3D) load from. Each source falls back to the next after 8 s.",
  cdnPreset: "Source",
  cdnPresetLocal: "Plugin built-in (recommended) → jsDelivr → npmmirror",
  cdnPresetChina: "China mirror: plugin built-in → npmmirror → jsDelivr",
  cdnPresetGlobal: "Global CDN: jsDelivr → unpkg → plugin built-in",
  cdnPresetCustom: "Custom template",
  cdnTemplate: "Custom template",
  cdnTemplateHint: "https only; {name} {version} {file} are replaced, e.g. https://cdn.example.com/npm/{name}@{version}/{file}. Falls back to the built-in copy.",
  legacyFences: "Legacy fences (deprecated)",
  legacyFencesHint: "Render old ```iui / ```dsh-ui fences from earlier conversations. Off: they show as code with a “Render as page” button. Removed in 0.14.",
  frameChannelMount: "Wire mount → frames.sse",
  frameChannelMountHint: "When on, each GenuiBlock opens a scoped frame channel + store replay. JSON SSE only — not a binary UI channel.",
  forceFenceDoc: "FreeLLMAPI soft fence",
  forceFenceDocHint: "Default path dsh→FreeLLMAPI→plugin Gateway. IUI_FENCE_MODE=prefer; visual asks may force-prefill. No separate inference gateway. See docs/SETTINGS.md.",
  formatRouter: "Format router",
  formatRouterHint: "Rules by default. Optional TypeSafe Jev only chooses format id — generation stays on your dsh model. Off without API key.",
  jevEnabled: "Enable Jev router",
  jevEnabledHint: "Privacy: when on (and a key is set), the text of each user message is sent to the third-party TypeSafe System One service to pick a format. Off by default. Failures fall back to local rules.",
  jevApiKey: "TypeSafe API key",
  jevApiKeyHint: "Stored as a secret. Empty keeps Jev off.",
  jevBaseUrl: "TypeSafe base URL",
  jevModel: "Jev model",
  structuredOutputsMode: "Structured Outputs",
  structuredOutputsModeHint: "Build/advertise json_schema when upstream supports it; otherwise degrade to soft fence + Gateway. dsh cannot attach response_format on LlmCallConfig.",
  structuredOutputsAuto: "Auto (probe + degrade)",
  structuredOutputsPrefer: "Prefer (advertise schema)",
  structuredOutputsOff: "Off",
  structuredOutputsProbeUrl: "Probe base URL",
  structuredOutputsProbeUrlHint: "Optional OpenAI-compatible root (e.g. http://127.0.0.1:3001). Empty skips network probe.",
  structuredOutputsProbeKey: "Probe API key",
  description: "Bubble-native Intelligent UI packs and appearance.",
}

const zh: typeof en = {
  nav: "IUI",
  title: "IUI",
  intro: "为气泡 ```iui 围栏选择组件包。组件包提供真实控件（不是只换 token 的皮肤）。保存后对新围栏生效。",
  themeId: "主题",
  themeIdHint: "跟随所选组件包自动同步。",
  packId: "组件包",
  packIdHint: "每个包自带 stat / card / progress / button / input / table / chart 渲染器，并同步主题 token。",
  appearance: "外观覆盖",
  appearanceHint: "在组件包主题之上的可选调整。选「继承」则保持包默认。",
  tokenAccent: "强调色",
  tokenRadius: "圆角",
  tokenDensity: "密度",
  tokenInherit: "继承",
  radiusSm: "小",
  radiusMd: "中",
  radiusLg: "大",
  densityCompact: "紧凑",
  densityComfortable: "舒适",
  behavior: "行为",
  fenceFeedback: "围栏修复反馈",
  fenceFeedbackHint: "围栏渲染失败时，同轮请求模型修复。",
  formatReferee: "格式裁判",
  formatRefereeHint: "资源/天气/表单/对比类问句若只回 Markdown 或弱围栏，同轮纠正为 ```iui。",
  strictImagePolicy: "严格图片策略",
  strictImagePolicyHint: "沙箱页面只能加载 data:/blob: 图片和白名单图床（Wikimedia、地图瓦片）。可防止页面脚本借图片 URL 外传数据；任意网络图片将无法显示。",
  pageStorage: "页面存储",
  pageStorageHint: "交互页面会按对话在本浏览器中记住状态（表单、待办、localStorage），保留 90 天。",
  pageStorageClear: "清除页面存储",
  pageStorageCleared: "已清除所有页面保存的状态。",
  advancedTokens: "高级：原始 CSS token JSON",
  customTokensJson: "自定义 CSS token（JSON）",
  customTokensJsonHint: "高级逃生舱。优先使用上方外观控件。",
  previewTitle: "实时预览",
  previewMeta: "pack={pack} · theme={theme}",
  maturityNative: "原生",
  maturityScaffold: "脚手架",
  unavailable: "IUI 当前未加载，暂时无法配置。",
  readOnly: "本部署的设置为只读。",
  save: "保存",
  saving: "保存中…",
  saveFailed: "本部署没有接受这些值，已保留供你修改。",
  templates: "自定义模板",
  templatesHint: "保存完整 ```iui 规格。预览后可一键插入输入框（或复制到剪贴板）试用。",
  templateName: "名称",
  templateDesc: "描述",
  templateSave: "把当前预览存为模板",
  templateLoad: "加载到预览",
  templateDelete: "删除",
  templateEmpty: "还没有自定义模板。",
  templateInvalid: "模板 JSON 无效 — 请先修好再保存。",
  templateNameRequired: "请先填写模板名称。",
  templateSaved: "模板已写入表单（请再点底部保存以持久化）。",
  templateInsert: "插入到输入框",
  templateInsertPreview: "插入预览围栏",
  templateInserted: "已插入输入框 — 编辑后发送即可。",
  templateCopied: "当前没有可用输入框 — 围栏已复制，粘贴到对话即可。",
  templateInsertFailed: "无法插入或复制围栏。",
  templateEditor: "模板 JSON（高级）",
  templateEditorHint: "数组项为 {id, name, description?, instruction?, demo}。demo 必须是合法 ```iui 规格。",
  gateway: "Gateway",
  gatewayHint: "OpenUI 风格校验/修补。默认同进程；sidecar 为可选隔离进程（不是 MCP）。",
  gatewayMode: "传输方式",
  gatewayModeInProcess: "同进程（默认）",
  gatewayModeSidecar: "HTTP sidecar",
  gatewayModeOff: "关闭",
  gatewaySidecarUrl: "Sidecar 地址",
  gatewaySidecarUrlHint: "例如 http://127.0.0.1:3097 — 仅在传输为 sidecar 时使用。",
  gatewayHealthCheck: "检查健康状态",
  gatewayHealthChecking: "检查中…",
  gatewayHealthOk: "正常 · schema {schema} · {transport}",
  gatewayHealthFail: "不可达 · {error}",
  fenceOps: "围栏运维（本进程）",
  fenceOpsEmpty: "还没有围栏运维记录。",
  instanceStore: "实例 store",
  instanceStoreHint: "可选 JSONL 持久化 IR 实例（重启可 replay）。不是多副本权威 store。",
  instanceStorePersist: "落盘持久化",
  instanceStorePersistPath: "持久化路径（JSONL）",
  instanceStorePersistPathHint: "例如 /home/box/.dsh/profiles/web/iui-instance-store.jsonl",
  uiEagerness: "界面生成积极度",
  uiEagernessHint: "克制：只有你明确要求时才生成页面。均衡：解释、对比类问题先用文字回答，并在下方提供“做成可交互页面”按钮。积极：能可视化就直接生成页面。",
  uiEagernessRestrained: "克制",
  uiEagernessBalanced: "均衡（默认）",
  uiEagernessEager: "积极",
  cdnSource: "资源源",
  cdnSourceHint: "页面里的地图、图表、表格、脑图、3D 等库从哪里加载。每个源 8 秒没响应就换下一个。",
  cdnPreset: "来源",
  cdnPresetLocal: "插件自带（推荐）→ jsDelivr → npmmirror",
  cdnPresetChina: "国内镜像：插件自带 → npmmirror → jsDelivr",
  cdnPresetGlobal: "海外 CDN：jsDelivr → unpkg → 插件自带",
  cdnPresetCustom: "自定义模板",
  cdnTemplate: "自定义模板",
  cdnTemplateHint: "仅 https；{name} {version} {file} 会被替换，例如 https://cdn.example.com/npm/{name}@{version}/{file}。失败时回退到插件自带。",
  legacyFences: "旧版围栏兼容（已弃用）",
  legacyFencesHint: "渲染早期对话里的 ```iui / ```dsh-ui 围栏。关闭时显示为代码，并提供「渲染为页面」按钮。0.14 起移除。",
  frameChannelMount: "挂载接线 → frames.sse",
  frameChannelMountHint: "开启后每个 GenuiBlock 会订阅 scoped frame channel 并做 store replay。仍是 JSON SSE，不是二进制 UI 通道。",
  forceFenceDoc: "FreeLLMAPI 软围栏",
  forceFenceDocHint: "默认路径 dsh→FreeLLMAPI→插件 Gateway。IUI_FENCE_MODE=prefer；可视问句可 force-prefill。不另挂推理网关。见 docs/SETTINGS.md。",
  formatRouter: "格式路由",
  formatRouterHint: "默认规则裁判。可选 TypeSafe Jev 只选格式 id——生成仍用 dsh 现有模型。无 Key 则关闭。",
  jevEnabled: "启用 Jev 路由",
  jevEnabledHint: "隐私提示：开启且填了 Key 后，每条用户消息的文字会发送给第三方 TypeSafe System One 服务来选择输出格式。默认关闭；失败时回落本地规则。",
  jevApiKey: "TypeSafe API Key",
  jevApiKeyHint: "按密钥保存。留空则 Jev 不启用。",
  jevBaseUrl: "TypeSafe 根地址",
  jevModel: "Jev 模型",
  structuredOutputsMode: "Structured Outputs",
  structuredOutputsModeHint: "上游支持则构建/暴露 json_schema；否则降级为软围栏 + Gateway。dsh 的 LlmCallConfig 无法挂 response_format。",
  structuredOutputsAuto: "自动（探测 + 降级）",
  structuredOutputsPrefer: "优先（暴露 schema）",
  structuredOutputsOff: "关闭",
  structuredOutputsProbeUrl: "探测 base URL",
  structuredOutputsProbeUrlHint: "可选 OpenAI 兼容根（如 http://127.0.0.1:3001）。留空则不做网络探测。",
  structuredOutputsProbeKey: "探测 API Key",
  description: "气泡原生 Intelligent UI 组件包与外观。",
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

let activeFormScope: SettingsFormScope<IuiSettingsSectionValue> | null = null

/**
 * G10: write one IUI config field outside the settings page (e.g. 「设为我的默认风格」).
 * Resolves false when the host form is unavailable / read-only or rejects the write.
 */
export async function writeIuiConfigField(field: string, value: string): Promise<boolean> {
  const formScope = activeFormScope
  if (formScope === null) return false
  try {
    const snap = formScope.getSnapshot()
    if (snap.status !== 'ready' || !snap.writable) return false
    const op = value === ''
      ? { op: 'unset' as const, path: [field] }
      : { op: 'set' as const, path: [field], value }
    return await formScope.mutate([op], snap.revision)
  } catch {
    return false
  }
}

/**
 * Install Settings → IUI. Caller must hard-inject locale + configForms
 * (see SETTINGS_INJECT + client `export const inject`).
 */
export function installIuiSettings(ctx: Context): () => void {
  const scope = ctx as SettingsHostCtx
  const t = scope.locale.bind(SETTINGS_NS)
  const disposeLocale = scope.locale.register(SETTINGS_NS, { zh, en })

  let card: IuiSettingsCardController
  try {
    const formScope = scope.configForms.get(IUI_SETTINGS_NAMESPACE) as SettingsFormScope<IuiSettingsSectionValue>
    activeFormScope = formScope
    card = new IuiSettingsCardController(formScope)
  } catch (error) {
    console.error('[iui] settings form failed to bind; registering nav with error face', error)
    const disposeSection = scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'iui',
      order: 35,
      label: () => t('nav'),
    }, (() => createElement('div', null, t('unavailable'))) as ComponentType<never>))
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
    activeFormScope = null
    disposeLocale()
  }
}
