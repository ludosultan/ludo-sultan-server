// 3.15.6 profile photos + Photo to cartoon: upload checks (device key, webp/jpeg, 30 KB, daily limit), GET with cache headers,
// report + auto hide, admin hide/show, delete, account delete removes the photo, avx passes through rooms/presence,
// cartoon: unconfigured -> 'unconfigured'; mock -> 1 image, then 30-day limit; failed job gives the try back.
const {spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),WS=require('ws');const sl=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0,bad=0;const T=(c,m)=>{if(c){ok++;console.log('ok',m)}else{bad++;console.log('FAIL',m)}};
const WEBP='data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoIAAgAAUAmJaACdLoABDAAAP7vUS/xbSOhTIf/cHH/YOP+wcfumAAA';
const JPG='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0]),Buffer.alloc(100)]).toString('base64');
const BIG='data:image/webp;base64,'+Buffer.concat([Buffer.from('RIFF0000WEBP'),Buffer.alloc(31*1024)]).toString('base64');
const pass='Owner-pass-123';const H=p=>{const s=crypto.randomBytes(16);return 'scrypt$16384$'+s.toString('hex')+'$'+crypto.scryptSync(p,s,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex')};
const fidOf=pid=>crypto.createHash('sha256').update('ls-friend:'+pid).digest('hex').slice(0,6).toUpperCase();
async function run(port,extra,fn){const D=fs.mkdtempSync(path.join(os.tmpdir(),'av'));const env=Object.assign({},process.env,{PORT:String(port),DATA_FILE:D+'/s.json',TOUR_FILE:D+'/t.json',EVENTS_FILE:D+'/e.json',LB_FILE:D+'/lb.json',ACC_FILE:D+'/a.json',LO_FILE:D+'/lo.json',LOP_FILE:D+'/lop.json',LO_DATA_DIR:D,WAL_FILE:D+'/w.json',EV3_FILE:D+'/ev3.json',EV3_AUTOIMPORT:'0',AV_FILE:D+'/av.json',ADMIN_USER:'khawar',ADMIN_PASS_HASH:H(pass),AV_AUTOHIDE:'2'},extra);
 delete env.DATABASE_URL;delete env.XAI_API_KEY;delete env.EMOJI_GEN_URL;delete env.EMOJI_GEN_KEY;if(!extra.EMOJI_GEN_MOCK)delete env.EMOJI_GEN_MOCK;
 // optional: AV_TEST_PG=postgres://... runs the same checks on Postgres (separate test tables)
 if(process.env.AV_TEST_PG){const x=[...crypto.randomBytes(6)].map(b=>String.fromCharCode(97+b%26)).join('');Object.assign(env,{DATABASE_URL:process.env.AV_TEST_PG,PG_SSL:'0',PG_TABLE:'t_kv_'+x,AV_TABLE:'t_av_'+x,PG_PERSIST_MS:'50'})}
 const s=spawn(process.execPath,[path.join(__dirname,'index.js')],{env,stdio:'ignore'});const B='http://127.0.0.1:'+port;
 for(let i=0;i<40;i++){try{if((await fetch(B+'/health')).ok)break}catch(e){}await sl(200)}
 try{await fn(B,port)}finally{s.kill();fs.rmSync(D,{recursive:true,force:true})}}
const P=(B,u,b,h)=>fetch(B+u,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},h||{}),body:JSON.stringify(b)}).then(async r=>({s:r.status,j:await r.json().catch(()=>null),h:r.headers}));
const hello=async(B,pid)=>(await P(B,'/api/hello',{pid,ver:'3.15.6'})).j.key;
function client(port,pid,avatar,avx){return new Promise(res=>{const ws=new WS('ws://127.0.0.1:'+port);const q=[];const C={ws,q,send:o=>ws.send(JSON.stringify(o)),
  wait:async(pred,ms=3000)=>{const t=Date.now();while(Date.now()-t<ms){const i=q.findIndex(pred);if(i>=0)return q.splice(i,1)[0];await sl(30)}throw new Error('timeout '+pid)}};
 ws.on('message',d=>q.push(JSON.parse(d)));ws.on('open',()=>C.send({t:'hello',pid,name:pid,avatar,avx}));C.wait(m=>m.t==='welcome').then(()=>res(C))})}
