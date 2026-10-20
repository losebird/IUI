import { safeRegExpTest } from '../shared/safe-regexp.ts'
/**
 * Format-referee rules: data-driven intent → fence / plain-text decisions.
 * Call sites resolve via classifyIntentAsk() / listIntentRules() / getIntentRule()
 * — never hard-code pattern lists or recipes in the plugin prompt or feedback loop.
 *
 * Architecture (Ace 0.13): intents are starter hints only — never a fence gate.
 * Product fence is ```iui-html sandbox (css/html/js). Short facts / greetings stay plain.
 * Catalog component trees (catalog type trees) are REMOVED — recipes are sandbox JSON only.
 */

/** Named intents are always must_fence; plain_ok reserved for future opt-outs. */
export type IntentMode = 'must_fence' | 'plain_ok'

/**
 * Legacy catalog shape checks — kept optional for type compat.
 * Sandbox-first path: any parseable ```iui-html satisfies the intent
 * (see replyMeetsSuccessShape); do not rely on catalog types.
 */
export interface SuccessShape {
  requireTypesAny?: readonly string[]
  requireTypesAll?: readonly string[]
  forbidTypesAny?: readonly string[]
  minStatValues?: number
  requireFilledProgressOrChart?: boolean
  preferHero?: boolean
  requireHero?: boolean
  minOrderedItems?: number
  countOnlySteps?: boolean
  minStepDescs?: number
  requireActionButton?: boolean
  requireExternalHref?: number
}

/** One classifiable user intent. */
export interface IntentRule {
  readonly id: string
  readonly label: string
  readonly askPatterns: readonly string[]
  readonly mode: IntentMode
  /** Sandbox pattern hints (not catalog component types). */
  readonly preferredTypes: readonly string[]
  readonly markdownFailPatterns: readonly string[]
  readonly successCriteria: readonly string[]
  readonly successShape?: SuccessShape
  /** One-line ```iui-html sandbox JSON recipe for primes / rescue. */
  readonly recipe: string
  readonly repairHint: string
}

/** Compact sandbox recipe helper. */
function sb(title: string, html: string, css = '', js = '', height = 420): string {
  return JSON.stringify({ title, height, css, html, js })
}

/**
 * Built-in intent catalog. Order matters: first match wins.
 * Recipes are ALWAYS ```iui-html sandbox JSON — never catalog trees.
 */
