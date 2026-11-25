// 3.15 server wallet: coins and diamonds per player id (pid; an account owns its device pid) are kept on the server.
// - First sync from a 3.15 app seeds the wallet once from the phone balance, capped at sane limits (logged).
// - After that the app only sends deltas (what changed on the phone since the last confirmed balance). Spends always apply,
//   earnings from phone-side play are capped per UTC day. Big rewards (events, mail, store packs) are added by the server only.
// - 3.14.x apps never create a wallet, so nothing changes for them.
// Store key 'wallet' (one row per pid in Postgres).
const store=require('./store.js');const APPLE=require('./apple.js');
function iosIndex(){let d=store.get('iap_ios');if(!d||typeof d!=='object'){d={};store.set('iap_ios',d)}return d}
const N=(v,d)=>{const x=+v;return Number.isFinite(x)?x:d};
const CFG=()=>({seedCoins:N(process.env.WAL_SEED_COINS,1e8),seedGems:N(process.env.WAL_SEED_GEMS,2e5),
 dayCoins:N(process.env.WAL_DAY_COINS,5e8),dayGems:N(process.env.WAL_DAY_GEMS,5000),maxCoins:1e12,maxGems:1e9});
// store packs (same as the app's PRODUCTS / legacy GEMPACKS + COINPACKS); amounts come from here, never from the app
const SKUS={ls_gems_100:{g:200},ls_gems_500:{g:1250},ls_gems_1000:{g:2750},ls_gems_2500:{g:6750},ls_gems_5000:{g:13500},ls_gems_10000:{g:29000},
 ls_coins_10k:{c:1e4},ls_coins_30k:{c:3e4},ls_coins_100k:{c:1e5},ls_coins_250k:{c:25e4},ls_coins_1m:{c:1e6},ls_coins_2m:{c:2e6},
 ls_starter_pack:{g:150,c:5000,once:true},gems_50:{g:50},gems_120:{g:120},gems_300:{g:300},gems_800:{g:800},coins_2000:{c:2000},coins_6000:{c:6000},coins_15000:{c:15000}};
const dayKey=t=>new Date(t||Date.now()).toISOString().slice(0,10);
function all(){let d=store.get('wallet');if(!d||typeof d!=='object'){d={};store.set('wallet',d)}return d}
function save(){store.set('wallet',all(),1000)}
const get=pid=>{const d=store.get('wallet');return (d&&typeof d==='object'&&d[pid])||null};
function log(w,op,c,g,why){w.log=w.log||[];w.log.push({t:Date.now(),op,c:c||0,g:g||0,why:String(why||'').slice(0,60)});if(w.log.length>40)w.log=w.log.slice(-40)}
// 3.15.9: daily = last claimed 7-day login bonus {k: phone day key, n: day 1-7}, so a reinstall can restore the streak
const pub=w=>w?Object.assign({c:w.c,g:w.g,items:w.items||{},rev:w.rev|0,n:w.n|0,seeded:w.seeded||0},w.daily&&w.daily.k?{daily:{k:w.daily.k,n:w.daily.n|0}}:{}):null;
function create(pid,seed){const C=CFG();const sc=Math.max(0,Math.floor(N(seed&&seed.c,0))),sg=Math.max(0,Math.floor(N(seed&&seed.g,0)));
 const w={c:Math.min(sc,C.seedCoins),g:Math.min(sg,C.seedGems),items:{},rev:1,n:0,seeded:Date.now(),seed:{c:sc,g:sg},day:{k:dayKey(),c:0,g:0},iap:[]};
 if(sc>C.seedCoins||sg>C.seedGems){w.flag=(w.flag|0)+1;console.log('[wallet] seed capped',pid.slice(0,8),'coins',sc,'->',w.c,'gems',sg,'->',w.g)}
 log(w,'seed',w.c,w.g,'phone '+sc+'/'+sg);all()[pid]=w;save();return w}
