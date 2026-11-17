// Run: node test-events.js  (uses a temp data dir, never touches real data)
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert'),http=require('http'),crypto=require('crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ev-'));process.env.EVENTS_FILE=path.join(dir,'e.json');
const pass='Test-pass-123';const salt=crypto.randomBytes(16);
process.env.ADMIN_USER='admin';process.env.ADMIN_PASS_HASH='scrypt$16384$'+salt.toString('hex')+'$'+crypto.scryptSync(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
const store=require('./store.js');
store.init({events:{file:process.env.EVENTS_FILE,def:{events:[],log:[],rewards:{},joins:{}}},liveops:{file:path.join(dir,'lo.json'),def:{},split:true},loplayers:{file:path.join(dir,'lop.json'),def:{}}}).then(async()=>{
 const ev=require('./events.js');const lo=require('./liveops.js');// 3.14: admin auth + CSRF live in liveops.js
 const srv=http.createServer((q,s)=>{const u=q.url.split('?')[0];if(!lo.handle(q,s,u)&&!ev.handle(q,s,u)){s.statusCode=404;s.end('nf')}}).listen(0);const port=srv.address().port;
 const rq=(m,p,b,ck)=>new Promise(r=>{const q=http.request({port,method:m,path:p,headers:Object.assign({'Content-Type':'application/json','X-LS-Admin':'1'},ck?{Cookie:ck}:{})},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>r({c:s.statusCode,h:s.headers,b:d}))});if(b)q.write(JSON.stringify(b));q.end()});
 assert.equal((await rq('GET','/admin/api/state')).c,401);
 assert.equal((await rq('POST','/admin/api/login',{user:'admin',pass:'bad'})).c,401);
 const l=await rq('POST','/admin/api/login',{user:'admin',pass});assert.equal(l.c,200);const ck=l.h['set-cookie'][0].split(';')[0];
 assert.equal((await rq('POST','/admin/api/login',{user:'x',pass})).c,401);
 const c=await rq('POST','/admin/api/event',{name:{en:'Ramadan Cup \u2013 test'},desc:{en:'Play'},fee:20,split:[50,30,20],start:Date.now()-1e3,end:Date.now()+864e5,rewards:[{type:'gems',n:100},{type:'pawn',id:'pd_lion'}],active:true},ck);assert.equal(c.c,200);
 const id=JSON.parse(c.b).id;assert(/^[a-z0-9]{2,12}$/.test(id));
 const bad=await rq('POST','/admin/api/event',{name:{}},ck);assert.equal(bad.c,400);
 let pub=JSON.parse((await rq('GET','/api/events')).b);assert.equal(pub.events.length,1);assert(!/[\u2013\u2014]/.test(pub.events[0].name.en));assert.equal(pub.events[0].pool,0);
 await rq('POST','/api/events/join',{id,pid:'p1'});await rq('POST','/api/events/join',{id,pid:'p2'});await rq('POST','/api/events/join',{id,pid:'p2'});
 pub=JSON.parse((await rq('GET','/api/events')).b);assert.equal(pub.events[0].pool,40);assert.equal(pub.events[0].players,2);
 const rw=await rq('POST','/admin/api/rewards',{welcomeGems:30},ck);assert.equal(JSON.parse(rw.b).rewards.welcomeGems,30);
 assert.equal((await rq('POST','/admin/api/event/delete',{id},ck)).c,200);
 assert.equal(JSON.parse((await rq('GET','/api/events')).b).events.length,0);
 assert.equal((await rq('GET','/admin')).c,200);
 console.log('events tests OK');srv.close();setTimeout(()=>process.exit(0),700)});
