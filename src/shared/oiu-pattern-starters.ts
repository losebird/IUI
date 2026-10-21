/**
 * Sandbox pattern starters for ```iui-html.
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
  var s=stops[i];
  document.getElementById('status').textContent=s.n+' · '+s.d;
  var sheet=document.getElementById('sheet');
  if(sheet) sheet.innerHTML='<h4 style="margin:0 0 6px">'+s.n+' <span class="iui-sandbox-muted" style="font-weight:400">'+s.d+'</span></h4><p class="iui-sandbox-muted" style="margin:0">'+s.desc+' · 建议停留 2 小时</p>';
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
    p.textContent = st==='playing' ? '暂停' : '继续';
  }
});
document.getElementById('pause').onclick=function(){
  if(this.textContent==='暂停') tour.pause(); else tour.play();
};
document.getElementById('replay').onclick=function(){ tour.replay(); };
strip.onclick=function(e){
  var c=e.target.closest('.iui-stop-card');
  if(!c) return;
  tour.seek(+c.dataset.i);
};
setTimeout(function(){ tour.play(); }, 400);
`.trim()

/** D7: 3D starter — three-point light, soft shadows, auto-fit camera (object ≥ 40% of frame), damped orbit. */
const SCENE_3D_JS = `
(async function(){
  var wrap=document.getElementById('stage');
  var note=wrap.querySelector('.iui-3d-loading');
  try{
    var THREE=await import('three');
    var OC=(await import('three/addons/controls/OrbitControls.js')).OrbitControls;
    var w=wrap.clientWidth||480,h=wrap.clientHeight||320;
    var renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(w,h);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    wrap.appendChild(renderer.domElement);
    var scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(40,w/h,0.05,200);
    // Three-point lighting + soft sky fill.
    scene.add(new THREE.HemisphereLight(0xffffff,0x8a8070,0.55));
    var key=new THREE.DirectionalLight(0xffffff,2.2);
    key.position.set(4,6,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.radius=4;key.shadow.bias=-0.0005;
    var fill=new THREE.DirectionalLight(0xdbe8ff,0.7);fill.position.set(-5,2.5,2);
    var rim=new THREE.DirectionalLight(0xffffff,1.2);rim.position.set(-2,4,-5);
    scene.add(key,fill,rim);
    var obj=new THREE.Mesh(new THREE.TorusKnotGeometry(0.8,0.28,220,32),new THREE.MeshStandardMaterial({color:0x185FA5,roughness:0.32,metalness:0.2}));
    obj.castShadow=true;obj.position.y=1.35;
    var plinth=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.6,0.24,64),new THREE.MeshStandardMaterial({color:0xd9d4ca,roughness:0.85}));
    plinth.position.y=0.12;plinth.receiveShadow=true;plinth.castShadow=true;
    var subject=new THREE.Group();subject.add(obj,plinth);scene.add(subject);
    var ground=new THREE.Mesh(new THREE.CircleGeometry(4,64),new THREE.ShadowMaterial({opacity:0.22}));
    ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    var controls=new OC(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=0.08;
    var still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotate=!still;controls.autoRotateSpeed=1.2;
    // Auto-fit: the subject (object + plinth) is framed to ~93% of the frame by projecting its vertices, so the subject
    // (object + shadow) covers ≥ 40% of the canvas at any orbit angle (F25 template gate).
    function fit(){
      var box=new THREE.Box3().setFromObject(subject),c=box.getCenter(new THREE.Vector3());
      var sphere=box.getBoundingSphere(new THREE.Sphere());
      var dir=new THREE.Vector3(0.9,0.45,1.3).normalize(),d=sphere.radius*3,p=new THREE.Vector3();
      // Project the subject's actual vertices (a box is too loose) and pull the camera in until the
      // silhouette spans ~93% of the frame.
      var pts=[];
      subject.updateMatrixWorld(true);
      subject.traverse(function(m){
        if(!m.isMesh)return;var a=m.geometry.attributes.position,step=Math.max(1,Math.floor(a.count/1500));
        for(var i=0;i<a.count;i+=step)pts.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld));
      });
      for(var k=0;k<4;k++){
        camera.position.copy(c).addScaledVector(dir,d);camera.lookAt(c);
        camera.near=d/100;camera.far=d*20;camera.updateProjectionMatrix();camera.updateMatrixWorld();
        var ext=0;
        for(var n=0;n<pts.length;n++){p.copy(pts[n]).project(camera);ext=Math.max(ext,Math.abs(p.x),Math.abs(p.y));}
        d*=ext/0.93;
      }
      camera.position.copy(c).addScaledVector(dir,d);
      camera.near=d/100;camera.far=d*20;camera.updateProjectionMatrix();
      controls.target.copy(c);controls.minDistance=d*0.5;controls.maxDistance=d*3;controls.update();
    }
    fit();
    controls.addEventListener('start',function(){controls.autoRotate=false;sync();});
    var running=false;
    function loop(){controls.update();renderer.render(scene,camera);}
    function run(on){if(on===running)return;running=on;renderer.setAnimationLoop(on?loop:null);}
    run(true);
    document.addEventListener('visibilitychange',function(){run(!document.hidden);});
    if(window.ResizeObserver)new ResizeObserver(function(){
      var W=wrap.clientWidth,H=wrap.clientHeight;if(!W||!H)return;
      renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();
    }).observe(wrap);
    var spin=document.getElementById('spin');
    function sync(){spin.setAttribute('aria-pressed',controls.autoRotate?'true':'false');spin.textContent=controls.autoRotate?'暂停旋转':'自动旋转';}
    spin.onclick=function(){controls.autoRotate=!controls.autoRotate;sync();};
    document.getElementById('reset').onclick=function(){fit();};
    sync();
    wrap.setAttribute('data-iui-3d-ready','1');
  }catch(e){
    wrap.setAttribute('data-iui-3d-error','1');
    note.textContent='3D 场景加载失败：'+(e&&e.message?e.message:e);
  }
})();
`.trim()