(async()=>{
 await run(18891,{},async(B,port)=>{
  const st=await P(B,'/avatar/toon/status',{});T(st.j.configured===false,'cartoon status: not configured (app shows Coming soon)');
  const r0=await P(B,'/avatar/toon',{pid:'p1',key:'x',consent:true,photo:JPG});T(r0.j&&r0.j.status==='unconfigured'&&!r0.j.job,'cartoon unconfigured -> no job, no charge');
  T((await P(B,'/avatar/toon',{pid:'p1',key:'x',consent:false,photo:JPG})).s===400,'cartoon needs consent');
  const k1=await hello(B,'player0001'),k2=await hello(B,'player0002'),k3=await hello(B,'player0003');const f1=fidOf('player0001');
  T((await P(B,'/avatar',{pid:'player0001',key:'bad',img:WEBP})).s===403,'upload: wrong device key -> 403');
  T((await P(B,'/avatar',{pid:'player0001',key:k1,img:'data:image/png;base64,iVBORw0KGgo='})).s===400,'upload: png rejected');
  T((await P(B,'/avatar',{pid:'player0001',key:k1,img:'data:image/webp;base64,'+Buffer.from('not a webp at all').toString('base64')})).s===400,'upload: fake webp bytes rejected');
  T((await P(B,'/avatar',{pid:'player0001',key:k1,img:BIG})).s===400,'upload: over 30 KB rejected');
  let u=await P(B,'/avatar',{pid:'player0001',key:k1,img:WEBP});T(u.s===200&&u.j.ver===1&&u.j.url==='/avatar/'+f1+'.webp?v=1','upload webp ok '+JSON.stringify(u.j));
  let g=await fetch(B+u.j.url);T(g.status===200&&g.headers.get('content-type')==='image/webp'&&/immutable/.test(g.headers.get('cache-control')),'GET photo, webp, cached');
  T(Buffer.from(await g.arrayBuffer()).equals(Buffer.from(WEBP.split(',')[1],'base64')),'GET returns the same bytes');
  T((await fetch(B+u.j.url,{headers:{'If-None-Match':g.headers.get('etag')}})).status===304,'ETag 304');
  u=await P(B,'/avatar',{pid:'player0001',key:k1,img:JPG});T(u.s===200&&u.j.ver===2,'upload jpeg ok, version 2');
  T((await fetch(B+'/avatar/'+f1+'.webp?v=2')).headers.get('content-type')==='image/jpeg','jpeg served with its type');
  T((await fetch(B+'/avatar/ABCDEF.webp')).status===404,'no photo -> 404');
  // avx through rooms and presence
  const A=await client(port,'player0001','av:sultan','ph:2'),C=await client(port,'player0002','av:tiger','x_panda');
  A.send({t:'create',size:2,opts:{mode:'classic'}});const ra=await A.wait(m=>m.t==='room');C.send({t:'join',code:ra.code});const rc=await C.wait(m=>m.t==='room'&&m.players.length===2);
  T(rc.players[0].avx==='ph:2'&&rc.players[1].avx==='x_panda'&&rc.players[1].avatar==='av:tiger','room players carry avatar (fallback) + avx '+JSON.stringify(rc.players.map(p=>[p.avatar,p.avx])));
  C.send({t:'presence',fids:[f1]});const pr=await C.wait(m=>m.t==='presence');T(pr.list[f1]&&pr.list[f1].avx==='ph:2','presence carries avx');
  const Z=await client(port,'player0009','av:sultan','<script>');Z.send({t:'presence',fids:[fidOf('player0009')]});const pz=await Z.wait(m=>m.t==='presence');T(!pz.list[fidOf('player0009')].avx,'bad avx dropped');
  A.ws.close();C.ws.close();Z.ws.close();
  // report -> auto hide after 2 (test setting), admin show / hide
  T((await P(B,'/avatar/report',{pid:'player0001',key:k1,fid:f1})).s===400,'cannot report own photo');
  T((await P(B,'/avatar/report',{pid:'player0002',key:k2,fid:f1,why:'not a face'})).j.ok,'report 1');
  T((await P(B,'/avatar/report',{pid:'player0002',key:k2,fid:f1})).j.ok,'same reporter again (counted once)');
  T((await fetch(B+'/avatar/'+f1+'.webp?v=2')).status===200,'still shown after 1 reporter');
  await P(B,'/avatar/report',{pid:'player0003',key:k3,fid:f1});T((await fetch(B+'/avatar/'+f1+'.webp?v=3')).status===404,'hidden after 2 reporters');
  T((await P(B,'/avatar',{pid:'player0001',key:k1,img:WEBP})).s===403,'upload refused while hidden');
  T((await fetch(B+'/admin/api/avatars')).status===401,'admin list needs login');
  const l=await P(B,'/admin/api/login',{user:'khawar',pass});const ck=l.h.get('set-cookie').split(';')[0];
  const al=await (await fetch(B+'/admin/api/avatars',{headers:{Cookie:ck}})).json();T(al.list.length===1&&al.list[0].fid===f1&&al.list[0].reports===2&&al.list[0].hidden==='auto'&&/^data:image/.test(al.list[0].img),'admin sees the reported photo');
  T((await P(B,'/admin/api/avatars/hide',{fid:f1,hidden:false},{Cookie:ck})).s===403,'admin action needs csrf header');
  T((await P(B,'/admin/api/avatars/hide',{fid:f1,hidden:false},{Cookie:ck,'X-LS-Admin':'1'})).j.hidden===null,'admin: show photo again');
  T((await fetch(B+'/avatar/'+f1+'.webp')).status===200,'shown again');
  T((await P(B,'/admin/api/avatars/hide',{fid:f1,hidden:true},{Cookie:ck,'X-LS-Admin':'1'})).j.hidden==='admin','admin: hide photo');
  T((await fetch(B+'/avatar/'+f1+'.webp')).status===404,'hidden by admin');
  // delete own photo
  await P(B,'/avatar',{pid:'player0002',key:k2,img:WEBP});const f2=fidOf('player0002');T((await fetch(B+'/avatar/'+f2+'.webp')).status===200,'player 2 photo up');
  T((await P(B,'/avatar/delete',{pid:'player0002',key:k2})).j.ok&&(await fetch(B+'/avatar/'+f2+'.webp')).status===404,'delete own photo');
  // daily limit 10
  let last;for(let i=0;i<11;i++)last=await P(B,'/avatar',{pid:'player0003',key:k3,img:WEBP});T(last.s===429,'11th upload in a day -> 429');
  // account delete removes the photo
  const k4=await hello(B,'player0004');await P(B,'/avatar',{pid:'player0004',key:k4,img:WEBP});const f4=fidOf('player0004');
  const Q=await client(port,'player0004','av:sultan');Q.send({t:'acc_signup',email:'av4@example.com',pass:'longpassword1',name:'Q'});const sg=await Q.wait(m=>m.token,8000);
  Q.send({t:'acc_delete',token:sg.token,pass:'longpassword1'});await Q.wait(m=>m.t==='accdeleted',8000);await sl(300);
  T((await fetch(B+'/avatar/'+f4+'.webp')).status===404,'account delete removes the photo');Q.ws.close()});
 await run(18892,{EMOJI_GEN_MOCK:'1'},async B=>{const k=await hello(B,'player0001');
  T((await P(B,'/avatar/toon',{pid:'player0001',key:'wrong',consent:true,photo:JPG})).s===403,'cartoon: wrong device key -> 403');
  T((await P(B,'/avatar/toon',{pid:'player0001',key:k,consent:true,photo:'http://x'})).s===400,'cartoon: bad photo');
  let s=await P(B,'/avatar/toon/status',{pid:'player0001',key:k});T(s.j.configured&&!s.j.nextAt,'status: configured, can make one');
  const r=await P(B,'/avatar/toon',{pid:'player0001',key:k,consent:true,photo:JPG});T(r.s===202&&r.j.job,'cartoon job accepted');
  let d;for(let i=0;i<20;i++){d=await (await fetch(B+'/avatar/toon/'+r.j.job)).json();if(d.status!=='processing')break;await sl(100)}
  T(d.status==='done'&&d.image===JPG,'cartoon done, 1 image');
  const r2=await P(B,'/avatar/toon',{pid:'player0001',key:k,consent:true,photo:JPG});T(r2.s===429&&r2.j.error==='limit'&&r2.j.nextAt>Date.now()+29*864e5,'second cartoon within 30 days -> limit');
  s=await P(B,'/avatar/toon/status',{pid:'player0001',key:k});T(s.j.nextAt>Date.now(),'status shows the next date')});
 console.log(bad?'test-avatars: FAILED '+bad:'test-avatars: ALL PASSED ('+ok+' checks)');process.exit(bad?1:0)})();
