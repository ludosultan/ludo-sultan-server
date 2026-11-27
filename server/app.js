// Ludo Sultan online server: static hosting + WebSocket rooms, server-authoritative
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer}=require('ws');
const L=require(path.join(__dirname,'..','logic.js'));const L6=require(path.join(__dirname,'..','logic6.js'));
const PORT=+process.env.PORT||8080,TURN_MS=+process.env.TURN_MS||10000,BOT_MS=+process.env.BOT_MS||900,
 OFFLINE_MS=+process.env.OFFLINE_MS||1500,QUICK_MS=+process.env.QUICK_MS||10000,EV_WAIT_MS=+process.env.EV_WAIT_MS||40000,ANIM_MS=+process.env.ANIM_MS||1400,NOMOVE_MS=+process.env.NOMOVE_MS||900;
const ROOT=path.join(__dirname,'..');
const store=require('./store.js');const mg=require('./mg.js');const EV3=require('./events3.js'),WAL=require('./wallet.js');const LO=require('./liveops.js');
const lbg=require('./lbg.js');const mgApi={};mg.bind(mgApi);const LB=new Map();for(const e of (store.get('leaderboard')||[]))if(e&&e.pid)LB.set(e.pid,e);
function lbSave(){store.set('leaderboard',[...LB.values()],2000)}
const MIME={'.html':'text/html','.js':'application/javascript','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';
 if(u==='/health'){res.end('ok');return}
 try{if(LO.handle(req,res,u))return}catch(e){console.error('liveops',e.message);res.statusCode=500;res.end('error');return}
 if(u.startsWith('/avatar')||u.startsWith('/admin/api/avatars')){AVX.handle(req,res,u).catch(e=>{console.error('avatar',e.message);if(!res.headersSent){res.statusCode=500;res.end('error')}});return}
 try{if(EV3.handle(req,res,u)||WAL.handle(req,res,u))return}catch(e){console.error('ev3/wallet',e.message);res.statusCode=500;res.end('error');return}
 try{if(require('./events.js').handle(req,res,u))return}catch(e){console.error('events',e.message);res.statusCode=500;res.end('error');return}
 if(u==='/turn-status'){res.end(require('./turn.js').enabled()?'turn:on':'turn:off');return}
 if(u==='/health/db'){res.setHeader('Content-Type','application/json');store.ping().then(x=>res.end(JSON.stringify(x))).catch(e=>{res.statusCode=500;res.end(JSON.stringify({ok:false,error:'db'}))});return}
 if(u.startsWith('/custom-emoji')){customEmoji(req,res,u);return}
 const f=path.normalize(path.join(ROOT,u));if(!f.startsWith(ROOT)||f.includes(path.sep+'server'+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('not found');return}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
// ---- 3.5.8 "Make Your Own Emojis" (stub + pluggable generator; see server/emojigen.js) ----
const GEN=require('./emojigen.js');const ceJobs=new Map();
// 3.15.6: profile photos, report/hide, Photo to cartoon (server/avatars.js)
const AVX=require('./avatars.js')({fidOf,LO,GEN});
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
// 3.15.1: Make Your Own Emojis. Needs the device key (pid+key), consent and 1-5 photos. One job at a time per player, 3 per day.
// Photos stay in memory only for the job; finished jobs are kept 30 min for the app to fetch, then dropped.
const ceDay=new Map();
function customEmoji(req,res,u){cors(res);const J=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 if(req.method==='GET'){if(u==='/custom-emoji/status')return J(200,{configured:GEN.configured()});const id=u.split('/')[2];const j=ceJobs.get(id);if(!j)return J(404,{error:'unknown job'});
  const o={job:id,status:j.status,emojis:j.status==='done'?j.emojis:undefined};if(j.status==='done'){j.fetched=1}return J(200,o)}
 if(req.method!=='POST')return J(405,{error:'method'});
 if(LO.limited(req,'cemoji',10,60e3))return J(429,{error:'slow down'});
 let body='',big=false;req.on('data',d=>{body+=d;if(body.length>12e6){big=true;req.destroy()}});
 req.on('end',()=>{if(big)return;let m;try{m=JSON.parse(body)}catch(e){return J(400,{error:'bad json'})}
  const photos=Array.isArray(m.photos)?m.photos.slice(0,5):[];if(!m.consent)return J(400,{error:'consent required'});if(!photos.length)return J(400,{error:'no photos'});
  if(!photos.every(x=>typeof x==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(x)&&x.length<3e6))return J(400,{error:'bad photo'});
  if(!GEN.configured())return J(200,{job:null,status:'unconfigured'});
  const pid=String(m.pid||'').slice(0,64);if(!LO.authDev({pid,key:String(m.key||'')}))return J(403,{error:'auth'});
  for(const j of ceJobs.values())if(j.pid===pid&&j.status==='processing')return J(202,{job:j.id,status:'processing'});
  const day=new Date().toISOString().slice(0,10),dk=pid+'|'+day,dn=ceDay.get(dk)|0;if(dn>=3)return J(429,{error:'daily limit'});ceDay.set(dk,dn+1);
  const id=crypto.randomUUID();const job={id,pid,status:'processing',created:Date.now(),n:photos.length};ceJobs.set(id,job);
  GEN.generate(photos).then(out=>{job.emojis=out;job.status='done'}).catch(e=>{job.status='failed';console.error('[emoji] job failed',String(e.message||e).slice(0,160))});
  J(202,{job:id,status:'processing'})})}
setInterval(()=>{const t=Date.now();for(const [k,j] of ceJobs)if(t-j.created>30*60e3)ceJobs.delete(k);const d=new Date().toISOString().slice(0,10);for(const k of ceDay.keys())if(!k.endsWith(d))ceDay.delete(k)},5*60e3).unref();
const wss=new WebSocketServer({server});
const rooms=new Map(),clients=new Map();// pid -> {ws,room,name,avatar}
const SEATS={2:['red','yellow'],3:['red','green','yellow'],4:['red','green','yellow','blue']};
// 3.11.0: one adapter per board so the room code is shared by the classic board and the 6-player hexagon board (logic6.js)
const A4={newGame:r=>L.newGame(SEATS[r.size],r.opts),init:g=>L.qInit(g),rollPush:L.rollPush,options:L.options,canUse:(g,pi,o)=>L.canUse(g,pi,o.di|0,o.ti),useDie:(g,pi,o)=>L.useDie(g,pi,o.di|0,o.ti),
 endDice:L.endDice,over:L.over,standings:L.standings,ai:(g,pi)=>L.aiChoose(g,pi),from:(g,pi,o)=>g.tokens[pi][o.ti]};
const A6={newGame:r=>L6.newGame(r.size,{mode:'solo',shift:0}),init:g=>{g.queue=g.queue||[]},rollPush:L6.rollPush,options:L6.options,canUse:(g,pi,o)=>L6.canUse(g,pi,o),useDie:(g,pi,o)=>L6.useDie(g,pi,o),
 endDice:L6.endDice,over:L6.over,standings:L6.standings,ai:(g,pi)=>L6.aiChoose(g,pi,false),from:(g,pi,o)=>g.tokens[o.pj][o.ti]};
const LG=r=>r.six?A6:A4;
function norm(r,pi,o){o=o||{};const m={ti:Math.max(0,Math.min(3,o.ti|0)),di:Math.max(0,o.di|0)};if(r.six){m.pj=o.pj==null?pi:(o.pj|0);if(m.pj<0||m.pj>=r.g.players.length)m.pj=pi}return m}
const BOTN=['Bot Leo','Bot Mia','Bot Kai','Bot Zed'];
const BETS30=[500,1000,2500,5000,10000,50000,100000,250000,500000,1e6,5e6,1e7,2e7,4e7,8e7,1e8,2.5e8,5e8,1e9];
const BETS_OK=BETS30.concat([2.5e7]); // legacy 3.11 table still accepted (25M)
const W30={2:[2],3:[2,1],4:[3,1],5:[3,2],6:[4,2]};
function betPay(r){if(!r.bet||!r.g)return;const order=ordr(r);const n=r.size;const team=r.opts&&r.opts.mode==='team';
 const pay={};order.forEach(pi=>pay[pi]=0);
 if(team){const wt=order[0]%2;const ws=order.filter(pi=>pi%2===wt);const each=Math.floor(r.bet*n/ws.length);ws.forEach(pi=>pay[pi]=each)}
 else (W30[n]||[n]).forEach((w,k)=>{if(order[k]!=null)pay[order[k]]=r.bet*w});
 r.seats.forEach((s,i)=>{if(s.pid&&clients.get(s.pid))send(clients.get(s.pid).ws,{t:'betPay',bet:r.bet,pay:pay[i]|0,all:pay})})}
// 3.8.0: quick-match fill players (after QUICK_MS with no real opponent) get normal names/avatars
const FILLN=['Ali','Sana','Bilal','Ayesha','Hamza','Zara','Omar','Fatima','Usman','Hira','Daniel','Lucia','Marco','Sofia','Arjun','Priya','Yusuf','Mariam','Diego','Elena','Kemal','Aisha','Rafael','Noor'];
const FILLA=['🦁','🐯','🦊','🐼','🐵','🐸','🐨','🦄','🐲','🦉','🐙','👳'];
// 3.16: region-aware Quick Match. The phone sends a coarse region (from its time zone, e.g. 'SA', 'ME', 'EU').
// Same-region rooms are preferred; a room that has waited REGION_WAIT ms takes anyone, so nobody waits longer.
const REGION_WAIT=+process.env.REGION_WAIT||6000;
function regOf(m){const r=String((m&&m.reg)||'').toUpperCase();return /^[A-Z]{2,3}$/.test(r)?r:''}
function pickQuick(ok,reg){const list=[...rooms.values()].filter(ok);if(!list.length)return null;
 const same=list.find(x=>reg&&x.reg===reg);if(same)return same;
 const now=Date.now();return list.find(x=>!reg||!x.reg||now-(x.created||0)>=REGION_WAIT)||null}
function qkey(size,mode,night,blockade){return size+'|'+mode+'|'+(night?1:0)+'|'+(blockade?1:0)}
function code(){let c;do c=Math.random().toString(36).slice(2,7).toUpperCase();while(rooms.has(c));return c}
function send(ws,m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m))}
function bc(r,m){r.seats.forEach(s=>{if(s.pid&&clients.get(s.pid)&&clients.get(s.pid).room===r.code)send(clients.get(s.pid).ws,m)})}
function roomInfo(r){return {t:'room',code:r.code,game:r.mg||undefined,mg:r.mg||undefined,six:!!r.six,tour:r.tour?{id:r.tour.id,round:r.tour.round}:null,public:r.public,ev:r.ev||undefined,size:r.size,host:r.host,started:r.started,opts:r.opts,bet:r.bet||0,fillIn:r.fillAt&&!r.started?Math.max(0,r.fillAt-Date.now()):null,
 players:r.seats.map(s=>({fid:s.pid?fidOf(s.pid):null,name:s.name,avatar:s.avatar,avx:(s.pid&&clients.get(s.pid)&&clients.get(s.pid).avx)||s.avx||undefined,tok:(s.pid&&clients.get(s.pid)&&clients.get(s.pid).tok)||s.tok||null,dice:(s.pid&&clients.get(s.pid)&&clients.get(s.pid).dice)||s.dice||null,bot:!!s.bot&&!s.fill,left:!!s.left||undefined,online:s.bot||!!(s.pid&&clients.get(s.pid)&&clients.get(s.pid).ws&&clients.get(s.pid).room===r.code&&clients.get(s.pid).ws.readyState===1)}))}}