/** D-补充: meeting-room board (data personality, two-layer stats, equal-height cards). */
const MEETING_ROOMS_JS = `
var NOW=10.5;
var rooms=[
  {n:'星河厅',f:'3F',cap:20,b:[[9,10],[10,12],[14,15.5]],m:'季度规划评审'},
  {n:'松风',f:'3F',cap:8,b:[[13,14],[16,17]],m:''},
  {n:'云杉',f:'5F',cap:6,b:[[10.75,11.5],[15,16]],m:'候选人面试'},
  {n:'海棠',f:'5F',cap:12,b:[[9.5,11],[11,12.5]],m:'设计周会'},
  {n:'竹影（电话间）',f:'6F',cap:2,b:[],m:''},
  {n:'远山',f:'6F',cap:16,b:[[17,18.5]],m:''}
];
function state(r){
  for(var i=0;i<r.b.length;i++){var s=r.b[i];if(NOW>=s[0]&&NOW<s[1])return {k:'busy',t:'使用中',until:s[1]};}
  for(var j=0;j<r.b.length;j++){var x=r.b[j];if(x[0]>NOW&&x[0]-NOW<=0.5)return {k:'soon',t:'即将开始',at:x[0]};}
  return {k:'free',t:'空闲'};
}
function hm(v){var h=Math.floor(v),m=Math.round((v-h)*60);return h+':'+(m<10?'0':'')+m;}
var filter='all';
function render(){
  var free=0,busy=0,total=0,used=0;
  rooms.forEach(function(r){var st=state(r);if(st.k==='busy')busy++;else free++;total+=r.b.length;r.b.forEach(function(s){used+=s[1]-s[0];});});
  document.getElementById('sFree').firstChild.nodeValue=String(free);
  document.getElementById('sBusy').firstChild.nodeValue=String(busy);
  document.getElementById('sTotal').firstChild.nodeValue=String(total);
  document.getElementById('sUse').firstChild.nodeValue=String(Math.round(used/(rooms.length*12)*100));
  var grid=document.getElementById('rooms');grid.innerHTML='';
  var gantt=document.getElementById('gantt');gantt.innerHTML='';
  rooms.forEach(function(r,i){
    var st=state(r);
    if(filter!=='all'&&!(filter==='free'?st.k!=='busy':st.k==='busy'))return;
    var bars=r.b.map(function(s){return '<i style="left:'+((s[0]-8)/12*100)+'%;width:'+((s[1]-s[0])/12*100)+'%"></i>';}).join('');
    var line=st.k==='busy'?(r.m||'已预订')+' · 至 '+hm(st.until):st.k==='soon'?'下一场 '+hm(st.at)+' 开始':'现在可用';
    var el=document.createElement('article');
    el.className='room';
    el.innerHTML='<div class="top"><div class="iui-card-title">'+r.n+'</div><span class="st '+st.k+'">'+st.t+'</span></div>'+
      '<div class="iui-card-summary">'+r.f+' · '+r.cap+' 人 · '+line+'</div>'+
      '<button type="button" class="iui-card-foot'+(st.k==='busy'?' secondary':' primary')+'" data-i="'+i+'">'+(st.k==='busy'?'查看日程':'预订')+'</button>';
    grid.appendChild(el);
    var row=document.createElement('div');
    row.className='gr';
    row.innerHTML='<span class="nm">'+r.n+'</span><div class="tl" aria-label="'+r.n+' 8:00–20:00 预订情况">'+bars+'<b style="left:'+((NOW-8)/12*100)+'%"></b></div>';
    gantt.appendChild(row);
  });
}
document.getElementById('rooms').onclick=function(e){
  var b=e.target.closest('button[data-i]');if(!b)return;
  var r=rooms[+b.dataset.i];
  window.iuiSandbox.action('book_room',{room:r.n,floor:r.f,capacity:r.cap});
};
document.getElementById('flt').onclick=function(e){
  var b=e.target.closest('button[data-f]');if(!b)return;
  filter=b.dataset.f;
  this.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false');});
  render();
};
render();
`.trim()

