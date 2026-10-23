import { createElement as h, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { STANDALONE_THEME_CSS } from '../../src/client/artifact/standalone-theme.ts'
import { setLocale } from '../../src/client/i18n/index.ts'
import { HtmlSandboxFrame, renderPatchFence, renderHtmlFence } from '../../src/client/html-fence.tsx'
import { registerPageVersion } from '../../src/client/page-versions.ts'
import { parseHtmlSandboxFence } from '../../src/shared/html-sandbox.ts'
import { pageFromSpec } from '../../src/shared/sandbox-patch.ts'
import { SandboxSkeleton } from '../../src/client/sandbox-skeleton.tsx'
import * as tip from '../../src/client/tip-toast.tsx'
import { GenuiPanel } from '../../src/client/panel.tsx'
import { setLocalPanel } from '../../src/client/panel-store.ts'
import { GenuiBlock } from '../../src/client/GenuiBlock.tsx'
import { ThemeRoot } from '../../src/client/theme/ThemeRoot.tsx'
import { IuiSettingsSection } from '../../src/client/settings/IuiSettingsSection.tsx'
import { setNetworkProbeSnapshot } from '../../src/client/runtime-config.ts'
import { SETTINGS_FIELD_NAMES } from '../../src/config/settings-fields.ts'
import settingsSrc from '../../src/client/settings/index.ts?raw'
function settingsZh(): Record<string, string> {
  const a = settingsSrc.indexOf('const zh: typeof en = {')
  const b = settingsSrc.indexOf('\n}\n', a)
  return new Function('return ' + settingsSrc.slice(settingsSrc.indexOf('{', a), b + 2))() as Record<string, string>
}

const dark = /dark/.test(location.hash)
const scene = location.hash.replace(/^#/, '').split(/[-&]/)[0]
if (dark) document.body.setAttribute('data-ds-dark-theme', '')
const style = document.createElement('style')
style.textContent = STANDALONE_THEME_CSS + `
#genui-root,#root{width:auto;margin:0;padding:16px;box-sizing:border-box}
body{font-family:"Noto Sans SC","Noto Sans CJK SC",system-ui,sans-serif;font-size:14px}
.msg{max-width:100%;}
.user{align-self:flex-end;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);padding:8px 14px;border-radius:16px;margin:0 0 12px auto;width:fit-content}
`
document.head.appendChild(style)
setLocale('zh')

const PAGE = JSON.stringify({
  id: 'trip', title: '东京行程',
  css: '',
  html: '<div class="p-6"><div class="text-2xl font-semibold tracking-tight">3 天 · 13 站 · 约 46 km</div><div class="text-sm text-base-content/60 mt-1">浅草起 · 涩谷收 · 地铁 + 步行全覆盖</div><div class="flex gap-2 mt-4"><span class="badge badge-neutral">第 1 天</span><span class="badge badge-ghost">第 2 天</span><span class="badge badge-ghost">第 3 天</span></div><div class="grid grid-cols-2 gap-3 mt-4"><div class="skeleton h-48 opacity-60"></div><div class="flex flex-col gap-2"><div class="skeleton h-12 opacity-60"></div><div class="skeleton h-12 opacity-60"></div><div class="skeleton h-12 opacity-60"></div></div></div></div>',
  js: '',
})


const autoFixMod = Object.values(import.meta.glob('../../src/client/auto-fix.ts', { eager: true }))[0] as { registerConversationSender?: (fn: (s: string | undefined, t: string) => Promise<boolean>) => () => void } | undefined
const BAD = JSON.stringify({
  id: 'tokyo-3d', title: '东京三日',
  css: '.day{padding:6px 14px;border-radius:999px;background:#f4f4f5;color:#3f3f46;font-weight:600;font-size:14px}.day.on{background:#f97316;color:#fdba74}.note{color:#c9c9cf;font-size:14px}',
  html: '<div class="p-6"><div class="text-2xl font-semibold tracking-tight">3 天 · 13 站 · 约 46 km</div><p class="note mt-1">浅草起 · 涩谷收 · 地铁 + 步行全覆盖</p><div id="days" class="flex gap-2 mt-4"><button class="day on">第 1 天</button><button class="day">第 2 天</button><button class="day">第 3 天</button></div><div class="grid grid-cols-2 gap-3 mt-4"><div class="card bg-base-200 p-4"><div class="font-semibold">浅草寺</div><div class="text-sm opacity-70">09:00 · 1.5 h</div></div><div class="card bg-base-200 p-4"><div class="font-semibold">晴空塔</div><div class="text-sm opacity-70">11:00 · 2 h</div></div></div></div>',
  js: "function paint(on){document.querySelectorAll('.day').forEach(function(x){x.style.background=x===on?'#f97316':'';x.style.color=x===on?'#fdba74':''})}document.querySelectorAll('.day').forEach(function(b){b.addEventListener('click',function(){paint(b)})});paint(document.querySelector('.day'))",
})
const FIX = "page: tokyo-3d\n---find\nx.style.color=x===on?'#fdba74':''\n---with\nx.style.color=x===on?'#ffffff':''\n---find\nx===on?'#f97316':''\n---with\nx===on?'#c2410c':''\n---css\n.note{color:color-mix(in oklab,var(--color-base-content) 62%,transparent)}"
function ContrastScene(): ReactNode {
  const [streaming, setStreaming] = useState(true)
  const [sent, setSent] = useState<string | null>(null)
  useEffect(() => {
    const off = autoFixMod?.registerConversationSender?.(async (_s, text) => { setSent(text); return true })
    const stopToasts = tip.mountTipToasts()
    const t = setTimeout(() => setStreaming(false), 400)
    return () => { off?.(); stopToasts(); clearTimeout(t) }
  }, [])
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
    h('div', { className: 'user' }, '做一个东京三日行程页'),
    renderHtmlFence(BAD, 'dom:a1:1', { sessionId: 's1', streaming, ...(streaming ? {} : { source: { id: 'dom:a1:1', order: [1, 0, 1] } }) } as never),
    sent ? h('div', { className: 'user', style: { whiteSpace: 'pre-wrap', fontSize: 12, maxWidth: '88%', textAlign: 'left' } }, sent) : null,
    sent ? renderPatchFence(FIX, 'dom:a2:1', { sessionId: 's1', source: { id: 'dom:a2:1', order: [2, 0, 1] } } as never) : null,
  )
}

let node: ReactNode = null
if (scene === 'chrome') {
  node = h('div', { style: { minHeight: 560 } }, h(HtmlSandboxFrame, { raw: PAGE }))
} else if (scene === 'contrast') {
  node = h(ContrastScene)
} else if (scene === 'probe') {
  node = h('div', { style: { minHeight: 560 } }, h(HtmlSandboxFrame, { raw: sessionStorage.getItem('probe') || PAGE }))
} else if (scene === 'states') {
  const spec = parseHtmlSandboxFence(PAGE)!
  registerPageVersion('s1', { fenceKey: 'dom:a1:1', pageId: 'trip', raw: PAGE, page: pageFromSpec(spec), storageKey: null, order: [1, 0, 1] })
  const anyTip = tip as unknown as Record<string, unknown>
  const Card = anyTip.ToastCard as ((p: Record<string, unknown>) => ReactNode) | undefined
  node = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
    h('div', { className: 'user' }, '把它改成深色主题。'),
    renderPatchFence('---find\nL.tileLayer("https://server.arcgisonline"\n---with\nL.tileLayer(dark)', 'dom:a2:1', { sessionId: 's1', source: { id: 'dom:a2:1', order: [2, 0, 1] } } as never),
    h(SandboxSkeleton, { label: '正在生成页面… · 已写 182 行', pct: 48, height: 220, received: 12700 } as never),
    Card ? h('div', { className: (Object.values(import.meta.glob('../../src/client/chrome/ChromeKit.module.css', { eager: true }))[0] as { default?: Record<string,string> } | undefined)?.default?.root || '', style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h(Card, { tone: 'achievement', title: '解锁成就 · 第一张看板', description: '已生成 1 个仪表盘页面', onClose: () => {} }),
      h(Card, { tone: 'success', title: '已保存为模板「东京行程」', action: { label: '撤销', onClick: () => {} }, onClose: () => {} }),
    ) : null,
  )
  if (!Card) setTimeout(() => { tip.pushTipToast({ title: '已保存到「我的模板」', description: '在模板抽屉的「我的模板」里', durationMs: 999999 }) ; (tip.mountTipToasts)() }, 50)
} else if (scene === 'drawer') {
  setLocalPanel('s1', { title: 'GenUI 面板', items: [{ type: 'text', text: 'x' }] } as never)
  node = h(GenuiPanel as never, { sessionId: 's1', sendGenuiAction: () => {}, insertTemplate: () => {} } as never)
} else if (scene === 'table') {
  node = h(ThemeRoot as never, {} as never, h(GenuiBlock, { stateKey: 'tbl', spec: { items: [
    { type: 'table', columns: ['城市', '天数', '预算'], rows: [['东京', 3, '¥6,800'], ['京都', 2, '¥4,200'], ['大阪', 2, '¥3,900']] },
    { type: 'callout', tone: 'info', title: '提示', content: '表格外框、媒体、提示条等容器应是圆角矩形，而不是椭圆。' },
  ] } as never }))
} else if (scene === 'settings') {
  setNetworkProbeSnapshot({ at: new Date('2025-01-01T15:01:00').getTime(), results: [
    ['jsdelivr', 71], ['npmmirror', 217], ['unpkg', 81], ['zstatic', 582], ['staticfile', 1354], ['wikipedia', 854], ['wikimedia', 547], ['tiles', 549], ['amap', 775], ['models', 1159],
  ].map(([id, ms]) => ({ id, ok: true, ms })) } as never)
  const fields: Record<string, unknown> = {}
  for (const n of SETTINGS_FIELD_NAMES) fields[n] = { text: '', overridden: false, invalid: false }
  fields.uiEagerness = { text: 'balanced', overridden: false, invalid: false }
  fields.fenceFeedback = { text: 'true', overridden: true, invalid: false }
  fields.formatReferee = { text: 'true', overridden: false, invalid: false }
  const dirty = /dirty/.test(location.hash)
  const snap = { available: true, writable: true, dirty, invalid: false, saving: false, failed: false, ...fields }
  node = h('div', { style: { maxWidth: 760 } }, h(IuiSettingsSection as never, {
    t: ((d) => (k: string) => d[k] ?? k)(settingsZh()), useIuiSettings: () => snap, edit: () => {}, resetField: () => {}, save: () => {}, discard: () => {},
  } as never))
}
createRoot(document.getElementById('root')!).render(node as never)
