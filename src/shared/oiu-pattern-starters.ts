/**
 * OpenIntelligentUI-pattern starters for ```iui-html.
 * Kept separate so long JS strings stay readable.
 */
import type { HtmlSandboxStarter } from './html-sandbox.ts'

const ITINERARY_JS = `
var stops=[
  {n:'旧金山',d:'Day 1',lat:37.7749,lng:-122.4194,desc:'海湾与金门',img:'https://commons.wikimedia.org/wiki/Special:FilePath/GoldenGateBridge-001.jpg?width=480'},
  {n:'蒙特雷',d:'Day 2',lat:36.6002,lng:-121.8947,desc:'水族馆与码头',img:'https://commons.wikimedia.org/wiki/Special:FilePath/Monterey_Bay.jpg?width=480'},
  {n:'大苏尔',d:'Day 3',lat:36.2704,lng:-121.8081,desc:'悬崖公路',img:'https://commons.wikimedia.org/wiki/Special:FilePath/Bixby_Creek_Bridge.jpg?width=480'}
];
var map=L.map('map',{scrollWheelZoom:false,zoomControl:true}).setView([36.8,-121.6],7);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19}).addTo(map);
var pts=stops.map(function(s){return [s.lat,s.lng];});
var line=L.polyline([],{color:'#1a1a1a',weight:2,dashArray:'4 6',opacity:0.55}).addTo(map);
var pinEls=[];
var strip=document.getElementById('strip');
stops.forEach(function(s,i){
  var icon=L.divIcon({
    className:'',
    html:'<span class="iui-pin-dot">'+(i+1)+'</span>',
    iconSize:[26,26],
    iconAnchor:[13,13]
  });
  var m=L.marker([s.lat,s.lng],{icon:icon}).addTo(map);
  var el=m.getElement();
  if(el){
    var dot=el.querySelector('.iui-pin-dot');
    if(dot) pinEls.push(dot);
  }
  var card=document.createElement('div');
  card.className='iui-stop-card';
  card.dataset.i=String(i);
  card.innerHTML='<div class="photo"><img src="'+s.img+'" alt="'+s.n+'" loading="eager" decoding="async"/></div><div class="body"><span class="num">'+(i+1)+'</span><span class="name">'+s.n+'</span><div class="meta">'+s.d+' · '+s.desc+'</div></div>';
  strip.appendChild(card);
});
map.fitBounds(L.latLngBounds(pts).pad(0.18));
map.invalidateSize();
var last=-1;
function activate(i){
  if(i===last) return;
  last=i;
  document.querySelectorAll('.iui-stop-card').forEach(function(c,idx){
    c.setAttribute('aria-current', idx===i ? 'true' : 'false');
  });
  var card=strip.children[i];
  if(card) strip.scrollLeft=Math.max(0, card.offsetLeft - strip.offsetLeft - 12);
  document.getElementById('status').textContent=stops[i].n+' · '+stops[i].d;
}
var tour=window.createTripAnimator({
  stopCount: stops.length,
  durationMs: 6000,
  pinElements: pinEls,
  map: map,
  onFrame: function(f){
    var count=f.pinIndex + (f.pinProgress >= 0.7 ? 1 : 0);
    line.setLatLngs(pts.slice(0, count));
    activate(f.activeStop);
  },
  onState: function(st){
    var p=document.getElementById('pause');
    p.disabled = st==='complete';
    p.textContent = st==='playing' ? 'Pause' : 'Resume';
  }
});
document.getElementById('pause').onclick=function(){
  if(this.textContent==='Pause') tour.pause(); else tour.play();
};
document.getElementById('replay').onclick=function(){ tour.replay(); };
strip.onclick=function(e){
  var c=e.target.closest('.iui-stop-card');
  if(!c) return;
  tour.seek(+c.dataset.i);
};
setTimeout(function(){ tour.play(); }, 400);
`.trim()