export const INTENT_RULES: readonly IntentRule[] = [
  {
    id: 'dashboard',
    label: '通用看板 / KPI',
    askPatterns: [
      'dashboard', 'kpi', '指标卡', '数据看板', '展示.*(指标|数据|统计)',
      '做.*看板', '画.*看板', 'overview', 'summary card',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'kpi', 'chart'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*(?:[-*]|\\d+\\.)\\s*.{0,20}\\d+(?:\\.\\d+)?\\s*%',
      '\\|\\s*(指标|KPI|Metric)',
      '(?:^|\\n)#{1,3}\\s*.*(看板|Dashboard|KPI)',
    ],
    successCriteria: [
      '短 lead → ```iui-html 沙箱看板 → 可选 outro。',
      '沙箱内用 KPI 卡片 / 圆环 / 迷你图（Chart.js 或 SVG），本地可点刷新；禁止 Markdown 指标列表。',
    ],
    recipe: sb(
      '本周指标看板',
      '<div class="iui-sandbox-card" style="display:grid;gap:12px"><h3>本周概览</h3><div class="iui-sandbox-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px"><div class="iui-sandbox-card"><div class="iui-sandbox-muted">转化</div><strong>4.2%</strong></div><div class="iui-sandbox-card"><div class="iui-sandbox-muted">留存</div><strong>61%</strong></div></div><button class="iui-sandbox-btn" id="b">刷新看板</button></div>',
      '',
      "document.getElementById('b').onclick=function(){this.textContent='已刷新'}",
      360,
    ),
    repairHint: '看板/KPI 必须输出 ```iui-html 沙箱页（KPI 卡片+可点按钮）。Markdown 指标列表不算成功。',
  },
  {
    id: 'tool',
    label: '可玩工具 / 计算器',
    askPatterns: [
      '计算器', 'calculator', '可点', '可玩', 'interactive tool', '小工具',
      '用 iui-html', 'iui-html', '做.*计算器',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'form', 'tool'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*[-*]\\s*.*(加|减|乘|除|按钮)',
      '(?:用法|步骤)\\s*[:：]',
    ],
    successCriteria: [
      '短说明 → ```iui-html 可交互沙箱 → 可选 outro。',
      '输入+按钮本地计算；禁止纯文字步骤。',
    ],
    recipe: sb(
      '简易计算器',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>简易计算器</h3><input id="a" placeholder="A"/><input id="b" placeholder="B"/><button class="iui-sandbox-btn" id="go">相加</button><div id="out" class="iui-sandbox-muted">结果 —</div></div>',
      'input{padding:8px;border-radius:8px;border:1px solid #e5e7eb}',
      "document.getElementById('go').onclick=function(){var a=+document.getElementById('a').value||0,b=+document.getElementById('b').value||0;document.getElementById('out').textContent='结果 '+(a+b)}",
      320,
    ),
    repairHint: '工具/计算器必须输出可交互 ```iui-html 沙箱（输入+按钮）。纯文字不算成功。',
  },
  {
    id: 'manual',
    label: '说明书 / 安装 / How-to',
    askPatterns: [
      '说明书', '使用说明', '使用手册', '产品说明', '操作指南', '操作手册',
      '安装步骤', '安装教程', '安装指南', '安装说明', '怎么安装', '如何安装',
      '怎么用', '如何使用', '怎么.*(装|组装|装配)', '装配', '组装', '手册', '教程',
      '教我.*(装|用|做)', '自行车.*(说明|安装|组装)', '家具.*(说明|安装|组装)',
      'how[- ]?to', 'setup guide', 'user manual', "owner.?s? manual",
      'install(ation)? guide', 'assemble', 'assembly', 'instruction(s)? manual',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'steps', 'checklist'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*\\d+\\.\\s+\\S+',
      '(?:^|\\n)\\s*[-*]\\s+第[一二三四五六七八九十\\d]+',
      '(?:注意事项|注意|提示)\\s*[:：]',
      '(?:^|\\n)#{1,3}\\s*.*(安装|说明|教程|手册)',
    ],
    successCriteria: [
      '短 lead → ```iui-html 步骤清单沙箱（≥3 步可勾选）→ 可选 outro。',
      '本地勾选进度；禁止只给注意事项散文。',
    ],
    recipe: sb(
      '安装说明',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>安装说明</h3><ol id="steps" style="margin:0;padding-left:1.2em;display:grid;gap:8px"><li><label><input type="checkbox"/> 开箱清点</label></li><li><label><input type="checkbox"/> 主体装配</label></li><li><label><input type="checkbox"/> 安全检查</label></li><li><label><input type="checkbox"/> 试运行</label></li></ol><button class="iui-sandbox-btn" id="done">标记完成</button></div>',
      '',
      "document.getElementById('done').onclick=function(){this.textContent='已完成'}",
      380,
    ),
    repairHint: '说明书/How-to 必须 ```iui-html：≥3 步可勾选步骤清单。禁止纯 Markdown 有序列表。',
  },
  {
    id: 'steps',
    label: '步骤 / 流程',
    askPatterns: [
      '步骤', '流程', '怎么做', '如何.*步骤', 'checklist', '分步',
      'step[- ]?by[- ]?step', '办.*手续',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'steps', 'timeline'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*\\d+\\.\\s+\\S+',
      '(?:^|\\n)\\s*[-*]\\s+第[一二三四五六七八九十\\d]+',
      '(?:注意事项|注意|提示)\\s*[:：]',
    ],
    successCriteria: [
      '短 lead → ```iui-html 有序步骤沙箱（≥3 步）→ 可选 outro。',
      '禁止 Markdown 有序列表冒充 UI。',
    ],
    recipe: sb(
      '办理步骤',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>办理步骤</h3><ol style="margin:0;padding-left:1.2em;display:grid;gap:8px"><li>准备材料</li><li>提交审核</li><li>等待结果</li><li>领取办理</li></ol><button class="iui-sandbox-btn" id="b">我做完了</button></div>',
      '',
      "document.getElementById('b').onclick=function(){this.textContent='已记录'}",
      360,
    ),
    repairHint: '步骤/流程必须 ```iui-html 有序步骤沙箱（≥3 步）。Markdown 列表不算成功。',
  },
  {
    id: 'map',
    label: '地图 / 目的地 / 导航',
    askPatterns: [
      '地图', '导航', '怎么走', '怎么去', '路线', '定位', '位置', '目的地',
      '把.*地图', '给我.*地图', '打开.*地图', '高德', '百度地图', 'amap',
      'baidu map', 'google maps', 'directions?', 'navigate to',
      'show (me )?the map', 'where is', '在哪', '在哪儿', '地址.*地图', '地图.*给',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'leaflet', 'map'],
    markdownFailPatterns: [
      '(?:高德|百度|Google)\\s*(?:地图)?\\s*[:：]?\\s*https?://',
      '(?:^|\\n)\\s*[-*]\\s*.*(?:地址|路线|导航|地图)',
      '(?:搜索不可用|无法搜索|请自行|你可以打开)',
      '(?:^|\\n)#{1,3}\\s*.*(地图|导航|路线)',
    ],
    successCriteria: [
      '短 lead → ```iui-html 真 Leaflet。多站必须：灰阶地图 + 编号针 + 横滑站卡 + 点针/卡出详解（停留/票/怎么去/避坑）。',
      '用 createTripAnimator；禁止纯文字道歉、只贴 URL、或只有针没有详情。',
    ],
    recipe: sb(
      '目的地',
      '<div class="iui-sandbox-card iui-itinerary" style="display:grid;gap:10px"><h3>珠江路一带</h3><div class="iui-map-chrome"><button class="iui-sandbox-btn" id="pause" type="button">暂停</button><button class="iui-sandbox-btn" id="replay" type="button">重播</button><span id="status">点标记看详情</span></div><div id="map" class="iui-map-wrap" style="height:280px"></div><div class="iui-cards-strip" id="strip"></div><div id="sheet" class="iui-sandbox-card"><b>停留</b> 40 分 · <b>怎么去</b> 地铁 1 号线</div></div>',
      '',
      "var stops=[{n:'珠江路',lat:32.0439,lng:118.7881,stay:'40 分',go:'地铁 1 号线',pit:'早高峰勿打车'}];var map=L.map('map',{scrollWheelZoom:false}).setView([32.0439,118.7881],14);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19}).addTo(map);var m=L.marker([32.0439,118.7881]).addTo(map);document.getElementById('strip').innerHTML='<button class=\"iui-stop-card\" type=\"button\"><div class=\"name\">珠江路</div></button>';function open(){document.getElementById('sheet').innerHTML='<b>停留</b> '+stops[0].stay+' · <b>怎么去</b> '+stops[0].go+' · <b>避坑</b> '+stops[0].pit};open();m.on('click',open);document.getElementById('strip').onclick=open;",
      560,
    ),
    repairHint: '地图必须 ```iui-html 真 Leaflet。多站还要横滑卡 + 点开详解（停留/票/怎么去/避坑）。禁止只贴 URL 或只有针没有详情。',
  },
  {
    id: 'resource',
    label: '资源 / 本机看板',
    askPatterns: [
      '资源', 'cpu', '内存', '磁盘', '负载', '仪表盘', '看板', 'memory', 'disk',
      'load average', 'resource', '电脑.*(怎么样|如何|情况)', '这台.*(电脑|机器|主机)',
      '当前.*(资源|CPU|内存|磁盘)', '本机.*(资源|状态|指标)', '看看.*(CPU|内存|磁盘|资源)',
      'machine (stats|status|resources?)', 'system (stats|status|resources?|usage)',
      'how.*(cpu|memory|disk|resources?)', '使用量', '占用率', '占用情况', '系统状态',
      '机器状态', '跑得怎么样', '卡不卡', '发热', '性能怎么样', 'usage', 'utilization',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'kpi', 'chart'],
    markdownFailPatterns: [
      '\\|\\s*(CPU|Mem|Memory|Disk|Load|内存|磁盘|负载)',
      '(?:^|\\n)\\s*(?:[-*]|\\d+\\.)\\s*(?:\\*\\*)?(?:CPU|内存|磁盘|负载|Memory|Disk|Load)\\b',
      '(?:^|\\n)#{1,3}\\s*.*(资源|看板|仪表盘|CPU|内存)',
      '(?:资源使用|本机资源|系统资源|resource usage)',
      '(?:CPU|Mem(?:ory)?|内存|磁盘|负载).{0,12}\\d+(?:\\.\\d+)?\\s*%',
      '(?:^|\\n)\\s*(?:\\*\\*)?(?:CPU|内存|磁盘|负载|Memory|Disk)\\s*[:：]',
      '(?:大概|约|大约).{0,8}\\d+(?:\\.\\d+)?\\s*%',
      '(?:GiB|GB|MiB).{0,20}(?:已用|占用|可用)',
    ],
    successCriteria: [
      '```iui-html 资源 bento：多 KPI + 可选图表；至少一个本地按钮。',
      '禁止 Markdown 表格/列表冒充资源看板。',
    ],
    recipe: sb(
      '本机资源',
      '<div class="iui-sandbox-card" style="display:grid;gap:12px"><h3>本机资源</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px"><div class="iui-sandbox-card">CPU <strong>28%</strong></div><div class="iui-sandbox-card">内存 <strong>6.2 GB</strong></div><div class="iui-sandbox-card">磁盘 <strong>180 GB</strong></div><div class="iui-sandbox-card">负载 <strong>1.2</strong></div></div><button class="iui-sandbox-btn" id="b">刷新指标</button></div>',
      '',
      "document.getElementById('b').onclick=function(){this.textContent='已刷新'}",
      360,
    ),
    repairHint: '资源/看板必须 ```iui-html KPI 沙箱。Markdown 列表不算成功。',
  },
  {
    id: 'weather',
    label: '天气卡',
    askPatterns: [
      '天气', '气温', '降雨', 'humidity', 'forecast', 'weather', '温度',
      '空气质量', '下雨', '几度', '穿什么', '出门.*天气', 'forecast for',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'chart', 'weather'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*[-*]\\s*(?:温度|气温|湿度|风力|空气|Temp|Humidity|Wind)',
      '\\|\\s*(温度|气温|湿度|Temp|Humidity)',
      '(?:温度|气温|Temp(?:erature)?)\\s*[:：]?\\s*\\d+',
      '(?:湿度|Humidity)\\s*[:：]?\\s*\\d+',
    ],
    successCriteria: [
      '```iui-html 天气沙箱：渐变头图大气温 + 体感/湿度/风/空气芯片 + Chart.js 折线 + 7 日可选卡。',
      '禁止只有 3 个 KPI 方块、禁止项目符号/表格冒充天气卡。',
    ],
    recipe: sb(
      '上海天气',
      "<div class=\"iui-sandbox-card iui-weather\"><div class=\"iui-weather-hero\"><div><div class=\"iui-sandbox-muted\">\u4e0a\u6d77 \u00b7 \u4eca\u65e5</div><div class=\"temp\">22\u00b0</div><div class=\"iui-weather-chips\"><span class=\"iui-weather-chip\">\u4f53\u611f<strong>21\u00b0</strong></span><span class=\"iui-weather-chip\">\u6e7f\u5ea6<strong>62%</strong></span><span class=\"iui-weather-chip\">\u4e1c\u5317\u98ce<strong>3 \u7ea7</strong></span><span class=\"iui-weather-chip\">\u7a7a\u6c14<strong>\u826f 68</strong></span></div></div><div class=\"meta\"><div class=\"icon\">\u26c5</div><div>\u591a\u4e91</div><div class=\"iui-sandbox-muted\">26\u00b0 / 17\u00b0</div></div></div><div class=\"iui-weather-chart\"><canvas id=\"wxChart\"></canvas></div><div class=\"iui-weather-days\" id=\"days\"></div></div>",
      ".iui-weather{display:flex;flex-direction:column;gap:14px}.iui-weather-hero{display:grid;grid-template-columns:1fr auto;gap:12px;padding:18px 20px;border-radius:var(--border-radius-xl);background:linear-gradient(135deg,var(--color-background-info),var(--color-background-secondary));border:1px solid var(--color-border-tertiary)}.iui-weather-hero .temp{font-size:56px;font-weight:700;letter-spacing:-.04em;line-height:1}.iui-weather-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.iui-weather-chip{padding:8px 12px;border-radius:999px;background:var(--color-background-secondary);border:1px solid var(--color-border-tertiary);font-size:12px}.iui-weather-chart{height:200px}.iui-weather-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.iui-weather-day{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:var(--border-radius-lg);border:1px solid var(--color-border-tertiary);background:var(--color-background-primary);cursor:pointer;font:inherit}.iui-weather-day[aria-current=\"true\"]{border-color:var(--color-border-info);background:var(--color-background-info)}",
      "var days=[{d:'\u4eca\u65e5',hi:26,lo:17,icon:'\u26c5',cond:'\u591a\u4e91'},{d:'\u5468\u4e00',hi:28,lo:18,icon:'\u2600\ufe0f',cond:'\u6674'},{d:'\u5468\u4e8c',hi:27,lo:19,icon:'\u2600\ufe0f',cond:'\u6674'},{d:'\u5468\u4e09',hi:24,lo:16,icon:'\ud83c\udf26\ufe0f',cond:'\u5c0f\u96e8'},{d:'\u5468\u56db',hi:25,lo:17,icon:'\u26c5',cond:'\u591a\u4e91'},{d:'\u5468\u4e94',hi:22,lo:15,icon:'\ud83c\udf27\ufe0f',cond:'\u4e2d\u96e8'},{d:'\u5468\u516d',hi:23,lo:16,icon:'\u26c5',cond:'\u591a\u4e91'}];var row=document.getElementById('days');days.forEach(function(x,i){var b=document.createElement('button');b.type='button';b.className='iui-weather-day';b.innerHTML='<span>'+x.d+'</span><span style=\"font-size:20px\">'+x.icon+'</span><span>'+x.cond+'</span><strong>'+x.hi+'\u00b0/'+x.lo+'\u00b0</strong>';if(i===0)b.setAttribute('aria-current','true');row.appendChild(b)});(function paint(){var cv=document.getElementById('wxChart');if(!cv)return;if(!window.Chart){setTimeout(paint,40);return;}(window.iuiCreateChart||function(c,cfg){return new Chart(c,cfg);})(cv,{type:'line',data:{labels:['08','10','12','14','16','18','20'],datasets:[{data:[18,19,21,23,26,24,21],borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,.12)',fill:true,tension:.35,pointRadius:2}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:false}}}});cv.__iuiChartOk=true;window.iuiSandbox&&window.iuiSandbox.resize();})();",
      560,
    ),
    repairHint: '天气必须 ```iui-html：渐变头图大气温 + 细节芯片 + Chart.js + 7 日卡（见 weather-dense starter）。稀薄 KPI 不算成功。',
  },
  {
    id: 'booking',
    label: '订票 / 行程查询',
    askPatterns: [
      '订票', '订机票', '订火车票', '订酒店', '预订', '买票', '查票', '机票',
      '火车票', '车票', '高铁票', '飞机票', '航班', '订票界面', '订票表单',
      '出行查询', '车次', 'booking', 'book (a |the )?(flight|ticket|train|hotel)',
      'flight ticket', 'train ticket', 'hotel booking',
      'reserve (a )?(flight|ticket|hotel|room)',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'form', 'booking'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*[-*]\\s*.*(出发|到达|日期|乘客|车次|航班)',
      '(?:请填写|订票信息|行程)\\s*[:：]',
      '(?:^|\\n)#{1,3}\\s*.*(订票|机票|火车票|酒店)',
      '\\|\\s*(车次|航班|出发|到达)',
    ],
    successCriteria: [
      '机票/火车票：```iui-html 订票表单（出发/到达/日期+查询）。',
      '酒店列表：```iui-html 用 .iui-hotel-card + .photo Wikimedia 封面（可调 get_place_images）。',
      '禁止 Markdown 行程清单。',
    ],
    recipe: sb(
      '上海精选酒店',
      '<div class="iui-itinerary"><div class="iui-itinerary-head"><div><div class="iui-itinerary-title">上海 · 精选住宿</div><div class="iui-itinerary-sub">示意封面</div></div></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px"><div class="iui-hotel-card" data-iui-place="上海"><div class="photo"></div><div class="name">外滩悦榕庄</div></div><div class="iui-hotel-card" data-iui-place="豫园"><div class="photo"></div><div class="name">豫园精品酒店</div></div><div class="iui-hotel-card" data-iui-place="陆家嘴"><div class="photo"></div><div class="name">陆家嘴商务酒店</div></div></div></div>',
      '',
      '',
      420,
    ),
    repairHint: '订票用表单沙箱；酒店列表用 .iui-hotel-card + Wikimedia 封面（get_place_images）。禁止 Markdown 列表。',
  },
  {
    id: 'form',
    label: '表单 / 报名',
    askPatterns: [
      '报名', '申请表', '表单', '收集信息', 'intake', 'sign[- ]?up',
      'registration form', '填写', '问卷', '帮我做.*表',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'form'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*[-*]\\s*.*(姓名|邮箱|方向|目标|Name|Email)',
      '(?:^|\\n)\\s*\\d+\\.\\s*.*(姓名|邮箱|方向)',
      '(?:请填写|报名信息|申请表|字段)\\s*[:：]',
      '\\[[\\sxX]\\]\\s*.*(姓名|邮箱|方向)',
    ],
    successCriteria: [
      '```iui-html 表单沙箱：带标签输入 + 提交按钮（本地校验）。',
      '禁止 Markdown 勾选列表冒充表单。',
    ],
    recipe: sb(
      '需求收集',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>需求收集</h3><label>主题<input id="topic" placeholder="季度活动方案"/></label><label>语言<select id="lang"><option>中文</option><option>English</option></select></label><button class="iui-sandbox-btn" id="b">开始整理</button></div>',
      'label{display:grid;gap:4px;font-size:13px}input,select{padding:8px;border-radius:8px;border:1px solid #e5e7eb}',
      "document.getElementById('b').onclick=function(){var t=document.getElementById('topic').value;if(!t){alert('请填写主题');return}window.iuiSandbox&&iuiSandbox.action('intake',{topic:t,lang:document.getElementById('lang').value})}",
      360,
    ),
    repairHint: '表单/报名必须 ```iui-html 可提交表单沙箱。Markdown 勾选列表不算成功。',
  },
  {
    id: 'compare',
    label: '方案对比',
    askPatterns: [
      '对比', '比较', 'vs\\b', 'versus', 'A\\s*vs\\s*B', '方案\\s*[AB]',
      '哪个更好', '优缺点', 'compare', 'pros and cons',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'compare', 'iui-compare-3'],
    markdownFailPatterns: [
      '\\|\\s*(方案|选项|Option|Pros|Cons|成本|风险)',
      '(?:^|\\n)\\s*[-*]\\s*(?:优点|缺点|Pros|Cons)\\b',
      '(?:方案\\s*[AB]|Option\\s*[AB]).{0,40}(?:成本|风险|周期)',
      '(?:^|\\n)\\s*(?:\\*\\*)?(?:方案\\s*[AB]|Pros|Cons)\\s*[:：]',
    ],
    successCriteria: [
      '```iui-html 并排对比沙箱（优先 iui-compare-3 三列）。',
      '禁止 Markdown 表格当默认主布局。',
    ],
    recipe: sb(
      '方案对比',
      '<div class="iui-compare-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"><div class="iui-sandbox-card"><h4>Basic</h4><strong>$9</strong><button class="iui-sandbox-btn">选择</button></div><div class="iui-sandbox-card" data-featured="1"><h4>Pro</h4><strong>$29</strong><button class="iui-sandbox-btn">选择</button></div><div class="iui-sandbox-card"><h4>Team</h4><strong>$79</strong><button class="iui-sandbox-btn">选择</button></div></div>',
      '[data-featured="1"]{outline:2px solid var(--color-accent,#3b82f6)}',
      '',
      320,
    ),
    repairHint: '对比必须 ```iui-html 并排卡片沙箱（三列优先）。纯 Markdown 对比不算成功。',
  },
  {
    id: 'grid-table',
    label: '可筛表格 / AG Grid',
    askPatterns: [
      'ag.?grid', '数据表', '可筛选', '可排序', 'spreadsheet', '明细表',
      '排行榜.*表', '名单.*筛选', 'filterable table', 'sortable table',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'ag-grid'],
    markdownFailPatterns: [
      '\\|\\s*\\S+\\s*\\|\\s*\\S+',
      '(?:^|\\n)\\s*[-*]\\s+\\S+\\s+[\\d.]+',
    ],
    successCriteria: [
      '```iui-html 用 agGrid.createGrid + ag-theme-quartz ag-theme-iui。',
      '禁止 Markdown 表冒充可筛数据表。行程小表不走这条。',
    ],
    recipe: sb(
      '明细表',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>明细</h3><div id="grid" class="ag-theme-quartz ag-theme-iui" style="width:100%"></div></div>',
      '',
      "agGrid.createGrid(document.getElementById('grid'),{domLayout:'autoHeight',columnDefs:[{field:'name',headerName:'名称',filter:true,sortable:true},{field:'n',headerName:'数量',sortable:true}],rowData:[{name:'甲',n:3},{name:'乙',n:1},{name:'丙',n:8}]});",
      360,
    ),
    repairHint: '可筛/可排序数据表必须 ```iui-html + agGrid.createGrid（ag-theme-iui）。Markdown 表不算。行程里的预算小表不要改成 Grid。',
  },
  {
    id: 'mindmap',
    label: '脑图 / Mermaid',
    askPatterns: [
      '脑图', '思维导图', 'mindmap', 'mermaid', '流程图', 'flowchart',
      '知识图谱', '结构图',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'mermaid'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s{0,3}[-*]\\s+\\S+\\n\\s{2,}[-*]',
      '(?:^|\\n)#{1,3}\\s*.*(脑图|思维导图|流程图)',
    ],
    successCriteria: [
      '```iui-html 用 mermaid / .iui-mindmap，不要 ASCII 树。',
    ],
    recipe: sb(
      '脑图',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>结构</h3><pre class="mermaid iui-mindmap">mindmap\n  root((主题))\n    分支甲\n    分支乙</pre></div>',
      '',
      "if(window.mermaid&&mermaid.run)mermaid.run({querySelector:'.mermaid'});",
      420,
    ),
    repairHint: '脑图/流程图必须 ```iui-html + mermaid（.iui-mindmap）。禁止 Markdown 缩进树。',
  },
  {
    id: 'visual',
    label: '通用可视 / 兜底卡',
    askPatterns: [
      '可视化', '做一张卡', '做个卡片', '界面', '组件', '给我看', '展示一下',
      '画一张', '用卡片', 'interactive ui',
      'show (me )?(a |the )?(card|ui|panel|widget)',
    ],
    mode: 'must_fence',
    preferredTypes: ['sandbox', 'card'],
    markdownFailPatterns: [
      '(?:^|\\n)\\s*(?:[-*]|\\d+\\.)\\s+\\S+',
      '\\|\\s*\\S+\\s*\\|',
      '(?:^|\\n)#{1,3}\\s+\\S+',
    ],
    successCriteria: [
      '凡「要看的东西」默认 ```iui-html 自由好看页。',
      '短 lead → 沙箱 → 可选 outro；禁止 Markdown 冒充 UI。',
    ],
    recipe: sb(
      '今日菜单',
      '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>今日菜单</h3><ul style="margin:0;padding-left:1.2em;display:grid;gap:6px"><li>主菜 · 红烧肉</li><li>素菜 · 清炒时蔬</li><li>汤品 · 例汤</li><li>主食 · 米饭</li></ul><button class="iui-sandbox-btn" id="b">我要这个</button></div>',
      '',
      "document.getElementById('b').onclick=function(){window.iuiSandbox&&iuiSandbox.sendPrompt('我选这个菜单')}",
      340,
    ),
    repairHint: '可视问句必须先发 ```iui-html 沙箱页。不要用纯 Markdown/道歉散文当答案。',
  },
]