// server-side grants (events, mail claims, store packs). create=false: only players who already have a wallet (3.15+).
function credit(pid,c,g,why,items,create0){let w=get(pid);if(!w){if(!create0)return null;w=create(pid,{c:0,g:0})}const C=CFG();
 c=Math.trunc(N(c,0));g=Math.trunc(N(g,0));w.c=Math.max(0,Math.min(C.maxCoins,w.c+c));w.g=Math.max(0,Math.min(C.maxGems,w.g+g));
 (items||[]).forEach(it=>{if(it&&it.id){w.items=w.items||{};w.items[it.id]=(w.items[it.id]|0)+Math.max(1,it.n|0||1)}});w.rev=(w.rev|0)+1;log(w,'grant',c,g,why);save();return w}
// phone sync: m={seed:{c,g}, dc, dg, n}. n = increasing sync number from the phone; a repeated n is ignored (retry after a lost reply)
function sync(pid,m){m=m||{};let w=get(pid),seeded=false;if(!w){w=create(pid,m.seed);seeded=true;return {ok:true,seeded,applied:{c:0,g:0},capped:{c:0,g:0},w:pub(w)}}
 const C=CFG(),n=Math.max(0,Math.floor(N(m.n,0)));if(n&&n<=(w.n|0))return {ok:true,dup:true,applied:{c:0,g:0},capped:{c:0,g:0},w:pub(w)};
 const k=dayKey();if(!w.day||w.day.k!==k)w.day={k,c:0,g:0};
 let dc=Math.trunc(N(m.dc,0)),dg=Math.trunc(N(m.dg,0));const cap={c:0,g:0};
 if(dc>0){const room=Math.max(0,C.dayCoins-w.day.c);if(dc>room){cap.c=dc-room;dc=room}w.day.c+=dc}
 if(dg>0){const room=Math.max(0,C.dayGems-w.day.g);if(dg>room){cap.g=dg-room;dg=room}w.day.g+=dg}
 const c0=w.c,g0=w.g;w.c=Math.max(0,Math.min(C.maxCoins,w.c+dc));w.g=Math.max(0,Math.min(C.maxGems,w.g+dg));
 if(c0+dc<0||g0+dg<0){w.flag=(w.flag|0)+1}// phone spent more than the server balance
 if(cap.c||cap.g){w.flag=(w.flag|0)+1;log(w,'capped',cap.c,cap.g,'daily earn cap')}
 if(dc||dg){log(w,'phone',dc,dg,'sync');w.rev=(w.rev|0)+1}if(n)w.n=n;save();
 return {ok:true,applied:{c:w.c-c0,g:w.g-g0},capped:cap,w:pub(w)}}
// store purchase (Google Play token or Apple JWS): amounts from SKUS; one grant per purchase
// iOS: token is the StoreKit 2 signed transaction (JWS). It is verified against Apple's root certificate and credited once
// per Apple transactionId, on one player only (global index 'iap_ios': transactionId -> pid).
function iap(pid,sku,token,opts){const p=SKUS[String(sku||'')];if(!p)return {ok:false,error:'sku'};
 let key=null,ios=null;if(APPLE.isJws(token)){try{ios=APPLE.verifyTransaction(token,String(sku),opts&&opts.apple)}catch(e){console.log('[wallet] apple iap refused',String(pid).slice(0,8),sku,e.message);return {ok:false,error:'token',why:e.message}}
  key='ios:'+ios.transactionId;const ix=iosIndex();if(ix[ios.transactionId]&&ix[ios.transactionId]!==pid)return {ok:false,error:'token',why:'used by another player'}}
 else{token=String(token||'').slice(0,400);if(token.length<8)return {ok:false,error:'token'};key=token}
 let w=get(pid);if(!w)return {ok:false,error:'nowallet'};w.iap=w.iap||[];const h=require('crypto').createHash('sha256').update(key).digest('hex').slice(0,32);
 if(ios){const ix=iosIndex();if(!ix[ios.transactionId]){ix[ios.transactionId]=pid;store.set('iap_ios',ix,1000)}}
 if(w.iap.includes(h))return {ok:true,dup:true,w:pub(w)};if(p.once&&w.starter)return {ok:true,dup:true,w:pub(w)};
 w.iap.push(h);if(w.iap.length>200)w.iap=w.iap.slice(-200);if(p.once)w.starter=1;credit(pid,p.c||0,p.g||0,'store '+sku);return {ok:true,granted:{c:p.c||0,g:p.g||0},w:pub(get(pid))}}
