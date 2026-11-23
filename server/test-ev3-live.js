// Run: node server/test-ev3-live.js  (starts the real server on a temp data dir, simulates players + an online match; never touches live data)
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert'),crypto=require('crypto'),{spawn}=require('child_process');const WS=require('ws');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ev3l-'));const D=864e5,now0=Date.now();
const real=JSON.parse(fs.readFileSync(path.join(__dirname,'ev3-schedule.json'),'utf8'));const fl=real.events.find(e=>e.id==='sul261204');
const mk=(id,comm,start,end)=>Object.assign(JSON.parse(JSON.stringify(fl)),{id,community:comm,name:{en:'Live test '+id},start,end});
const START=now0+12000;
fs.writeFileSync(path.join(dir,'s.json.sched'),JSON.stringify({catalog:real.catalog,events:[mk('lflag','all',START,START+D),mk('lmus','muslim',START,START+D),mk('lfew','all',START,START+D)]}));
const pass='Owner-pass-123';const H=p=>{const s=crypto.randomBytes(16);return 'scrypt$16384$'+s.toString('hex')+'$'+crypto.scryptSync(p,s,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex')};
const PORT=21000+Math.floor(Math.random()*1000);
const env=Object.assign({},process.env,{PORT:String(PORT),DATA_FILE:path.join(dir,'s.json'),TOUR_FILE:path.join(dir,'t.json'),EVENTS_FILE:path.join(dir,'e.json'),LB_FILE:path.join(dir,'lb.json'),ACC_FILE:path.join(dir,'a.json'),LO_FILE:path.join(dir,'lo.json'),LOP_FILE:path.join(dir,'lop.json'),LO_DATA_DIR:dir,
 WAL_FILE:path.join(dir,'w.json'),EV3_FILE:path.join(dir,'ev3.json'),EV3_SCHEDULE:path.join(dir,'s.json.sched'),EV3_TICK_MS:'1000',WAL_DAY_GEMS:'500',
 ADMIN_USER:'khawar',ADMIN_PASS_HASH:H(pass),TURN_MS:'400',BOT_MS:'5',OFFLINE_MS:'20',QUICK_MS:'60000',EV_WAIT_MS:'1500',ANIM_MS:'5',NOMOVE_MS:'5'});delete env.DATABASE_URL;
const B='http://127.0.0.1:'+PORT;let n=0;const T=(name,c)=>{assert.ok(c,name);n++;console.log('  ✓',name)};
const J=async(p,o={})=>{const r=await fetch(B+p,o);let j=null;const tx=await r.text();try{j=JSON.parse(tx)}catch(e){}return {s:r.status,j,h:r.headers}};
const P=(p,b,h)=>J(p,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},h||{}),body:JSON.stringify(b)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(f,ms=60000){const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw new Error('timeout');await wait(50)}}
(async()=>{const srv=spawn(process.execPath,[path.join(__dirname,'index.js')],{env,stdio:['ignore','pipe','pipe']});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
 for(let i=0;i<60;i++){try{if((await fetch(B+'/health')).ok)break}catch(e){}await wait(250)}
 try{
 const keys={};const XF=pid=>({'X-Forwarded-For':'10.9.'+(pid.length*7%250)+'.'+(parseInt(pid.replace(/\D/g,'')||'0')%250)});const hello=async pid=>{const h=await P('/api/hello',{pid,ver:'3.15.0',vc:56,name:pid},XF(pid));keys[pid]=h.j.key;return h.j.key};
 console.log('wallet');await hello('wallet01');
 T('wallet needs device key',(await P('/api/wallet',{pid:'wallet01',key:'bad',op:'sync'})).s===401);
 let w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'sync',seed:{c:5e9,g:9e6}});T('first sync seeds, capped at sane limits',w.j.seeded&&w.j.w.c===1e8&&w.j.w.g===2e5);
 w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'sync',seed:{c:1,g:1},n:1,dc:-5000,dg:-100});T('seed only once; spends apply',!w.j.seeded&&w.j.w.c===1e8-5000&&w.j.w.g===2e5-100);
 w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'sync',n:1,dc:-5000});T('repeated sync number ignored (no double spend)',w.j.dup&&w.j.w.c===1e8-5000);
 w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'sync',n:2,dg:800});T('phone earnings capped per day',w.j.applied.g===500&&w.j.capped.g===300);
 w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'iap',sku:'ls_gems_100',token:'tok-123456789'});T('store pack granted by server table',w.j.ok&&w.j.granted.g===200);
 w=await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'iap',sku:'ls_gems_100',token:'tok-123456789'});T('same purchase token granted once',w.j.dup);
 T('unknown sku refused',!(await P('/api/wallet',{pid:'wallet01',key:keys.wallet01,op:'iap',sku:'free_gems',token:'tok-999999999'})).j.ok);
 console.log('events v3');
 T('3.14.x /api/events unchanged (no v3 events)',(await J('/api/events')).j.events.every(e=>!['lflag','lmus','lfew'].includes(e.id)));
 let L=await J('/api/ev3');T('no community -> only all events',L.j.events.map(e=>e.id).sort().join()==='lfew,lflag');
 L=await J('/api/ev3?comm=muslim');T('muslim community -> muslim events too',L.j.events.some(e=>e.id==='lmus'));
 T('status registration + 0/100',L.j.events.find(e=>e.id==='lflag').status==='registration'&&L.j.events.find(e=>e.id==='lflag').minPlayers===20&&L.j.events[0].fee===0);
 T('join needs device key',(await P('/api/ev3/join',{pid:'wallet01',key:'x',id:'lflag'})).s===401);
 const pids=[...Array(100)].map((_,i)=>'player'+String(i).padStart(3,'0'));for(const p of pids)await hello(p);
 for(const p of pids){await P('/api/ev3/join',{pid:p,key:keys[p],id:'lflag',name:'U'+p,cc:'PK'},XF(p))}for(const p of pids.slice(0,19))await P('/api/ev3/join',{pid:p,key:keys[p],id:'lfew'},XF(p));
 L=await J('/api/ev3?pid=player001');T('100/100 joined, my join state',L.j.events.find(e=>e.id==='lflag').joined===100&&L.j.events.find(e=>e.id==='lflag').me.joinedAt>0);
 T('muslim event join refused without community',(await P('/api/ev3/join',{pid:'player001',key:keys.player001,id:'lmus'})).j.error==='community');
 T('muslim event join with community',(await P('/api/ev3/join',{pid:'player001',key:keys.player001,id:'lmus',comm:'muslim'})).j.ok);
 await until(async()=>Date.now()>START+1500,20000);
 L=await J('/api/ev3?pid=player001');T('100 joined (>= 20) -> live on time',L.j.events.find(e=>e.id==='lflag').status==='live');T('19 joined (< 20) -> not started',L.j.events.find(e=>e.id==='lfew').status==='notStarted');
 console.log('online match');
 const cl=pid=>new Promise(res=>{const ws=new WS('ws://127.0.0.1:'+PORT);const c={ws,pid};ws.on('open',()=>ws.send(JSON.stringify({t:'hello',pid,name:'N'+pid})));
  ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='welcome')res(c);if(m.t==='room'){c.room=m;c.seat=m.you}if(m.t==='evlb')c.evlb=m;
   if(m.t==='state'&&m.phase==='roll'&&m.g.turn===c.seat)ws.send(JSON.stringify({t:'roll'}));if(m.t==='state'&&m.phase==='move'&&m.g.turn===c.seat&&m.moves.length){const o=m.moves[0];ws.send(JSON.stringify({t:'move',ti:o.ti,di:o.di}))}
   if(m.t==='rolled'&&m.pi===c.seat&&m.moves.length){const o=m.moves[0];ws.send(JSON.stringify({t:'move',ti:o.ti,di:o.di}))}if(m.t==='over'){c.over=m.rank;c.overMsg=m}if(m.t==='error')c.err=m;if(m.t==='evNoOpp')c.noOpp=m})});
 const A=await cl('player001'),Bc=await cl('player002');
 // 1) NORMAL online match: both joined players, event is live, but nothing is counted
 A.ws.send(JSON.stringify({t:'quick',mode:'quick',size:2}));await wait(200);Bc.ws.send(JSON.stringify({t:'quick',mode:'quick',size:2}));
 await until(()=>A.over&&Bc.over,240000);await wait(300);
 let m1=(await J('/api/ev3?pid=player001')).j.events.find(e=>e.id==='lflag').me;
 T('NORMAL online match gives 0 event points and no game',m1.games===0&&m1.pts===0&&!A.overMsg.evPts);
 A.over=Bc.over=null;
 // 2) ineligible event: error, no fallback to a normal match
 const C=await cl('player050');C.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lfew'}));await until(()=>C.err);
 T('ineligible ev (not started) -> error event, no room',C.err.code==='event'&&C.err.why==='notStarted'&&!C.room);
 C.err=null;C.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'nope'}));await until(()=>C.err);T('unknown ev -> error',C.err.code==='event'&&!C.room);
 const U=await cl('wallet01');U.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lflag'}));await until(()=>U.err);T('not joined -> error',U.err.why==='notJoined'&&!U.room);
 // 3) event queue does not mix with the normal queue; no silent bot fill; evNoOpp; evwait; evpractice
 const D1=await cl('player060'),D2=await cl('player061');
 D1.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lflag'}));await until(()=>D1.room&&D1.room.ev==='lflag');
 T('event room carries ev and a fillIn countdown',D1.room.ev==='lflag'&&D1.room.public&&D1.room.size===2&&D1.room.fillIn>0);
 D2.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2}));await wait(400);T('normal quick player is NOT put in the event room',!D2.room||D2.room.code!==D1.room.code);
 D2.ws.send(JSON.stringify({t:'leave'}));
 await until(()=>D1.noOpp,8000);T('no opponent after the wait: evNoOpp (no bot fill)',D1.noOpp.ev==='lflag'&&!D1.room.started);
 D1.noOpp=null;D1.ws.send(JSON.stringify({t:'evwait'}));await until(()=>D1.noOpp,8000);T('evwait re-arms the queue',!!D1.noOpp);
 // 4) EVENT match with two real players: only that event scores, evPts on over
 const E1=Bc;E1.room=null;D1.ws.send(JSON.stringify({t:'leave'}));await wait(200);
 A.room=null;A.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lflag'}));await wait(200);Bc.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lflag'}));
 await until(()=>A.over&&Bc.over,240000);await wait(300);
 const me1=(await J('/api/ev3?pid=player001')).j.events.find(e=>e.id==='lflag').me,me2=(await J('/api/ev3?pid=player002')).j.events.find(e=>e.id==='lflag').me;
 T('EVENT match scored for both joined players ('+me1.pts+' / '+me2.pts+')',me1.games===1&&me2.games===1&&me1.pts>=10&&me2.pts>=10&&(me1.pts>=40||me2.pts>=40));
 T('today counter in /api/ev3 me.today',me1.today===1&&me2.today===1);
 T('over carries evPts with the per-seat points',A.overMsg.evPts&&A.overMsg.evPts.id==='lflag'&&A.overMsg.evPts.p[A.seat]===me1.pts&&A.overMsg.evPts.p[Bc.seat]===me2.pts);
 // 5) practice match from the event queue gives nothing
 const F=await cl('player070');F.ws.send(JSON.stringify({t:'quick',mode:'classic',size:2,ev:'lflag'}));await until(()=>F.noOpp,8000);F.ws.send(JSON.stringify({t:'evpractice'}));await until(()=>F.room&&F.room.started,8000);
 T('evpractice starts a match vs the computer',F.room.players.length===2);
 A.ws.send(JSON.stringify({t:'evscore',ev:'lflag',pts:999999,games:500,wins:500}));await wait(200);A.ws.send(JSON.stringify({t:'evlb',ev:'lflag'}));await until(()=>A.evlb);
 T('phone evscore ignored, evlb answers with server scores',A.evlb.v3&&A.evlb.total===0&&A.evlb.list.length===0);
 const lb=await J('/api/ev3/lb?id=lflag&pid=player001');T('leaderboard: unranked under 10 matches',lb.j.me.rank===0&&lb.j.me.minGames===10&&lb.j.me.games===1);
 T('/api/sultan empty before any approval',(await J('/api/sultan')).j.showcase===null);
 console.log('admin');T('admin ev3 api needs login',(await J('/admin/api/ev3/state')).s===401);
 const l=await P('/admin/api/login',{user:'khawar',pass});const ck=l.h.get('set-cookie').split(';')[0];
 const st=await J('/admin/api/ev3/state',{headers:{Cookie:ck}});T('admin sees v3 events, joins and status',st.s===200&&st.j.events.find(e=>e.id==='lflag').joined===100&&st.j.events.find(e=>e.id==='lfew').status==='notStarted');
 T('admin POST needs csrf header',(await P('/admin/api/ev3/review',{id:'x',action:'approve'},{Cookie:ck})).s===403);
 T('wallet admin view',(await J('/admin/api/ev3/wallet?pid=wallet01',{headers:{Cookie:ck}})).j.wallet.seed.c===5e9);
 console.log('test-ev3-live: ALL PASSED ('+n+' checks)');srv.kill();process.exit(0)
 }catch(e){console.error('FAIL',e.message);console.error(log.slice(-3000));srv.kill();process.exit(1)}})();
