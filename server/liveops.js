// LiveOps (3.14.0): everything small is changed from the server / admin panel, no APK needed.
// Public: GET /api/config, POST /api/hello, GET /api/mail, POST /api/mail/claim, POST /api/redeem, POST /api/telemetry,
//         GET /api/ota (manifest), GET /api/ota/b/<id>.gz (signed web bundle)
// Admin:  /admin (panel), /admin/api/login|logout|me, /admin/api/lo/* (owner + support roles, audit log with undo)
// Rewards are decided by the server: the app only receives grants the server created, each grant can be claimed once per player.
const crypto=require('crypto'),fs=require('fs'),path=require('path'),zlib=require('zlib'),store=require('./store.js'),IG=require('./integrity.js');
const K='liveops',KP='loplayers';
const DATA_DIR=process.env.LO_DATA_DIR||path.join(__dirname,'data');
const LANGS=['en','es','fr','de','zh','ar','ur','hi','bn','tr','pt','id'];
const FLAGS=[['onlinePlay','Online play','Quick match, rooms, tables'],['voice','Voice rooms','All countries'],['minigames','Mini Games tab','Carrom, Chess, Dominoes and more'],
 ['tournaments','Tournaments','8-player cups'],['events','Events hub','Server events and cups'],['spin','Lucky Spin','Daily free spin'],['daily','Daily rewards','7-day login calendar'],
 ['rewardedAds','Rewarded ads','Free coins and diamonds buttons'],['customEmoji','Custom emoji maker','Make your own emojis'],['clubsChat','Clubs chat','Club messages'],
 ['dm','Private messages','Player to player chat'],['shop','Store','Coins and diamonds shop'],['nightMode','Night mode board','Truck night scene'],['mail','Mailbox','Gifts and messages inbox'],['promo','Gift codes','Redeem code box in settings']];
const DEF_BADGES=[
 {n:'Newcomer',g:5,w:0,k:0},{n:'First Steps',g:10,w:30,k:0},{n:'Rising Star',g:20,w:40,k:.5},{n:'Steady Hand',g:35,w:45,k:.7},
 {n:'Competitor',g:55,w:48,k:.8},{n:'Hunter',g:80,w:50,k:1.0},{n:'Fighter',g:115,w:52,k:1.1},{n:'Striker',g:160,w:54,k:1.2},
 {n:'Tactician',g:220,w:56,k:1.3},{n:'Warrior',g:300,w:57,k:1.4},{n:'Sharp Blade',g:405,w:58,k:1.5},{n:'Veteran Champion',g:545,w:60,k:1.7},
 {n:'Elite Hunter',g:730,w:61,k:1.9},{n:'Shadow',g:975,w:62,k:2.0},{n:'Grand Strategist',g:1295,w:63,k:2.2},{n:'Unstoppable',g:1715,w:64,k:2.4},
 {n:'Legend Hunter',g:2260,w:66,k:2.6},{n:'Apex Hunter',g:2970,w:67,k:2.8},{n:'Immortal',g:3890,w:69,k:3.0},{n:'Sultan of Ludo',g:5000,w:70,k:3.2}];
const copyBadges=a=>(a||DEF_BADGES).map(b=>({n:b.n,g:b.g,w:b.w,k:b.k}));
const DEF_CFG=()=>({v:1,updated:Date.now(),
 flags:Object.fromEntries(FLAGS.map(f=>[f[0],true])),
 daily:[{c:200},{g:3},{g:5},{c:300,g:2},{c:150,g:2},{c:400,g:3},{c:750,g:10}],
 spin:[{k:'c',n:200,w:22},{k:'g',n:3,w:18},{k:'c',n:500,w:18},{k:'g',n:5,w:12},{k:'c',n:1000,w:12},{k:'s',n:0,w:4},{k:'c',n:2500,w:8},{k:'g',n:10,w:6}],
 store:{packs:{},hidden:[],offer:null},
 popups:[],
 maintenance:{on:false,msg:{en:'Ludo Sultan is getting a quick update. Online play is back soon. You can still play offline.'},until:0,blockOnline:true},
 update:{minVc:0,latestVc:0,msg:{en:'A new version of Ludo Sultan is ready with new features and fixes.'},url:'https://play.google.com/store/apps/details?id=com.ludosultan.game'},
 vars:{},
 badges:copyBadges(),
 chat:{blocked:[]},
 integrity:{mode:'log',ttlMin:60,maxAgeSec:300,needDevice:true,needLicensed:true,actions:['claim','redeem','match']},
 mailPoll:300});
const SKUS=['ls_gems_100','ls_gems_500','ls_gems_1000','ls_gems_2500','ls_gems_5000','ls_gems_10000','ls_coins_10k','ls_coins_30k','ls_coins_100k','ls_coins_250k','ls_coins_1m','ls_coins_2m','ls_starter_pack'];
const CAP={personalCoins:50e6,personalGems:5e4,audienceCoins:1e5,audienceGems:1000,codeCoins:1e5,codeGems:1000};
const clean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').replace(/[\u2013\u2014]/g,'-').slice(0,n);
const int=(x,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(+x||0)));
function normBadges(x){if(!Array.isArray(x)||x.length!==20)throw new Error('20 badges needed');
 const out=x.map((y,i)=>{const n=clean(y&&y.n!=null?y.n:DEF_BADGES[i].n,40).trim();const g=int(y&&y.g,1,1e7);
  const w=Math.max(0,Math.min(100,+(y&&y.w)||0)),k=Math.max(0,Math.min(100,+(y&&y.k)||0));
  if(!n)throw new Error('Badge '+(i+1)+' needs a name');return {n,g,w:Math.round(w*10)/10,k:Math.round(k*100)/100}});
 for(let i=1;i<20;i++)if(!(out[i].g>out[i-1].g))throw new Error('Games must increase at each badge');return out}
const now=()=>Date.now();
const dayKey=t=>new Date(t||now()).toISOString().slice(0,10);
const rid=p=>p+crypto.randomBytes(5).toString('hex');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const tx=(o,n)=>{const r={};if(typeof o==='string')o={en:o};LANGS.forEach(l=>{const v=o&&o[l];if(v)r[l]=clean(v,n||400)});return r};
// ---------------- state ----------------
function S(){let d=store.get(K);if(!d||typeof d!=='object')d={};let ch=false;
 if(!d.cfg){d.cfg=DEF_CFG();ch=true}else{const def=DEF_CFG();for(const k of Object.keys(def))if(d.cfg[k]==null){d.cfg[k]=def[k];ch=true}d.cfg.flags=Object.assign({},def.flags,d.cfg.flags)}
 for(const [k,v] of [['hist',[]],['mail',[]],['codes',{}],['mod',{bans:{},mutes:{},handled:{}}],['audit',[]],['ota',{bundles:[],current:null,staged:null,paused:false,health:{}}],['stats',{days:{}}],['themes',{defs:{},schedule:[]}],['ig',{days:{},recent:[]}]])if(!d[k]){d[k]=v;ch=true}
 if(ch)store.set(K,d);return d}
function save(){store.set(K,S(),800)}
function P(){let p=store.get(KP);if(!p||typeof p!=='object'){p={};store.set(KP,p)}return p}
function saveP(){store.set(KP,P(),3000)}
function day(){const st=S().stats,k=dayKey();const o=st.days[k]=st.days[k]||{newPlayers:0,active:0,matches:0,claims:0,coins:0,gems:0,redeems:0,errors:0,boots:0,rollbacks:0,peak:0};
 const keys=Object.keys(st.days).sort();while(keys.length>90)delete st.days[keys.shift()];return o}