function sendRoom(r){r.seats.forEach((s,i)=>{const c=s.pid&&clients.get(s.pid);if(c&&c.room===r.code)send(c.ws,{...roomInfo(r),you:i})})}
function stateMsg(r){return {t:'state',six:!!r.six,g:r.g,phase:r.phase,dice:r.dice,moves:r.moves,deadline:r.deadline,left:Math.max(0,r.deadline-Date.now()),turnMs:TURN_MS,colors:r.colors}}
const MODES=['classic','quick','team','arrow','blitz','kill'];
function newRoom(size,opts,pub){const game=opts&&mg.is(opts.game)&&opts.game;if(game){const r={code:code(),size:mg.size(game),mg:game,opts:{game,mode:game},public:!!pub,seats:[],host:null,started:false,g:null,phase:'wait',timer:null,created:Date.now()};rooms.set(r.code,r);return r}const six=size===6||!!(opts&&opts.six);const md=six?'classic':MODES.includes(opts&&opts.mode)?opts.mode:'classic';if(md==='team')size=4;if(six)size=Math.max(2,Math.min(6,size));const r={code:code(),size,six,opts:{blockade:!six&&!!(opts&&opts.blockade),three6:!!(opts&&opts.three6),mode:md,night:!!(opts&&opts.night),six},public:!!pub,seats:[],host:null,started:false,g:null,phase:'wait',dice:0,moves:[],timer:null,created:Date.now()};rooms.set(r.code,r);return r}
function joinRoom(c,pid,r){if(c.room&&c.room!==r.code)leaveRoom(pid);let i=r.seats.findIndex(s=>s.pid===pid);
 if(i<0){if(r.started)return send(c.ws,{t:'error',msg:'Game already started'});if(r.seats.length>=r.size)return send(c.ws,{t:'error',msg:'Room is full'});r.seats.push({pid,name:c.name,avatar:c.avatar,avx:c.avx});if(!r.host)r.host=pid}
 c.room=r.code;sendRoom(r);if(r.started){if(r.mg)mg.onJoinStarted(r,c);else send(c.ws,stateMsg(r))}
 if(!r.started&&r.seats.length===r.size)startGame(r);
 if(r.ev){evArm(r);return}
 if(r.public&&!r.started&&r.seats.length>=1&&!r.qt){r.fillAt=Date.now()+QUICK_MS;sendRoom(r)}if(r.public&&!r.started&&r.seats.length>=1&&!r.qt)r.qt=setTimeout(()=>{if(!r.started&&r.seats.some(s=>s.pid)){while(r.seats.length<r.size)addFill(r);startGame(r)}},QUICK_MS)}
