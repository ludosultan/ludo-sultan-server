// 3.15 events v3: server-scored events with a 7-day registration and a 100-player start rule.
// - Schedule: ev3-schedule.json (66 events, UTC). Imported into the events store at boot (new ids only, never overwrites admin edits).
// - Registration opens 7 days before start. Players join for free (fee 0). At the start time the event starts only if 100+ players joined,
//   otherwise it is "Not started: fewer than 100 players" and gives no prizes.
// - Points come only from finished ONLINE public matches the server saw (never from the app): played / win / 2nd / captures (capped),
//   only for matches that started after the player joined, with a daily cap, max 3 counted matches per day against the same opponent,
//   no points for bot-only matches or players who left early. Friend / private / coin tables and mini-games never count.
// - Milestones and ranks are paid through the LiveOps mailbox (server grants). Ranking needs at least 10 counted matches.
// - The flagship rank 1 (Sultan of Sultans) waits in an admin review queue; approval pays it and starts the 7-day showcase (/api/sultan).
// - Religion filter: a player without a community sees only community 'all'. Muslim events only for community 'muslim'.
const fs=require('fs'),path=require('path'),crypto=require('crypto');const store=require('./store.js');const EVS=require('./events.js');
const DAY=864e5,REG_DAYS=7,MIN_PLAYERS=+process.env.EV3_MIN_PLAYERS||100,MIN_RANKED=10;
const SCHED=process.env.EV3_SCHEDULE||path.join(__dirname,'ev3-schedule.json');
const COMMS=['muslim','hindu','sikh','christian','general'];
let CAT={};// item catalog r01..r86 {name,type,audience}
function S(){let d=store.get('ev3');if(!d||typeof d!=='object'){d={};store.set('ev3',d)}d.meta=d.meta||{review:[],showcase:null,decided:{},final:{},imported:{}};const m=d.meta;m.review=m.review||[];m.decided=m.decided||{};m.final=m.final||{};m.imported=m.imported||{};return d}
const save=()=>store.set('ev3',S(),1500);
const sc=id=>{const d=S();return d['s_'+id]=d['s_'+id]||{}};// pid -> score row
const jn=id=>{const d=S();return d['j_'+id]=d['j_'+id]||{}};// pid -> {t,name,av,cc}
const v3=()=>EVS.db().events.filter(e=>e.v2&&e.active);
const byId=id=>EVS.db().events.find(e=>e.id===id&&e.v2);
const clean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,' ').replace(/[\u2013\u2014]/g,'-').slice(0,n);
const dayKey=t=>new Date(t).toISOString().slice(0,10);
function reg(e){const r=(e.v2&&e.v2.registration)||{};return {days:r.days==null?REG_DAYS:r.days,min:r.minPlayers==null?MIN_PLAYERS:r.minPlayers,late:!!r.lateJoin}}
function regOpens(e){return e.start-reg(e).days*DAY}
function joined(e){return Object.keys(jn(e.id)).length}
// status: upcoming -> registration -> live | notStarted -> ended
function status(e,now){now=now||Date.now();if(now<regOpens(e))return 'upcoming';if(now<e.start)return 'registration';
 const m=S().meta;let dec=m.decided[e.id];if(!dec){const n=joined(e);dec=m.decided[e.id]={n,ok:n>=reg(e).min,t:now};save();
  console.log('[ev3]',e.id,dec.ok?'started':'not started',n,'joined')}
 if(!dec.ok)return 'notStarted';return now>e.end?'ended':'live'}
