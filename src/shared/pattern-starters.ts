/**
 * Sandbox pattern starters for ```iui-html (template drawer, settings preview, prompt examples).
 *
 * visual(②/⑧): the six page templates (itinerary, weather, pricing, hotels, meeting rooms,
 * kanban) are written the daisyUI way — `card` / `btn` / `badge` / `stats` / `tabs-box` /
 * `progress` / `avatar` on the IUI 中性 tokens (`--color-base-*`, `--color-primary`,
 * `--radius-box`), muted text via `text-base-content/70|60`. Tailwind utilities are
 * compiled per page (visual ③), but starters keep layout in their own `css` so they stay readable. Host hooks are kept on purpose:
 * `.iui-map-wrap` + `createTripAnimator` + `.iui-pin-dot` (map fixes, declutter, replay),
 * `.iui-stop-card` / `.iui-hotel-card` + `data-iui-place` (verified photo fill),
 * `.iui-badge-sample` (sample-data tag), `data-iui-icon` (local Lucide).
 * Kept separate so long JS strings stay readable.
 */
import type { HtmlSandboxStarter } from './html-sandbox.ts'

/** Shared header / footnote rules (title + one-line context on the left, chips or a segmented control on the right). */
const HEAD_CSS = '.hd{display:flex;align-items:flex-start;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}'
  + '.hd h2{margin:0;font-size:var(--fs-lg);font-weight:600;letter-spacing:-.01em;line-height:1.3}'
  + '.hd .sub{margin-top:2px;font-size:var(--fs-sm)}.hd .chips{display:flex;gap:6px}'
  + '.foot{font-size:var(--fs-xs)}'

const ITINERARY_JS = `
var stops=[
  {n:'旧金山',d:'Day 1',lat:37.8199,lng:-122.4783,desc:'金门大桥 · 渔人码头',plan:'金门大桥观景台 → 渔人码头 → 九曲花街。傍晚去 Presidio 看海湾日落，晚上住联合广场附近。',img:'https://commons.wikimedia.org/wiki/Special:FilePath/GoldenGateBridge-001.jpg?width=480'},
  {n:'蒙特雷',d:'Day 2',lat:36.6002,lng:-121.8947,desc:'水族馆 · 17 英里海岸',plan:'上午蒙特雷湾水族馆（建议提前买票）→ 罐头厂街午餐 → 下午自驾 17 英里海岸，晚上住卡梅尔。',img:'https://commons.wikimedia.org/wiki/Special:FilePath/Monterey_Bay.jpg?width=480'},
  {n:'大苏尔',d:'Day 3',lat:36.2704,lng:-121.8081,desc:'比克斯比大桥 · 麦克维瀑布',plan:'比克斯比溪大桥观景台 → 普菲弗海滩 → 麦克维瀑布。沿 1 号公路南行约 2 小时，日落前返回卡梅尔。',img:'https://commons.wikimedia.org/wiki/Special:FilePath/Bixby_Creek_Bridge.jpg?width=480'}
];
// Each leg ends at its stop; the polyline grows leg by leg as the tour plays.
var legs=[
  [[37.8199,-122.4783]],
  [[37.55,-122.5],[37.1,-122.3],[36.97,-122.03],[36.85,-121.8],[36.6002,-121.8947]],
  [[36.45,-121.93],[36.2704,-121.8081]]
];
var cs=getComputedStyle(document.documentElement);
var dark=/dark/.test(cs.colorScheme||'')||matchMedia('(prefers-color-scheme: dark)').matches;
var toHex=window.__iuiCssColor||function(v){return v;};
var ink=toHex(cs.getPropertyValue('--color-base-content').trim()||'#0a0a0a');
var map=L.map('map',{scrollWheelZoom:false,zoomControl:false,zoomSnap:0.25}).setView([36.8,-121.6],7);
// ⑧: light / dark grey basemap, the ink route carries the colour.
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_'+(dark?'Dark':'Light')+'_Gray_Base/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:16}).addTo(map);
var pts=stops.map(function(s){return [s.lat,s.lng];});
var line=L.polyline([],{color:ink,weight:3,opacity:0.85,lineJoin:'round'}).addTo(map);
var pinEls=[];
var strip=document.getElementById('strip');
var seg=document.getElementById('days');
stops.forEach(function(s,i){
  var icon=L.divIcon({className:'',html:'<span class="iui-pin-dot">'+(i+1)+'</span>',iconSize:[26,26],iconAnchor:[13,13]});
  var m=L.marker([s.lat,s.lng],{icon:icon}).addTo(map);
  m.bindTooltip(s.n,{permanent:true,direction:'right',offset:[14,0],className:'iui-map-label'});
  m.on('click',function(){ tour.seek(i); });
  var el=m.getElement();
  if(el){ var dot=el.querySelector('.iui-pin-dot'); if(dot) pinEls.push(dot); }
  var card=document.createElement('button');
  card.type='button';
  card.className='iui-stop-card';
  card.dataset.i=String(i);
  card.innerHTML='<div class="photo"><img src="'+s.img+'" alt="'+s.n+'" loading="eager" decoding="async"/></div><div class="body"><span class="num">'+(i+1)+'</span><div class="tx"><div class="name">'+s.d+' · '+s.n+'</div><div class="meta">'+s.desc+'</div></div></div>';
  strip.appendChild(card);
  var b=document.createElement('button');
  b.type='button';
  b.className='tab';
  b.setAttribute('role','tab');
  b.dataset.i=String(i);
  b.textContent=s.d;
  seg.appendChild(b);
});
map.fitBounds(L.latLngBounds(pts).pad(0.25));
map.invalidateSize();
var last=-1;
function activate(i){
  if(i===last) return;
  last=i;
  strip.querySelectorAll('.iui-stop-card').forEach(function(c,idx){ c.setAttribute('aria-current', idx===i ? 'true' : 'false'); });
  seg.querySelectorAll('.tab').forEach(function(t,idx){ t.classList.toggle('tab-active', idx===i); t.setAttribute('aria-selected', idx===i ? 'true' : 'false'); });
  var card=strip.children[i];
  if(card && strip.scrollWidth>strip.clientWidth) strip.scrollLeft=Math.max(0, card.offsetLeft - strip.offsetLeft - 12);
  var s=stops[i];
  document.getElementById('status').textContent=s.d+' · '+s.n;
  document.getElementById('sheet').innerHTML='<span class="pn">'+(i+1)+'</span><div><div class="st">'+s.d+' · '+s.n+'</div><p class="text-base-content/70">'+s.plan+'</p></div>';
}
var tour=window.createTripAnimator({
  stopCount: stops.length,
  durationMs: 6000,
  pinElements: pinEls,
  map: map,
  onFrame: function(f){
    var count=f.pinIndex + (f.pinProgress >= 0.7 ? 1 : 0);
    var path=[];
    for(var k=0;k<count && k<legs.length;k++) path=path.concat(legs[k]);
    line.setLatLngs(path);
    activate(f.activeStop);
  },
  onState: function(st){
    var p=document.getElementById('pause');
    p.disabled = st==='complete';
    p.textContent = st==='playing' ? '暂停' : '继续';
  }
});
document.getElementById('pause').onclick=function(){
  if(this.textContent==='暂停') tour.pause(); else tour.play();
};
document.getElementById('replay').onclick=function(){ tour.replay(); };
strip.onclick=function(e){
  var c=e.target.closest('.iui-stop-card');
  if(c) tour.seek(+c.dataset.i);
};
seg.onclick=function(e){
  var t=e.target.closest('.tab');
  if(t) tour.seek(+t.dataset.i);
};
setTimeout(function(){ tour.play(); }, 400);
`.trim()