export const OIU_PATTERN_STARTERS: readonly HtmlSandboxStarter[] = [
  {
    id: 'itinerary-coast',
    title: '海岸行程（地图+播放+横滑）',
    summary: 'OpenIntelligentUI 密度：灰阶 Leaflet、pin 逐站落下、Pause/Replay、横滑景点卡+Wikimedia 实景图',
    spec: {
      title: '加州海岸三日',
      height: 560,
      css: '.disclaimer{font-size:11px;color:var(--color-text-tertiary);margin-top:4px}',
      html: '<div class="iui-itinerary" id="trip"><div class="iui-itinerary-head"><div><div class="iui-itinerary-title">加州海岸 · 三日</div><div class="iui-itinerary-sub">SF → Monterey → Big Sur</div></div><div class="iui-chip">3 天</div><div class="iui-chip">3 站</div></div><div class="iui-map-wrap"><div id="map" style="height:100%;width:100%"></div><div class="iui-map-chrome"><button type="button" id="pause">Pause</button><button type="button" id="replay">Replay</button><span class="iui-chip" id="status" role="status">准备中</span></div></div><div class="iui-cards-strip" id="strip"></div><p class="disclaimer">示意行程连线 — 非核实驾车路线 · © OSM</p></div>',
      js: ITINERARY_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },

  {
    id: 'weather-dense',
    title: '天气看板',
    summary: '渐变头图大气温 + 细节芯片 + Chart.js 折线 + 7 日可选卡',
    spec: {
      title: '上海天气',
      height: 560,
      css: ".iui-weather{display:flex;flex-direction:column;gap:14px}.iui-weather-hero{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:18px 20px;border-radius:var(--border-radius-xl);background:linear-gradient(135deg,var(--color-background-info),var(--color-background-secondary));border:1px solid var(--color-border-tertiary)}.iui-weather-hero .temp{font-size:56px;font-weight:700;letter-spacing:-.04em;line-height:1;color:var(--color-text-primary)}.iui-weather-hero .meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end;text-align:right}.iui-weather-hero .icon{font-size:42px;line-height:1}.iui-weather-chips{display:flex;flex-wrap:wrap;gap:8px}.iui-weather-chip{padding:8px 12px;border-radius:999px;background:var(--color-background-secondary);border:1px solid var(--color-border-tertiary);font-size:12px;color:var(--color-text-secondary)}.iui-weather-chip strong{color:var(--color-text-primary);font-weight:600;margin-left:4px}.iui-weather-chart{height:200px;position:relative;padding:8px 4px 0}.iui-weather-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.iui-weather-day{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:var(--border-radius-lg);border:1px solid var(--color-border-tertiary);background:var(--color-background-primary);cursor:pointer;font:inherit;color:inherit}.iui-weather-day[aria-current=\"true\"]{border-color:var(--color-border-info);background:var(--color-background-info);box-shadow:0 0 0 1px var(--color-border-info)}.iui-weather-day .wd{font-size:12px;font-weight:600}.iui-weather-day .dt{font-size:10px;color:var(--color-text-tertiary)}.iui-weather-day .ic{font-size:22px;line-height:1.2}.iui-weather-day .cd{font-size:11px;color:var(--color-text-secondary)}.iui-weather-day .rg{font-size:11px;font-weight:600}@media(max-width:560px){.iui-weather-days{grid-template-columns:repeat(4,minmax(0,1fr))}.iui-weather-hero .temp{font-size:44px}}",
      html: "<div class=\"iui-sandbox-card iui-weather\"><div class=\"iui-weather-hero\"><div><div class=\"iui-sandbox-muted\" id=\"hero-loc\">\u4e0a\u6d77 \u00b7 \u4eca\u65e5</div><div class=\"temp\" id=\"hero-temp\">26\u00b0</div><div class=\"iui-weather-chips\" style=\"margin-top:10px\"><span class=\"iui-weather-chip\">\u4f53\u611f<strong>24\u00b0</strong></span><span class=\"iui-weather-chip\">\u6e7f\u5ea6<strong>62%</strong></span><span class=\"iui-weather-chip\">\u4e1c\u5317\u98ce<strong>3 \u7ea7</strong></span><span class=\"iui-weather-chip\">\u7a7a\u6c14<strong>\u826f 68</strong></span></div></div><div class=\"meta\"><div class=\"icon\" id=\"hero-icon\">\u26c5</div><div id=\"hero-cond\" style=\"font-weight:600\">\u591a\u4e91</div><div class=\"iui-sandbox-muted\" id=\"hero-range\">26\u00b0 / 17\u00b0</div></div></div><div><div class=\"iui-sandbox-muted\" style=\"margin-bottom:6px\">\u4eca\u65e5\u9010\u65f6\u6c14\u6e29</div><div class=\"iui-weather-chart\"><canvas id=\"wxChart\"></canvas></div></div><div><div class=\"iui-sandbox-muted\" style=\"margin-bottom:8px\">\u672a\u6765 7 \u5929 \u00b7 \u70b9\u51fb\u5207\u6362</div><div class=\"iui-weather-days\" id=\"days\"></div></div><p class=\"iui-sandbox-muted\" style=\"font-size:11px\">\u793a\u4f8b\u6570\u636e \u00b7 \u672c\u5730\u5207\u6362\u4e0d\u8c03\u6a21\u578b</p></div>",
      js: "var days=[\n  {d:'\u4eca\u65e5',date:'10/11',icon:'\u26c5',cond:'\u591a\u4e91',hi:26,lo:17},\n  {d:'\u5468\u4e00',date:'10/12',icon:'\u2600\ufe0f',cond:'\u6674',hi:28,lo:18},\n  {d:'\u5468\u4e8c',date:'10/13',icon:'\u2600\ufe0f',cond:'\u6674',hi:27,lo:19},\n  {d:'\u5468\u4e09',date:'10/14',icon:'\ud83c\udf26\ufe0f',cond:'\u5c0f\u96e8',hi:24,lo:16},\n  {d:'\u5468\u56db',date:'10/15',icon:'\u26c5',cond:'\u591a\u4e91',hi:25,lo:17},\n  {d:'\u5468\u4e94',date:'10/16',icon:'\ud83c\udf27\ufe0f',cond:'\u4e2d\u96e8',hi:22,lo:15},\n  {d:'\u5468\u516d',date:'10/17',icon:'\u26c5',cond:'\u591a\u4e91',hi:23,lo:16}\n];\nvar hourly=[18,19,20,22,24,26,25,23,21];\nvar hourlyL=['08','10','12','14','16','18','20','22','24'];\nvar selected=0;\nfunction paintHero(i){\n  var x=days[i];\n  document.getElementById('hero-loc').textContent='\u4e0a\u6d77 \u00b7 '+x.date+' \u00b7 '+x.d;\n  document.getElementById('hero-temp').textContent=x.hi+'\u00b0';\n  document.getElementById('hero-cond').textContent=x.cond;\n  document.getElementById('hero-icon').textContent=x.icon;\n  document.getElementById('hero-range').textContent=x.hi+'\u00b0 / '+x.lo+'\u00b0';\n  document.querySelectorAll('.iui-weather-day').forEach(function(el,idx){\n    el.setAttribute('aria-current', idx===i?'true':'false');\n  });\n}\nfunction paintDays(){\n  var row=document.getElementById('days');\n  row.innerHTML='';\n  days.forEach(function(x,i){\n    var b=document.createElement('button');\n    b.type='button';\n    b.className='iui-weather-day';\n    b.innerHTML='<span class=\"wd\">'+x.d+'</span><span class=\"dt\">'+x.date+'</span><span class=\"ic\">'+x.icon+'</span><span class=\"cd\">'+x.cond+'</span><span class=\"rg\">'+x.hi+'\u00b0/'+x.lo+'\u00b0</span>';\n    b.onclick=function(){ selected=i; paintHero(i); window.iuiSandbox.action('weather_day',{i:i,day:x.d}); };\n    row.appendChild(b);\n  });\n  paintHero(selected);\n}\npaintDays();\n(function paintChart(){\n  var ctx=document.getElementById('wxChart');\n  if(!ctx) return;\n  var Chart=window.Chart;\n  if(!Chart){ setTimeout(paintChart, 40); return; }\n  if(window.iuiCreateChart){\n    window.iuiCreateChart(ctx,{\n      type:'line',\n      data:{labels:hourlyL,datasets:[{label:'\u6c14\u6e29',data:hourly,borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,.12)',fill:true,tension:.35,pointRadius:2,borderWidth:2}]},\n      options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:11},color:'#73726c'}},y:{beginAtZero:false,grid:{color:'rgba(0,0,0,.06)'},ticks:{font:{size:11},color:'#73726c',callback:function(v){return v+'\u00b0'}}}}}\n    });\n  } else {\n    new Chart(ctx,{type:'line',data:{labels:hourlyL,datasets:[{label:'\u6c14\u6e29',data:hourly,borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,.12)',fill:true,tension:.35,pointRadius:2,borderWidth:2}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:false}}}});\n  }\n  ctx.__iuiChartOk=true;\n  window.iuiSandbox&&window.iuiSandbox.resize();\n})();",
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'pricing-3col',
    title: 'SaaS 三列定价',
    summary: 'iui-compare-3 + featured 中间档',
    spec: {
      title: '定价方案',
      height: 420,
      css: '',
      html: '<div class="iui-itinerary"><div class="iui-itinerary-head"><div><div class="iui-itinerary-title">选择适合你的方案</div><div class="iui-itinerary-sub">按月计费 · 随时取消</div></div></div><div class="iui-compare-3"><div class="iui-tier"><h3>Starter</h3><div class="price">¥49 <small>/月</small></div><ul><li>1 个项目</li><li>基础分析</li><li>邮件支持</li></ul><button type="button" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;starter&quot;}">开始</button></div><div class="iui-tier featured"><h3>Pro <span class="iui-chip">推荐</span></h3><div class="price">¥129 <small>/月</small></div><ul><li>无限项目</li><li>高级分析</li><li>优先支持</li><li>团队席位 ×5</li></ul><button type="button" class="primary" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;pro&quot;}">升级 Pro</button></div><div class="iui-tier"><h3>Enterprise</h3><div class="price">定制</div><ul><li>SSO / SLA</li><li>专属成功经理</li><li>私有部署</li></ul><button type="button" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;ent&quot;}">联系销售</button></div></div></div>',
      js: '',
      stages: ['css', 'html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'hotel-covers',
    title: '酒店封面卡',
    summary: 'iui-hotel-card + Wikimedia covers（非行程）',
    spec: {
      title: '上海精选酒店',
      height: 420,
      css: '.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media(max-width:480px){.grid{grid-template-columns:1fr}}',
      html: '<div class="iui-itinerary"><div class="iui-itinerary-head"><div><div class="iui-itinerary-title">上海 · 精选住宿</div><div class="iui-itinerary-sub">示意封面 · Wikimedia</div></div><div class="iui-chip">3 家</div></div><div class="grid"><div class="iui-hotel-card" data-iui-place="上海"><div class="photo"></div><div class="body"><div class="name">外滩悦榕庄</div><div class="meta">外滩景观 · ¥2,800 起</div></div></div><div class="iui-hotel-card" data-iui-place="豫园"><div class="photo"></div><div class="body"><div class="name">豫园附近精品酒店</div><div class="meta">城隍庙商圈 · ¥980 起</div></div></div><div class="iui-hotel-card" data-iui-place="陆家嘴"><div class="photo"></div><div class="body"><div class="name">陆家嘴商务酒店</div><div class="meta">金融区 · ¥1,260 起</div></div></div></div><p class="disclaimer">示意封面 · 非实时房价</p></div>',
      js: '',
      stages: ['css', 'html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
]