// visibility: no community -> only 'all'; otherwise 'all' + own community
function visible(e,comm){comm=COMMS.includes(comm)?comm:null;return e.community==='all'||(!!comm&&e.community===comm)}
// ---- import ----
function importSchedule(file,opts){opts=opts||{};let j;try{j=JSON.parse(fs.readFileSync(file||SCHED,'utf8'))}catch(e){console.error('[ev3] schedule',e.message);return {ok:false,error:'file'}}
 (j.catalog||[]).forEach(c=>{if(c&&/^r\d{2}$/.test(c.id))CAT[c.id]={name:clean(c.name,40),type:clean(c.type,30),audience:c.audience==='muslim'?'muslim':'all',rarity:clean(c.rarity||'',12)}});
 const d=EVS.db(),m=S().meta;let added=0,updated=0;
 for(const x of (j.events||[])){if(!x||!x.v2)continue;const old=d.events.find(e=>e.id===x.id);
  if(old&&!opts.replace)continue;const e=EVS.normEvent(Object.assign({},x,{id:x.id}),old||null);if(!old){e.id=/^[a-z0-9]{2,12}$/.test(x.id)?x.id:e.id;d.events.push(e);added++}else{Object.assign(old,e);updated++}m.imported[e.id]=Date.now()}
 EVS.save();save();return {ok:true,added,updated,total:v3().length}}
function loadCatalog(){if(Object.keys(CAT).length)return;try{const j=JSON.parse(fs.readFileSync(SCHED,'utf8'));(j.catalog||[]).forEach(c=>{if(c&&/^r\d{2}$/.test(c.id))CAT[c.id]={name:clean(c.name,40),type:clean(c.type,30),audience:c.audience==='muslim'?'muslim':'all',rarity:clean(c.rarity||'',12)}})}catch(e){}}
// ---- public view ----
function rowOf(e,pid){return pid?sc(e.id)[pid]||null:null}
function pubEvent(e,pid,now){const st=status(e,now),r=reg(e),me=rowOf(e,pid),j=pid?jn(e.id)[pid]:null;
 return {id:e.id,name:e.name,desc:e.desc,community:e.community,audience:e.audience,icon:e.icon,start:e.start,end:e.end,regOpens:regOpens(e),fee:0,free:true,status:st,
  joined:joined(e),minPlayers:r.min,lateJoin:r.late,v2:{kind:e.v2.kind,icon:e.v2.icon,target:e.v2.target,minGames:Math.max(MIN_RANKED,e.v2.minGames|0),points:e.v2.points,pointsMode:e.v2.pointsMode,
   dailyCap:e.v2.antiFarm.maxCountedMatchesPerDay,popup:e.v2.popup,milestones:e.v2.milestones,ranks:e.v2.ranks,flagship:e.v2.flagship||null,days:e.v2.days},
  me:j?{joinedAt:j.t,pts:me?me.pts|0:0,games:me?me.games|0:0,wins:me?me.wins|0:0,best:me?me.best|0:0,ms:me?me.ms||[]:[],rank:me?rankOf(e,pid):0,prize:me&&me.prize||null}:null}}
function list(comm,pid){const now=Date.now();return v3().filter(e=>visible(e,comm)&&e.end>now-3*DAY&&regOpens(e)<=now+14*DAY).sort((a,b)=>a.start-b.start).map(e=>pubEvent(e,pid,now))}
function ranked(e){const rows=sc(e.id),min=Math.max(MIN_RANKED,e.v2.minGames|0);return Object.entries(rows).filter(([p,r])=>(r.games|0)>=min&&(r.pts|0)>0).sort((a,b)=>(b[1].pts|0)-(a[1].pts|0)||(a[1].t||0)-(b[1].t||0))}
function rankOf(e,pid){const i=ranked(e).findIndex(([p])=>p===pid);return i+1}
function board(e,pid,n){const J=jn(e.id);const rk=ranked(e);const top=rk.slice(0,n||100).map(([p,r],i)=>({rank:i+1,name:(J[p]&&J[p].name)||'Player',av:(J[p]&&J[p].av)||'',cc:(J[p]&&J[p].cc)||'',pts:r.pts|0,games:r.games|0,wins:r.wins|0}));
 const me=pid?rk.findIndex(([p])=>p===pid)+1:0;const mr=pid&&sc(e.id)[pid];return {id:e.id,status:status(e),top,total:rk.length,me:pid?{rank:me,pts:mr?mr.pts|0:0,games:mr?mr.games|0:0,minGames:Math.max(MIN_RANKED,e.v2.minGames|0)}:null}}