const ITINERARY_CSS = HEAD_CSS
  + '.trip{gap:16px}'
  + '.mapbox{position:relative;height:300px;border-radius:var(--radius-box);border:1px solid var(--color-base-300);background:var(--color-base-200)}'
  + '.mapbar{position:absolute;left:12px;bottom:12px;z-index:500;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px)}'
  + '.mapbar .tabs-box,.mapbar .join{background:var(--color-base-100);border:1px solid var(--color-base-300);box-shadow:none;border-radius:999px;padding:2px}'
  + '.mapbar .join .btn{border-radius:999px;border:0}.mapbar .tab{border-radius:999px}'
  + '.leaflet-tooltip.iui-map-label{background:var(--color-base-100);color:var(--color-base-content);border:1px solid var(--color-base-300);border-radius:999px;box-shadow:none;padding:1px 8px;font-weight:500}'
  + '.leaflet-tooltip.iui-map-label:before{display:none}'
  + '.stops{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;overflow:visible;padding:0}'
  + '.stops .iui-stop-card{display:block;width:auto;min-width:0;padding:0;text-align:left;font:inherit;color:inherit;border:1px solid var(--color-base-300);border-radius:var(--radius-box);background:var(--color-base-100);box-shadow:none}'
  + '.stops .iui-stop-card[aria-current="true"]{border-color:var(--color-base-content);box-shadow:none}'
  + '.stops .iui-stop-card .photo{height:96px}'
  + '.stops .iui-stop-card .body{display:flex;gap:10px;align-items:flex-start;padding:10px 12px}'
  + '.stops .iui-stop-card .num{flex:none;margin:1px 0 0}.stops .iui-stop-card .tx{min-width:0}'
  + '.stops .iui-stop-card .name{font-size:var(--fs-sm);font-weight:500}'
  + '.stops .iui-stop-card .meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.sheet{display:flex;gap:12px;padding:14px 16px;border-radius:var(--radius-box);background:var(--color-base-200)}'
  + '.sheet .pn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:var(--color-primary);color:var(--color-primary-content);font-size:var(--fs-xs);font-weight:600}'
  + '.sheet .st{font-weight:500}.sheet p{margin:2px 0 0;font-size:var(--fs-sm);line-height:1.6}'
  + '.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
  + '@media(max-width:520px){.stops{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.stops .iui-stop-card{flex:0 0 72%;scroll-snap-align:start}.mapbox{height:260px}}'

const ITINERARY_HTML = '<div class="card border"><div class="card-body trip">'
  + '<div class="hd"><div><h2>加州海岸 · 三日</h2><div class="sub text-base-content/70">旧金山 → 蒙特雷 → 大苏尔 · 约 250 km</div></div><div class="chips"><span class="badge badge-soft">3 天</span><span class="badge badge-soft">3 站</span></div></div>'
  + '<div class="mapbox iui-map-wrap"><div id="map" style="height:100%;width:100%"></div>'
  + '<div class="mapbar"><div class="join"><button type="button" class="btn btn-xs btn-ghost join-item" id="pause">暂停</button><button type="button" class="btn btn-xs btn-ghost join-item" id="replay">重播</button></div>'
  + '<div class="tabs tabs-box tabs-xs" role="tablist" id="days" aria-label="按天查看"></div></div></div>'
  + '<div class="iui-cards-strip stops" id="strip"></div>'
  + '<div class="sheet" id="sheet" aria-live="polite"><span class="pn">1</span><div><div class="st">点地图上的编号或下方卡片</div><p class="text-base-content/70">看当天路线、停留和怎么去</p></div></div>'
  + '<span class="vh" id="status" role="status">准备中</span>'
  + '<div class="foot text-base-content/60">示意行程连线 — 非核实驾车路线 · 图片来自 Wikimedia Commons · 地图 © Esri</div>'
  + '</div></div>'