export function listIntentRules(): readonly IntentRule[] {
  return INTENT_RULES
}

export function getIntentRule(id: string): IntentRule | undefined {
  return INTENT_RULES.find((rule) => rule.id === id)
}

/** Named + visual must_fence rules (quality catalog; not a fence gate alone). */
export function mustFenceRules(): readonly IntentRule[] {
  return INTENT_RULES.filter((rule) => rule.mode === 'must_fence')
}

/** Short greetings / yes-no / trivial arithmetic — plain text OK. */
export function isPlainAsk(ask: string): boolean {
  const text = ask.trim()
  if (text.length === 0) return true
  if (text.length <= 2) return true
  if (/^(好的?|你好|您好|嗨|哈喽|谢谢|感谢|嗯+|哦+|啊+|ok|okay|yes|no|yep|nope|是的?|不是|对的?|没错)[!！.。?？…]*$/iu.test(text)) {
    return true
  }
  if (/^[\d\s+\-*/().^=]+[?？]?$/u.test(text)) return true
  if (/^(什么是|谁是|几[点岁]|等于几)\S{0,24}[?？]?$/iu.test(text) && text.length < 36) {
    return true
  }
  return false
}

const EXPLICIT_UI_ASK =
  /做[一个张份款套]?|画[一个张份]?|生成.{0,8}(页|卡|图|表|看板)|给我看|可视化|看板|仪表盘|地图|计算器|图表|界面|页面|卡片|组件|交互|表单|问卷|报名|预订|订票|买票|查票|dashboard|chart|visuali[sz]e|interactive|widget|\bui\b|show\s+me|make\s+(a|me)|build\s+(a|me)|draw\s+(a|me)|iui(?:-html)?/iu