// ---- join ----
function join(id,pid,info){const e=byId(id);if(!e)return {ok:false,error:'unknown'};const st=status(e);const r=reg(e);
 if(!(st==='registration'||(st==='live'&&r.late)))return {ok:false,error:st==='upcoming'?'notOpen':st==='live'?'registrationClosed':st};
 if(!visible(e,info&&info.comm))return {ok:false,error:'community'};
 const J=jn(id);if(!J[pid]){J[pid]={t:Date.now(),name:clean(info&&info.name||'Player',16),av:clean(info&&info.av||'',30),cc:clean(info&&info.cc||'',3).toUpperCase()};save()}
 return {ok:true,joined:Object.keys(J).length,minPlayers:r.min,status:st}}
// ---- scoring (called by app.js when an online match ends) ----
function grant(pid,e,rw,why,kind){const LO=require('./liveops.js');const t={en:(e.name.en||'Event')+': '+why};
 if(rw.type==='coins'&&rw.n>0)return LO.grantTo(pid,{coins:rw.n,title:t,kind:'event',ref:e.id});if(rw.type==='gems'&&rw.n>0)return LO.grantTo(pid,{gems:rw.n,title:t,kind:'event',ref:e.id});
 if(rw.type==='item'&&rw.id)return LO.grantTo(pid,{item:{type:'ev3',id:rw.id,n:rw.n||1},title:t,kind:kind||'event',ref:e.id})}
function onMatchOver(r,order){try{if(!r||r.mg||!r.public||r.tour||!r.g||!Array.isArray(order))return 0;
 const humans=r.seats.map((s,i)=>({s,i})).filter(x=>x.s.pid&&!x.s.bot);if(humans.length<2)return 0;// bot-only for everyone: ignored
 const now=Date.now(),t0=r.startedAt||now,k=dayKey(now);let counted=0;const live=v3().filter(e=>status(e,now)==='live'&&e.start<=t0);if(!live.length)return 0;
 for(const e of live){const J=jn(e.id),rows=sc(e.id),v=e.v2,af=v.antiFarm,P=v.points;
  for(const {s,i} of humans){const j=J[s.pid];if(!j||j.t>t0)continue;// only matches started after joining
   const row=rows[s.pid]=rows[s.pid]||{pts:0,games:0,wins:0,cur:0,best:0,ms:[],t:0,d:{k,n:0,o:{}}};if(!row.d||row.d.k!==k)row.d={k,n:0,o:{}};
   if(row.d.n>=af.maxCountedMatchesPerDay)continue;
   const opp=humans.filter(x=>x.i!==i).map(x=>x.s.pid);if(opp.every(o=>(row.d.o[o]|0)>=af.sameOpponentCountsPerDay))continue;
   opp.forEach(o=>row.d.o[o]=(row.d.o[o]|0)+1);row.d.n++;
   const place=order.indexOf(i),win=place===0,second=place===1&&r.seats.length>2,caps=Math.min(P.captureCapPerMatch,(r.caps&&r.caps[i])|0);
   row.games++;if(win)row.wins++;row.cur=win?(row.cur|0)+1:0;row.best=Math.max(row.best|0,row.cur);
   const add=P.played+(win?P.win:0)+(second?P.second:0)+caps*P.capture;
   row.pts=v.pointsMode==='consecutiveWins'?row.best:(row.pts|0)+add;row.t=now;if(s.name)j.name=clean(s.name,16);if(s.avatar)j.av=clean(s.avatar,30);counted++;
   // milestones
   v.milestones.forEach((m,mi)=>{if((row.ms||[]).includes(mi))return;const need=v.pointsMode==='consecutiveWins'?(m.wins!=null?m.wins:m.pts):m.pts;
    if(row.pts>=need){row.ms=row.ms||[];row.ms.push(mi);grant(s.pid,e,m.reward,m.level?('level '+m.level):('reached '+need+(v.pointsMode==='consecutiveWins'?' wins in a row':' points')))}})}}
 if(counted)save();return counted}catch(err){console.error('[ev3] score',err.message);return 0}}