const WEATHER_JS = `
var days=[
  {d:'今天',date:'10/11',icon:'cloud-sun',cond:'多云',lo:17,hi:26,feel:24,hum:62,wind:'东北风 3 级',aqi:68},
  {d:'周日',date:'10/12',icon:'sun',cond:'晴',lo:18,hi:28,feel:27,hum:48,wind:'东风 2 级',aqi:55},
  {d:'周一',date:'10/13',icon:'sun',cond:'晴',lo:19,hi:27,feel:26,hum:52,wind:'东南风 2 级',aqi:61},
  {d:'周二',date:'10/14',icon:'cloud-rain',cond:'小雨',lo:16,hi:24,feel:22,hum:84,wind:'北风 4 级',aqi:42},
  {d:'周三',date:'10/15',icon:'cloud',cond:'阴',lo:16,hi:25,feel:23,hum:76,wind:'北风 3 级',aqi:47},
  {d:'周四',date:'10/16',icon:'cloud-rain',cond:'中雨',lo:15,hi:22,feel:19,hum:90,wind:'西北风 4 级',aqi:38},
  {d:'周五',date:'10/17',icon:'cloud-sun',cond:'多云',lo:16,hi:23,feel:21,hum:70,wind:'北风 3 级',aqi:51}
];
var H=['08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00','00:00'];
var T=[18,19.5,22,24.5,26,25.5,23,21,19];
var NOW=3;
var MIN=14, MAX=30;
function aqiBadge(v){ return v<=50?['优','badge-success']:v<=100?['良','badge-success']:['轻度','badge-warning']; }
function paintHero(i){
  var x=days[i];
  document.getElementById('when').textContent='上海 · '+x.date+' '+x.d+(i===0?' · 14:00 更新':' · 预报');
  document.getElementById('temp').textContent=(i===0?26:x.hi)+'°';
  document.getElementById('cond').textContent=x.cond;
  document.getElementById('range').textContent='最高 '+x.hi+'° · 最低 '+x.lo+'°';
  document.getElementById('icon').setAttribute('data-iui-icon',x.icon);
  document.getElementById('fFeel').textContent=x.feel+'°';
  document.getElementById('fHum').textContent=x.hum+'%';
  var wd=x.wind.split(' ');
  document.getElementById('fWindK').textContent=wd[0];
  document.getElementById('fWind').textContent=wd.slice(1).join(' ');
  var q=aqiBadge(x.aqi);
  document.getElementById('fAqi').innerHTML='<span class="num">'+x.aqi+'</span> <span class="badge badge-sm badge-soft '+q[1]+'">'+q[0]+'</span>';
  document.querySelectorAll('#wk .day').forEach(function(el,idx){ el.setAttribute('aria-current', idx===i?'true':'false'); });
}
var wk=document.getElementById('wk');
days.forEach(function(x,i){
  var b=document.createElement('button');
  b.type='button';
  b.className='day';
  var left=(x.lo-MIN)/(MAX-MIN)*100, right=(MAX-x.hi)/(MAX-MIN)*100;
  b.innerHTML='<span class="dn">'+x.d+'<span class="dt num text-base-content/60">'+x.date+'</span></span>'
    +'<span class="ic'+(x.icon==='cloud-rain'?' text-info':'')+'"><i data-iui-icon="'+x.icon+'"></i></span>'
    +'<span class="cd text-base-content/70">'+x.cond+'</span>'
    +'<span class="lo num text-base-content/70">'+x.lo+'°</span>'
    +'<span class="bar"><i style="left:'+left+'%;right:'+right+'%"></i></span>'
    +'<span class="hi num">'+x.hi+'°</span>';
  b.onclick=function(){ paintHero(i); window.iuiSandbox.action('weather_day',{i:i,day:x.d}); };
  wk.appendChild(b);
});
paintHero(0);
(function draw(){
  var el=document.getElementById('hr');
  if(!el) return;
  if(!window.echarts){ setTimeout(draw, 40); return; }
  var chart=echarts.init(el,undefined,{renderer:'svg'});
  var toHex=window.__iuiCssColor||function(v){return v;};
  var ink=toHex(getComputedStyle(document.documentElement).getPropertyValue('--color-base-content').trim()||'#0a0a0a');
  chart.setOption({
    grid:{left:18,right:18,top:28,bottom:24},
    tooltip:{trigger:'axis',valueFormatter:function(v){return v+'°';}},
    xAxis:{type:'category',data:H,boundaryGap:false,axisLine:{show:false},axisTick:{show:false},splitLine:{show:false}},
    yAxis:{type:'value',min:15,show:false},
    series:[{type:'line',data:T,smooth:0.35,symbol:'circle',showSymbol:true,
      symbolSize:function(v,p){return p.dataIndex===NOW?9:0;},
      lineStyle:{width:2},areaStyle:{opacity:0.08},
      label:{show:true,fontSize:12,color:ink,textBorderWidth:0,formatter:function(p){return p.dataIndex===NOW?'现在 '+p.value+'°':(p.dataIndex===0||p.dataIndex===5||p.dataIndex===8)?p.value+'°':'';}},
      markLine:{silent:true,symbol:'none',data:[{xAxis:NOW}],lineStyle:{type:'dashed',opacity:0.35},label:{show:false}}
    }]
  });
  window.addEventListener('resize',function(){ chart.resize(); });
  window.iuiSandbox&&window.iuiSandbox.resize();
})();
`.trim()

const WEATHER_CSS = '.wx{gap:20px}'
  + '.wx .top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}'
  + '.wx .now{display:flex;align-items:flex-end;gap:12px;margin-top:4px}'
  + '.wx .temp{font-size:56px;font-weight:600;letter-spacing:-.03em;line-height:1}'
  + '.wx .cond{font-weight:500}.wx .sm{font-size:var(--fs-sm)}'
  + '.wx .big{font-size:52px;line-height:1;opacity:.85}'
  + '.wx .facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--color-base-300);border-radius:var(--radius-box);font-size:var(--fs-sm)}'
  + '.wx .facts>div{padding:10px 14px;min-width:0}.wx .facts>div+div{border-left:1px solid var(--color-base-300)}'
  + '.wx .facts .k{font-size:var(--fs-xs)}.wx .facts .v{font-weight:600;margin-top:2px;white-space:nowrap}'
  + '.wx .lbl{font-size:var(--fs-sm);font-weight:500}'
  + '.wx .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}'
  + '.wx .hr{height:150px}'
  + '.wx .day{display:grid;grid-template-columns:96px 24px 44px 32px 1fr 32px;align-items:center;gap:10px;width:100%;padding:8px 6px;border:0;border-top:1px solid var(--color-base-300);border-radius:0;background:none;font:inherit;font-size:var(--fs-sm);color:inherit;text-align:left;cursor:pointer;min-height:0}'
  + '.wx .day:first-child{border-top:0}.wx .day:hover{background:var(--color-base-200)}'
  + '.wx .day[aria-current="true"]{background:var(--color-base-200)}.wx .day[aria-current="true"] .dn{font-weight:600}'
  + '.wx .dn{white-space:nowrap}.wx .dt{font-size:var(--fs-xs);margin-left:6px;font-weight:400}'
  + '.wx .ic{font-size:18px;line-height:1;display:flex}.wx .lo{text-align:right}.wx .hi{font-weight:500}'
  + '.wx .bar{position:relative;height:6px;border-radius:999px;background:var(--color-base-200)}'
  + '.wx .day[aria-current="true"] .bar{background:var(--color-base-300)}'
  + '.wx .bar i{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--color-base-content)}'
  + '@media(max-width:520px){.wx .facts{grid-template-columns:repeat(2,minmax(0,1fr))}.wx .facts>div:nth-child(3){border-left:0}.wx .facts>div:nth-child(n+3){border-top:1px solid var(--color-base-300)}'
  + '.wx .day{grid-template-columns:72px 20px 28px 1fr 28px;gap:8px}.wx .day .cd{display:none}.wx .temp{font-size:48px}.wx .big{font-size:40px}}'