const CODE_TOPIC =
  /python|javascript|typescript|\bjs\b|\bts\b|\bjava\b|golang|\bgo\b|rust|c\+\+|c#|\bsql\b|shell|bash|\bgit\b|\bnpm\b|pnpm|node(?:\.js)?|react|vue|正则|代码|函数|方法|变量|数组|字典|列表|元组|字符串|报错|异常|编译|语法|\bapi\b|docker|linux|命令/iu
const QUESTION_ASK =
  /怎么|怎样|如何|为什么|为啥|是什么|什么是|有什么|区别|差别|用法|写法|意思|原理|解释|讲讲|说说|吗[?？]?$|how\s+(do|to|can)|what|why|difference|explain/iu
const BRIEF_ASK = /简单说|简单讲|简要|简短|一句话|大概说|快速说|briefly|in\s+short|tl;?dr|quick\s+question/iu

/**
 * Knowledge / coding Q&A ("Python 里怎么把列表反转？简单说一下") — plain text is
 * the right answer even when it mentions a UI-ish noun (列表/流程/安装…).
 * Seen live: the referee forced a sandbox page after a correct plain answer.
 * An explicit build/show verb (做/画/可视化/看板/地图…) still wins.
 */
export function isKnowledgeAsk(ask: string): boolean {
  const text = ask.trim()
  if (text.length === 0 || EXPLICIT_UI_ASK.test(text)) return false
  if (BRIEF_ASK.test(text)) return true
  return CODE_TOPIC.test(text) && QUESTION_ASK.test(text)
}