let ctx={clients:new Map(),rooms:new Map(),accounts:null};
function bind(c){ctx=Object.assign(ctx,c||{});setInterval(()=>{try{const o=day(),n=online();if(n>o.peak){o.peak=n;save()}}catch(e){}},60e3).unref()}
function online(){let n=0;for(const c of ctx.clients.values())if(c.ws&&c.ws.readyState===1)n++;return n}
function stat(k,n){try{day()[k]=(day()[k]||0)+(n==null?1:n);save()}catch(e){}}
// ---------------- audit log (append only) + undo ----------------
function audit(by,action,target,summary,undo){const a=S().audit;const e={id:rid('a'),t:now(),by:clean(by||'system',30),action,target:clean(target||'',80),summary:clean(summary||'',200),undo:undo||null,undone:false};
 a.push(e);if(a.length>1000)a.splice(0,a.length-1000);save();return e}
// ---------------- moderation ----------------
const sUsers=()=>{const s=store.get('social');return (s&&s.users)||{}};
function pidOf(idOrFid){const x=String(idOrFid||'').trim();if(!x)return null;if(P()[x])return x;const u=sUsers()[x.toUpperCase()];if(u&&u.pid)return u.pid;
 for(const [pid,p] of Object.entries(P()))if(p.fid===x.toUpperCase())return pid;return x.length>=8?x:null}
function active(rec){return rec&&(!rec.until||rec.until>now())}
function banned(pid){const r=S().mod.bans[pid];return active(r)?r:null}
function muted(pid){const r=S().mod.mutes[pid];return active(r)?r:null}
function maintenance(){const m=S().cfg.maintenance;if(!m||!m.on)return null;if(m.until&&m.until<now())return null;return m}
// ---------------- players (device registry, TOFU key) ----------------
function country(m){const c=String(m.country||'').toUpperCase();if(/^[A-Z]{2}$/.test(c))return c;const l=/[-_]([A-Za-z]{2})$/.exec(String(m.locale||''));return l?l[1].toUpperCase():''}
function hello(m,ip){const pid=clean(m.pid,40);if(pid.length<8)return {code:400,body:{error:'pid'}};
 const PL=P();let p=PL[pid],fresh=false,key=null;
 if(!p){p=PL[pid]={first:now(),c:[]};fresh=true;stat('newPlayers')}
 if(!p.k){key=crypto.randomBytes(18).toString('base64url');p.k=sha(key)}
 else if(!m.key||sha(String(m.key))!==p.k){// lost key (data cleared / cloud restore on a new phone): an account session that owns this pid can re-key
  const owner=ctx.accounts&&m.token&&ctx.accounts.pidForToken&&ctx.accounts.pidForToken(String(m.token));
  if(owner===pid){key=crypto.randomBytes(18).toString('base64url');p.k=sha(key)}else return {code:409,body:{error:'key',msg:'device key mismatch'}}}
 if(!p.last||dayKey(p.last)!==dayKey())stat('active');
 p.last=now();p.ver=clean(m.ver,16);p.vc=int(m.vc,0,1e6);p.bundle=clean(m.bundle,40);p.lang=clean(m.lang,5);p.country=country(m)||p.country||'';p.name=clean(m.name,20)||p.name||'';
 p.fid=crypto.createHash('sha256').update('ls-friend:'+pid).digest('hex').slice(0,6).toUpperCase();p.coins=int(m.coins,0,1e12);p.gems=int(m.gems,0,1e9);p.level=int(m.level,0,9999);p.games=int(m.games,0,1e7);p.ip=sha('ip|'+ip).slice(0,10);
 saveP();const b=banned(pid),mu=muted(pid);
 return {code:200,body:{ok:true,key:key||undefined,fresh,banned:b?{until:b.until||0,reason:b.reason||''}:null,muted:mu?{until:mu.until||0}:null,mail:pending(pid,p).length,now:now()}}}
function auth(m){const pid=clean(m&&m.pid,40);const p=P()[pid];if(!p||!p.k||!m.key||sha(String(m.key))!==p.k)return null;return {pid,p}}
// ---------------- mail / grants / giveaways ----------------
function matches(g,pid,p){if(g.revoked)return false;const t=now();if(g.start&&g.start>t)return false;if(g.expire&&g.expire<t)return false;
 if(g.aud==='player')return g.pid===pid;
 if(g.aud==='list')return (g.pids||[]).includes(pid);
 if(g.onlyExisting&&p.first>g.created)return false;
 if(g.minVc&&(p.vc||0)<g.minVc)return false;
 if(g.aud==='country')return (g.countries||[]).includes(p.country);
 return g.aud==='all'}
function pending(pid,p){if(!p)return [];const c=new Set(p.c||[]);return S().mail.filter(g=>!c.has(g.id)&&matches(g,pid,p)&&(!g.cap||(g.claims||0)<g.cap))}
function pubMail(g){return {id:g.id,title:g.title,msg:g.msg,coins:g.coins,gems:g.gems,item:g.item||null,expire:g.expire||0,t:g.start||g.created,kind:g.kind||'gift'}}
function claim(pid,p,id){const g=S().mail.find(x=>x.id===id);if(!g||!matches(g,pid,p))return {ok:false,error:'gone'};
 p.c=p.c||[];if(p.c.includes(id))return {ok:false,error:'claimed'};if(g.cap&&(g.claims||0)>=g.cap)return {ok:false,error:'empty'};
 p.c.push(id);if(p.c.length>400)p.c=p.c.slice(-400);g.claims=(g.claims||0)+1;g.coinsOut=(g.coinsOut||0)+g.coins;g.gemsOut=(g.gemsOut||0)+g.gems;
 const o=day();o.claims++;if(g.coins>0)o.coins+=g.coins;if(g.gems>0)o.gems+=g.gems;saveP();save();
 try{require('./wallet.js').onMailClaim(pid,g)}catch(e){console.error('wallet claim',e.message)}// 3.15: server wallet (only players who have one)
 return {ok:true,grant:{id:g.id,coins:g.coins,gems:g.gems,item:g.item||null,title:g.title}}}
function normGrant(m,by,role){const aud=['player','list','all','country'].includes(m.aud)?m.aud:'player';const personal=aud==='player'||aud==='list';
 if(role==='support'&&!personal)throw new Error('Support role can only send to single players');
 const cc=personal?CAP.personalCoins:CAP.audienceCoins,cg=personal?CAP.personalGems:CAP.audienceGems;
 const coins=Math.round(+m.coins||0),gems=Math.round(+m.gems||0);
 if(Math.abs(coins)>cc||Math.abs(gems)>cg)throw new Error(`Safety limit: max ${cc.toLocaleString('en-US')} coins / ${cg.toLocaleString('en-US')} diamonds`);
 if(!personal&&(coins<0||gems<0))throw new Error('Remove coins only from single players');
 const item=m.item&&m.item.id?{type:['dice','token','board','frame','pawn'].includes(m.item.type)?m.item.type:'dice',id:clean(m.item.id,40),days:int(m.item.days,0,3650)}:null;
 if(!coins&&!gems&&!item)throw new Error('Nothing to send');
 const g={id:rid('g'),aud,coins,gems,item,title:tx(m.title||{en:coins<0||gems<0?'Balance correction':'A gift for you'},60),msg:tx(m.msg||{en:''},400),
  kind:coins<0||gems<0?'adjust':(m.kind==='comp'?'comp':'gift'),created:now(),start:+m.start||now(),expire:+m.expire||(now()+30*864e5),by,reason:clean(m.reason,200),claims:0,cap:int(m.cap,0,1e7),
  onlyExisting:!!m.onlyExisting,minVc:int(m.minVc,0,1e6)};
 if(aud==='player'){const pid=pidOf(m.to);if(!pid)throw new Error('Player not found');g.pid=pid}
 if(aud==='list'){g.pids=String(m.to||'').split(/[\s,;]+/).map(pidOf).filter(Boolean).slice(0,5000);if(!g.pids.length)throw new Error('No valid player IDs')}
 if(aud==='country'){g.countries=String(m.countries||m.to||'').toUpperCase().split(/[\s,;]+/).filter(c=>/^[A-Z]{2}$/.test(c)).slice(0,60);if(!g.countries.length)throw new Error('Add country codes like PK, IN, SA')}
 return g}