const WEATHER_HTML = '<div class="card border"><div class="card-body wx">'
  + '<div class="top"><div><div class="sm text-base-content/70" id="when">上海 · 10/11 今天 · 14:00 更新</div>'
  + '<div class="now"><span class="temp num" id="temp">26°</span><div style="padding-bottom:4px"><div class="cond" id="cond">多云</div><div class="sm num text-base-content/70" id="range">最高 26° · 最低 17°</div></div></div></div>'
  + '<i class="big" id="icon" data-iui-icon="cloud-sun"></i></div>'
  + '<div class="facts"><div><div class="k text-base-content/70">体感</div><div class="v num" id="fFeel">24°</div></div>'
  + '<div><div class="k text-base-content/70">湿度</div><div class="v num" id="fHum">62%</div></div>'
  + '<div><div class="k text-base-content/70" id="fWindK">东北风</div><div class="v num" id="fWind">3 级</div></div>'
  + '<div><div class="k text-base-content/70">空气</div><div class="v" id="fAqi"><span class="num">68</span> <span class="badge badge-sm badge-soft badge-success">良</span></div></div></div>'
  + '<div><div class="row"><div class="lbl">今日逐时</div><span class="iui-badge-sample"></span></div><div class="hr" id="hr"></div></div>'
  + '<div><div class="row"><div class="lbl">未来 7 天</div><span class="badge badge-sm badge-soft badge-warning">周二起降温</span></div><div id="wk"></div></div>'
  + '</div></div>'

const PRICING_CSS = HEAD_CSS
  + '.px{gap:20px}'
  + '.tiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}'
  + '.tier{display:flex;flex-direction:column;gap:16px;padding:20px;border:1px solid var(--color-base-300);border-radius:var(--radius-box)}'
  + '.tier.hot{background:var(--color-neutral);color:var(--color-neutral-content);border-color:var(--color-neutral)}'
  + '.tier .nm{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:600}'
  + '.tier .ds{font-size:var(--fs-xs);margin-top:2px}.tier.hot .ds,.tier.hot .u{opacity:.7}'
  + '.tier .pr{display:flex;align-items:baseline;gap:4px}.tier .p{font-size:36px;font-weight:600;letter-spacing:-.02em;line-height:1.1}.tier .u{font-size:var(--fs-sm)}'
  + '.tier ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;flex:1;align-content:start;font-size:var(--fs-sm)}'
  + '.tier li{display:flex;gap:8px;align-items:center}.tier li i{opacity:.7}'
  + '.tier .badge-hot{background:color-mix(in oklab,var(--color-neutral-content) 16%,transparent);color:inherit;border:0}'
  + '.tier .btn{width:100%}.tier:not(.hot) .btn{border-color:var(--color-base-300)}'
  + '.tier.hot .btn{background:var(--color-neutral-content);color:var(--color-neutral);border-color:var(--color-neutral-content)}'
  + '.note{text-align:center;font-size:var(--fs-xs)}'
  + '@media(max-width:560px){.tiers{grid-template-columns:1fr}.tier.hot{order:-1}}'

const PRICING_HTML = '<div class="card border"><div class="card-body px">'
  + '<div class="hd"><div><h2>选择适合你的方案</h2><div class="sub text-base-content/70" id="cycNote">按月计费 · 随时取消</div></div>'
  + '<div class="tabs tabs-box tabs-xs" role="tablist" id="cyc"><button type="button" role="tab" class="tab tab-active" data-c="m" aria-selected="true">按月</button><button type="button" role="tab" class="tab" data-c="y" aria-selected="false">按年&nbsp;<span class="text-success">−20%</span></button></div></div>'
  + '<div class="tiers">'
  + '<div class="tier"><div><div class="nm">Starter</div><div class="ds text-base-content/70">个人与小项目</div></div><div class="pr"><span class="p num" data-m="¥49" data-y="¥39">¥49</span><span class="u text-base-content/70">/月</span></div><ul><li><i data-iui-icon="check"></i>1 个项目</li><li><i data-iui-icon="check"></i>基础分析</li><li><i data-iui-icon="check"></i>邮件支持</li></ul><button type="button" class="btn btn-sm btn-outline" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;starter&quot;}">开始使用</button></div>'
  + '<div class="tier hot"><div><div class="nm">Pro<span class="badge badge-sm badge-hot">最受欢迎</span></div><div class="ds">成长中的团队</div></div><div class="pr"><span class="p num" data-m="¥129" data-y="¥103">¥129</span><span class="u">/月</span></div><ul><li><i data-iui-icon="check"></i>无限项目</li><li><i data-iui-icon="check"></i>高级分析</li><li><i data-iui-icon="check"></i>优先支持</li><li><i data-iui-icon="check"></i>团队席位 ×5</li></ul><button type="button" class="btn btn-sm" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;pro&quot;}">升级 Pro</button></div>'
  + '<div class="tier"><div><div class="nm">Enterprise</div><div class="ds text-base-content/70">合规与规模</div></div><div class="pr"><span class="p">定制</span></div><ul><li><i data-iui-icon="check"></i>SSO / SLA</li><li><i data-iui-icon="check"></i>专属成功经理</li><li><i data-iui-icon="check"></i>私有部署</li></ul><button type="button" class="btn btn-sm btn-outline" data-iui-action="pick" data-iui-payload="{&quot;tier&quot;:&quot;ent&quot;}">联系销售</button></div>'
  + '</div>'
  + '<div class="note text-base-content/60">所有方案均含 14 天免费试用 · 价格不含税</div>'
  + '</div></div>'

const PRICING_JS = `
document.getElementById('cyc').onclick=function(e){
  var t=e.target.closest('.tab'); if(!t) return;
  var c=t.dataset.c;
  this.querySelectorAll('.tab').forEach(function(x){ var on=x===t; x.classList.toggle('tab-active',on); x.setAttribute('aria-selected',on?'true':'false'); });
  document.querySelectorAll('.p[data-m]').forEach(function(p){ p.textContent=p.dataset[c]; });
  document.getElementById('cycNote').textContent=c==='y'?'按年计费 · 折合每月 · 随时取消':'按月计费 · 随时取消';
};
`.trim()