export const OIU_PATTERN_STARTERS: readonly HtmlSandboxStarter[] = [
  {
    id: 'itinerary-coast',
    title: '海岸行程（地图+播放+横滑+详解）',
    summary: '彩色 Leaflet、pin 落下、Pause/Replay、横滑站卡、点开停留/怎么去/避坑',
    spec: {
      title: '加州海岸三日',
      height: 560,
      css: '.disclaimer{font-size:12px;color:var(--color-text-tertiary);margin-top:4px}',
      html: '<div class="iui-itinerary" id="trip"><div class="iui-itinerary-head"><div><div class="iui-itinerary-title">加州海岸 · 三日</div><div class="iui-itinerary-sub">SF → Monterey → Big Sur</div></div><div class="iui-chip">3 天</div><div class="iui-chip">3 站</div></div><div class="iui-map-wrap"><div id="map" style="height:100%;width:100%"></div><div class="iui-map-chrome"><button type="button" id="pause">暂停</button><button type="button" id="replay">重播</button><span class="iui-chip" id="status" role="status">准备中</span></div></div><div class="iui-cards-strip" id="strip"></div><div class="iui-sandbox-card" id="sheet"><b>点针或卡片</b> 看停留 / 怎么去 / 避坑</div><p class="disclaimer">示意行程连线 — 非核实驾车路线</p></div>',
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
      css: ".iui-weather{display:flex;flex-direction:column;gap:14px}.iui-weather-hero{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:18px 20px;border-radius:var(--border-radius-xl);background:linear-gradient(135deg,var(--accent-soft,var(--color-background-info)),var(--color-background-secondary))}.iui-weather-hero .temp{font-size:56px;font-weight:700;letter-spacing:-.04em;line-height:1;color:var(--color-text-primary)}.iui-weather-hero .meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end;text-align:right}.iui-weather-hero .icon{font-size:42px;line-height:1}.iui-weather-chips{display:flex;flex-wrap:wrap;gap:8px}.iui-weather-chip{padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--color-background-primary) 72%,transparent);font-size:12px;color:var(--color-text-secondary)}.iui-weather-chip strong{color:var(--color-text-primary);font-weight:600;margin-left:4px}.iui-weather-chart{height:200px;position:relative;padding:8px 4px 0}.iui-weather-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.iui-weather-day{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:var(--border-radius-lg);border:1px solid transparent;background:var(--color-background-secondary);cursor:pointer;font:inherit;color:inherit;min-height:0}.iui-weather-day:hover{background:var(--color-background-tertiary,var(--color-background-secondary))}.iui-weather-day[aria-current=\"true\"]{border-color:var(--accent-fill);background:var(--accent-soft);box-shadow:0 0 0 1px var(--accent-fill)}.iui-weather-day .wd{font-size:12px;font-weight:600}.iui-weather-day .dt{font-size:12px;color:var(--color-text-tertiary)}.iui-weather-day .ic{font-size:22px;line-height:1.2}.iui-weather-day .cd{font-size:12px;color:var(--color-text-secondary)}.iui-weather-day .rg{font-size:12px;font-weight:600}@media(max-width:560px){.iui-weather-days{grid-template-columns:repeat(4,minmax(0,1fr))}.iui-weather-hero .temp{font-size:44px}}",
      html: "<div class=\"iui-sandbox-card iui-weather\"><div class=\"iui-weather-hero\"><div><div class=\"iui-sandbox-muted\" id=\"hero-loc\">\u4e0a\u6d77 \u00b7 \u4eca\u65e5</div><div class=\"temp\" id=\"hero-temp\">26\u00b0</div><div class=\"iui-weather-chips\" style=\"margin-top:10px\"><span class=\"iui-weather-chip\">\u4f53\u611f<strong>24\u00b0</strong></span><span class=\"iui-weather-chip\">\u6e7f\u5ea6<strong>62%</strong></span><span class=\"iui-weather-chip\">\u4e1c\u5317\u98ce<strong>3 \u7ea7</strong></span><span class=\"iui-weather-chip\">\u7a7a\u6c14<strong>\u826f 68</strong></span></div></div><div class=\"meta\"><div class=\"icon\"><i id=\"hero-icon\" data-iui-icon=\"cloud-sun\"></i></div><div id=\"hero-cond\" style=\"font-weight:600\">\u591a\u4e91</div><div class=\"iui-sandbox-muted\" id=\"hero-range\">26\u00b0 / 17\u00b0</div></div></div><div><div class=\"iui-sandbox-muted\" style=\"margin-bottom:6px\">\u4eca\u65e5\u9010\u65f6\u6c14\u6e29</div><div class=\"iui-weather-chart\"><canvas id=\"wxChart\"></canvas></div></div><div><div class=\"iui-sandbox-muted\" style=\"margin-bottom:8px\">\u672a\u6765 7 \u5929 <span class=\"iui-badge-sample\"></span></div><div class=\"iui-weather-days\" id=\"days\"></div></div></div>",
      js: "var days=[\n  {d:'\u4eca\u65e5',date:'10/11',icon:'cloud-sun',cond:'\u591a\u4e91',hi:26,lo:17},\n  {d:'\u5468\u4e00',date:'10/12',icon:'sun',cond:'\u6674',hi:28,lo:18},\n  {d:'\u5468\u4e8c',date:'10/13',icon:'sun',cond:'\u6674',hi:27,lo:19},\n  {d:'\u5468\u4e09',date:'10/14',icon:'cloud-rain',cond:'\u5c0f\u96e8',hi:24,lo:16},\n  {d:'\u5468\u56db',date:'10/15',icon:'cloud-sun',cond:'\u591a\u4e91',hi:25,lo:17},\n  {d:'\u5468\u4e94',date:'10/16',icon:'cloud-rain',cond:'\u4e2d\u96e8',hi:22,lo:15},\n  {d:'\u5468\u516d',date:'10/17',icon:'cloud-sun',cond:'\u591a\u4e91',hi:23,lo:16}\n];\nvar hourly=[18,19,20,22,24,26,25,23,21];\nvar hourlyL=['08','10','12','14','16','18','20','22','24'];\nvar selected=0;\nfunction paintHero(i){\n  var x=days[i];\n  document.getElementById('hero-loc').textContent='\u4e0a\u6d77 \u00b7 '+x.date+' \u00b7 '+x.d;\n  document.getElementById('hero-temp').textContent=x.hi+'\u00b0';\n  document.getElementById('hero-cond').textContent=x.cond;\n  document.getElementById('hero-icon').setAttribute('data-iui-icon',x.icon);\n  document.getElementById('hero-range').textContent=x.hi+'\u00b0 / '+x.lo+'\u00b0';\n  document.querySelectorAll('.iui-weather-day').forEach(function(el,idx){\n    el.setAttribute('aria-current', idx===i?'true':'false');\n  });\n}\nfunction paintDays(){\n  var row=document.getElementById('days');\n  row.innerHTML='';\n  days.forEach(function(x,i){\n    var b=document.createElement('button');\n    b.type='button';\n    b.className='iui-weather-day';\n    b.innerHTML='<span class=\"wd\">'+x.d+'</span><span class=\"dt\">'+x.date+'</span><span class=\"ic\"><i data-iui-icon=\"'+x.icon+'\"></i></span><span class=\"cd\">'+x.cond+'</span><span class=\"rg\">'+x.hi+'\u00b0/'+x.lo+'\u00b0</span>';\n    b.onclick=function(){ selected=i; paintHero(i); window.iuiSandbox.action('weather_day',{i:i,day:x.d}); };\n    row.appendChild(b);\n  });\n  paintHero(selected);\n}\npaintDays();\n(function paintChart(){\n  var ctx=document.getElementById('wxChart');\n  if(!ctx) return;\n  var Chart=window.Chart;\n  if(!Chart){ setTimeout(paintChart, 40); return; }\n  if(window.iuiCreateChart){\n    window.iuiCreateChart(ctx,{\n      type:'line',\n      data:{labels:hourlyL,datasets:[{label:'\u6c14\u6e29',data:hourly}]},\n      options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:false,ticks:{callback:function(v){return v+'\u00b0'}}}}}\n    });\n  } else {\n    new Chart(ctx,{type:'line',data:{labels:hourlyL,datasets:[{label:'\u6c14\u6e29',data:hourly}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:false}}}});\n  }\n  ctx.__iuiChartOk=true;\n  window.iuiSandbox&&window.iuiSandbox.resize();\n})();",
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
  },
  {
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
  },
  {
    id: 'scene-3d',
    title: '3D 展示台',
    summary: '三点光源 + 阴影 + 自动取景 + OrbitControls 阻尼 + 加载占位',
    spec: {
      title: '3D 展示台',
      height: 500,
      css: '',
      html: "<div class=\"iui-sandbox-stack\"><div><h2 style=\"margin:0\">3D 展示台</h2><div class=\"iui-sandbox-muted\">三点光源 + 柔和阴影，物体按轮廓自动取景、占满画面约 90%</div></div><div class=\"iui-3d-wrap\" id=\"stage\" style=\"height:380px\"><div class=\"iui-3d-loading\">正在加载 3D 场景…</div></div><div class=\"iui-sandbox-row\"><button type=\"button\" id=\"reset\" class=\"secondary\">重置视角</button><button type=\"button\" id=\"spin\" class=\"secondary\" aria-pressed=\"true\">暂停旋转</button><span class=\"iui-sandbox-muted\">拖动旋转 · 滚轮或双指缩放</span></div></div>",
      js: SCENE_3D_JS,
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
  {
    id: 'meeting-rooms',
    title: '会议室看板',
    summary: '数据型风格 + 上下两层数字 + 等高卡片 + 时间轴',
    spec: {
      title: '会议室看板',
      height: 820,
      css: ".head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}.room{gap:8px;padding:14px;border-radius:var(--border-radius-lg);background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary)}.room .top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.st{flex:none;font-size:var(--fs-xs);font-weight:600;padding:2px 8px;border-radius:999px}.st.free{background:var(--color-background-success);color:var(--color-text-success)}.st.busy{background:var(--color-background-danger);color:var(--color-text-danger)}.st.soon{background:var(--color-background-warning);color:var(--color-text-warning)}.gantt{margin-top:12px;padding:12px 14px;border-radius:var(--border-radius-lg);background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary)}.gantt h3{margin:0 0 6px}.gr{display:grid;grid-template-columns:minmax(64px,96px) 1fr;align-items:center;gap:10px;min-height:30px}.gr .nm{font-size:var(--fs-xs);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tl{position:relative;height:16px;border-radius:4px;background:var(--color-background-secondary)}.tl i{position:absolute;top:0;bottom:0;border-radius:4px;background:var(--accent-fill)}.tl b{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--color-text-danger);border-radius:1px}.ticks{display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--color-text-secondary)}.room button{width:100%}#rooms{margin-top:12px}",
      html: "<div data-iui-style=\"data\"><div class=\"head\"><div><h2 style=\"margin:0\">会议室看板</h2><div class=\"iui-sandbox-muted\">今天 · 当前 10:30（示例数据）</div></div><div class=\"iui-sandbox-tabbar\" id=\"flt\" role=\"tablist\"><button type=\"button\" class=\"iui-sandbox-tab\" data-f=\"all\" aria-selected=\"true\">全部</button><button type=\"button\" class=\"iui-sandbox-tab\" data-f=\"free\" aria-selected=\"false\">可用</button><button type=\"button\" class=\"iui-sandbox-tab\" data-f=\"busy\" aria-selected=\"false\">使用中</button></div></div><div class=\"iui-stats\"><div class=\"iui-stat\"><div class=\"iui-stat-value\" id=\"sFree\">0<span class=\"unit\">间</span></div><div class=\"iui-stat-label\">现在可用</div></div><div class=\"iui-stat\"><div class=\"iui-stat-value\" id=\"sBusy\">0<span class=\"unit\">间</span></div><div class=\"iui-stat-label\">使用中</div></div><div class=\"iui-stat\"><div class=\"iui-stat-value\" id=\"sTotal\">0<span class=\"unit\">场</span></div><div class=\"iui-stat-label\">今日预订</div></div><div class=\"iui-stat\"><div class=\"iui-stat-value\" id=\"sUse\">0<span class=\"unit\">%</span></div><div class=\"iui-stat-label\">今日利用率（8:00–20:00）</div></div></div><section class=\"gantt\" data-iui-hero aria-label=\"今日占用\"><h3>今日占用 · 红线为现在</h3><div id=\"gantt\"></div><div class=\"gr\"><span></span><div class=\"ticks\"><span>8:00</span><span>11:00</span><span>14:00</span><span>17:00</span><span>20:00</span></div></div></section><div class=\"iui-card-grid\" id=\"rooms\"></div></div>",
      js: MEETING_ROOMS_JS,
      stages: ['css', 'html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    },
  },
]