function reach(g){const PL=P();let n=0;for(const [pid,p] of Object.entries(PL)){if(matches(Object.assign({},g,{start:0}),pid,p))n++}return n}
// ---------------- promo / gift codes ----------------
const redeemTries=new Map();
function redeem(pid,p,code,ip){const k=pid+'|'+ip;const r=redeemTries.get(k)||{n:0,t:now()};if(now()-r.t>3600e3){r.n=0;r.t=now()}r.n++;redeemTries.set(k,r);if(r.n>10)return {ok:false,error:'Too many tries, wait one hour'};
 const C=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20);const c=S().codes[C];
 if(!c||!c.on)return {ok:false,error:'Code not valid'};const t=now();if(c.start&&c.start>t)return {ok:false,error:'Code not active yet'};if(c.end&&c.end<t)return {ok:false,error:'Code expired'};
 if(c.maxUses&&c.uses>=c.maxUses)return {ok:false,error:'Code fully used'};c.by=c.by||{};if(c.by[pid])return {ok:false,error:'Already used'};
 if(c.country&&c.country!==p.country)return {ok:false,error:'Code not valid in your country'};
 c.uses=(c.uses||0)+1;c.by[pid]=t;const ks=Object.keys(c.by);if(ks.length>20000)delete c.by[ks[0]];stat('redeems');
 const g={id:rid('g'),aud:'player',pid,coins:c.coins,gems:c.gems,item:c.item||null,title:{en:'Gift code '+C},msg:{en:''},kind:'code',created:t,start:t,expire:t+7*864e5,by:'code:'+C,claims:0};
 S().mail.push(g);trimMail();save();return Object.assign(claim(pid,p,g.id),{code:C})}
// 3.15 events v3: personal reward mail created by the server (milestones, ranks). Works for every app version (mailbox).
function grantTo(pid,o){pid=clean(pid,40);if(!pid)return null;const t=now();const g={id:rid('g'),aud:'player',pid,coins:Math.trunc(+o.coins||0),gems:Math.trunc(+o.gems||0),item:o.item&&o.item.id?{type:clean(o.item.type||'ev3',16),id:clean(o.item.id,40),n:Math.max(1,o.item.n|0||1)}:null,
 title:o.title&&typeof o.title==='object'?o.title:{en:String(o.title||'Event reward').slice(0,80)},msg:o.msg&&typeof o.msg==='object'?o.msg:{en:String(o.msg||'').slice(0,200)},kind:o.kind||'event',created:t,start:t,expire:t+60*864e5,by:'events',reason:String(o.reason||'').slice(0,120),ref:o.ref||undefined};
 S().mail.push(g);trimMail();save();return g}
function trimMail(){const m=S().mail;const t=now();for(let i=m.length-1;i>=0&&m.length>3000;i--){if(m[i].expire&&m[i].expire<t-30*864e5)m.splice(i,1)}}
// ---------------- themes (engine: default + scheduled packs delivered by the OTA bundle) ----------------
function themeNow(){const th=S().themes,t=now();const live=(th.schedule||[]).filter(s=>s.on!==false&&s.start<=t&&s.end>t).sort((a,b)=>b.start-a.start)[0];
 const soon=(th.schedule||[]).filter(s=>s.on!==false&&s.start>t&&s.start-t<(s.leadDays||0)*864e5);
 return {active:live?live.theme:'default',until:live?live.end:0,teaser:soon.map(s=>({theme:s.theme,start:s.start,banner:s.banner||null})),
  schedule:(th.schedule||[]).filter(s=>s.on!==false&&s.end>t&&s.start-t<30*864e5).map(s=>({id:s.id,theme:s.theme,start:s.start,end:s.end,banner:s.banner||null,community:s.community||'all'})),defs:th.defs||{}}}
// ---------------- public config ----------------
let cfgCache={at:0,etag:'',json:''};
function publicConfig(){const d=S(),c=d.cfg,t=now();let ev={events:[],rewards:{}};try{ev=require('./events.js').publicConfig()}catch(e){}
 return {v:c.v,now:t,flags:c.flags,daily:c.daily,spin:c.spin,store:c.store,
  popups:(c.popups||[]).filter(p=>p.on!==false&&(!p.end||p.end>t)&&(!p.start||p.start-t<14*864e5)),
  maintenance:maintenance(),update:c.update,vars:c.vars,badges:c.badges||copyBadges(),chat:c.chat,mailPoll:c.mailPoll||300,
  rewards:ev.rewards,events:ev.events,theme:themeNow(),ota:{enabled:!d.ota.paused},integrity:igPublic(c)}}
function configJson(){if(now()-cfgCache.at<15e3)return cfgCache;const j=JSON.stringify(publicConfig());cfgCache={at:now(),etag:'"'+sha(j.replace(/"now":\d+,/,'')).slice(0,16)+'"',json:j};return cfgCache}
function bust(){cfgCache.at=0}
function publish(by,section,before,summary){const c=S().cfg;S().hist.push({v:c.v,t:now(),by,snap:JSON.parse(JSON.stringify(before))});if(S().hist.length>40)S().hist.shift();c.v++;c.updated=now();save();bust();
 return audit(by,'config',section,summary||('Published config v'+c.v),{type:'cfg',section,before:before[section]})}
// ---------------- OTA ----------------
const OTA_PUB=()=>process.env.OTA_PUBLIC_KEY||(()=>{try{return fs.readFileSync(path.join(__dirname,'ota-pub.pem'),'utf8')}catch(e){return ''}})();
function verifyBundle(raw,sha256,sigB64){if(sha(raw)!==sha256)return 'SHA-256 does not match';const pub=OTA_PUB();if(!pub)return 'No OTA public key on the server';
 try{if(!crypto.verify('sha256',Buffer.from(sha256),pub,Buffer.from(String(sigB64),'base64')))return 'Bad signature'}catch(e){return 'Bad signature'}return null}
async function blobPut(id,gz){if(store.pg){await store.query('CREATE TABLE IF NOT EXISTS ls_ota_blobs(id text PRIMARY KEY, gz bytea NOT NULL, created timestamptz NOT NULL DEFAULT now())');await store.query('INSERT INTO ls_ota_blobs(id,gz) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET gz=EXCLUDED.gz',[id,gz]);return}
 fs.mkdirSync(path.join(DATA_DIR,'ota'),{recursive:true});fs.writeFileSync(path.join(DATA_DIR,'ota',id+'.gz'),gz)}
const blobCache=new Map();
async function blobGet(id){if(blobCache.has(id))return blobCache.get(id);let b=null;
 if(store.pg){const r=await store.query('SELECT gz FROM ls_ota_blobs WHERE id=$1',[id]).catch(()=>null);b=r&&r.rows[0]&&r.rows[0].gz||null}
 else{try{b=fs.readFileSync(path.join(DATA_DIR,'ota',id+'.gz'))}catch(e){}}
 if(b){blobCache.set(id,b);if(blobCache.size>3)blobCache.delete(blobCache.keys().next().value)}return b}
const bucket=(pid,id)=>parseInt(sha(pid+'|'+id).slice(0,8),16)%100;
function otaTarget(pid,vc){const o=S().ota;if(o.paused)return {action:'none'};const B=id=>o.bundles.find(b=>b.id===id);
 const ok=b=>b&&vc>=(b.minVc||0)&&(!b.maxVc||vc<=b.maxVc);
 if(o.staged&&ok(B(o.staged.id))&&bucket(pid,o.staged.id)<o.staged.rollout)return {b:B(o.staged.id)};
 if(o.current&&o.current!=='builtin'&&ok(B(o.current)))return {b:B(o.current)};return {b:null}}