// ---- finalize ended events: rank prizes (rank 1 of the flagship goes to admin review) ----
function finalize(now){now=now||Date.now();const m=S().meta;let n=0;
 for(const e of v3()){if(m.final[e.id]||now<=e.end)continue;const st=status(e,now);if(st!=='ended'){m.final[e.id]={t:now,status:st,paid:0};n++;continue}
  const rk=ranked(e);let paid=0;
  rk.forEach(([pid,row],i)=>{const rank=i+1;const tier=e.v2.ranks.find(t=>rank>=t.from&&rank<=t.to);if(!tier)return;
   const prize={rank,gems:tier.gems,coins:tier.coins,items:tier.items||[]};row.prize=prize;
   if(tier.showcase){const J=jn(e.id)[pid]||{};m.review.push({id:'rv'+crypto.randomBytes(4).toString('hex'),eid:e.id,event:e.name.en,pid,name:J.name||'Player',av:J.av||'',cc:J.cc||'',pts:row.pts|0,games:row.games|0,rank,gems:tier.gems,coins:tier.coins,items:tier.items||[],showcaseDays:tier.showcaseDays||7,title:(e.v2.flagship&&e.v2.flagship.winnerTitle)||'Sultan of Sultans',t:now,status:'pending'});return}
   payPrize(pid,e,prize);paid++});
  m.final[e.id]={t:now,status:'ended',paid,ranked:rk.length};n++;console.log('[ev3] finalized',e.id,'ranked',rk.length,'paid',paid)}
 if(n)save();return n}
function payPrize(pid,e,p){const LO=require('./liveops.js');const t={en:(e.name.en||'Event')+': rank '+p.rank};
 if(p.gems||p.coins)LO.grantTo(pid,{gems:p.gems,coins:p.coins,title:t,kind:'event',ref:e.id});(p.items||[]).forEach(id=>LO.grantTo(pid,{item:{type:'ev3',id},title:t,kind:'event',ref:e.id}))}
function review(id,action,by){const m=S().meta;const r=m.review.find(x=>x.id===id);if(!r)throw new Error('Not found');if(r.status!=='pending')throw new Error('Already '+r.status);
 const e=byId(r.eid);if(!e)throw new Error('Event gone');
 if(action==='approve'){payPrize(r.pid,e,{rank:r.rank,gems:r.gems,coins:r.coins,items:r.items});r.status='approved';r.by=by;r.at=Date.now();
  m.showcase={pid:r.pid,name:r.name,av:r.av,cc:r.cc,pts:r.pts,eid:r.eid,event:r.event,title:r.title,from:Date.now(),until:Date.now()+(r.showcaseDays||7)*DAY}}
 else if(action==='reject'){r.status='rejected';r.by=by;r.at=Date.now();r.note=clean(arguments[3]||'',200)}else throw new Error('Unknown action');
 save();try{require('./liveops.js').audit(by,'event',r.event,(action==='approve'?'Approved':'Rejected')+' Sultan of Sultans: '+r.name,{})}catch(e){}return r}
