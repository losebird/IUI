const IMG = (id, w = 800) => `https://images.unsplash.com/${id}?w=${w}&q=70&auto=format&fit=crop`
window.PHOTOS = [IMG('photo-1566073771259-6a8506099945'), IMG('photo-1582719508461-905c673771fd'), IMG('photo-1571896349842-33c89424de2d'), IMG('photo-1551882547-ff40c63fe5fa')]
window.SPECS = {
 forms: { title: '活动报名', gap: 14, items: [
  { type: 'text', size: 'muted', content: '周六 14:00 · 静安店 · 限 20 人' },
  { type: 'grid', cols: 2, items: [{ type: 'input', label: '姓名', placeholder: '怎么称呼你' }, { type: 'input', label: '邮箱', placeholder: 'name@example.com', inputType: 'email' }] },
  { type: 'select', label: '参加场次', options: ['周六 14:00', '周六 16:00', '周日 10:00'] },
  { type: 'radio', label: '人数', options: ['1 人', '2 人', '3 人以上'], layout: 'segmented', selected: 0, group: 'size' },
  { type: 'radio', label: '饮品偏好', options: [{ label: '咖啡', desc: '现磨美式 / 拿铁' }, { label: '茶饮', desc: '乌龙 / 茉莉' }], selected: 0, group: 'drink' },
  { type: 'slider', label: '预算（元）', min: 0, max: 500, step: 50, value: 200, local: true },
  { type: 'textarea', label: '备注', placeholder: '有什么想告诉我们的', rows: 3 },
  { type: 'checkbox', label: '我已阅读并同意活动须知', checked: true, group: 'agree' },
  { type: 'switch', label: '活动前一天提醒我', checked: true, local: true },
  { type: 'row', items: [{ type: 'spacer' }, { type: 'button', label: '取消', tone: 'ghost' }, { type: 'submit', label: '提交报名', groups: ['size', 'drink', 'agree'] }] },
 ] },
 interact: { title: '交互组件', gap: 14, items: [
  { type: 'tabs', tabs: [{ label: '概览', items: [{ type: 'text', content: '本周新增会员 412 人，复购率 27.6%。' }] }, { label: '明细', items: [{ type: 'text', content: '明细' }] }, { label: '设置', items: [{ type: 'text', content: '设置' }] }] },
  { type: 'steps', current: 1, steps: [{ title: '选择场次', desc: '周六 14:00' }, { title: '填写信息', desc: '姓名与联系方式' }, { title: '确认支付', desc: '¥39 / 人' }] },
  { type: 'grid', cols: 2, items: [{ type: 'progress', value: 68, label: '报名进度', valueLabel: '68%' }, { type: 'progress', value: 72, variant: 'ring', label: '目标完成' }] },
  { type: 'accordion', items: [{ title: '可以带孩子吗？', items: [{ type: 'text', content: '可以，12 岁以下免费，需家长陪同。' }] }, { title: '可以退款吗？', items: [{ type: 'text', content: '活动前 24 小时可全额退款。' }] }, { title: '停车方便吗？', items: [{ type: 'text', content: '商场 B2 停车场，凭小票免费 2 小时。' }] }] },
  { type: 'quiz', question: '哪家门店本周销售最高？', options: [{ label: '静安' }, { label: '浦东', correct: true }, { label: '徐汇' }], explanation: '浦东 312 千元，比第二名静安高 9%。' },
  { type: 'row', wrap: true, items: [{ type: 'button', label: '主要', tone: 'primary' }, { type: 'button', label: '次要' }, { type: 'button', label: '成功', tone: 'success' }, { type: 'button', label: '危险', tone: 'danger' }, { type: 'button', label: '幽灵', tone: 'ghost' }] },
 ] },
 dev: { title: '开发内容', gap: 14, items: [
  { type: 'breadcrumb', items: ['项目', 'IUI', 'src', 'themes'] },
  { type: 'code', lang: 'ts', code: 'export function summarize(rows: Row[]) {\n  const total = rows.reduce((s, r) => s + r.amount, 0)\n  return { total, avg: total / rows.length }\n}' },
  { type: 'diff', diffs: [{ path: 'src/theme.ts', oldText: "accent: '#185FA5'\nradius: 8\nshadow: 'double'", newText: "accent: '#0a0a0a'\nradius: 20\nshadow: 'none'" }] },
  { type: 'grid', cols: 2, items: [
   { type: 'file-tree', items: [{ name: 'src', type: 'dir', children: [{ name: 'themes', type: 'dir', children: [{ name: 'daisy.ts' }, { name: 'tokens.ts' }] }, { name: 'index.ts' }] }, { name: 'package.json' }] },
   { type: 'json', value: { theme: 'iui', radius: 20, dark: false, fonts: ['Inter'] } }] },
  { type: 'copy', label: '安装命令', text: 'dsh plugin add @losebird/iui' },
 ] },
 info: { title: '订单 SO-24815', gap: 14, items: [
  { type: 'grid', cols: 2, items: [
   { type: 'callout', tone: 'info', title: '提示', content: '数据每 5 分钟同步一次。' },
   { type: 'callout', tone: 'success', title: '已完成', content: '付款已到账。' },
   { type: 'callout', tone: 'warning', title: '注意', content: '库存低于 20 件。' },
   { type: 'callout', tone: 'error', title: '失败', content: '退款接口超时。' }] },
  { type: 'keyvalue', pairs: [{ key: '门店', value: '徐汇' }, { key: '客户', value: '陈一鸣' }, { key: '金额', value: '¥2,310' }, { key: '支付', value: '微信支付' }] },
  { type: 'timeline', items: [{ time: '10-18 09:12', title: '下单', desc: '陈一鸣 · 徐汇店' }, { time: '10-18 09:13', title: '付款成功', desc: '微信支付 ¥2,310' }, { time: '10-18 14:40', title: '已发货', desc: '顺丰 SF1234567' }] },
  { type: 'row', wrap: true, items: [{ type: 'avatar', name: '陈一鸣' }, { type: 'avatar', name: '林晓雯' }, { type: 'avatar', name: '王若溪' }, { type: 'badge', label: '已付款', tone: 'success' }, { type: 'badge', label: '待发货', tone: 'warn' }, { type: 'badge', label: '已退款', tone: 'danger' }, { type: 'badge', label: '新品', tone: 'accent' }] },
  { type: 'chips', items: ['静安', '徐汇', '浦东', '长宁'] },
  { type: 'entity', title: '徐汇店', subtitle: '徐汇区天钥桥路 123 号', label: '营业中', tone: 'success' },
  { type: 'list', items: [{ title: '周报自动化', desc: '每周一 9:00 推送到群' }, { title: '库存预警', desc: '低于 20 件时提醒店长' }] },
 ] },
 data: { title: '本周经营', gap: 14, items: [
  { type: 'hero', title: '本周总销售', label: '总销售额 · 较上周', value: '¥1,284,600', delta: '+12.4%', spark: [98, 104, 101, 112, 108, 115, 121, 128] },
  { type: 'grid', cols: 3, items: [
   { type: 'stat', label: '订单数', value: '3,912', delta: '+8.1%', spark: [3.1, 3.4, 3.2, 3.6, 3.9] },
   { type: 'stat', label: '客单价', value: '¥328', delta: '+3.9%' },
   { type: 'stat', label: '复购率', value: '27.6%', delta: '-1.2pt', ring: 27.6, tone: 'warning' }] },
  { type: 'table', columns: ['门店', '销售(千元)', '较上周', '状态'], types: ['text', 'num', 'delta', 'badge'], rows: [['浦东', 312, '+15.6%', '达标'], ['静安', 286, '+13.9%', '达标'], ['徐汇', 241, '+5.2%', '达标'], ['长宁', 168, '+5.0%', '待提升'], ['杨浦', 139, '+6.1%', '待提升']] },
 ] },
 gchart: { title: '内置图表', gap: 14, items: [
  { type: 'chart', kind: 'bars', data: [], series: [{ label: '本周', data: [{ label: '静安', value: 286 }, { label: '徐汇', value: 241 }, { label: '浦东', value: 312 }, { label: '长宁', value: 168 }, { label: '杨浦', value: 139 }, { label: '闵行', value: 138 }] }, { label: '上周', data: [{ label: '静安', value: 251 }, { label: '徐汇', value: 229 }, { label: '浦东', value: 270 }, { label: '长宁', value: 160 }, { label: '杨浦', value: 131 }, { label: '闵行', value: 104 }] }] },
  { type: 'grid', cols: 2, items: [
   { type: 'chart', kind: 'line', data: [98, 104, 101, 112, 108, 115, 121, 128.5].map((v, i) => ({ label: 'W' + (35 + i), value: v })) },
   { type: 'chart', kind: 'donut', data: [{ label: '堂食', value: 46 }, { label: '外卖', value: 32 }, { label: '自提', value: 22 }] }] },
  { type: 'plot', title: '价格弹性', series: [{ expr: '120*exp(-k*x)', label: '需求', kind: 'area', params: [{ name: 'k', value: 0.3, min: 0.1, max: 1, step: 0.05 }] }], xMin: 0, xMax: 10 },
 ] },
 diagram: { title: '下单流程', items: [
  { type: 'diagram', kind: 'flowchart', title: '下单流程', nodes: [
   { id: 'a', label: '用户下单', type: 'input' }, { id: 'b', label: '库存检查', type: 'backend' }, { id: 'c', label: '支付', type: 'focal' }, { id: 'd', label: '订单库', type: 'store' }, { id: 'e', label: '微信支付', type: 'external' }, { id: 'f', label: '发货通知', type: 'optional' }],
   edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: '有货' }, { from: 'c', to: 'e', kind: 'dashed' }, { from: 'c', to: 'd', kind: 'accent' }, { from: 'd', to: 'f' }] }] },
 mermaid: { title: 'Mermaid 图', gap: 14, items: [
  { type: 'mermaid', code: 'flowchart LR\n  A[用户下单] --> B{库存充足?}\n  B -- 是 --> C[创建订单]\n  B -- 否 --> D[提示缺货]\n  C --> E[(订单库)]\n  C --> F[微信支付]\n  F --> G[发货]' },
  { type: 'mermaid', code: 'sequenceDiagram\n  participant U as 用户\n  participant S as 门店系统\n  participant P as 支付\n  U->>S: 提交订单\n  S->>P: 发起支付\n  P-->>S: 支付成功\n  S-->>U: 订单确认' },
  { type: 'mermaid', code: 'gantt\n  dateFormat YYYY-MM-DD\n  axisFormat %m-%d\n  section 设计\n  主题替换 :a1, 2025-10-20, 5d\n  组件对齐 :a2, after a1, 4d\n  section 开发\n  图表精修 :b1, 2025-10-23, 6d\n  3D 预设 :b2, after b1, 5d' },
 ] },
 media: { title: '媒体', gap: 14, items: [
  { type: 'grid', cols: 2, items: [{ type: 'image', src: PHOTOS[0], alt: '外滩酒店' }, { type: 'image', src: PHOTOS[1], alt: '海景房' }] },
  { type: 'video', src: '/r2/clip.mp4', poster: PHOTOS[2], aspectRatio: '16:9', muted: true },
  { type: 'audio', src: '/r2/tone.mp3', alt: '门店背景音乐' },
 ] },
}