/**
 * Heuristic: ask wants something to *see* / interact with.
 * Broad on purpose — whitelist must not be the gate.
 */
export function askNeedsUi(ask: string): boolean {
  const text = ask.trim()
  if (text.length === 0 || isPlainAsk(text) || isKnowledgeAsk(text)) return false
  if (
    /地图|导航|路线|定位|目的地|看板|仪表盘|表单|报名|问卷|对比|比较|步骤|流程|说明书|手册|安装|教程|天气|气温|资源|CPU|内存|磁盘|负载|展示|可视化|卡片|界面|组件|图表|列表|菜单|课表|日历|行程|订票|机票|火车票|车票|高铁|航班|酒店|预订|买票|查票|点菜|嵌入|沙箱|计算器|看板|KPI|dashboard|weather|forecast|form|compare|checklist|manual|map|directions|navigate|booking|ticket|flight|hotel|iui(?:-html)?/iu.test(
      text,
    )
  ) {
    return true
  }
  if (
    /把.{0,16}给[我你]|给[我你].{0,12}(看|出|画|做|来)|做[一张个份]|画[一张个]|用卡片|show\s+me|give\s+me|make\s+(a|me)|draw\s+(a|me)/iu.test(
      text,
    )
  ) {
    return true
  }
  const seps = text.match(/[、,，;；]/gu)
  if (seps !== null && seps.length >= 2 && text.length >= 16) return true
  return false
}

/**
 * Classify ask: named intent first (quality recipes), else visual fallback when
 * UI-worthy, else null (plain OK).
 */
export function classifyIntentAsk(ask: string): IntentRule | null {
  const text = ask.trim()
  if (text.length === 0) return null
  if (isKnowledgeAsk(text)) return null
  for (const rule of INTENT_RULES) {
    if (rule.id === 'visual') continue
    if (rule.askPatterns.some((source) => safeRegExpTest(source, 'iu', text))) {
      return rule
    }
  }
  if (isPlainAsk(text)) return null
  if (askNeedsUi(text)) {
    return INTENT_RULES.find((rule) => rule.id === 'visual') ?? null
  }
  return null
}