// 3.15.4 event queue: a room started with PLAY EVENT MATCH (r.ev) waits for a real opponent. No silent bot fill: after EV_WAIT_MS every waiting player gets
// {t:'evNoOpp'} and may keep waiting ({t:'evwait'}), leave, or play a practice match vs the computer ({t:'evpractice'}, no event points).
function evArm(r){if(r.started||r.qt||!r.seats.some(s=>s.pid))return;r.fillAt=Date.now()+EV_WAIT_MS;sendRoom(r);
 r.qt=setTimeout(()=>{r.qt=null;r.fillAt=null;if(r.started||!r.seats.some(s=>s.pid))return;r.seats.forEach(s=>{const c=s.pid&&clients.get(s.pid);if(c&&c.room===r.code)send(c.ws,{t:'evNoOpp',ev:r.ev,code:r.code})});sendRoom(r)},EV_WAIT_MS)}
function addFill(r){const used=new Set(r.seats.map(s=>s.name));const pool=FILLN.filter(n=>!used.has(n));const name=pool.length?pool[crypto.randomInt(pool.length)]:'Player'+(100+crypto.randomInt(900));r.seats.push({bot:true,fill:true,name,avatar:FILLA[crypto.randomInt(FILLA.length)]})}
function addBot(r){const k=r.seats.length;r.seats.push({bot:true,name:BOTN[k%4],avatar:'🤖'})}
function leaveRoom(pid,explicit){const c=clients.get(pid);if(!c||!c.room)return;const r=rooms.get(c.room);c.room=null;if(!r)return;
 if(!r.started){r.seats=r.seats.filter(s=>s.pid!==pid);if(r.host===pid)r.host=(r.seats.find(s=>s.pid)||{}).pid||null;if(!r.seats.length){clearTimeout(r.qt);rooms.delete(r.code)}else sendRoom(r)}
 else{const i=r.seats.findIndex(s=>s.pid===pid),s=r.seats[i];if(s){s.bot=true;s.name+=' (left)';s.pid=null;
   // 3.16.1: an explicit Leave (not a dropped connection / minimised app) takes the player out of the match: no computer plays for them,
   // their pawns go back to base, their turns are skipped, they rank last, and the match ends when fewer than 2 seats are still playing.
   if(explicit&&r.g&&!r.mg&&r.phase!=='over'){s.left=true;(r.leftOrder=r.leftOrder||[]).push(i);
    if(leftSkips(r)){try{r.g.tokens[i]=r.g.tokens[i].map(()=>-1)}catch(e){}sendRoom(r);
     if(leftEnd(r)){clearTimeout(r.timer);finishGame(r,0);cleanup(r);return}
     if(r.g.turn===i&&(r.phase==='roll'||r.phase==='move')){clearTimeout(r.timer);r.g.bonus=0;r.g.queue=[];r.rerollOpen=false;endTurn(r)}else bc(r,stateMsg(r));cleanup(r);return}}}
  sendRoom(r);schedule(r);cleanup(r)}}