function showcase(){const s=S().meta.showcase;if(!s||Date.now()>s.until)return null;const {pid,...pub}=s;return pub}
// ---- HTTP ----
function J(res,c,o){res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))}
function body(req,cb){let b='';req.on('data',d=>{b+=d;if(b.length>2e4)req.destroy()});req.on('end',()=>{try{cb(JSON.parse(b||'{}'))}catch(e){cb(null)}})}
function handle(req,res,u){
 if(u==='/api/ev3'||u==='/api/ev3/join'||u==='/api/ev3/lb'||u==='/api/sultan'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true}
  const q=new URL(req.url,'http://x').searchParams;
  if(u==='/api/sultan')return J(res,200,{showcase:showcase(),now:Date.now()}),true;
  if(u==='/api/ev3'&&req.method==='GET'){loadCatalog();return J(res,200,{now:Date.now(),v:3,minPlayers:MIN_PLAYERS,regDays:REG_DAYS,minRanked:MIN_RANKED,events:list(q.get('comm'),clean(q.get('pid'),40)),showcase:showcase()}),true}
  if(u==='/api/ev3/lb'&&req.method==='GET'){const e=byId(String(q.get('id')||''));if(!e)return J(res,404,{error:'unknown'}),true;return J(res,200,board(e,clean(q.get('pid'),40),100)),true}
  if(u==='/api/ev3/join'&&req.method==='POST'){body(req,m=>{if(!m)return J(res,400,{ok:false});const LO=require('./liveops.js');if(LO.limited(req,'ev3join',40,60e3))return J(res,429,{ok:false,error:'slow down'});const a=LO.authDev(m);if(!a)return J(res,401,{ok:false,error:'key'});if(LO.banned(a.pid))return J(res,403,{ok:false,error:'banned'});
   J(res,200,join(String(m.id||''),a.pid,{comm:m.comm,name:m.name,av:m.av,cc:m.cc}))});return true}
  return J(res,405,{error:'method'}),true}
 if(!u.startsWith('/admin/api/ev3/'))return false;
 const LO=require('./liveops.js');const adm=LO.adminOf(req);if(!adm)return J(res,401,{error:'login'}),true;
 if(req.method!=='GET'&&req.headers['x-ls-admin']!=='1')return J(res,403,{error:'csrf'}),true;
 if(u==='/admin/api/ev3/state'&&req.method==='GET'){const now=Date.now();const m=S().meta;
  return J(res,200,{events:v3().map(e=>({id:e.id,name:e.name.en,community:e.community,start:e.start,end:e.end,regOpens:regOpens(e),status:status(e,now),joined:joined(e),final:m.final[e.id]||null})),review:m.review.slice(-50).reverse(),showcase:m.showcase}),true}
 if(u==='/admin/api/ev3/review'&&req.method==='POST'){body(req,m=>{try{J(res,200,{ok:true,review:review(String(m&&m.id||''),m&&m.action,adm.user,m&&m.note)})}catch(e){J(res,400,{error:e.message})}});return true}
 if(u==='/admin/api/ev3/import'&&req.method==='POST'){if(adm.role&&adm.role!=='owner')return J(res,403,{error:'Owner only'}),true;body(req,m=>J(res,200,importSchedule(null,{replace:!!(m&&m.replace)})));return true}
 if(u==='/admin/api/ev3/wallet'&&req.method==='GET'){const q=new URL(req.url,'http://x').searchParams;return J(res,200,{wallet:require('./wallet.js').adminView(clean(q.get('pid'),40))}),true}
 J(res,404,{error:'unknown'});return true}
// ---- WS: old evscore is ignored for v3 events; evlb for v3 events answers with server scores ----
function handleWs(m,pid,send,ws){if(m.t==='evscore'&&byId(String(m.ev||'')))return true;
 if(m.t==='evlb'){const e=byId(String(m.ev||''));if(!e)return false;const b=board(e,pid,50);send(ws,{t:'evlb',ev:e.id,list:b.top.map(x=>({name:x.name,avatar:x.av,cc:x.cc,pts:x.pts,wins:x.wins,games:x.games})),rank:b.me?b.me.rank:0,total:b.total,v3:true});return true}
 return false}
let timer=null;
function boot(){if(process.env.EV3_AUTOIMPORT!=='0'){const r=importSchedule();if(r.ok&&r.added)console.log('[ev3] imported',r.added,'events')}else loadCatalog();
 if(!timer){timer=setInterval(()=>{try{const now=Date.now();v3().forEach(e=>status(e,now));finalize(now)}catch(e){console.error('[ev3] tick',e.message)}},+process.env.EV3_TICK_MS||60e3);timer.unref()}}
module.exports={boot,handle,handleWs,onMatchOver,finalize,join,list,board,status,visible,importSchedule,review,showcase,regOpens,MIN_PLAYERS,MIN_RANKED,_S:S,_cat:()=>CAT};