const HOTELS_CSS = HEAD_CSS
  + '.ht{gap:16px}'
  + '.hs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'
  + '.hs .iui-hotel-card{position:relative;display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--color-base-300);border-radius:var(--radius-box);background:var(--color-base-100)}'
  + '.hs .iui-hotel-card .photo{height:auto;aspect-ratio:4/3;background-color:var(--color-base-200)}'
  + '.hs .pick{position:absolute;left:8px;top:8px;border:0;background:color-mix(in oklab,var(--color-base-100) 90%,transparent);color:var(--color-base-content)}'
  + '.hs .b{display:flex;flex-direction:column;gap:6px;flex:1;padding:12px}'
  + '.hs .t{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}'
  + '.hs .iui-hotel-card .name{padding:0;font-size:var(--fs-sm);font-weight:500;line-height:1.4}'
  + '.hs .rate{display:inline-flex;align-items:center;gap:2px;flex:none;font-size:var(--fs-xs);font-weight:500}'
  + '.hs .area{display:flex;align-items:center;gap:4px;font-size:var(--fs-xs)}'
  + '.hs .tags{display:flex;gap:4px;flex-wrap:wrap}'
  + '.hs .price{margin-top:auto;padding-top:4px}.hs .price .num{font-size:var(--fs-lg);font-weight:600}.hs .price .u{font-size:var(--fs-xs)}'
  + '.ht .ft{display:flex;align-items:center;justify-content:space-between;gap:8px}'
  + '@media(max-width:560px){.hs{grid-template-columns:1fr}.hs .iui-hotel-card .photo{aspect-ratio:16/9}}'

function hotelCard(place: string, name: string, area: string, rate: string, tags: readonly string[], price: string, pick = false): string {
  return `<article class="iui-hotel-card" data-iui-place="${place}"><div class="photo"></div>${pick ? '<span class="badge badge-sm pick">编辑推荐</span>' : ''}`
    + `<div class="b"><div class="t"><div class="name">${name}</div><span class="rate num"><i data-iui-icon="star"></i>${rate}</span></div>`
    + `<div class="area text-base-content/70"><i data-iui-icon="map-pin"></i>${area}</div>`
    + `<div class="tags">${tags.map((t) => `<span class="badge badge-sm badge-ghost">${t}</span>`).join('')}</div>`
    + `<div class="price"><span class="num">${price}</span><span class="u text-base-content/70"> /晚起</span></div></div></article>`
}

const HOTELS_HTML = '<div class="card border"><div class="card-body ht">'
  + '<div class="hd"><div><h2>上海 · 精选住宿</h2><div class="sub text-base-content/70">10/11–10/13 · 2 晚 · 2 位成人</div></div><span class="badge badge-soft">3 家</span></div>'
  + '<div class="hs">'
  + hotelCard('上海', '外滩悦榕庄', '外滩 · 江景', '4.8', ['江景', '行政酒廊'], '¥2,800', true)
  + hotelCard('豫园', '豫园附近精品酒店', '城隍庙商圈', '4.6', ['含早', '步行 3 分钟'], '¥980')
  + hotelCard('陆家嘴', '陆家嘴商务酒店', '金融区', '4.5', ['地铁直达', '健身房'], '¥1,260')
  + '</div>'
  + '<div class="ft"><span class="foot text-base-content/60">示意封面 · 非实时房价 · 图片来自 Wikimedia Commons</span><button type="button" class="btn btn-xs btn-ghost" id="more">查看更多<i data-iui-icon="arrow-right"></i></button></div>'
  + '</div></div>'

const HOTELS_JS = "document.getElementById('more').onclick=function(){ window.iuiSandbox.sendPrompt('再推荐 3 家上海酒店，10/11–10/13 两晚'); };"

/** D-补充 → ⑧: meeting-room board — grey occupancy + red "now" line, state badges, buttons by state. */
const MEETING_ROOMS_JS = `
var NOW=10.5, S=8, E=20;
var rooms=[
  {n:'星河厅',f:'3F',cap:20,b:[[9,10],[10,12],[14,15.5]],m:'季度规划评审'},
  {n:'松风',f:'3F',cap:8,b:[[13,14],[16,17]],m:''},
  {n:'云杉',f:'5F',cap:6,b:[[10.75,11.5],[15,16]],m:'候选人面试'},
  {n:'海棠',f:'5F',cap:12,b:[[9.5,11],[11,12.5]],m:'设计周会'},
  {n:'竹影（电话间）',f:'6F',cap:2,b:[],m:''},
  {n:'远山',f:'6F',cap:16,b:[[17,18.5]],m:''}
];
var BADGE={busy:'badge-error',soon:'badge-warning',free:'badge-success'};
function pc(h){ return (h-S)/(E-S)*100; }
function state(r){
  for(var i=0;i<r.b.length;i++){var s=r.b[i];if(NOW>=s[0]&&NOW<s[1])return {k:'busy',t:'使用中',until:s[1]};}
  for(var j=0;j<r.b.length;j++){var x=r.b[j];if(x[0]>NOW&&x[0]-NOW<=0.5)return {k:'soon',t:'即将开始',at:x[0]};}
  return {k:'free',t:'空闲'};
}
function next(r){ for(var i=0;i<r.b.length;i++){ if(r.b[i][0]>NOW) return r.b[i][0]; } return null; }
function hm(v){var h=Math.floor(v),m=Math.round((v-h)*60);return h+':'+(m<10?'0':'')+m;}
var filter='all';
function render(){
  var free=0,busy=0,total=0,used=0;
  rooms.forEach(function(r){var st=state(r);if(st.k==='busy')busy++;else free++;total+=r.b.length;r.b.forEach(function(s){used+=s[1]-s[0];});});
  document.getElementById('sFree').firstChild.nodeValue=String(free);
  document.getElementById('sBusy').firstChild.nodeValue=String(busy);
  document.getElementById('sTotal').firstChild.nodeValue=String(total);
  document.getElementById('sUse').firstChild.nodeValue=String(Math.round(used/(rooms.length*(E-S))*100));
  var grid=document.getElementById('rooms');grid.innerHTML='';
  var gantt=document.getElementById('gantt');gantt.innerHTML='';
  rooms.forEach(function(r,i){
    var st=state(r);
    if(filter!=='all'&&!(filter==='free'?st.k!=='busy':st.k==='busy'))return;
    var bars=r.b.map(function(s){var on=NOW>=s[0]&&NOW<s[1];return '<i class="'+(on?'on':'')+'" style="left:'+pc(s[0])+'%;width:'+(pc(s[1])-pc(s[0]))+'%"></i>';}).join('');
    var nx=next(r);
    var line=st.k==='busy'?(r.m||'已预订')+' · 至 '+hm(st.until):st.k==='soon'?hm(st.at)+' 开始':nx!==null?'下一场 '+hm(nx):'今日无预订';
    var el=document.createElement('article');
    el.className='room';
    el.innerHTML='<div class="top"><div class="nm">'+r.n+'</div><span class="badge badge-sm badge-soft '+BADGE[st.k]+'">'+st.t+'</span></div>'+
      '<div class="meta text-base-content/70">'+r.f+' · '+r.cap+' 人 · '+line+'</div>'+
      '<button type="button" class="btn btn-sm '+(st.k==='busy'?'btn-outline':'btn-neutral')+'" data-i="'+i+'">'+(st.k==='busy'?'查看日程':'预订')+'</button>';
    grid.appendChild(el);
    var row=document.createElement('div');
    row.className='gr';
    row.innerHTML='<span class="rn">'+r.n+'</span><div class="tl" aria-label="'+r.n+' 8:00–20:00 预订情况">'+bars+'</div>';
    gantt.appendChild(row);
  });
  document.getElementById('nowLine').style.left=pc(NOW)+'%';
}
document.getElementById('rooms').onclick=function(e){
  var b=e.target.closest('button[data-i]');if(!b)return;
  var r=rooms[+b.dataset.i];
  window.iuiSandbox.action('book_room',{room:r.n,floor:r.f,capacity:r.cap});
};
document.getElementById('flt').onclick=function(e){
  var b=e.target.closest('.tab');if(!b)return;
  filter=b.dataset.f;
  this.querySelectorAll('.tab').forEach(function(x){var on=x===b;x.classList.toggle('tab-active',on);x.setAttribute('aria-selected',on?'true':'false');});
  render();
};
render();
`.trim()