// explicit leavers (3.16.1): skipped in solo Ludo (2-6 players); team games keep the computer playing for the partner's sake
const leftSkips=r=>!!(r&&r.g&&!r.mg&&!(r.opts&&r.opts.mode==='team')&&!(r.six&&r.g.team));
const isLeft=(r,i)=>!!(r.seats[i]&&r.seats[i].left);
function leftEnd(r){if(!leftSkips(r)||!r.seats.some(s=>s.left))return false;const rk=r.g.rank||[];return r.seats.filter((s,i)=>!s.left&&!rk.includes(i)).length<=1}
function ordr(r){const o=LG(r).standings(r.g)||[];if(!leftSkips(r)||!r.seats.some(s=>s.left))return o;const lo=(r.leftOrder||[]).slice().reverse();return o.filter(i=>!isLeft(r,i)).concat(lo.filter(i=>o.includes(i)))}
function cleanup(r){if(r.seats.every(s=>!s.pid)){clearTimeout(r.timer);rooms.delete(r.code)}}
function startGame(r){LO.stat('matches');if(r.mg)return mg.startGame(r);clearTimeout(r.qt);r.size=r.seats.length;r.started=true;r.startedAt=Date.now();r.caps=r.seats.map(()=>0);r.g=LG(r).newGame(r);r.colors=r.six?r.g.players.slice():SEATS[r.size];r.rerolls=r.seats.map(()=>0);try{social.onGameStart(r)}catch(e){}r.g.turn=0;sendRoom(r);beginTurn(r)}
function isAuto(r,i){const s=r.seats[i];if(s.bot)return BOT_MS;const c=clients.get(s.pid);if(!c||c.room!==r.code||!c.ws||c.ws.readyState!==1)return OFFLINE_MS;if(c.away)return Math.min(OFFLINE_MS,1500);return 0}
function schedule(r,extraDelay=0){if(r.mg)return mg.schedule(r,extraDelay);if(!r.started||(r.phase!=='roll'&&r.phase!=='move'))return;clearTimeout(r.timer);const a=isAuto(r,r.g.turn);
 const ms=a?a+extraDelay:Math.max(0,r.deadline-Date.now())+extraDelay;r.timer=setTimeout(()=>autoAct(r),ms)}
function autoAct(r){if(r.phase==='roll')doRoll(r);else if(r.phase==='move'){const ch=LG(r).ai(r.g,r.g.turn);if(ch)doMove(r,ch);else endTurn(r)}}
function beginTurn(r,delay=0,keep=false){if(leftSkips(r)&&r.seats.some(x=>x.left)){if(leftEnd(r)){finishGame(r,0);return}if(isLeft(r,r.g.turn)){r.g.bonus=0;r.g.queue=[];r.rerollOpen=false;endTurn(r);return}}if(!keep){r.g.queue=[];r.rerollOpen=false}r.phase='roll';r.dice=0;r.moves=[];r.deadline=Date.now()+TURN_MS+delay;bc(r,stateMsg(r));schedule(r,delay)}
function endTurn(r){r.rerollOpen=false;if(r.rerolls)r.rerolls=r.rerolls.map(()=>0);LG(r).endDice(r.g);if(LG(r).over(r.g)){finishGame(r,0);return}beginTurn(r)}
const REROLL_WIN=+process.env.REROLL_WIN||2600;
function canAfford(r,pi){if(r.six)return false;const s=r.seats[pi];const c=s&&!s.bot&&clients.get(s.pid);return c&&c.diamonds>=L.rerollCost((r.rerolls||[])[pi]|0)}
// 3.5.5 dice queue: 6 -> roll again; when rolling ends the player applies queued values in any order
function doRoll(r,re){if(r.phase!=='roll'&&!re)return;const pi=r.g.turn;const A=LG(r);A.init(r.g);
 if(!re){r.sixesBefore=r.g.sixes||0;r.qBefore=r.g.queue.slice()}else{r.g.sixes=r.sixesBefore;r.g.queue=r.qBefore.slice()}
 const d=1+crypto.randomInt(6);r.dice=d;const rr=A.rollPush(r.g,d);const moves=rr.forfeit||rr.again?[]:A.options(r.g,pi);
 r.rerollOpen=!rr.forfeit&&!!canAfford(r,pi);r.rerollUntil=Date.now()+REROLL_WIN;
 bc(r,Object.assign({t:'rolled',six:!!r.six,pi,dice:d,queue:r.g.queue.slice(),again:rr.again,moves,forfeit:rr.forfeit,n:(r.rerolls||[])[pi]|0,canRe:r.rerollOpen},re||{}));
 r.phase='busy';clearTimeout(r.timer);const wn=r.rerollOpen?REROLL_WIN:0;
 if(rr.forfeit){r.g.bonus=0;r.timer=setTimeout(()=>endTurn(r),NOMOVE_MS);return}
 if(rr.again){/* 3.9.0: next roll available at once; the re-roll offer stays valid until the player rolls again or REROLL_WIN ends */r.timer=setTimeout(()=>beginTurn(r,0,true),450);return}
 if(!moves.length){r.timer=setTimeout(()=>endTurn(r),Math.max(wn,NOMOVE_MS));return}
 r.phase='move';r.moves=moves;r.deadline=Date.now()+TURN_MS;schedule(r,700)}