function otaManifest(q){const pid=clean(q.get('pid'),40),vc=int(q.get('vc'),0,1e6),cur=clean(q.get('cur'),40);const t=otaTarget(pid,vc);
 if(t.action==='none')return {action:'none'};
 if(!t.b)return cur&&cur!=='builtin'?{action:'reset'}:{action:'none'};
 if(t.b.id===cur)return {action:'none',id:cur};
 const b=t.b;return {action:'update',id:b.id,ver:b.ver,url:'/api/ota/b/'+b.id+'.gz',sha256:b.sha256,sig:b.sig,size:b.size,gzSize:b.gzSize}}
// ---------------- rate limit ----------------
const buckets=new Map();
function rl(ip,key,max,winMs){const k=key+'|'+ip;const t=now();let b=buckets.get(k);if(!b||t-b.t>winMs){b={t,n:0};buckets.set(k,b)}b.n++;if(buckets.size>50000)buckets.clear();return b.n>max}
// ---------------- admin auth: scrypt password, optional TOTP 2FA, HMAC session cookie, CSRF header, lockout, roles ----------------
const ev=()=>require('./events.js');
function admins(){const L=[];if(process.env.ADMIN_USER&&process.env.ADMIN_PASS_HASH)L.push({user:process.env.ADMIN_USER,hash:process.env.ADMIN_PASS_HASH,totp:process.env.ADMIN_TOTP_SECRET||'',role:'owner'});
 if(process.env.ADMIN2_USER&&process.env.ADMIN2_PASS_HASH)L.push({user:process.env.ADMIN2_USER,hash:process.env.ADMIN2_PASS_HASH,totp:process.env.ADMIN2_TOTP_SECRET||'',role:'support'});return L}
function checkHash(pass,h){const p=String(h||'').split('$');if(p[0]!=='scrypt'||p.length!==4)return false;try{const N=+p[1],salt=Buffer.from(p[2],'hex'),want=Buffer.from(p[3],'hex');
 const got=crypto.scryptSync(String(pass),salt,want.length,{N,r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(got,want)}catch(e){return false}}
function b32(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g,''))bits+=A.indexOf(ch).toString(2).padStart(5,'0');const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out)}
function totp(secret,step){const key=b32(secret);const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',key).update(buf).digest();const o=h[h.length-1]&15;
 return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0')}
function totpOk(secret,code){code=String(code||'').replace(/\D/g,'');if(code.length!==6)return false;const s=Math.floor(now()/30e3);return [-1,0,1].some(d=>totp(secret,s+d)===code)}
const SECRET=()=>process.env.ADMIN_SECRET||sha('ls-admin|'+(process.env.ADMIN_PASS_HASH||'')+'|'+(process.env.ADMIN2_PASS_HASH||''));
const hm=s=>crypto.createHmac('sha256',SECRET()).update(s).digest('hex');
const SESSION_H=+process.env.ADMIN_SESSION_H||8;
function mkToken(a){const b=Buffer.from(JSON.stringify({u:a.user,r:a.role,e:now()+SESSION_H*3600e3})).toString('base64url');return b+'.'+hm('lo|'+b)}
function readToken(t){if(!t)return null;const [b,s]=String(t).split('.');if(!b||!s)return null;const w=hm('lo|'+b);if(s.length!==w.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(w)))return null;
 try{const o=JSON.parse(Buffer.from(b,'base64url').toString());if(!(o.e>now()))return null;if(!admins().some(a=>a.user===o.u&&a.role===o.r))return null;return {user:o.u,role:o.r}}catch(e){return null}}