const MEETING_ROOMS_CSS = HEAD_CSS
  + '.mr{gap:20px}'
  + '.mr .stats{display:grid;grid-auto-flow:row;grid-template-columns:repeat(4,minmax(0,1fr));width:100%;overflow:hidden}'
  + '.mr .stat{padding:12px 16px;min-width:0}.mr .stat-title{font-size:var(--fs-xs);white-space:normal}'
  + '.mr .stat-value{font-size:28px;font-weight:600;line-height:1.2}.mr .stat-value .unit{font-size:var(--fs-sm);font-weight:400;margin-left:2px}'
  + '.mr .lbl{font-size:var(--fs-sm);font-weight:500;margin-bottom:8px}'
  + '.mr .ticks{position:relative;height:18px;font-size:var(--fs-xs)}.mr .ticks span{position:absolute;transform:translateX(-50%);white-space:nowrap}.mr .ticks span:first-child{transform:none}.mr .ticks span:last-child{transform:translateX(-100%)}'
  + '.mr .gwrap{position:relative}'
  + '.mr .gr{display:grid;grid-template-columns:112px 1fr;column-gap:12px;align-items:center;height:28px}.mr .gr.tk{height:20px}'
  + '.mr .rn{font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.mr .tl{position:relative;height:14px;border-radius:999px;background:var(--color-base-200)}'
  + '.mr .tl i{position:absolute;top:0;bottom:0;border-radius:999px;background:color-mix(in oklab,var(--color-base-content) 28%,var(--color-base-100))}'
  + '.mr .tl i.on{background:var(--color-base-content)}'
  + '.mr .nowtrack{position:absolute;top:0;bottom:0;left:124px;right:0;pointer-events:none}'
  + '.mr .now{position:absolute;top:-4px;bottom:0;width:2px;margin-left:-1px;background:var(--color-error)}'
  + '.mr .now:before{content:"";position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:999px;background:var(--color-error)}'
  + '.mr .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'
  + '.mr .room{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--color-base-300);border-radius:var(--radius-box)}'
  + '.mr .room .top{display:flex;align-items:center;justify-content:space-between;gap:8px}.mr .room .nm{font-weight:500}'
  + '.mr .room .meta{font-size:var(--fs-xs);flex:1}'
  + '.mr .room .btn-outline{border-color:var(--color-base-300)}'
  + '@media(max-width:560px){.mr .stats{grid-template-columns:repeat(2,minmax(0,1fr))}.mr .stat:nth-child(3){border-inline-start:0}.mr .stat:nth-child(n+3){border-top:1px solid var(--color-base-300)}'
  + '.mr .cards{grid-template-columns:repeat(2,minmax(0,1fr))}.mr .gr{grid-template-columns:72px 1fr}.mr .nowtrack{left:84px}}'

const MEETING_ROOMS_HTML = '<div class="card border"><div class="card-body mr">'
  + '<div class="hd"><div><h2>会议室看板</h2><div class="sub text-base-content/70">今天 · 当前 10:30 · <span class="iui-badge-sample"></span></div></div>'
  + '<div class="tabs tabs-box tabs-xs" role="tablist" id="flt"><button type="button" role="tab" class="tab tab-active" data-f="all" aria-selected="true">全部</button><button type="button" role="tab" class="tab" data-f="free" aria-selected="false">可用</button><button type="button" role="tab" class="tab" data-f="busy" aria-selected="false">使用中</button></div></div>'
  + '<div class="stats border">'
  + '<div class="stat"><div class="stat-title text-base-content/70">现在可用</div><div class="stat-value num" id="sFree">0<span class="unit text-base-content/60">间</span></div></div>'
  + '<div class="stat"><div class="stat-title text-base-content/70">使用中</div><div class="stat-value num" id="sBusy">0<span class="unit text-base-content/60">间</span></div></div>'
  + '<div class="stat"><div class="stat-title text-base-content/70">今日预订</div><div class="stat-value num" id="sTotal">0<span class="unit text-base-content/60">场</span></div></div>'
  + '<div class="stat"><div class="stat-title text-base-content/70">利用率 8–20 点</div><div class="stat-value num" id="sUse">0<span class="unit text-base-content/60">%</span></div></div>'
  + '</div>'
  + '<section data-iui-hero aria-label="今日占用"><div class="lbl">今日占用</div>'
  + '<div class="gr tk"><span></span><div class="ticks num text-base-content/60"><span style="left:0">8:00</span><span style="left:25%">11:00</span><span style="left:50%">14:00</span><span style="left:75%">17:00</span><span style="left:100%">20:00</span></div></div>'
  + '<div class="gwrap"><div id="gantt"></div><div class="nowtrack"><span class="now" id="nowLine"></span></div></div></section>'
  + '<div class="cards" id="rooms"></div>'
  + '</div></div>'

