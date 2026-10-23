(function(){
var stops=[
{day:1,name:'断桥残雪',place:'Broken Bridge Hangzhou',one:'秋晨白堤第一眼',time:'D1 07:30',cost:'¥0',stay:'45–70 分钟',lat:30.2594,lng:120.1513,img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/West_Lake_%E8%A5%BF%E6%B9%96_-_panoramio_%2810%29.jpg/800px-West_Lake_%E8%A5%BF%E6%B9%96_-_panoramio_%2810%29.jpg',credit:'lienyuan lee · CC BY 3.0',creditUrl:'https://commons.wikimedia.org/wiki/File:West_Lake_%E8%A5%BF%E6%B9%96_-_panoramio_(10).jpg',ticket:'免费，全天可走。白堤与断桥不收门票。',
go:'住湖滨可步行 8–15 分钟。地铁 1 号线龙翔桥站 D 口出，沿湖滨路向北。也可骑共享单车到桥头即还。',
pit:'周末 9 点后桥面会堵成拍照队列。想拍白堤纵深请 7:30 前到。秋雨后石板湿，单人不要靠湖栏杆倒退取景。',
why:'白娘子传说的起点，也是北线入湖最干净的第一眼。十月水位稳，晨雾偶尔有，比冬天好走。',
intro:'断桥并不真断，是白堤东端的拱桥。冬雪消融时桥身露出一线，远看像断了，故名。秋天没有雪，但薄雾、秋水和长堤是单人行最从容的开场。过桥后沿白堤向孤山，平湖秋月就在左手。不要在桥头买便宜丝巾和“导游”。'},
{day:1,name:'岳王庙 · 孤山',place:'Yue Fei Temple',one:'一碗忠义，再一碗杭帮菜',time:'D1 10:00',cost:'¥25',stay:'70–90 分钟',lat:30.2528,lng:120.1410,img:'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Yue_Fei_temple_13.jpg/800px-Yue_Fei_temple_13.jpg',credit:'Peter Potrowl · CC BY 3.0',creditUrl:'https://commons.wikimedia.org/wiki/File:Yue_Fei_temple_13.jpg',ticket:'岳王庙门票约 ¥25。孤山、西泠印社园林步道免费。楼外楼需排队，单人可改去孤山路点心或知味观。',
go:'白堤走到孤山西端即到岳庙。无需打车。参观后可沿北山街回湖，或继续往苏堤。',
pit:'岳庙里请勿喧哗拍照闪灯。秦桧跪像前不要起哄。午餐如果非去楼外楼，不要被门口拉客“团队餐”带走。',
why:'北线在这里折向人文。秋天院内银杏开始黄，和外面的湖是两种杭州。',
intro:'岳飞于绍兴十一年遇害，庙祠在栖霞岭南麓。正殿、墓园、精忠柏亭足够一个人慢慢看。看完出庙，北山街往东是楼外楼，往南可折向苏堤。单人正餐更稳妥的是知味观（仁和路）或新白鹿，人均 ¥60–90 能吃到东坡肉、龙井虾仁、片儿川。'},
{day:1,name:'雷峰塔',place:'Leifeng Pagoda',one:'夕照是秋天的主菜',time:'D1 15:30',cost:'¥40',stay:'80–100 分钟',lat:30.2311,lng:120.1489,img:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Leifeng_Pagoda_DJI_0593_%282%29.jpg/800px-Leifeng_Pagoda_DJI_0593_%282%29.jpg',credit:'David290 · CC BY-SA 4.0',creditUrl:'https://commons.wikimedia.org/wiki/File:Leifeng_Pagoda_DJI_0593_(2).jpg',ticket:'登塔约 ¥40。景区外围净慈寺、长桥公园免费。电梯+步行结合，顶层看南湖与苏堤。',
go:'苏堤南下经花港观鱼到南线；或公交 Y2 / 4 路到雷峰塔站。单人下午不要从断桥打车横穿全湖，沿苏堤骑行更值。',
pit:'塔是重建的，不要期待“原塔”。夕照前后 40 分钟人最多。玻璃栈道恐高可只到中间层。门口“旅拍”套餐水分大。',
why:'白蛇传说的另一极。十月太阳落得早，15:30 进塔刚刚好，下来沿南山路吃晚饭。',
intro:'原塔明末已圮，现在看到的是 2002 年重建，地宫可看文物复制与遗址。秋天南线梧桐和水杉开始上色，花港观鱼的鱼不是重点，金桂和湖岸才是。若体力还够，日落后来长桥公园看塔影，比在塔顶更静。'},
{day:2,name:'灵隐寺 · 飞来峰',place:'Lingyin Temple',one:'早进山，避开香客高峰',time:'D2 08:30',cost:'¥75',stay:'2.5–3 小时',lat:30.2407,lng:120.1015,img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Lingyin_Temple%2C_Hangzhou_20161003.jpg/800px-Lingyin_Temple%2C_Hangzhou_20161003.jpg',credit:'Tyg728 · CC BY-SA 4.0',creditUrl:'https://commons.wikimedia.org/wiki/File:Lingyin_Temple,_Hangzhou_20161003.jpg',ticket:'飞来峰约 ¥45 + 灵隐寺香花券约 ¥30，合计约 ¥75。线上购票可走快捷通道。永福寺、韬光另计，单人当天可不加。',
go:'地铁 1 号线到龙翔桥或武林广场，转 7 路 / Y2 路到灵隐。打车约 ¥25–35。不要在龙翔桥上“黑车进山”。',
pit:'中午香客与旅行团叠在天王殿。8:30 前进飞来峰看造像光线最好。寺内勿短裤背心，勿高声直播。飞来峰造像禁止攀爬。',
why:'西湖是面，灵隐是骨。秋天进山凉，比夏天少一层汗味。',
intro:'东晋咸和元年开山，是江南最重要的禅寺之一。飞来峰摩崖造像才是真正值票的部分，尤以卢舍那佛会和布袋弥勒著名。单人把手机调静音，从冷泉亭走到寺内大约一小时刚刚好。出寺可在法云古村喝杯茶再去龙井，不要回头再钻纪念品街。'},
{day:2,name:'龙井村',place:'Longjing',one:'自己看茶，不跟茶托',time:'D2 13:00',cost:'¥0–180',stay:'90–120 分钟',lat:30.2230,lng:120.1065,img:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Longjing_tea.jpg/800px-Longjing_tea.jpg',credit:'Difference engine · CC BY-SA 4.0',creditUrl:'https://commons.wikimedia.org/wiki/File:Longjing_tea.jpg',ticket:'村口与茶园步道免费。中国茶叶博物馆（双峰）免费，建议提前预约。买茶完全自愿。',
go:'灵隐打车约 15 分钟；或 27 路 / 103 路到龙井村。单人别包“品茶一日游”。',
pit:'门口热情招呼“免费品茶”的，多半是要你买一斤。明前茶十月不可能新鲜到这个价。想买：小份 50 克、看防伪、去狮峰山脚正规茶号或茶博文创。',
why:'龙井是杭州的味觉地标。秋天不是采茶季，却是把杯子坐热、看梯田层次的季。',
intro:'狮峰山、龙井村、翁家山连成一片。十月茶树深绿，村路好走。一个人点一壶狮峰龙井、一盘时蔬，人均 ¥50–80。若对茶史有兴趣，先去双峰茶博再进村，被套路的概率会低很多。'},
{day:2,name:'满觉陇 · 九溪',place:'满觉陇',one:'桂花尾香，石板路慢走',time:'D2 15:00',cost:'¥0',stay:'80–110 分钟',lat:30.2188,lng:120.1205,img:'',credit:'',creditUrl:'',ticket:'满觉陇、九溪十八涧均免费。10 月中下旬是桂花尾香，不是最盛，但人少、能闻见。',
go:'龙井村步行约 25 分钟到满觉陇；再往南是九溪。也可 4 路 / 水上巴士衔接，单人步行更值。',
pit:'国庆档已经过去，不要再跟“满觉陇爆堵”的旧帖走。石板路落花湿滑。农家乐门口的桂花酒、桂花糕可以尝，不要批发式打包。',
why:'这是把行程钉在 10 月中下旬的理由：西湖看水，满觉陇闻香。',
intro:'满觉陇沿山坡种桂，秋风一过整条路都是甜的。尾香比盛开更适合单人——你可以停下来拍照，而不用给人让路。体力好再下九溪十八涧，溪声比景区广播好听。天黑前必须回到公交沿线，山路没有路灯。'},
{day:3,name:'河坊街 · 清河坊',place:'河坊街',one:'市井、故居、一碗面',time:'D3 09:00',cost:'¥0–20',stay:'2–2.5 小时',lat:30.2455,lng:120.1705,img:'',credit:'',creditUrl:'',ticket:'街区免费。胡雪岩故居约 ¥20，强烈建议进。南宋官窑、中山中路店铺自由进出。',
go:'地铁 1 号线定安路站。从湖滨走中山中路过去约 25 分钟，正好把御街走一遍。',
pit:'主街小吃甜腻且贵，不要在大牌坊下吃第一家。假古董、“老杭帮团队餐”绕开。想吃面：奎元馆（中山中路）或皇饭儿，单人点虾爆鳝面/片儿川即可。',
why:'前两天是湖与山，第三天把杭州还成一座城。',
intro:'清河坊是南宋以来的商业根。胡雪岩故居的木雕、芝园和铜钱铺地，比街上的汉服租借有内容得多。看完沿中山中路向北，民国骑楼和咖啡店适合一个人坐半小时。吴山广场若腿还行，可爬到城隍阁看一眼城和湖的交界，再下山吃面。'},
{day:3,name:'拱宸桥 · 大运河',place:'拱宸桥',one:'免费博物馆，桥上收尾',time:'D3 14:00',cost:'¥0',stay:'2–3 小时',lat:30.3190,lng:120.1415,img:'',credit:'',creditUrl:'',ticket:'中国大运河博物馆（运河杭州市博物馆）免费，建议预约。桥西历史街区、拱宸桥本身免费。',
go:'地铁 5 号线到大运河站或拱宸桥东。从河坊街过去约 30–40 分钟，一趟地铁，不要再打车绕城。',
pit:'不要把拱宸桥当成“小西湖”。它是生活运河：豆浆、修车铺、居民楼。夜游船可坐可不坐，单人下午把博物馆和桥西直街走完就很满。',
why:'西湖太像风景，运河才像杭州还在过的日子。',
intro:'拱宸桥是京杭大运河南端的标志性桥。上桥看船，下桥进桥西直街。博物馆把漕运、织造和城市改造讲清楚，比再买一张西湖游船票更值。傍晚坐地铁回湖滨吃最后一顿：片儿川、油墩子或一碗虾爆鳝面，然后去车站。'}
];
var days=[
{title:'第一天 · 北线入湖到雷峰夕照',spend:'当天现金约 ¥280–420（不含住宿）',slots:[
{t:'07:30',n:'断桥 · 白堤',d:'空腹走白堤。桥头不要停留太久，真正好看的是堤上那条线。',i:0},
{t:'08:40',n:'平湖秋月 · 孤山 · 西泠',d:'秋天的名字就写在这里。西泠印社园林免费，单人很适合。',i:1},
{t:'10:00',n:'岳王庙',d:'门票约 ¥25。看完沿北山街找午饭。',i:1},
{t:'12:00',n:'杭帮菜午餐',d:'预算 ¥70–110。楼外楼贵且排队；知味观/新白鹿更适合单人。',i:-1},
{t:'13:30',n:'苏堤南下 · 花港观鱼',d:'共享单车或步行。重点是秋树和水，不是鱼。',i:2},
{t:'15:30',n:'雷峰塔登塔',d:'门票约 ¥40。卡夕照。下来走南山路。',i:2},
{t:'18:30',n:'南山路或湖滨晚饭',d:'预算 ¥60–90。早睡，第二天要早进灵隐。',i:2}
]},
{title:'第二天 · 灵隐、龙井、桂花尾香',spend:'当天现金约 ¥320–480（含小份茶）',slots:[
{t:'08:00',n:'公交或打车进山',d:'7 路 / Y2 路。黑车不坐。',i:3},
{t:'08:30',n:'飞来峰 + 灵隐寺',d:'合计约 ¥75。先造像后寺院。',i:3},
{t:'11:40',n:'法云古村或农家面',d:'素面/时蔬 ¥35–55。',i:3},
{t:'13:00',n:'龙井村喝茶',d:'自己点茶。不跟茶托。可加茶博。',i:4},
{t:'15:00',n:'满觉陇尾香',d:'免费。石板湿滑。',i:5},
{t:'16:20',n:'九溪十八涧',d:'天黑前回到公交站。',i:5},
{t:'18:40',n:'回湖滨晚饭',d:'奎元馆或小笼 + 猫耳朵。',i:6}
]},
{title:'第三天 · 清河坊到运河收尾',spend:'当天现金约 ¥160–260',slots:[
{t:'09:00',n:'定安路 → 河坊街',d:'步行中山中路更有意思。',i:6},
{t:'09:40',n:'胡雪岩故居',d:'约 ¥20。芝园别错过。',i:6},
{t:'12:00',n:'虾爆鳝面或片儿川',d:'单人一碗足够，预算 ¥45–70。',i:6},
{t:'14:00',n:'地铁 5 号线到大运河',d:'博物馆免费需预约。',i:7},
{t:'16:30',n:'上拱宸桥',d:'看完桥西直街，回城。',i:7},
{t:'18:00',n:'最后一顿 + 去车站',d:'酒店若在龙翔桥，拖箱去东站/城站都方便。',i:7}
]}
];
var hotels=[
{name:'湖滨 / 龙翔桥',tag:'首选',place:'Hangzhou',price:'¥480–680/晚',why:'早断桥、晚南山、转灵隐都在 15 分钟半径。单人开一间带窗商务房即可，不要为了“湖景”多付 400。'},
{name:'南山路 / 清波门',tag:'风景更好',place:'West Lake',price:'¥650–1,100/晚',why:'推窗近雷峰、柳浪。适合把第一天走得很慢的人。周末紧，需提前。'},
{name:'拱宸桥 / 桥西',tag:'更生活',place:'拱宸桥',price:'¥380–560/晚',why:'夜运河安静。但去满觉陇要多 25 分钟，三天单人不建议中途换酒店。'}
];
var foods=[
{name:'片儿川',place:'Hangzhou',d:'雪菜冬笋肉丝面。早餐或简单晚饭。¥20–35。'},
{name:'虾爆鳝面',place:'Hefang Street',d:'奎元馆代表作。单人点一碗，鳝段要趁热。¥45–70。'},
{name:'东坡肉 · 龙井虾仁',place:'West Lake',d:'正餐两样点一个就够。新白鹿/知味观比楼外楼好下口。¥60–110。'}
];
var strip=document.getElementById('strip');
var dayNav=document.getElementById('dayNav');
var dayBox=document.getElementById('dayBox');
var hotelsEl=document.getElementById('hotels');
var foodsEl=document.getElementById('foods');
var current=0, currentDay=1, animator=null, map=null;
function el(tag, cls, html){var n=document.createElement(tag); if(cls) n.className=cls; if(html) n.innerHTML=html; return n;}
stops.forEach(function(s,i){
  var card=el('article','iui-stop-card'+(s.img?'':' iui-place-card'));
  card.setAttribute('data-i', String(i));
  if(!s.img) card.setAttribute('data-iui-place', s.place);
  var photo=el('div','photo');
  var im=document.createElement('img');
  im.alt=s.name; im.loading='eager'; if(s.img) im.src=s.img;
  photo.appendChild(im); card.appendChild(photo);
  card.appendChild(el('div','num', String(i+1)));
  card.appendChild(el('div','name', s.name));
  card.appendChild(el('div','one', s.one));
  if(s.credit){
    var cr=el('div','iui-photo-credit');
    var a=document.createElement('a'); a.href=s.creditUrl; a.textContent=s.credit; cr.appendChild(a); card.appendChild(cr);
  }
  card.onclick=function(){activate(i,true);};
  strip.appendChild(card);
});
[1,2,3].forEach(function(d){
  var b=el('button','iui-sandbox-btn');
  b.type='button'; b.textContent='第'+d+'天'; b.id='dayBtn'+d;
  b.onclick=function(){showDay(d); var idx=stops.findIndex(function(s){return s.day===d;}); if(idx>=0) activate(idx,true);};
  dayNav.appendChild(b);
});
hotels.forEach(function(h){
  var c=el('div','iui-tier iui-hotel-card');
  c.setAttribute('data-iui-place', h.place);
  var p=el('div','photo'); var im=document.createElement('img'); im.alt=h.name; im.loading='eager'; p.appendChild(im); c.appendChild(p);
  c.appendChild(el('div',null,h.tag));
  c.appendChild(el('div','name',h.name));
  c.appendChild(el('div','price',h.price));
  c.appendChild(el('p',null,h.why));
  hotelsEl.appendChild(c);
});
foods.forEach(function(f){
  var c=el('div','iui-place-card iui-sandbox-card');
  c.setAttribute('data-iui-place', f.place);
  var p=el('div','photo'); var im=document.createElement('img'); im.alt=f.name; im.loading='eager'; p.appendChild(im); c.appendChild(p);
  c.appendChild(el('div','name',f.name));
  c.appendChild(el('p',null,f.d));
  foodsEl.appendChild(c);
});
function showDay(d){
  currentDay=d;
  var info=days[d-1];
  document.getElementById('dayTitle').textContent=info.title;
  document.getElementById('daySpend').textContent=info.spend;
  dayBox.innerHTML='';
  info.slots.forEach(function(sl){
    var row=el('div','slot');
    var tm=document.createElement('time'); tm.textContent=sl.t; row.appendChild(tm);
    var box=document.createElement('div');
    box.appendChild(el('strong',null,sl.n));
    box.appendChild(el('p',null,sl.d));
    row.appendChild(box);
    row.onclick=function(){ if(sl.i>=0) activate(sl.i,true); };
    dayBox.appendChild(row);
  });
}
function activate(i, fromUser){
  if(i<0||i>=stops.length) return;
  current=i;
  var s=stops[i];
  var cards=strip.querySelectorAll('.iui-stop-card');
  cards.forEach(function(c,idx){ if(idx===i) c.setAttribute('aria-current','true'); else c.removeAttribute('aria-current'); });
  var card=cards[i];
  if(card) strip.scrollLeft=card.offsetLeft-12;
  document.getElementById('shMeta').textContent='第'+s.day+'天 · '+s.time+' · 个人花费 '+s.cost;
  document.getElementById('shTitle').textContent=(i+1)+'. '+s.name;
  document.getElementById('shWhy').textContent=s.why;
  document.getElementById('shStay').textContent=s.stay;
  document.getElementById('shTicket').textContent=s.ticket;
  document.getElementById('shGo').textContent=s.go;
  document.getElementById('shPit').textContent=s.pit;
  document.getElementById('shIntro').textContent=s.intro;
  if(s.day!==currentDay) showDay(s.day);
  if(fromUser && animator && animator.seek) animator.seek(i);
  if(map) map.panTo([s.lat,s.lng]);
}
function setupMap(){
  if(typeof L==='undefined'){ document.getElementById('mapStatus').textContent='地图库未就绪，卡片仍可点开详解'; return; }
  map=L.map('map',{scrollWheelZoom:false, zoomControl:true});
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri', maxZoom:19}).addTo(map);
  var latlngs=stops.map(function(s){return [s.lat,s.lng];});
  L.polyline(latlngs,{color:'#c45c26',weight:3,opacity:0.8,dashArray:'6 8'}).addTo(map).bindTooltip('示意行程连线 — 非核实驾车路线');
  var pinEls=[];
  stops.forEach(function(s,i){
    var icon=L.divIcon({className:'',html:'<div class="iui-pin-dot">'+(i+1)+'</div>',iconSize:[26,26],iconAnchor:[13,13]});
    var m=L.marker([s.lat,s.lng],{icon:icon}).addTo(map);
    m.on('click',function(){activate(i,true);});
    pinEls.push(m.getElement());
  });
  map.fitBounds(latlngs,{padding:[28,28]});
  setTimeout(function(){ map.invalidateSize(); }, 250);
  pinEls=pinEls.filter(function(x){return !!x;});
  if(typeof createTripAnimator==='function'){
    animator=createTripAnimator({stopCount:stops.length,durationMs:8000,pinElements:pinEls,map:map,
      onFrame:function(i){activate(i,false);},
      onState:function(st){ document.getElementById('mapStatus').textContent=st||'示意行程连线 — 非核实驾车路线'; }
    });
  }
  document.getElementById('btnPause').onclick=function(){ if(animator&&animator.pause) animator.pause(); };
  document.getElementById('btnReplay').onclick=function(){ if(animator&&animator.replay) animator.replay(); else if(animator&&animator.play) animator.play(); if(map) map.invalidateSize(); };
}
showDay(1);
activate(0,false);
setupMap();
var cfg={type:'bar',data:{labels:['门票','餐饮','市内交通','住宿(2晚)','茶叶/机动'],datasets:[{label:'舒适档',data:[210,645,145,1160,180],backgroundColor:['rgba(56,120,150,.55)','rgba(196,92,38,.55)','rgba(80,140,90,.55)','rgba(90,90,140,.55)','rgba(180,150,70,.55)']}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:0}},y:{beginAtZero:true}}}};
var cv=document.getElementById('budgetChart');
if(window.iuiCreateChart) window.iuiCreateChart(cv,cfg); else if(window.Chart) new Chart(cv,cfg);
document.getElementById('pickBudget0').onclick=function(){ if(window.iuiSandbox) iuiSandbox.sendPrompt('按轻装 ¥980 重排杭州三天单人线，保留免费湖景和灵隐');
};
document.getElementById('pickBudget1').onclick=function(){ if(window.iuiSandbox) iuiSandbox.sendPrompt('按舒适档 ¥2340 细化杭州三天餐饮预订和酒店区域');
};
document.getElementById('pickBudget2').onclick=function(){ if(window.iuiSandbox) iuiSandbox.sendPrompt('按精致档做杭州三天湖景酒店+包车+楼外楼版本');
};
document.getElementById('btnMetro').onclick=function(){ if(window.iuiSandbox) iuiSandbox.openLink('https://www.hzmetro.com/');
};
document.getElementById('btnHz').onclick=function(){ if(window.iuiSandbox) iuiSandbox.openLink('https://www.gotohz.com/');
};
document.getElementById('btnRain').onclick=function(){ if(window.iuiSandbox) iuiSandbox.sendPrompt('杭州三天单人线如果下秋雨，给我一天一备选的室内B计划');
};
})();