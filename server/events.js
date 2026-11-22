// Server-driven events + simple web admin (3.13). Nothing here needs an app update: the app fetches GET /api/events.
// Admin: /admin (login with ADMIN_USER + ADMIN_PASS_HASH = scrypt$N$saltHex$hashHex; sessions are HMAC-signed cookies).
const crypto=require('crypto'),https=require('https'),store=require('./store.js');
const LANGS=['en','es','fr','de','zh','ar','ur','hi','bn','tr','pt','id'];
const TL={en:'en',es:'es',fr:'fr',de:'de',zh:'zh-CN',ar:'ar',ur:'ur',hi:'hi',bn:'bn',tr:'tr',pt:'pt',id:'id'};
const COMM=['all','muslim','hindu','sikh','christian','general'];
const DEF_REWARDS={welcomeCoins:10000,welcomeGems:25,eventLevelGems:0,freeEventGems:600};
function db(){let d=store.get('events');if(!d||!Array.isArray(d.events)){d={events:[],log:[],rewards:Object.assign({},DEF_REWARDS),joins:{}};store.set('events',d)}d.rewards=Object.assign({},DEF_REWARDS,d.rewards||{});d.joins=d.joins||{};d.log=d.log||[];return d}
function save(){store.set('events',db(),500)}
const clean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').slice(0,n);
const noDash=s=>String(s||'').replace(/[\u2013\u2014]/g,'-');
function normEvent(x,old){const e=Object.assign({},old||{});
 e.id=old?old.id:(/^[a-z0-9]{2,12}$/.test(x.id||'')?x.id:('e'+crypto.randomBytes(4).toString('hex')).slice(0,10));
 const tx=(o,en)=>{const r={};LANGS.forEach(l=>{const v=o&&o[l];if(v)r[l]=noDash(clean(v,l==='en'?en:300))});return r};
 e.name=tx(x.name,80);e.desc=tx(x.desc,300);e.edited=x.edited&&typeof x.edited==='object'?x.edited:{};
 e.community=COMM.includes(x.community)?x.community:'all';e.icon=clean(x.icon||'ramadan',16);
 e.start=+x.start||Date.now();e.end=+x.end||(e.start+7*864e5);if(e.end<=e.start)e.end=e.start+864e5;
 e.fee=Math.max(0,Math.min(1e5,x.fee|0));e.seed=Math.max(0,Math.min(1e7,x.seed|0));
 let sp=Array.isArray(x.split)?x.split.map(n=>Math.max(0,Math.min(100,+n||0))).slice(0,50):[35,20,12];const sum=sp.reduce((a,b)=>a+b,0);if(sum>100||!sp.length)sp=[35,20,12];e.split=sp;
 const m=x.mission||{};e.mission={type:['play','win'].includes(m.type)?m.type:'play',target:Math.max(1,Math.min(1000,m.target|0||20)),mode:clean(m.mode||'any',12)};
 // 3.15: up to 12 rewards; coins and event items (r01..r86) besides gems and pawns. Legacy gems stay capped at 100,000 here (old apps grant them on the phone).
 e.rewards=(Array.isArray(x.rewards)?x.rewards:[]).slice(0,12).map(r=>r&&r.type==='pawn'?{type:'pawn',id:clean(r.id,40)}:r&&r.type==='item'?{type:'item',id:clean(r.id,8),n:Math.max(1,Math.min(99,r.n|0||1))}:r&&r.type==='coins'?{type:'coins',n:Math.max(0,Math.min(1e8,Math.floor(+r.n||0)))}:{type:'gems',n:Math.max(0,Math.min(1e5,r&&r.n|0))});
 if(x.v2!==undefined)e.v2=x.v2?normV2(x.v2):undefined;if(!e.v2)delete e.v2;
 e.audience=clean(x.audience||(e.v2&&e.v2.audience)||(e.community==='all'?'everyone':e.community+' community only'),40);
 e.active=x.active!==false;e.updated=Date.now();return e}