/** ⑧: kanban — status dots, progress, tags, avatars, overall progress bar; ← → buttons move cards (no drag-only). */
const KANBAN_JS = `
var COLS=[{k:'todo',n:'待办',dot:'d-todo'},{k:'doing',n:'进行中',dot:'d-doing'},{k:'done',n:'已完成',dot:'d-done'}];
var tasks=[
  {t:'秋季新品拍摄',p:'林晓雯',d:'10-24',tag:'拍摄',c:'todo'},
  {t:'菜单翻译',p:'王若溪',d:'10-25',tag:'内容',c:'todo'},
  {t:'门头灯箱报价',p:'赵安然',d:'10-26',tag:'采购',c:'todo'},
  {t:'小红书投放素材',p:'周子昂',d:'10-22',tag:'营销',c:'doing',pr:60},
  {t:'会员积分规则',p:'陈一鸣',d:'10-23',tag:'运营',c:'doing',pr:30},
  {t:'徐汇店排班',p:'李沐阳',d:'10-18',tag:'运营',c:'done'},
  {t:'库存预警阈值',p:'孙嘉禾',d:'10-17',tag:'供应链',c:'done'}
];
function esc(s){ return String(s).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];}); }
function render(){
  var board=document.getElementById('board');
  board.innerHTML='';
  COLS.forEach(function(col,ci){
    var items=tasks.filter(function(x){return x.c===col.k;});
    var el=document.createElement('section');
    el.className='col';
    el.setAttribute('aria-label',col.n);
    el.innerHTML='<div class="ch"><span class="dot '+col.dot+'"></span>'+col.n+'<span class="num text-base-content/60">'+items.length+'</span></div>'
      +items.map(function(x){
        var i=tasks.indexOf(x);
        return '<article class="task'+(col.k==='done'?' done':'')+'"><div class="tt">'+esc(x.t)+'</div>'
          +(x.pr?'<progress class="progress" value="'+x.pr+'" max="100" aria-label="进度 '+x.pr+'%"></progress>':'')
          +'<div class="tf"><span class="badge badge-sm badge-ghost">'+esc(x.tag)+'</span><span class="who text-base-content/70"><span class="num">'+x.d+'</span><span class="avatar avatar-placeholder"><span class="ini">'+esc(x.p.charAt(0))+'</span></span></span></div>'
          +'<div class="mv">'+(ci>0?'<button type="button" class="btn btn-ghost btn-xs btn-square" data-i="'+i+'" data-to="'+(ci-1)+'" aria-label="移到'+COLS[ci-1].n+'"><i data-iui-icon="chevron-left"></i></button>':'')
          +(ci<COLS.length-1?'<button type="button" class="btn btn-ghost btn-xs btn-square" data-i="'+i+'" data-to="'+(ci+1)+'" aria-label="移到'+COLS[ci+1].n+'"><i data-iui-icon="chevron-right"></i></button>':'')+'</div></article>';
      }).join('')
      +'<button type="button" class="btn btn-ghost btn-xs add text-base-content/60" data-add="'+col.k+'"><i data-iui-icon="plus"></i>添加</button>';
    board.appendChild(el);
  });
  var done=tasks.filter(function(x){return x.c==='done';}).length;
  var pct=Math.round(done/tasks.length*100);
  document.getElementById('prog').value=pct;
  document.getElementById('sub').textContent='秋季上新 · '+tasks.length+' 项任务 · 已完成 '+pct+'% · 截止 10/26';
}
document.getElementById('board').onclick=function(e){
  var mv=e.target.closest('button[data-to]');
  if(mv){ var x=tasks[+mv.dataset.i]; x.c=COLS[+mv.dataset.to].k; if(x.c==='doing'&&!x.pr) x.pr=10; render(); return; }
  var add=e.target.closest('button[data-add]');
  if(add){ tasks.push({t:'新任务 '+(tasks.length+1),p:'我',d:'10-26',tag:'待分配',c:add.dataset.add}); render(); }
};
document.getElementById('newTask').onclick=function(){ tasks.unshift({t:'新任务 '+(tasks.length+1),p:'我',d:'10-26',tag:'待分配',c:'todo'}); render(); };
render();
`.trim()

const KANBAN_CSS = HEAD_CSS
  + '.kb{gap:16px}'
  + '.kb .side{display:flex;align-items:center;gap:8px}'
  + '.kb .avatar-group{display:flex}.kb .avatar-group .avatar+.avatar{margin-left:-8px}'
  + '.kb .ini{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:var(--color-base-300);font-size:var(--fs-xs)}'
  + '.kb .avatar-group .ini{width:28px;height:28px;background:var(--color-base-200);border:2px solid var(--color-base-100)}'
  + '.kb #prog{height:6px}'
  + '.kb .board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}'
  + '.kb .col{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:var(--radius-box);background:var(--color-base-200);min-width:0}'
  + '.kb .ch{display:flex;align-items:center;gap:8px;padding:4px 6px;font-size:var(--fs-sm);font-weight:500}'
  + '.kb .dot{width:8px;height:8px;border-radius:999px}.kb .d-todo{background:color-mix(in oklab,var(--color-base-content) 35%,var(--color-base-200))}.kb .d-doing{background:var(--color-warning)}.kb .d-done{background:var(--color-success)}'
  + '.kb .task{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--color-base-300);border-radius:14px;background:var(--color-base-100)}'
  + '.kb .task .tt{font-size:var(--fs-sm);font-weight:500}.kb .task.done{opacity:.65}.kb .task.done .tt{text-decoration:line-through}'
  + '.kb .task .progress{height:4px}'
  + '.kb .tf{display:flex;align-items:center;justify-content:space-between;gap:6px}'
  + '.kb .who{display:flex;align-items:center;gap:6px;font-size:var(--fs-xs)}'
  + '.kb .mv{display:flex;justify-content:flex-end;gap:2px;margin:-4px -6px -6px}.kb .mv:empty{display:none}'
  + '.kb .add{justify-content:flex-start}'
  + '@media(max-width:560px){.kb .board{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.kb .col{flex:0 0 78%;scroll-snap-align:start}}'