function doMove(r,o){if(r.phase!=='move')return false;const pi=r.g.turn,A=LG(r);o=norm(r,pi,o);if(!A.canUse(r.g,pi,o))return false;r.rerollOpen=false;const from=A.from(r.g,pi,o);
 const res=A.useDie(r.g,pi,o);r.phase='busy';clearTimeout(r.timer);if(res&&res.captured&&res.captured.length&&r.caps)r.caps[pi]=(r.caps[pi]|0)+res.captured.length;
 bc(r,{t:'moved',six:!!r.six,pi,pj:r.six?o.pj:pi,ti:o.ti,di:o.di,dice:res.d,from,res});
 const steps=from<0?1:res.d;const anim=Math.min(ANIM_MS,200+steps*180)+(res.arrow?450:0);
 if(A.over(r.g)){finishGame(r,anim);return true}
 const os=res.done&&!r.six?[]:A.options(r.g,pi);
 if(os.length){r.timer=setTimeout(()=>{r.phase='move';r.moves=os;r.dice=0;r.deadline=Date.now()+TURN_MS;bc(r,stateMsg(r));schedule(r,300)},anim);return true}
 r.timer=setTimeout(()=>endTurn(r),anim);return true}
function finishGame(r,delay){try{betPay(r)}catch(e){}r.phase='over';clearTimeout(r.timer);const order=ordr(r);r.overRank=order;try{EV3.onMatchOver(r,order)}catch(e){console.error('ev3',e.message)}try{social.onMatchOver(r,order)}catch(e){console.error('fol',e.message)}r.timer=setTimeout(()=>{r.overTo=new Set(r.seats.filter(s=>s.pid&&clients.get(s.pid)&&clients.get(s.pid).room===r.code&&clients.get(s.pid).ws&&clients.get(s.pid).ws.readyState===1).map(s=>s.pid));bc(r,{t:'over',gid:gidOf(r),six:!!r.six,rank:order,mode:r.opts.mode,tour:r.tour?{id:r.tour.id,round:r.tour.round}:null,evPts:r.ev?{id:r.ev,p:r.evPts||r.seats.map(()=>0),practice:!!r.practice}:undefined});try{tour.onOver(r,order)}catch(e){console.error('tour',e.message)}},delay)}
// a client that was offline when the game ended still gets the result (once). 3.15.9: a player who already got the result
// (and e.g. force-stopped the app afterwards) is taken out of the finished room on reconnect instead of getting it again.
const gidOf=r=>r.code+'.'+(r.startedAt||0);
const seenOver=(r,pid)=>!!(r&&r.phase==='over'&&r.overTo&&r.overTo.has(pid));
function resendOver(r,ws,pid){if(r.phase==='over'&&r.overRank){if(pid){r.overTo=r.overTo||new Set();r.overTo.add(pid)}setTimeout(()=>send(ws,{t:'over',gid:gidOf(r),six:!!r.six,rank:r.overRank,mode:r.opts.mode,tour:r.tour?{id:r.tour.id,round:r.tour.round}:null}),50)}}
function fidOf(pid){return crypto.createHash('sha256').update('ls-friend:'+pid).digest('hex').slice(0,6).toUpperCase()}
const fids=new Map();// public friend code -> pid
const social=require('./social.js')({clients,send,fids,fidOf,rooms,newRoom:(...a)=>newRoom(...a),joinRoom:(...a)=>joinRoom(...a)});
function seatOf(r,pid){return r.seats.findIndex(s=>s.pid===pid)}
// Aimed emoji throws reuse the existing chat event with an optional `to` seat (old clients ignore unknown fields).
// Rate limits (overridable in tests): 2.5s between throws, max 6 per 20s per player.
const THROW_COOL=+process.env.THROW_COOL||2500,THROW_WINDOW=+process.env.THROW_WINDOW||20000,THROW_MAX=+process.env.THROW_MAX||6;
function aimedSeat(r,from,to){if(to==null||to==='')return -1;const j=Number(to);if(!Number.isInteger(j)||j<0||j>=r.seats.length||j===from||!r.seats[j])return -1;return j}
function throwOk(c){const now=Date.now();if(now-(c.throwAt||0)<THROW_COOL)return false;c.throwHits=(c.throwHits||[]).filter(t=>t>=now-THROW_WINDOW);if(c.throwHits.length>=THROW_MAX)return false;c.throwAt=now;c.throwHits.push(now);return true}
// Paid sticker packs / emotes are owned on the client (P.owned.stk / P.owned.emote). The server wallet tracks coins, gems, and mail/store item ids, not those packs, so paid-throw ownership is enforced client-side only unless that data is added later.
function throwOwned(/*pid,text*/){return true}
// 3.14.4 coin entry for friend challenges and private Ludo tables. Same table as quick match (BETS_OK); 0 = free.
// Coins live on the phone, so the client reports its balance with create/join/challenge and the server refuses obvious shortfalls.
// Only 3.14.4+ clients (caps.bet) can create or join a coin table: older apps would get the payout without paying the entry.
function ludoBet(c,m){const b=BETS_OK.includes(+m.bet)?(+m.bet):0;if(!b||!c.cb)return 0;if(m.coins!=null&&(+m.coins||0)<b)return 0;return b}
function betJoinBlock(c,pid,r,m){if(!r||r.mg||r.public||!r.bet||r.started||r.seats.some(s=>s.pid===pid))return '';
 if(!c.cb)return 'Please update Ludo Sultan to join coin tables.';if(m.coins!=null&&(+m.coins||0)<r.bet)return 'Not enough coins for this table.';return ''}