// ---- 3.15 events v3 (server scored) ----
const KINDS=['flagship','pass','month','twoweek','week','weekly','weekend','threeday','oneday','streak','friday'];
const int=(v,lo,hi,d)=>{const n=Math.floor(+v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d};
const itemId=v=>/^r\d{2}$/.test(String(v||''))?String(v):null;
function normReward(r){r=r||{};if(r.type==='coins')return {type:'coins',n:int(r.n,0,1e8,0)};if(r.type==='gems')return {type:'gems',n:int(r.n,0,2e6,0)};
 const id=itemId(r.id);return id?{type:'item',id,n:int(r.n,1,99,1)}:{type:'coins',n:0}}
function normV2(v){v=v||{};const p=v.points||{};const af=v.antiFarm||{};const reg=v.registration||{};
 const o={kind:KINDS.includes(v.kind)?v.kind:'week',icon:clean(v.icon||'trophy',16),joinRequired:true,onlineOnly:true,freeToJoin:true,fee:0,
  minGames:int(v.minGames,0,500,3),target:int(v.target,1,1e7,600),
  points:{played:int(p.played,0,1000,10),win:int(p.win,0,1000,30),second:int(p.second,0,1000,15),capture:int(p.capture,0,100,2),captureCapPerMatch:int(p.captureCapPerMatch,0,100,8)},
  pointsMode:v.pointsMode==='consecutiveWins'?'consecutiveWins':'sum',
  antiFarm:{maxCountedMatchesPerDay:int(af.maxCountedMatchesPerDay,1,500,40),sameOpponentCountsPerDay:int(af.sameOpponentCountsPerDay,1,100,3),ignoreBotOnlyMatches:af.ignoreBotOnlyMatches!==false,ignoreFriendAndPrivateTables:af.ignoreFriendAndPrivateTables!==false,requirePlayIntegrity:['off','log','enforce'].includes(af.requirePlayIntegrity)?af.requirePlayIntegrity:'log',leaveEarlyNoPoints:af.leaveEarlyNoPoints!==false},
  popup:{onAppOpen:!!(v.popup&&v.popup.onAppOpen),priority:int(v.popup&&v.popup.priority,1,9,4)},
  milestones:(Array.isArray(v.milestones)?v.milestones:[]).slice(0,40).map(m=>({pts:int(m&&m.pts,0,1e7,0),wins:m&&m.wins!=null?int(m.wins,0,1000,0):undefined,level:m&&m.level!=null?int(m.level,0,1000,0):undefined,extra:!!(m&&m.extra),reward:normReward(m&&m.reward)})),
  ranks:(Array.isArray(v.ranks)?v.ranks:[]).slice(0,12).map(r=>({from:int(r&&r.from,1,1e5,1),to:int(r&&r.to,1,1e5,1),gems:int(r&&r.gems,0,2e6,0),coins:int(r&&r.coins,0,1e8,0),items:(Array.isArray(r&&r.items)?r.items:[]).map(itemId).filter(Boolean).slice(0,10),showcase:!!(r&&r.showcase),showcaseDays:int(r&&r.showcaseDays,0,30,7)})),
  days:int(v.days,1,400,7),audience:clean(v.audience||'everyone',40),
  registration:{days:int(reg.days,0,30,7),minPlayers:int(reg.minPlayers,0,1e6,20),lateJoin:!!reg.lateJoin}};
 if(v.flagship){const f=v.flagship;o.flagship={title:clean(f.title||'Sultan of Ludo Sultan',60),winnerTitle:clean(f.winnerTitle||'Sultan of Sultans',60),winners:1,
  showcaseDays:int(f.showcase&&f.showcase.durationDays,1,30,7),fameNotice:noDash(clean(f.fameNotice||'',300)),leaderboardTop:int(f.leaderboardTop,10,1000,100),
  rank1Prize:{gems:int(f.rank1Prize&&f.rank1Prize.gems,0,2e6,0),coins:int(f.rank1Prize&&f.rank1Prize.coins,0,1e8,0)}}}
 return o}
function pool(e){const d=db();const n=Object.keys(d.joins[e.id]||{}).length;return e.seed+e.fee*n}
function pub(e){const d=db();return {id:e.id,name:e.name,desc:e.desc,community:e.community,icon:e.icon,start:e.start,end:e.end,fee:e.fee,free:e.fee===0,split:e.split,pool:pool(e),players:Object.keys(d.joins[e.id]||{}).length,mission:e.mission,rewards:e.rewards}}
function publicConfig(){const d=db(),now=Date.now();
 // 3.15: v3 events (with v2 rules) are only for 3.15+ apps (GET /api/ev3); 3.14.x keeps the legacy list unchanged
 const list=d.events.filter(e=>e.active&&!e.v2&&e.end>now-3*864e5).sort((a,b)=>a.start-b.start).map(pub);
 return {now,rewards:d.rewards,events:list,v:1}}
function join(id,pid){const d=db(),e=d.events.find(x=>x.id===id&&x.active&&!x.v2);if(!e||Date.now()>e.end)return {ok:false,error:'closed'};pid=clean(pid,40);if(!pid)return {ok:false,error:'pid'};
 const j=d.joins[id]=d.joins[id]||{};j[pid]=1;save();return {ok:true,pool:pool(e),players:Object.keys(j).length}}
// ---- free translation (MyMemory, no key); falls back to manual editing in the admin ----
function translate(text,to){return new Promise(res=>{if(to==='en'||!text)return res(text);
 const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en|'+encodeURIComponent(TL[to]||to);
 const rq=https.get(url,{timeout:7000},r=>{let b='';r.on('data',c=>{b+=c;if(b.length>2e5)rq.destroy()});r.on('end',()=>{try{const j=JSON.parse(b);const t=j&&j.responseData&&j.responseData.translatedText;res(t&&j.responseStatus==200?noDash(t):null)}catch(e){res(null)}})});
 rq.on('error',()=>res(null));rq.on('timeout',()=>{rq.destroy();res(null)})})}
// ---- admin auth ----
function verify(pass){const h=process.env.ADMIN_PASS_HASH||'',p=h.split('$');if(p[0]!=='scrypt'||p.length!==4)return false;try{const N=+p[1],salt=Buffer.from(p[2],'hex'),want=Buffer.from(p[3],'hex');const got=crypto.scryptSync(String(pass),salt,want.length,{N,r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(got,want)}catch(e){return false}}
const SECRET=()=>process.env.ADMIN_SECRET||crypto.createHash('sha256').update('ls-admin|'+(process.env.ADMIN_PASS_HASH||'')).digest('hex');
const sign=s=>crypto.createHmac('sha256',SECRET()).update(s).digest('hex');
function mkToken(){const exp=Date.now()+12*3600e3,body=String(exp);return body+'.'+sign('s'+body)}
function okToken(t){if(!t)return false;const [b,s]=String(t).split('.');if(!b||!s||+b<Date.now())return false;const w=sign('s'+b);return s.length===w.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(w))}
const fails=new Map();function limited(ip){const f=fails.get(ip);return f&&f.n>=6&&Date.now()-f.t<15*60e3}
function cookie(req){const m=/(?:^|;\s*)lsadm=([^;]+)/.exec(req.headers.cookie||'');return m&&m[1]}
function J(res,c,o){res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))}
function body(req,cb){let b='';req.on('data',d=>{b+=d;if(b.length>2e5)req.destroy()});req.on('end',()=>{try{cb(JSON.parse(b||'{}'))}catch(e){cb(null)}})}
function handle(req,res,u){
 if(u==='/api/events'||u==='/api/events/join'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true}
  if(u==='/api/events'&&req.method==='GET'){J(res,200,publicConfig());return true}
  if(u==='/api/events/join'&&req.method==='POST'){body(req,m=>{if(!m)return J(res,400,{ok:false});J(res,200,join(String(m.id||''),m.pid))});return true}
  J(res,405,{error:'method'});return true}
 if(u==='/admin'||u==='/admin/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'});res.end(require('./admin-html.js')());return true}
 if(!u.startsWith('/admin/api/'))return false;
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 if(u==='/admin/api/login'&&req.method==='POST'){if(limited(ip))return J(res,429,{error:'Too many attempts, try later'}),true;
  body(req,m=>{if(!m)return J(res,400,{error:'bad'});const okU=process.env.ADMIN_USER&&crypto.timingSafeEqual(crypto.createHash('sha256').update(String(m.user||'')).digest(),crypto.createHash('sha256').update(process.env.ADMIN_USER).digest());
   if(okU&&verify(m.pass)){fails.delete(ip);res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':'lsadm='+mkToken()+'; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=43200'+(req.headers['x-forwarded-proto']==='https'?'; Secure':'')});res.end('{"ok":true}')}
   else{const f=fails.get(ip)||{n:0,t:0};f.n++;f.t=Date.now();fails.set(ip,f);J(res,401,{error:'Wrong username or password'})}});return true}
 const adm=require('./liveops.js').adminOf(req);if(!adm){J(res,401,{error:'login'});return true}const LO=require('./liveops.js');
 const d=db();
 if(u==='/admin/api/state'&&req.method==='GET'){J(res,200,{events:d.events.map(e=>Object.assign({},e,{pool:pool(e),players:Object.keys(d.joins[e.id]||{}).length})),rewards:d.rewards,log:d.log.slice(-8).reverse(),langs:LANGS,now:Date.now(),user:process.env.ADMIN_USER||''});return true}
 if(u==='/admin/api/translate'&&req.method==='POST'){body(req,async m=>{if(!m||!m.text)return J(res,400,{error:'text'});const langs=(Array.isArray(m.langs)?m.langs:LANGS).filter(l=>LANGS.includes(l));const out={};
  for(const l of langs){out[l]=l==='en'?m.text:await translate(String(m.text).slice(0,300),l)}J(res,200,{out})});return true}
 if(u==='/admin/api/event'&&req.method==='POST'){body(req,m=>{if(!m)return J(res,400,{error:'bad'});const old=m.id&&d.events.find(x=>x.id===m.id);const e=normEvent(m,old);if(!e.name.en)return J(res,400,{error:'English name required'});
  const before=old?JSON.parse(JSON.stringify(old)):null;if(old)Object.assign(old,e);else d.events.push(e);LO.audit(adm.user,'event',e.name.en,(old?'Updated event ':'Created event ')+e.name.en,{type:'event',id:e.id,before});d.log.push({t:Date.now(),m:(old?'Updated ':'Created ')+e.name.en});d.log=d.log.slice(-50);save();J(res,200,{ok:true,id:e.id})});return true}
 if(u==='/admin/api/event/delete'&&req.method==='POST'){body(req,m=>{const i=d.events.findIndex(x=>x.id===(m&&m.id));if(i<0)return J(res,404,{error:'unknown'});d.log.push({t:Date.now(),m:'Deleted '+(d.events[i].name.en||m.id)});LO.audit(adm.user,'event',d.events[i].name.en||m.id,'Deleted event '+(d.events[i].name.en||m.id),{type:'event',id:d.events[i].id,before:JSON.parse(JSON.stringify(d.events[i]))});d.events.splice(i,1);save();J(res,200,{ok:true})});return true}
 if(u==='/admin/api/rewards'&&req.method==='POST'){body(req,m=>{if(!m)return J(res,400,{error:'bad'});const r=d.rewards;const rb=Object.assign({},r);for(const k of Object.keys(DEF_REWARDS)){if(m[k]!=null)r[k]=Math.max(0,Math.min(1e7,m[k]|0))}d.log.push({t:Date.now(),m:'Updated diamond/coin rewards'});LO.audit(adm.user,'rewards','welcome','Updated welcome/event rewards',{type:'event',rewards:rb});save();J(res,200,{ok:true,rewards:r})});return true}
 J(res,404,{error:'unknown'});return true}