// 7-day login bonus (same table as the 3.15 app D7). Claimed once per local day key; optional one-time double.
const DAILY=[{c:5000},{c:7500},{c:10000,g:2},{c:15000},{c:20000,g:5},{c:30000},{c:50000,g:10}];
function nearDay(k){k=String(k||'');if(!/^\d{4}-\d{1,2}-\d{1,2}$/.test(k))return false;const p=k.split('-').map(Number),ms=Date.UTC(p[0],p[1]-1,p[2]);if(!Number.isFinite(ms))return false;return Math.abs(Date.now()-ms)<36*3600*1000}
function daily(pid,m){m=m||{};let w=get(pid);if(!w)return {ok:false,error:'nowallet'};
 const day=Math.max(1,Math.min(7,Math.floor(N(m.day,1))));const k=String(m.dayKey||m.k||'').trim();const use=nearDay(k)?k:dayKey();
 const row=DAILY[day-1]||DAILY[0];const dbl=!!m.double;w.daily=w.daily||{};
 if(!dbl&&w.daily.k===use)return {ok:true,dup:true,granted:{c:0,g:0},w:pub(w)};
 if(dbl&&(w.daily.k!==use||w.daily.dbl))return {ok:false,error:'nodouble',w:pub(w)};
 const c=row.c|0,g=row.g|0;credit(pid,c,g,dbl?'daily-double '+day:'daily '+day+' '+use);w=get(pid);w.daily={k:use,n:day,dbl:dbl?1:(w.daily.dbl|0)};save();
 return {ok:true,granted:{c,g},w:pub(w)}}
// live LiveOps mail claim (also used for event rewards): credit wallets that exist
function onMailClaim(pid,g){if(!g||!get(pid))return;const items=g.item&&g.item.id?[{id:g.item.id,n:g.item.n||1}]:[];credit(pid,g.coins|0,g.gems|0,'mail '+g.id,items)}
// HTTP: POST /api/wallet {pid,key,op:'sync'|'iap'|'get', ...}  (device key from /api/hello)
function handle(req,res,u){if(u!=='/api/wallet')return false;res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 const J=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true}if(req.method!=='POST')return J(405,{error:'method'}),true;
 let b='';req.on('data',d=>{b+=d;if(b.length>24000)req.destroy()});req.on('end',()=>{let m;try{m=JSON.parse(b||'{}')}catch(e){return J(400,{error:'bad'})}
  const LO=require('./liveops.js');if(LO.limited(req,'wallet',90,60e3))return J(429,{error:'slow down'});const a=LO.authDev(m);if(!a)return J(401,{error:'key'});if(LO.banned(a.pid))return J(403,{error:'banned'});
  try{if(m.op==='iap')return J(200,iap(a.pid,m.sku,m.token));if(m.op==='daily')return J(200,daily(a.pid,m));if(m.op==='get')return J(200,{ok:true,w:pub(get(a.pid))});return J(200,sync(a.pid,m))}catch(e){console.error('wallet',e.message);J(500,{error:'server'})}});return true}
function adminView(pid){const w=get(pid);return w?Object.assign(pub(w),{seed:w.seed,flag:w.flag|0,log:(w.log||[]).slice(-20).reverse(),day:w.day}):null}
module.exports={handle,sync,credit,iap,daily,get,pub,onMailClaim,adminView,SKUS,DAILY,CFG,_all:all};
