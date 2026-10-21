/**
 * S3: the settings preview is a real ```iui-html sandbox page (mini dashboard:
 * hero KPI, chips, chart, cards, a small form and the primary action), rendered
 * side by side in light and dark with the current appearance.
 */
export function settingsPreviewPage(zh: boolean): string {
  const L = zh
    ? { title: '本周概览', hero: '本周访问', sub: '较上周 +12.4%', a: '转化率', b: '新用户', c: '平均时长', chart: '近 7 天', form: '提醒我', email: '邮箱', freq: '频率', daily: '每天', weekly: '每周', save: '保存', cancel: '取消', days: ['一', '二', '三', '四', '五', '六', '日'], badge: '示例数据' }
    : { title: 'This week', hero: 'Visits this week', sub: '+12.4% vs last week', a: 'Conversion', b: 'New users', c: 'Avg. time', chart: 'Last 7 days', form: 'Remind me', email: 'Email', freq: 'Frequency', daily: 'Daily', weekly: 'Weekly', save: 'Save', cancel: 'Cancel', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], badge: 'Sample' }
  return [
    `title: ${L.title}`,
    'height: 340',
    '---css',
    '.wrap{display:grid;gap:10px}',
    '.top{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.chart{height:84px}',
    '.wrap .iui-sandbox-card,.wrap .iui-sandbox-kpi{min-width:0}',
    '.kpis .value{font-size:20px}',
    '.row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}',
    '.row label{flex:1 1 120px;min-width:0;display:grid;gap:4px;font-size:12px;color:var(--color-text-secondary)}',
    '.row input,.row select{width:100%;box-sizing:border-box}',
    '---html',
    '<div class="wrap">',
    '<div class="top">',
    `<div class="iui-sandbox-card iui-hero"><div class="iui-hero-label">${L.hero} <span class="iui-badge-sample">${L.badge}</span></div><div class="iui-hero-value">12,480</div><div style="color:var(--color-text-success);font-size:12px">${L.sub}</div></div>`,
    `<div class="iui-sandbox-card"><div style="font-size:12px;color:var(--color-text-secondary)">${L.chart}</div><div class="chart"><canvas id="c"></canvas></div></div>`,
    '</div>',
    '<div class="kpis">',
    `<div class="iui-sandbox-kpi"><div class="label">${L.a}</div><div class="value">3.8%</div></div>`,
    `<div class="iui-sandbox-kpi"><div class="label">${L.b}</div><div class="value">1,204</div></div>`,
    `<div class="iui-sandbox-kpi"><div class="label">${L.c}</div><div class="value">4m 12s</div></div>`,
    '</div>',
    `<form class="iui-sandbox-card" id="f"><div style="font-weight:600;margin-bottom:6px">${L.form}</div><div class="row"><label>${L.email}<input type="email" value="me@example.com"></label><label>${L.freq}<select><option>${L.daily}</option><option>${L.weekly}</option></select></label>`,
    `<div class="iui-actions" style="margin:0"><button type="button" class="iui-sandbox-btn">${L.cancel}</button><button type="submit" class="iui-sandbox-btn primary">${L.save}</button></div></div></form>`,
    '</div>',
    '---js',
    "document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); });",
    `var labels = ${JSON.stringify(L.days)};`,
    "if (window.iuiCreateChart) window.iuiCreateChart(document.getElementById('c'), { type: 'line', data: { labels: labels, datasets: [{ data: [12, 19, 15, 22, 28, 24, 31], fill: true, tension: 0.35 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } }, y: { display: false } } } });",
  ].join('\n')
}