// 3.14 liveops: extend / end now / reopen, and undo support
function adminExtend(m,user){const d=db(),e=d.events.find(x=>x.id===m.id);if(!e)throw new Error('Unknown event');const before=JSON.parse(JSON.stringify(e));const now=Date.now();
 if(m.action==='extend'){const days=Math.max(-60,Math.min(365,+m.days||0));if(!days)throw new Error('Days needed');e.end=Math.max(e.start+36e5,e.end+days*864e5);e.active=true}
 else if(m.action==='end'){e.end=Math.min(e.end,now);}
 else if(m.action==='pause'){e.active=false}else if(m.action==='resume'){e.active=true}
 else if(m.action==='setEnd'){const t=+m.end;if(!(t>e.start))throw new Error('End must be after start');e.end=t;e.active=true}
 else throw new Error('Unknown action');
 e.updated=now;save();require('./liveops.js').audit(user,'event',e.name.en,({extend:'Extended by '+m.days+' day(s)',end:'Ended now',pause:'Paused (hidden)',resume:'Resumed',setEnd:'New end date'})[m.action]+': '+e.name.en,{type:'event',id:e.id,before});
 return {event:e}}
function adminRestore(u){const d=db();if(u.rewards){d.rewards=Object.assign({},u.rewards);save();return}const i=d.events.findIndex(x=>x.id===u.id);
 if(u.before){if(i>=0)d.events[i]=u.before;else d.events.push(u.before)}else if(i>=0)d.events.splice(i,1);save()}
module.exports={db,save,normV2,adminExtend,adminRestore,handle,publicConfig,normEvent,join,verify,DEF_REWARDS,LANGS};