function cookie(req){const m=/(?:^|;\s*)lsadm=([^;]+)/.exec(req.headers.cookie||'');return m&&m[1]}
function adminOf(req){return readToken(cookie(req))}
const fails=new Map();const locked=ip=>{const f=fails.get(ip);return f&&f.n>=6&&now()-f.t<15*60e3};
// ---------------- http helpers ----------------
function J(res,c,o,h){res.writeHead(c,Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},h||{}));res.end(JSON.stringify(o))}
function body(req,max){return new Promise(r=>{let b=[],n=0;req.on('data',d=>{n+=d.length;if(n>max){req.destroy();r(null)}else b.push(d)});req.on('end',()=>{try{r(JSON.parse(Buffer.concat(b).toString()||'{}'))}catch(e){r(null)}});req.on('error',()=>r(null))})}
const ipOf=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
// ---------------- request router ----------------
function handle(req,res,u){
 if(u.startsWith('/api/')&&/^\/api\/(config|hello|mail|mail\/claim|redeem|telemetry|integrity|ota|ota\/b\/[a-z0-9]+\.gz)$/.test(u)){cors(res);if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true}pub(req,res,u).catch(e=>{console.error('liveops',e.message);J(res,500,{error:'server'})});return true}
 if(u==='/admin'||u==='/admin/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'"});res.end(require('./admin2-html.js')());return true}
 if(!u.startsWith('/admin/api/'))return false;
 const ip=ipOf(req);
 if(u==='/admin/api/login'&&req.method==='POST'){login(req,res,ip);return true}
 if(u==='/admin/api/logout'){res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':'lsadm=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0'});res.end('{"ok":true}');return true}
 const a=adminOf(req);if(!a){J(res,401,{error:'login'});return true}
 if(req.method!=='GET'&&req.headers['x-ls-admin']!=='1'){J(res,403,{error:'csrf'});return true}
 req.lsAdmin=a;
 if(u.startsWith('/admin/api/lo/')){adminApi(req,res,u.slice(14),a).catch(e=>J(res,400,{error:e.message||'error'}));return true}
 if(a.role!=='owner'&&req.method!=='GET'&&/\/admin\/api\/(event|rewards)/.test(u)){J(res,403,{error:'Owner only'});return true}
 return false}// events.js handles the rest of /admin/api/* (events CRUD, translate)
async function login(req,res,ip){if(locked(ip))return J(res,429,{error:'Too many attempts, try again in 15 minutes'});const m=await body(req,4096);if(!m)return J(res,400,{error:'bad'});
 const a=admins().find(x=>{const A=sha(String(m.user||'')),B=sha(x.user);return crypto.timingSafeEqual(Buffer.from(A),Buffer.from(B))});
 const passOk=a&&checkHash(m.pass,a.hash);
 if(passOk&&a.totp&&!m.code)return J(res,200,{need2fa:true});
 if(passOk&&(!a.totp||totpOk(a.totp,m.code))){fails.delete(ip);audit(a.user,'login','admin','Signed in');
  res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':'lsadm='+mkToken(a)+'; HttpOnly; SameSite=Strict; Path=/admin; Max-Age='+SESSION_H*3600+(req.headers['x-forwarded-proto']==='https'?'; Secure':'')});return res.end(JSON.stringify({ok:true,role:a.role}))}
 const f=fails.get(ip)||{n:0,t:0};f.n++;f.t=now();fails.set(ip,f);J(res,401,{error:passOk?'Wrong 2FA code':'Wrong username or password'})}
async function pub(req,res,u){const ip=ipOf(req);const q=new URL(req.url,'http://x').searchParams;
 if(rl(ip,'api',240,60e3))return J(res,429,{error:'slow down'});
 if(u==='/api/config'){const c=configJson();if(req.headers['if-none-match']===c.etag){res.writeHead(304,{ETag:c.etag});return res.end()}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=60','ETag':c.etag});return res.end(c.json)}
 if(u==='/api/ota'){return J(res,200,otaManifest(q))}
 if(u.startsWith('/api/ota/b/')){const id=u.slice(11,-3);const b=await blobGet(id);if(!b)return J(res,404,{error:'gone'});
  res.writeHead(200,{'Content-Type':'application/gzip','Content-Length':b.length,'Cache-Control':'public, max-age=31536000, immutable'});return res.end(b)}
 if(req.method!=='POST'&&u!=='/api/mail')return J(res,405,{error:'method'});
 const m=u==='/api/mail'&&req.method==='GET'?{pid:q.get('pid'),key:q.get('key')}:await body(req,16384);if(!m)return J(res,400,{error:'bad'});
 if(u==='/api/hello'){if(rl(ip,'hello',30,60e3))return J(res,429,{error:'slow down'});const r=hello(m,ip);return J(res,r.code,r.body)}
 if(u==='/api/telemetry'){const t=auth(m);if(!t)return J(res,401,{error:'auth'});telemetry(t,m);return J(res,200,{ok:true})}
 const t=auth(m);if(!t)return J(res,401,{error:'auth'});
 if(u==='/api/integrity'){if(rl(ip,'pi',20,60e3))return J(res,429,{error:'slow down'});return J(res,200,await igReport(t,m))}
 if(u==='/api/mail')return J(res,200,{mail:pending(t.pid,t.p).map(pubMail),banned:banned(t.pid)?true:false});
 if(u==='/api/mail/claim'){if(rl(ip,'claim',60,60e3))return J(res,429,{error:'slow down'});if(!gate(t.pid,'claim'))return J(res,403,{error:'integrity',msg:'Device check needed'});const ids=Array.isArray(m.ids)?m.ids.slice(0,50):[m.id];const out=ids.map(id=>claim(t.pid,t.p,clean(id,20)));return J(res,200,{results:out})}
 if(u==='/api/redeem'){if(!gate(t.pid,'redeem'))return J(res,403,{error:'integrity',msg:'Device check needed'});if(!S().cfg.flags.promo)return J(res,200,{ok:false,error:'Gift codes are paused'});return J(res,200,redeem(t.pid,t.p,m.code,ip))}
 J(res,404,{error:'unknown'})}
function telemetry(t,m){const o=day(),h=S().ota.health;const b=clean(m.bundle,40)||'builtin';const x=h[b]=h[b]||{boots:0,errors:0,rollbacks:0,last:0};
 if(m.boot){o.boots++;x.boots++}const e=int(m.errors,0,50);o.errors+=e;x.errors+=e;if(m.rollback){o.rollbacks++;const rb=clean(m.rollback,40);const y=h[rb]=h[rb]||{boots:0,errors:0,rollbacks:0,last:0};y.rollbacks++}x.last=now();
 if(Array.isArray(m.errs)){S().errs=(S().errs||[]).concat(m.errs.slice(0,3).map(s=>({t:now(),b,s:clean(s,300)}))).slice(-60)}save()}
// ---------------- Play Integrity (3.14.3): verdict log + gate. Modes off / log (default) / enforce; not configured = off ----------------
function igPublic(c){const st=IG.settings(c&&c.integrity);const mode=IG.effectiveMode(c&&c.integrity);return mode==='off'?{mode}:{mode,cpn:IG.CPN(),actions:st.actions,ttlMin:st.ttlMin}}
function igDay(){const g=S().ig,k=dayKey();const o=g.days[k]=g.days[k]||{total:0,pass:0,fail:0,notoken:0,errors:0,blocked:0,wouldBlock:0,app:{},dev:{},lic:{},reasons:{},actions:{}};
 const ks=Object.keys(g.days).sort();while(ks.length>30)delete g.days[ks.shift()];return o}
const inc=(o,k)=>{o[k]=(o[k]||0)+1};
async function igReport(t,m){const cfg=S().cfg.integrity,mode=IG.effectiveMode(cfg);if(mode==='off')return {ok:true,mode,pass:true};
 const action=IG.ACTIONS.includes(m.action)?m.action:'session';
 const v=await IG.verify({pid:t.pid,action,ts:m.ts,token:m.token?String(m.token).slice(0,20000):'',err:m.err},cfg);
 const o=igDay();o.total++;inc(o.actions,action);
 if(v.pass)o.pass++;else{o.fail++;if(v.reasons[0]==='notoken')o.notoken++;if(v.reasons[0]==='decode')o.errors++}
 if(v.app)inc(o.app,v.app);if(v.dev)inc(o.dev,v.dev);if(v.lic)inc(o.lic,v.lic);v.reasons.forEach(r=>inc(o.reasons,r));
 const g=S().ig;g.recent.push({t:now(),pid:t.pid.slice(0,12),a:action,pass:!!v.pass,app:v.app||'',dev:v.dev||'',lic:v.lic||'',r:v.reasons.join(','),err:v.err?clean(v.err,60):'',vc:v.vc||t.p.vc||0,ver:t.p.ver||''});
 if(g.recent.length>200)g.recent.splice(0,g.recent.length-200);
 // a failed check never wipes an earlier pass inside its time window (a flaky network should not lock a good player out)
 if(v.pass)t.p.ig={t:now(),pass:true};else if(!(t.p.ig&&t.p.ig.pass&&now()-t.p.ig.t<IG.settings(cfg).ttlMin*60e3))t.p.ig={t:now(),pass:false,r:v.reasons.join(',')};
 saveP();save();return {ok:true,mode,pass:!!v.pass,reasons:v.reasons}}
// true = allow. log mode never blocks (counts what enforce would block); enforce needs a passing verdict within ttlMin.
function gate(pid,action){try{const cfg=S().cfg.integrity,mode=IG.effectiveMode(cfg);if(mode==='off')return true;const st=IG.settings(cfg);if(!st.actions.includes(action))return true;
 const p=P()[pid];const okNow=!!(p&&p.ig&&p.ig.pass&&now()-p.ig.t<st.ttlMin*60e3);if(okNow)return true;
 const o=igDay();if(mode==='enforce'){o.blocked++;save();return false}o.wouldBlock++;save();return true}catch(e){return true}}
function normIntegrity(x){x=x||{};if(!IG.MODES.includes(x.mode))throw new Error('Mode must be off, log or enforce');
 return {mode:x.mode,ttlMin:int(x.ttlMin||60,1,1440),maxAgeSec:int(x.maxAgeSec||300,30,3600),needDevice:x.needDevice!==false,needLicensed:x.needLicensed!==false,
  actions:(Array.isArray(x.actions)?x.actions:['claim','redeem','match']).filter(a=>IG.ACTIONS.includes(a)&&a!=='session')}}
// ---------------- admin API ----------------
const OWNER=a=>{if(a.role!=='owner')throw new Error('Owner only')};
async function adminApi(req,res,r,a){const G=req.method==='GET';const m=G?{}:await body(req,r==='ota/upload'?40e6:300000);if(!G&&!m)throw new Error('Bad request');const d=S();
 const ok=(o)=>J(res,200,Object.assign({ok:true},o||{}));
 switch(r){
 case 'overview':{const st=d.stats.days,k=dayKey();const days=Object.keys(st).sort().slice(-14).map(x=>Object.assign({day:x},st[x]));let rooms=0,inMatch=0;for(const rr of ctx.rooms.values()){if(rr.started){rooms++;inMatch+=rr.seats.filter(s=>s.pid).length}}
  const PL=P(),pl=Object.values(PL);const vers={},countries={},bundles={};const wk=now()-7*864e5;pl.forEach(p=>{if(p.last>wk){vers[p.ver||'?']=(vers[p.ver||'?']||0)+1;countries[p.country||'?']=(countries[p.country||'?']||0)+1;bundles[p.bundle||'builtin']=(bundles[p.bundle||'builtin']||0)+1}});
  let accounts=0;try{accounts=ctx.accounts&&ctx.accounts.count?ctx.accounts.count():0}catch(e){}
  return ok({online:online(),rooms,inMatch,today:st[k]||{},days,players:pl.length,active7:pl.filter(p=>p.last>wk).length,accounts,vers,countries,bundles,cfgV:d.cfg.v,
   bundle:d.ota.current||'builtin',staged:d.ota.staged,maintenance:!!maintenance(),reports:((store.get('social')||{}).reports||[]).filter(x=>!d.mod.handled[x.t+'|'+x.fid]).length,
   role:a.role,user:a.user,uptime:process.uptime(),store:store.info,theme:themeNow().active,flagsOn:Object.values(d.cfg.flags).filter(Boolean).length,flagsAll:FLAGS.length})}
 case 'config':return ok({cfg:d.cfg,flagsMeta:FLAGS,skus:SKUS,hist:d.hist.slice(-20).reverse().map(h=>({v:h.v,t:h.t,by:h.by})),caps:CAP});
 case 'config/save':{OWNER(a);const sec=String(m.section||'');const before=JSON.parse(JSON.stringify(d.cfg));const c=d.cfg,x=m.value;
  if(sec==='flags'){for(const f of FLAGS)if(x&&x[f[0]]!=null)c.flags[f[0]]=!!x[f[0]]}
  else if(sec==='daily'){if(!Array.isArray(x)||x.length!==7)throw new Error('7 days needed');c.daily=x.map(y=>{const o={};if(+y.c)o.c=int(y.c,0,1e7);if(+y.g)o.g=int(y.g,0,1e5);if(y.item)o.item=clean(y.item,40);return o})}
  else if(sec==='spin'){if(!Array.isArray(x)||x.length!==8)throw new Error('8 wheel slices needed');c.spin=x.map(y=>({k:['c','g','s'].includes(y.k)?y.k:'c',n:int(y.n,0,1e6),w:int(y.w,0,1000)}));if(!c.spin.some(s=>s.w>0))throw new Error('At least one slice needs a chance')}
  else if(sec==='store'){const p={};for(const s of SKUS){const y=x&&x.packs&&x.packs[s];if(y)p[s]={on:y.on!==false,tag:clean(y.tag,14),bonus:int(y.bonus,0,1000)}}c.store={packs:p,hidden:SKUS.filter(s=>p[s]&&p[s].on===false),offer:normOffer(x&&x.offer)}}
  else if(sec==='maintenance'){c.maintenance={on:!!x.on,msg:tx(x.msg,300),until:+x.until||0,blockOnline:x.blockOnline!==false}}
  else if(sec==='update'){c.update={minVc:int(x.minVc,0,1e6),latestVc:int(x.latestVc,0,1e6),msg:tx(x.msg,300),url:/^https:\/\//.test(x.url||'')?clean(x.url,300):DEF_CFG().update.url}}
  else if(sec==='badges'){c.badges=normBadges(x)}
  else if(sec==='integrity'){c.integrity=normIntegrity(x)}
  else if(sec==='vars'){if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Remote values must be an object');const j=JSON.stringify(x);if(j.length>20000)throw new Error('Too big');c.vars=JSON.parse(j)}
  else if(sec==='chat'){c.chat={blocked:(Array.isArray(x.blocked)?x.blocked:String(x.blocked||'').split(/[\n,]+/)).map(s=>clean(s,40).trim().toLowerCase()).filter(Boolean).slice(0,500)}}
  else if(sec==='popups'){c.popups=(Array.isArray(x)?x:[]).slice(0,30).map(normPopup)}
  else if(sec==='mailPoll'){c.mailPoll=int(x,60,3600)}
  else throw new Error('Unknown section');
  const e=publish(a.user,sec,before,`${sec}: published config v${c.v+1}`);e.summary=`${sec}: published config v${c.v}`;save();return ok({cfg:c})}
 case 'config/revert':{OWNER(a);const h=d.hist.find(x=>x.v===+m.v);if(!h)throw new Error('Version not found');const before=JSON.parse(JSON.stringify(d.cfg));const keepV=d.cfg.v;
  d.cfg=JSON.parse(JSON.stringify(h.snap));d.cfg.v=keepV;publish(a.user,'all',before,'Reverted to config v'+h.v);d.audit[d.audit.length-1].undo={type:'cfgall',before};save();return ok({cfg:d.cfg})}
 case 'players':{const q=String(new URL(req.url,'http://x').searchParams.get('q')||'').trim().toLowerCase();const PL=P(),U=sUsers();const out=[];
  const pidByFid={};for(const u of Object.values(U))if(u.pid)pidByFid[u.pid]=u;
  for(const [pid,p] of Object.entries(PL)){const u=pidByFid[pid];const name=(p.name||u&&u.name||'');const fid=p.fid||u&&u.fid||'';
   if(!q||pid.toLowerCase().includes(q)||fid.toLowerCase()===q||name.toLowerCase().includes(q))out.push(prow(pid,p,u));if(out.length>=40)break}
  if(q&&out.length<40)for(const u of Object.values(U)){if(out.some(o=>o.pid===u.pid))continue;if((u.fid||'').toLowerCase()===q||(u.name||'').toLowerCase().includes(q))out.push(prow(u.pid,PL[u.pid]||{},u));if(out.length>=40)break}
  return ok({players:out.sort((x,y)=>(y.last||0)-(x.last||0))})}
 case 'player':{const pid=pidOf(new URL(req.url,'http://x').searchParams.get('id'));if(!pid)throw new Error('Player not found');const p=P()[pid]||{};const U=sUsers();const u=Object.values(U).find(x=>x.pid===pid);
  const mail=d.mail.filter(g=>g.pid===pid||(g.pids||[]).includes(pid)).slice(-30).reverse().map(g=>Object.assign(pubMail(g),{claimed:(p.c||[]).includes(g.id),revoked:!!g.revoked,by:g.by,reason:g.reason}));
  const reports=((store.get('social')||{}).reports||[]).filter(r=>u&&r.fid===u.fid).slice(-20).reverse();
  return ok({player:prow(pid,p,u),mail,reports,ban:banned(pid),mute:muted(pid),online:!!(ctx.clients.get(pid)&&ctx.clients.get(pid).ws&&ctx.clients.get(pid).ws.readyState===1)})}
 case 'grant':{const g=normGrant(m,a.user,a.role);if(m.preview)return ok({reach:reach(g),grant:g});d.mail.push(g);trimMail();save();
  const who=g.aud==='player'?(P()[g.pid]&&P()[g.pid].name||g.pid):g.aud==='all'?'All players':g.aud==='country'?g.countries.join(', '):g.pids.length+' players';
  audit(a.user,'grant',who,`${g.coins?((g.coins>0?'+':'')+g.coins.toLocaleString('en-US')+' coins '):''}${g.gems?((g.gems>0?'+':'')+g.gems+' diamonds '):''}${g.item?'+'+g.item.id:''}${g.reason?' · '+g.reason:''}`,{type:'grant',id:g.id});return ok({id:g.id,reach:reach(g)})}
 case 'mail':return ok({mail:d.mail.slice(-200).reverse().map(g=>({id:g.id,aud:g.aud,to:g.aud==='player'?((P()[g.pid]||{}).name||g.pid):g.aud==='country'?g.countries.join(','):g.aud==='list'?g.pids.length+' players':'All',coins:g.coins,gems:g.gems,item:g.item,title:g.title,claims:g.claims||0,cap:g.cap||0,start:g.start,expire:g.expire,revoked:!!g.revoked,by:g.by,kind:g.kind}))});
 case 'grant/revoke':{const g=d.mail.find(x=>x.id===m.id);if(!g)throw new Error('Not found');if(a.role!=='owner'&&g.aud!=='player')throw new Error('Owner only');g.revoked=true;save();audit(a.user,'revoke',g.id,'Stopped grant (already claimed rewards stay)',{type:'unrevoke',id:g.id});return ok()}
 case 'codes':return ok({codes:Object.entries(d.codes).map(([k,c])=>({code:k,coins:c.coins,gems:c.gems,item:c.item,maxUses:c.maxUses,uses:c.uses||0,start:c.start,end:c.end,on:c.on,note:c.note,country:c.country||''}))});
 case 'codes/save':{OWNER(a);const C=String(m.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20)||crypto.randomBytes(4).toString('hex').toUpperCase();if(C.length<4)throw new Error('Code must be 4+ letters');
  const coins=int(m.coins,0,CAP.codeCoins),gems=int(m.gems,0,CAP.codeGems);if(!coins&&!gems&&!(m.item&&m.item.id))throw new Error('Add a reward');const old=d.codes[C];const before=old?JSON.parse(JSON.stringify(old)):null;
  d.codes[C]=Object.assign(old||{uses:0,by:{}},{coins,gems,item:m.item&&m.item.id?{type:clean(m.item.type||'dice',10),id:clean(m.item.id,40)}:null,maxUses:int(m.maxUses,0,1e7),start:+m.start||0,end:+m.end||0,on:m.on!==false,note:clean(m.note,100),country:/^[A-Z]{2}$/.test(String(m.country||'').toUpperCase())?String(m.country).toUpperCase():''});
  save();audit(a.user,'code',C,(old?'Updated':'Created')+` gift code ${C}: ${coins} coins, ${gems} diamonds, max ${d.codes[C].maxUses||'unlimited'} uses`,{type:'code',code:C,before});return ok({code:C})}
 case 'mod':{const S2=store.get('social')||{};const U=S2.users||{};const name=pid=>{const p=P()[pid];if(p&&p.name)return p.name;const u=Object.values(U).find(x=>x.pid===pid);return u?u.name:pid};
  const L=o=>Object.entries(o).filter(([k,v])=>active(v)).map(([pid,v])=>Object.assign({pid,name:name(pid)},v));
  const reps=(S2.reports||[]).slice(-200).reverse().map(r=>{const u=U[r.fid],b=U[r.by];return Object.assign({},r,{key:r.t+'|'+r.fid,name:u?u.name:r.fid,byName:b?b.name:r.by,pid:u?u.pid:null,handled:!!d.mod.handled[r.t+'|'+r.fid],count:(S2.reports||[]).filter(x=>x.fid===r.fid).length})});
  return ok({bans:L(d.mod.bans),mutes:L(d.mod.mutes),reports:reps})}
 case 'mod/set':{const kind=m.kind==='mute'?'mutes':'bans';const pid=pidOf(m.id);if(!pid)throw new Error('Player not found');const before=d.mod[kind][pid]?JSON.parse(JSON.stringify(d.mod[kind][pid])):null;
  if(m.off){delete d.mod[kind][pid]}else{const hrs=+m.hours||0;d.mod[kind][pid]={until:hrs>0?now()+hrs*3600e3:0,reason:clean(m.reason,200),by:a.user,t:now()}
   if(kind==='bans'){const c=ctx.clients.get(pid);if(c&&c.ws)try{c.ws.send(JSON.stringify({t:'banned',reason:clean(m.reason,200),until:d.mod.bans[pid].until}));c.ws.close()}catch(e){}}}
  save();audit(a.user,kind==='bans'?(m.off?'unban':'ban'):(m.off?'unmute':'mute'),(P()[pid]||{}).name||pid,m.off?'Removed':(`${+m.hours?m.hours+' h':'permanent'} · ${clean(m.reason,100)}`),{type:'mod',kind,pid,before});return ok()}
 case 'mod/handled':{d.mod.handled[String(m.key)]={by:a.user,t:now()};const ks=Object.keys(d.mod.handled);if(ks.length>3000)delete d.mod.handled[ks[0]];save();return ok()}
 case 'audit':return ok({audit:d.audit.slice(-300).reverse().map(e=>({id:e.id,t:e.t,by:e.by,action:e.action,target:e.target,summary:e.summary,canUndo:!!e.undo&&!e.undone,undone:e.undone}))});
 case 'undo':{const e=d.audit.find(x=>x.id===m.id);if(!e||!e.undo||e.undone)throw new Error('Nothing to undo');if(a.role!=='owner'&&!['grant','mod'].includes(e.undo.type))throw new Error('Owner only');undo(e,a);e.undone=true;save();bust();return ok()}
 case 'ota':{const o=d.ota;return ok({ota:{bundles:o.bundles.slice(-30).reverse(),current:o.current||'builtin',staged:o.staged,paused:!!o.paused,health:o.health},errs:(d.errs||[]).slice(-20).reverse(),hasKey:!!OTA_PUB()})}
 case 'ota/upload':{OWNER(a);const ver=clean(m.ver,40);if(!/^[0-9a-z.+_-]{3,40}$/i.test(ver))throw new Error('Bad version');const gz=Buffer.from(String(m.gz||''),'base64');if(!gz.length)throw new Error('No bundle');
  let raw;try{raw=zlib.gunzipSync(gz)}catch(e){throw new Error('Bundle is not gzip')}const err=verifyBundle(raw,String(m.sha256||''),m.sig);if(err)throw new Error(err);
  if(!/<html/i.test(raw.slice(0,4000).toString())||!raw.includes('LiveUpdate'))throw new Error('Bundle must be the game index.html with the 3.14 OTA loader');
  const id='b'+crypto.randomBytes(5).toString('hex');await blobPut(id,gz);const b={id,ver,note:clean(m.note,200),sha256:m.sha256,sig:String(m.sig),size:raw.length,gzSize:gz.length,minVc:int(m.minVc,0,1e6),maxVc:int(m.maxVc,0,1e6),created:now(),by:a.user,status:'uploaded'};
  d.ota.bundles.push(b);save();audit(a.user,'ota',ver,'Uploaded web bundle '+ver+' ('+Math.round(gz.length/1024)+' KB gz)');return ok({bundle:b})}
 case 'ota/stage':{OWNER(a);const o=d.ota;const b=o.bundles.find(x=>x.id===m.id);if(!b)throw new Error('Unknown bundle');const before={current:o.current,staged:o.staged};const pct=int(m.rollout,1,100);
  if(pct>=100){if(o.current&&o.current!==b.id){const old=o.bundles.find(x=>x.id===o.current);if(old)old.status='replaced'}o.current=b.id;o.staged=null;b.status='live';b.rollout=100}
  else{if(o.staged&&o.staged.id!==b.id){const old=o.bundles.find(x=>x.id===o.staged.id);if(old&&old.status==='staged')old.status='uploaded'}o.staged={id:b.id,rollout:pct};b.status='staged';b.rollout=pct}
  save();bust();audit(a.user,'ota',b.ver,pct>=100?'Released to 100%':'Staged to '+pct+'%',{type:'ota',before});return ok()}
 case 'ota/rollback':{OWNER(a);const o=d.ota;const before={current:o.current,staged:o.staged};const to=m.to||'builtin';
  if(o.staged){const s=o.bundles.find(x=>x.id===o.staged.id);if(s)s.status='rolledback';o.staged=null}
  if(to==='builtin'){const c=o.bundles.find(x=>x.id===o.current);if(c)c.status='rolledback';o.current=null}else{const b=o.bundles.find(x=>x.id===to);if(!b)throw new Error('Unknown bundle');const c=o.bundles.find(x=>x.id===o.current);if(c&&c!==b)c.status='rolledback';o.current=b.id;b.status='live'}
  save();bust();audit(a.user,'ota','rollback','Rolled back to '+(to==='builtin'?'built-in copy':to),{type:'ota',before});return ok()}
 case 'ota/pause':{OWNER(a);d.ota.paused=!!m.paused;save();bust();audit(a.user,'ota','pause',m.paused?'Paused live updates':'Resumed live updates',{type:'otapause',was:!m.paused});return ok()}
 case 'themes':return ok({themes:d.themes,now:themeNow(),builtIn:['default']});
 case 'integrity':{const g=d.ig,days=Object.keys(g.days).sort().slice(-14).map(k=>Object.assign({day:k},g.days[k]));const tot={total:0,pass:0,fail:0,notoken:0,errors:0,blocked:0,wouldBlock:0};
  days.forEach(x=>{for(const k in tot)tot[k]+=x[k]||0});
  return ok({configured:IG.configured(),cpnSet:!!IG.CPN(),saSet:!!process.env.GOOGLE_SA_JSON,pkg:IG.PKG(),settings:IG.settings(d.cfg.integrity),effective:IG.effectiveMode(d.cfg.integrity),days,tot,recent:g.recent.slice(-50).reverse()})}
 case 'themes/save':{OWNER(a);const before=JSON.parse(JSON.stringify(d.themes));const s=(Array.isArray(m.schedule)?m.schedule:[]).slice(0,40).map(x=>{const st=+x.start,en=+x.end;if(!st||!en||en<=st)throw new Error('Each theme needs a start and an end date');
   return {id:/^t[a-z0-9]{4,12}$/.test(x.id||'')?x.id:rid('t'),theme:clean(x.theme,24).toLowerCase().replace(/[^a-z0-9_-]/g,'')||'default',name:clean(x.name,40),start:st,end:en,leadDays:int(x.leadDays,0,30),on:x.on!==false,community:clean(x.community||'all',12),banner:x.banner?tx(x.banner,80):null}});
  const defs={};for(const [k,v] of Object.entries(m.defs||{})){const id=k.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,24);if(!id||id==='default')continue;defs[id]=normThemeDef(v)}
  d.themes={schedule:s,defs};save();bust();audit(a.user,'themes','schedule',`Saved ${s.length} theme schedule(s)`,{type:'themes',before});return ok({themes:d.themes,now:themeNow()})}
 case 'events/extend':{OWNER(a);const E=ev();return ok(E.adminExtend(m,a.user))}
 default:throw new Error('Unknown action')}}
function prow(pid,p,u){p=p||{};return {pid,fid:p.fid||(u&&u.fid)||'',name:p.name||(u&&u.name)||'Player',country:p.country||'',ver:p.ver||'',vc:p.vc||0,bundle:p.bundle||'',level:p.level||(u&&u.level)||0,games:p.games||(u&&u.games)||0,wins:u&&u.wins||0,
 coins:p.coins||0,gems:p.gems||0,first:p.first||u&&u.created||0,last:p.last||u&&u.seen||0,lang:p.lang||'',hasKey:!!p.k,banned:!!banned(pid),muted:!!muted(pid),claimed:(p.c||[]).length}}
function normOffer(x){if(!x||!x.on)return null;return {on:true,sku:SKUS.includes(x.sku)?x.sku:'ls_starter_pack',title:tx(x.title,60),text:tx(x.text,200),badge:clean(x.badge,14),start:+x.start||0,end:+x.end||0,freq:['once','daily','always'].includes(x.freq)?x.freq:'daily'}}
function normPopup(x){return {id:/^p[a-z0-9]{4,12}$/.test(x.id||'')?x.id:rid('p'),kind:['popup','ticker','banner'].includes(x.kind)?x.kind:'popup',title:tx(x.title,80),body:tx(x.body,500),img:/^https:\/\//.test(x.img||'')?clean(x.img,400):'',
 btn:tx(x.btn,30),action:['none','store','events','spin','daily','mail','url','offer','tournaments','minigames'].includes(x.action)?x.action:'none',url:/^https:\/\//.test(x.url||'')?clean(x.url,300):'',
 freq:['once','daily','always'].includes(x.freq)?x.freq:'once',start:+x.start||0,end:+x.end||0,on:x.on!==false,countries:String(x.countries||'').toUpperCase().split(/[\s,;]+/).filter(c=>/^[A-Z]{2}$/.test(c)).join(','),
 langs:String(x.langs||'').toLowerCase().split(/[\s,;]+/).filter(l=>LANGS.includes(l)).join(','),minVc:int(x.minVc,0,1e6),community:clean(x.community||'all',12),prio:int(x.prio,0,100)}}
function normThemeDef(v){v=v||{};const col=s=>/^#[0-9a-f]{3,8}$/i.test(s||'')?s:'';
 return {name:clean(v.name,40),accent:col(v.accent),accent2:col(v.accent2),bg:col(v.bg),particles:['none','snow','stars','petals','lanterns','confetti','bubbles'].includes(v.particles)?v.particles:'none',density:int(v.density,0,100),
  lobbyBg:/^(https:\/\/|theme:)/.test(v.lobbyBg||'')?clean(v.lobbyBg,400):'',boardFrame:/^(https:\/\/|theme:)/.test(v.boardFrame||'')?clean(v.boardFrame,400):'',music:/^(https:\/\/|theme:)/.test(v.music||'')?clean(v.music,400):'',
  pack:clean(v.pack,24),banner:v.banner?tx(v.banner,80):null}}
function undo(e,a){const d=S(),u=e.undo;
 if(u.type==='grant'){const g=d.mail.find(x=>x.id===u.id);if(!g)throw new Error('Grant gone');g.revoked=true;
  // rewards already claimed are taken back with a correction mail to each player who claimed (personal grants only)
  if(g.aud==='player'&&g.claims>0&&(g.coins>0||g.gems>0)){d.mail.push({id:rid('g'),aud:'player',pid:g.pid,coins:-Math.max(0,g.coins),gems:-Math.max(0,g.gems),item:null,title:{en:'Balance correction'},msg:{en:'A gift was sent by mistake and has been reversed.'},kind:'adjust',created:now(),start:now(),expire:now()+90*864e5,by:a.user,claims:0})}
  else if(g.aud==='player'&&g.claims>0&&(g.coins<0||g.gems<0)){d.mail.push({id:rid('g'),aud:'player',pid:g.pid,coins:-Math.min(0,g.coins),gems:-Math.min(0,g.gems),item:null,title:{en:'Balance restored'},msg:{en:'A correction was reversed. Your coins are back.'},kind:'comp',created:now(),start:now(),expire:now()+90*864e5,by:a.user,claims:0})}}
 else if(u.type==='unrevoke'){const g=d.mail.find(x=>x.id===u.id);if(g)g.revoked=false}
 else if(u.type==='cfg'){const before=JSON.parse(JSON.stringify(d.cfg));if(u.section==='all')throw new Error('Use config history');d.cfg[u.section]=u.before;publish(a.user,u.section,before,'Undo: '+u.section+' restored')}
 else if(u.type==='cfgall'){const before=JSON.parse(JSON.stringify(d.cfg));const v=d.cfg.v;d.cfg=u.before;d.cfg.v=v;publish(a.user,'all',before,'Undo: config restored')}
 else if(u.type==='code'){const C=u.code;if(u.before)d.codes[C]=u.before;else if(d.codes[C])d.codes[C].on=false}
 else if(u.type==='mod'){if(u.before)d.mod[u.kind][u.pid]=u.before;else delete d.mod[u.kind][u.pid]}
 else if(u.type==='ota'){Object.assign(d.ota,u.before);for(const b of d.ota.bundles){if(b.id===d.ota.current)b.status='live';else if(d.ota.staged&&b.id===d.ota.staged.id)b.status='staged'}}
 else if(u.type==='otapause'){d.ota.paused=u.was}
 else if(u.type==='themes'){d.themes=u.before}
 else if(u.type==='event'){ev().adminRestore(u)}
 else throw new Error('Cannot undo');
 audit(a.user,'undo',e.target,'Undid: '+e.summary)}
// chat word filter used by the WebSocket server (match chat, DMs, club chat)
function filterText(t){const L=(S().cfg.chat||{}).blocked||[];if(!L.length||!t)return t;let s=String(t);for(const w of L){if(!w)continue;const re=new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');s=s.replace(re,m=>'*'.repeat(m.length))}return s}
function flag(k){const f=S().cfg.flags;return !f||f[k]!==false}
module.exports={limited:(req,k,max,ms)=>rl(ipOf(req),k,max,ms),authDev:auth,grantTo,flag,gate,igReport,handle,bind,banned,muted,maintenance,stat,audit,adminOf,filterText,publicConfig,hello,claim,pending,normGrant,redeem,otaManifest,verifyBundle,totp,totpOk,_S:S,_P:P,FLAGS,CAP,DEF_BADGES,normBadges};