const KANBAN_HTML = '<div class="card border"><div class="card-body kb">'
  + '<div class="hd"><div><h2>门店上新看板</h2><div class="sub text-base-content/70" id="sub">秋季上新 · 7 项任务 · 截止 10/26</div></div>'
  + '<div class="side"><div class="avatar-group" aria-label="成员"><span class="avatar avatar-placeholder"><span class="ini">林</span></span><span class="avatar avatar-placeholder"><span class="ini">周</span></span><span class="avatar avatar-placeholder"><span class="ini">陈</span></span><span class="avatar avatar-placeholder"><span class="ini">李</span></span></div>'
  + '<button type="button" class="btn btn-sm btn-neutral" id="newTask"><i data-iui-icon="plus"></i>新任务</button></div></div>'
  + '<progress class="progress" id="prog" value="29" max="100" aria-label="总进度"></progress>'
  + '<div class="board" id="board"></div>'
  + '</div></div>'

/**
 * R5-3: 3D starter — the host stage (`data-iui-3d`) owns renderer, lights, soft shadow, auto-fit (silhouette ≈ 80% of
 * frame), damped orbit, keyboard, Ctrl+wheel zoom, pins and loading/fallback. The page only reacts to hotspot picks.
 * Swap `shape` for `"model":"polyhaven:ID"` / `"khronos:Name"` / an https .glb found via find_3d_models.
 */
const SCENE_3D_JS = `
var stage=document.getElementById('stage');
var info=document.getElementById('info');
stage.addEventListener('iui3d:hotspot',function(e){
  info.innerHTML='<b>'+e.detail.label+'</b> · '+(e.detail.spec.text||'');
});
// Stage API (focus / reset / play / stop / setAutoRotate): window.iuiStage3d(stage).then(function(s){ … })
stage.addEventListener('iui3d:ready',function(){ info.textContent='点模型上的圆点查看部件说明'; });
`.trim()

export const PATTERN_STARTERS: readonly HtmlSandboxStarter[] = [
  {
    id: 'itinerary-coast',
    title: '海岸行程（地图+播放+站卡+详解）',
    summary: '浅灰底图 + 墨色编号路线、按天切换、日卡带照片、点开当天安排',
    spec: {
      title: '加州海岸三日',
      height: 600,
      css: ITINERARY_CSS,
      html: ITINERARY_HTML,
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
    summary: '大号温度 + 四项指标 + ECharts 逐时曲线 + 七天温度区间条（可切换）',
    spec: {
      title: '上海天气',
      height: 620,
      css: WEATHER_CSS,
      html: WEATHER_HTML,
      js: WEATHER_JS,
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
    summary: '推荐档反色、月/年切换、每档一句定位',
    spec: {
      title: '定价方案',
      height: 460,
      css: PRICING_CSS,
      html: PRICING_HTML,
      js: PRICING_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'hotel-covers',
    title: '酒店封面卡',
    summary: '4:3 封面、评分、标签、价格层级（Wikimedia 封面，非行程）',
    spec: {
      title: '上海精选酒店',
      height: 420,
      css: HOTELS_CSS,
      html: HOTELS_HTML,
      js: HOTELS_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'ag-grid-sheet',
    title: '可筛明细表（AG Grid）',
    summary: 'agGrid.createGrid + ag-theme-iui，少行 autoHeight',
    spec: {
      title: '明细表',
      height: 380,
      css: '',
      html: '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>本周明细</h3><div id="grid" class="ag-theme-quartz ag-theme-iui"></div></div>',
      js: "agGrid.createGrid(document.getElementById('grid'),{domLayout:'autoHeight',defaultColDef:{sortable:true,filter:true,resizable:true},columnDefs:[{field:'name',headerName:'项目'},{field:'owner',headerName:'负责人'},{field:'n',headerName:'数量'}],rowData:[{name:'封面',owner:'阿月',n:12},{name:'地图',owner:'阿宁',n:8},{name:'表格',owner:'阿川',n:5}]});",
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },  {
    id: 'mermaid-mindmap',
    title: '脑图（Mermaid）',
    summary: 'iui-mindmap + mermaid.run，token 主题',
    spec: {
      title: '结构脑图',
      height: 420,
      css: '',
      html: '<div class="iui-sandbox-card" style="display:grid;gap:10px"><h3>产品结构</h3><pre class="mermaid iui-mindmap">mindmap\n  root((IUI))\n    地图\n    天气\n    表格\n    脑图</pre></div>',
      js: "if(window.mermaid&&mermaid.run)mermaid.run({querySelector:'.mermaid'});",
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },  {
    id: 'scene-3d',
    title: '3D 展示台',
    summary: '宿主 3D 舞台：data-iui-3d 声明式（形状 / GLB / CC0 模型）+ 热点镜头 + 背景字层 + 加载与失败兜底',
    spec: {
      title: '3D 展示台',
      height: 500,
      css: '',
      html: `<div class="iui-sandbox-stack"><div><h2 style="margin:0">3D 展示台</h2><div class="iui-sandbox-muted">拖动或方向键旋转 · Ctrl + 滚轮缩放 · 点圆点飞到部件</div></div><div id="stage" data-iui-3d='{"shape":"torusKnot","ground":"plinth","label":"环面纽结示意模型","hotspots":[{"id":"top","label":"顶部弧线","at":[0,0.9,0.2],"text":"曲率最大处，高光最集中"},{"id":"side","label":"侧向缠绕","at":[0.75,0.1,0.55],"text":"三圈缠绕形成的交叉结构"},{"id":"base","label":"展台","at":[0,-0.95,0.6],"text":"柔和接触阴影让物体落地"}]}'><h2 data-iui-3d-layer="back" style="justify-content:flex-start;padding-top:18px;font-size:132px;font-weight:800;letter-spacing:-.04em;opacity:.09">KNOT</h2></div><div class="iui-sandbox-row"><span class="iui-sandbox-muted" id="info" role="status">3D 舞台加载中…</span></div></div>`,

      js: SCENE_3D_JS,
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },  {
    id: 'meeting-rooms',
    title: '会议室看板',
    summary: '灰阶占用 + 红色“现在”线、状态标签、按状态区分按钮',
    spec: {
      title: '会议室看板',
      height: 760,
      css: MEETING_ROOMS_CSS,
      html: MEETING_ROOMS_HTML,
      js: MEETING_ROOMS_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'kanban-board',
    title: '任务看板',
    summary: '状态点、进度条、标签、头像、总进度；← → 移动卡片',
    spec: {
      title: '门店上新看板',
      height: 560,
      css: KANBAN_CSS,
      html: KANBAN_HTML,
      js: KANBAN_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
]