const tour=require('./tour.js')({clients,send,rooms,newRoom:(...a)=>newRoom(...a),joinRoom:(...a)=>joinRoom(...a),startGame:(...a)=>startGame(...a),fidOf,FILLN,FILLA});
{const _pg=social.purge;social.purge=function(p){AVX.purge(p).catch(e=>console.error('avatar purge',e.message));return _pg?_pg.apply(this,arguments):false}}
const accounts=require('./accounts.js')({send,social});LO.bind({clients,rooms,accounts});
const turn=require('./turn.js');
wss.on('connection',ws=>{let pid=null;ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
 ws.on('message',buf=>{let m;try{m=JSON.parse(buf)}catch(e){return}
  if(m.t==='hello'){pid=(typeof m.pid==='string'&&m.pid.length<=40&&m.pid)||crypto.randomUUID();
    {const bn=LO.banned(pid),mt=LO.maintenance();if(bn){try{ws.send(JSON.stringify({t:'banned',reason:bn.reason||'',until:bn.until||0}))}catch(e){}pid=null;setTimeout(()=>{try{ws.close()}catch(e){}},200);return}
     if(!mt&&!LO.flag('onlinePlay')){try{ws.send(JSON.stringify({t:'maint',msg:{en:'Online play is paused for a short time. You can still play offline.'},until:0}))}catch(e){}pid=null;setTimeout(()=>{try{ws.close()}catch(e){}},200);return}
     if(mt&&mt.blockOnline){try{ws.send(JSON.stringify({t:'maint',msg:mt.msg,until:mt.until||0}))}catch(e){}pid=null;setTimeout(()=>{try{ws.close()}catch(e){}},200);return}}let c=clients.get(pid);
   if(c){if(c.ws&&c.ws!==ws)try{c.ws.close()}catch(e){};c.ws=ws}else{c={ws,room:null};clients.set(pid,c)}
   c.name=String(m.name||'Player').slice(0,16);c.avatar=(a=>/^av:[a-z0-9_]{1,24}$/i.test(a)?a:a.slice(0,4))(String(m.avatar||'🦁'));c.avx=AVX.clean(m.avx);
   c.diamonds=Math.max(0,Math.min(100000,(m.diamonds|0)||0));c.fid=fidOf(pid);fids.set(c.fid,pid);send(ws,{t:'welcome',pid,fid:c.fid});social.onHello(pid,c,m);const r=c.room&&rooms.get(c.room);if(r&&!r.mg&&seenOver(r,pid)){leaveRoom(pid)}else if(r){sendRoom(r);if(r.started){if(r.mg){mg.onJoinStarted(r,c);mg.schedule(r)}else{send(ws,stateMsg(r));schedule(r);resendOver(r,ws,pid)}}}return}
  if(!pid)return;const c=clients.get(pid);const r=c.room&&rooms.get(c.room);
  if(m.t==='caps'){c.cb=!!m.bet;return}
  if(m.t==='vdiag'){const now=Date.now();if(now-(c.vdW||0)>10000){c.vdW=now;c.vdN=0}if(++c.vdN>6)return;try{const d=JSON.stringify(m.d||{}).replace(/(\d{1,3}\.){3}\d{1,3}/g,'x').slice(0,1400);console.log('vdiag',c.fid,c.room||'-',d)}catch(e){}return} // 3.16.1 voice diagnostics (no addresses) // 3.14.4: client understands coin entry at friend / private Ludo tables
  if(m.t==='ice'){turn.iceFor(pid).then(ice=>{try{send(ws,{t:'ice',servers:ice||[],ttl:turn.TTL})}catch(e){}});return}
  if(m.t==='skin'){const ok=v=>typeof v==='string'&&/^[a-z0-9]{1,16}$/.test(v)?v:'classic';c.tok=ok(m.tok);c.dice=ok(m.dice);try{social.setSkin(pid,c)}catch(e){}
   if(r)sendRoom(r);return}
  // 3.14.3 Play Integrity gate for joining online matches (only blocks in 'enforce' mode)
  if((m.t==='quick'||m.t==='join'||m.t==='create'||m.t==='challenge')&&!LO.gate(pid,'match')){send(ws,{t:'error',code:'integrity',msg:'Device check failed. Please install Ludo Sultan from Google Play and try again.'});return}
  switch(m.t){
   case 'create':{const gname=mg.is(m.game)?m.game:(m.opts&&mg.is(m.opts.game)&&m.opts.game);if(gname){const rr=newRoom(mg.size(gname),{game:gname},false);const bet=BETS_OK.includes(+m.bet)?(+m.bet):0;if(bet)rr.bet=bet;joinRoom(c,pid,rr);break}const n=(m.size|0)===6||(m.opts&&m.opts.six)?6:Math.min(4,Math.max(2,m.size|0||4));if(m.opts&&m.night!=null&&m.opts.night==null)m.opts.night=m.night;const nr=newRoom(n,m.opts,false);const bet=ludoBet(c,m);if(bet)nr.bet=bet;joinRoom(c,pid,nr);break}
   case 'join':{const rr=rooms.get(String(m.code||'').toUpperCase().trim());if(!rr){send(ws,{t:'error',msg:'Room not found'});break}if(rr.ev&&!(EV3.eligible(rr.ev,pid).ok&&!rr.started)){send(ws,{t:'error',code:'event',ev:rr.ev,msg:'This event room is not available'});break}const why=betJoinBlock(c,pid,rr,m);if(why){send(ws,{t:'error',code:'bet',msg:why});break}joinRoom(c,pid,rr);break}
   case 'quick':{if(m.ev){const evId=String(m.ev).slice(0,12);const el=EV3.eligible(evId,pid);if(!el.ok||mg.is(m.game)){send(ws,{t:'error',code:'event',ev:evId,why:el.error||'game',msg:el.error==='cap'?'Daily limit for this event reached':el.error==='notJoined'?'Join this event first':'This event is not live right now'});break}
     if(c.room){const cur=rooms.get(c.room);if(cur&&!cur.started)leaveRoom(pid)}
     const k='ev|'+evId;let rr=[...rooms.values()].find(x=>x.public&&!x.started&&x.ev===evId&&x.qkey===k&&x.seats.length<x.size&&!x.seats.some(s=>s.pid===pid));
     if(!rr){rr=newRoom(2,{mode:'classic',three6:true},true);rr.qkey=k;rr.ev=evId}joinRoom(c,pid,rr);break}
     if(mg.is(m.game)){const bet=BETS_OK.includes(+m.bet)?(+m.bet):0;const k='mg|'+m.game+(bet?('|b'+bet):'');if(c.room){const cur=rooms.get(c.room);if(cur&&!cur.started)leaveRoom(pid)}let rr=pickQuick(x=>x.public&&!x.started&&x.mg===m.game&&x.qkey===k&&x.seats.length<x.size,regOf(m));if(!rr){rr=newRoom(mg.size(m.game),{game:m.game},true);rr.qkey=k;rr.reg=regOf(m);if(bet)rr.bet=bet}else if(bet&&!rr.bet)rr.bet=bet;joinRoom(c,pid,rr);break}// queue key = player count + mode + night mode + house rule (blockade) + bet; only same-key players share a room.
     // 3.11.6: computer players fill empty seats after QUICK_MS (10 s) without enough real players
     const six=(m.size|0)===6;const md=six?'six':MODES.includes(m.mode)?m.mode:'classic';const sz=six?6:md==='team'?4:([2,3,4].includes(m.size|0)?(m.size|0):4);const nt=!!m.night,bl=!six&&!!m.blockade;
     const bet=BETS_OK.includes(+m.bet)?(+m.bet):0;const k=qkey(sz,md,nt,bl)+(bet?('|b'+bet):'');
     if(c.room){const cur=rooms.get(c.room);if(cur&&!cur.started)leaveRoom(pid)}
     let rr=pickQuick(x=>x.public&&!x.started&&x.qkey===k&&x.seats.length<x.size,regOf(m));if(!rr){rr=newRoom(sz,{mode:six?'classic':md,night:nt,blockade:bl,three6:true,six},true);rr.qkey=k;rr.reg=regOf(m);if(bet)rr.bet=bet}else if(bet&&!rr.bet)rr.bet=bet;joinRoom(c,pid,rr);break}
   case 'start':if(r&&!r.started&&!r.ev&&r.host===pid&&!r.tour){if(r.mg){while(r.seats.length<r.size)addFill(r);startGame(r);break}while(r.seats.length<(r.opts.mode==='team'?4:2))addBot(r);startGame(r)}break;
   case 'addbot':if(r&&!r.started&&!r.ev&&r.host===pid&&r.seats.length<r.size){addBot(r);sendRoom(r);if(r.seats.length===r.size)startGame(r)}break;
   case 'roll':if(r&&r.mg){mg.handle(m,pid,c,ws,r);break}if(r&&r.started&&seatOf(r,pid)===r.g.turn)doRoll(r);break;
   case 'reroll':{if(!(r&&r.started&&r.rerollOpen&&seatOf(r,pid)===r.g.turn&&Date.now()<=r.rerollUntil+400)){send(ws,{t:'rerollDenied',bal:c.diamonds});break}
     const pi=r.g.turn;const sp=L.spendReroll(c.diamonds,r.rerolls[pi]|0);if(!sp){r.rerollOpen=false;send(ws,{t:'rerollDenied',bal:c.diamonds});break}
     c.diamonds=sp.bal;r.rerolls[pi]=sp.n;clearTimeout(r.timer);doRoll(r,{reroll:true,cost:sp.cost,bal:sp.bal,n:sp.n});break}
   case 'gems':c.diamonds=Math.max(0,Math.min(100000,m.diamonds|0));break;
   case 'move':if(r&&r.mg){mg.handle(m,pid,c,ws,r);break}if(r&&r.started&&seatOf(r,pid)===r.g.turn)doMove(r,{ti:m.ti,di:m.di,pj:m.pj});break;
   case 'chat':if(r){if(LO.muted(pid)){send(ws,{t:'toast',msg:'You are muted for now.'});break}const i=seatOf(r,pid);if(i>=0){const msg={t:'chat',pi:i,fid:c.fid,text:LO.filterText(social.matchChat(c,m.text))};const to=aimedSeat(r,i,m.to);if(to>=0){if(!throwOk(c)){send(ws,{t:'toast',msg:'Wait a moment'});break}msg.to=to}bc(r,msg)}}break;
   case 'gift':if(r&&r.started){const i=seatOf(r,pid);const to=m.to|0;if(i>=0&&to>=0&&to<r.seats.length&&to!==i)bc(r,{t:'gift',from:i,to,item:String(m.item||'').slice(0,8)})}break;
   case 'away':{c.away=!!m.on;if(r&&r.started){const i=seatOf(r,pid);if(i>=0){bc(r,{t:'away',pi:i,on:!!m.on});schedule(r)}}break}
   case 'sync':if(r&&!r.mg&&seenOver(r,pid)){leaveRoom(pid);send(ws,{t:'left'});break}if(r){sendRoom(r);if(r.started){if(r.mg)mg.onJoinStarted(r,c);else{send(ws,stateMsg(r));resendOver(r,ws,pid)}}}break;
   case 'presence':{const out={};(Array.isArray(m.fids)?m.fids:[]).slice(0,100).forEach(f=>{f=String(f).toUpperCase();const cp=fids.get(f),cc=cp&&clients.get(cp);out[f]=cc?{online:!!(cc.ws&&cc.ws.readyState===1),name:cc.name,avatar:cc.avatar,avx:cc.avx,playing:!!(cc.room&&rooms.get(cc.room)&&rooms.get(cc.room).started)}:{online:false}});send(ws,{t:'presence',list:out});break}
   case 'challenge':{const tp=fids.get(String(m.to||'').toUpperCase()),tc=tp&&clients.get(tp);if(!tc||!tc.ws||tc.ws.readyState!==1||tp===pid){send(ws,{t:'error',msg:'Friend is offline'});break}
     if(mg.is(m.game)){const nr=newRoom(mg.size(m.game),{game:m.game},false);const bet=BETS_OK.includes(+m.bet)?(+m.bet):0;if(bet)nr.bet=bet;joinRoom(c,pid,nr);send(tc.ws,{t:'challenge',code:nr.code,game:m.game,bet:nr.bet||0,from:{fid:c.fid,name:c.name,avatar:c.avatar,avx:c.avx}});break}const md=MODES.includes(m.mode)&&m.mode!=='team'?m.mode:'classic';const nr=newRoom(2,{mode:md,night:!!m.night},false);let bet=ludoBet(c,m);if(bet&&!tc.cb){bet=0;send(ws,{t:'toast',code:'freebet',msg:'Your friend needs the new app version for coin games. This game is free.'})}if(bet)nr.bet=bet;joinRoom(c,pid,nr);send(tc.ws,{t:'challenge',code:nr.code,mode:md,bet:nr.bet||0,from:{fid:c.fid,name:c.name,avatar:c.avatar,avx:c.avx}});break}
   case 'decline':{const rr=rooms.get(String(m.code||''));if(rr&&!rr.started&&rr.host){const hc=clients.get(rr.host);hc&&send(hc.ws,{t:'declined',name:c.name})}break}
   case 'lbpost':{const e={pid,fid:c.fid||'',name:String(m.name||'Player').slice(0,16),av:(a=>/^av:[a-z0-9_]{1,24}$/i.test(a)?a:a.slice(0,4))(String(m.av||'')),tr:Math.max(0,Math.min(1e6,m.tr|0)),wins:Math.max(0,m.wins|0),cc:String(m.cc||'').slice(0,3).toUpperCase(),city:String(m.city||'').slice(0,40),t:Date.now()};const old=LB.get(pid);e.gm=m.gm?lbg.clean(m.gm):(old&&old.gm)||{};LB.set(pid,e);lbSave();break}
   case 'lb':{const sc=['local','national','friends','global'].includes(m.scope)?m.scope:'global';let a=[...LB.values()];
    if(sc==='national')a=a.filter(x=>x.cc===String(m.cc||'').toUpperCase());if(sc==='local')a=a.filter(x=>x.city&&x.city===String(m.city||''));
    if(sc==='friends'){const f=new Set((Array.isArray(m.fids)?m.fids:[]).slice(0,300).map(x=>String(x).toUpperCase()));f.add(c.fid);a=a.filter(x=>f.has(x.fid))}
    a.sort((x,y)=>y.tr-x.tr);send(ws,{t:'lb',scope:sc,rows:a.slice(0,100).map(({pid:_,...r})=>r)});break}
   case 'lbg':{const game=lbg.GKEYS.includes(m.game)?m.game:'ludo';const sc=['local','national','friends','global'].includes(m.scope)?m.scope:'global';let a=[...LB.values()];
    if(sc==='national')a=a.filter(x=>x.cc===String(m.cc||'').toUpperCase());if(sc==='local')a=a.filter(x=>x.city&&x.city===String(m.city||''));
    if(sc==='friends'){const f=new Set((Array.isArray(m.fids)?m.fids:[]).slice(0,300).map(x=>String(x).toUpperCase()));f.add(String(c.fid||'').toUpperCase());a=a.filter(x=>f.has(String(x.fid||'').toUpperCase()))}
    send(ws,Object.assign({t:'lbg',game,scope:sc},lbg.top(a,game,pid,100)));break}
   case 'lbmy':send(ws,{t:'lbmy',ranks:lbg.ranksFor([...LB.values()],pid)});break;
   case 'evwait':if(r&&r.ev&&!r.started&&seatOf(r,pid)>=0)evArm(r);break;
   case 'evpractice':if(r&&r.ev&&!r.started&&seatOf(r,pid)>=0){clearTimeout(r.qt);r.qt=null;r.practice=true;while(r.seats.length<r.size)addFill(r);startGame(r)}break;
   case 'leave':leaveRoom(pid,true);send(ws,{t:'left'});break;
   case 'mg':case 'mgact':case 'mgsync':if(r&&r.mg){mg.handle(m,pid,c,ws,r);break}send(ws,{t:'mgerr',msg:'not in a mini-game'});break;
   default:if((m.t==='evscore'||m.t==='evlb')&&EV3.handleWs(m,pid,send,ws))break;if(r&&r.mg&&mg.handle(m,pid,c,ws,r))break;if(tour.handle(m,pid,c,ws))break;if(accounts.handle(m,pid,c,ws))break;social.handle(m,pid,c,ws);
  }});
 ws.on('close',()=>{const c=pid&&clients.get(pid);if(c&&c.ws===ws){c.ws=null;social.onClose(pid,c);const r=c.room&&rooms.get(c.room);if(r){sendRoom(r);if(r.started)schedule(r)}
   // forget idle clients after 5 min
   setTimeout(()=>{const cc=clients.get(pid);if(cc&&!cc.ws){leaveRoom(pid);clients.delete(pid)}},+process.env.FORGET_MS||300000)}})});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.isAlive)return ws.terminate();ws.isAlive=false;ws.ping()}),30000).unref();
Object.assign(mgApi,{rooms,clients,send,bc:typeof bc==='function'?bc:null,sendRoom,fidOf,seatOf,isAuto,cleanup,social,TURN_MS,BOT_MS,OFFLINE_MS,QUICK_MS,BETS_OK,addFill,addBot,W30});
EV3.boot();
server.listen(PORT,()=>console.log('Ludo Sultan server on http://localhost:'+PORT+' (store: '+store.info+')'));
let stopping=false;function shutdown(){if(stopping)return;stopping=true;const k=setTimeout(()=>process.exit(0),8000);social.flush();store.close().catch(e=>console.error('flush',e.message)).finally(()=>{clearTimeout(k);process.exit(0)})}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
module.exports={server,rooms,social,tour,accounts,AVX};
