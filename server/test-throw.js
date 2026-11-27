// Aimed emoji throws: forward optional chat.to, validate seat, rate-limit. Old clients (no `to`) unchanged.
// node server/test-throw.js
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const PORT=22180+Math.floor(Math.random()*800);const D=fs.mkdtempSync(path.join(os.tmpdir(),'lsthrow-'));
const env={...process.env,PORT,TURN_MS:300,BOT_MS:8,OFFLINE_MS:30,QUICK_MS:250,ANIM_MS:5,NOMOVE_MS:5,REROLL_WIN:5,FORGET_MS:600000,
 THROW_COOL:80,THROW_WINDOW:400,THROW_MAX:3,
 DATA_FILE:D+'/s.json',TOUR_FILE:D+'/t.json',EVENTS_FILE:D+'/e.json',LB_FILE:D+'/l.json',LO_FILE:D+'/lo.json',LOP_FILE:D+'/lop.json',WAL_FILE:D+'/w.json',EV3_FILE:D+'/ev3.json'};
delete env.DATABASE_URL;
const srv=spawn('node',[path.join(__dirname,'index.js')],{env,stdio:['ignore','pipe','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=(fn,label,ms=20000)=>new Promise((ok,ko)=>{const t0=Date.now();const i=setInterval(()=>{let v=false;try{v=fn()}catch(e){}if(v){clearInterval(i);ok()}else if(Date.now()-t0>ms){clearInterval(i);ko(new Error('timeout '+label))}},8)});
function client(name){return new Promise((res,rej)=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,room:null,state:null,chats:[],toasts:[]};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name,pid:'t-'+name+'-'+Math.random().toString(36).slice(2,8)})));ws.on('error',rej);
 ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='welcome')res(c);if(m.t==='room')c.room=m;if(m.t==='state')c.state=m;if(m.t==='chat')c.chats.push(m);if(m.t==='toast')c.toasts.push(m)})})}
const S=(c,o)=>c.ws.send(JSON.stringify(o));
async function match(){const A=await client('A'),B=await client('B');S(A,{t:'create',size:2,opts:{mode:'classic'}});await until(()=>A.room&&A.room.code,'room');
 S(B,{t:'join',code:A.room.code});await until(()=>A.room.players.length===2,'join');if(!A.room.started)S(A,{t:'start'});await until(()=>A.state&&B.state,'start');return [A,B]}
(async()=>{await new Promise(r=>srv.stdout.on('data',d=>{if(/server on/.test(d))r()}));const R=[];
 const [A,B]=await match();const ai=A.room.you,bi=B.room.you;
 // 1. aimed throw: `to` is forwarded to the room, seats and text preserved
 A.chats=[];B.chats=[];S(A,{t:'chat',text:'🐔',to:bi});
 await until(()=>B.chats.some(m=>m.text==='🐔'&&m.to===bi)&&A.chats.some(m=>m.text==='🐔'&&m.to===bi),'aimed chat',4000);
 const hit=B.chats.find(m=>m.text==='🐔'&&m.to===bi);
 assert.strictEqual(hit.pi,ai,'sender seat');
 assert.strictEqual(hit.to,bi,'target seat forwarded');
 assert.ok(hit.fid,'fid present');
 R.push('aimed throw: to forwarded to the room');

 // 2. invalid `to` (own seat, out of range, junk): treated as plain chat, no `to` on the wire
 A.chats=[];B.chats=[];S(A,{t:'chat',text:'hello',to:ai});
 await until(()=>B.chats.some(m=>m.text==='hello'),'own-seat chat',4000);
 assert.ok(B.chats.filter(m=>m.text==='hello').every(m=>m.to==null),'own seat is not a throw');
 A.chats=[];B.chats=[];S(A,{t:'chat',text:'plain',to:99});
 await until(()=>B.chats.some(m=>m.text==='plain'),'oor chat',4000);
 assert.ok(B.chats.filter(m=>m.text==='plain').every(m=>m.to==null),'out-of-range to ignored');
 A.chats=[];B.chats=[];S(A,{t:'chat',text:'noto',to:'nope'});
 await until(()=>B.chats.some(m=>m.text==='noto'),'junk to',4000);
 assert.ok(B.chats.filter(m=>m.text==='noto').every(m=>m.to==null),'non-integer to ignored');
 R.push('invalid to: broadcast as plain chat (no to field)');

 // 3. old client: chat without `to` still works, and is not throw-rate-limited
 A.chats=[];B.chats=[];
 for(let i=0;i<5;i++)S(A,{t:'chat',text:'gg'+i});
 await until(()=>B.chats.filter(m=>/^gg/.test(m.text)).length===5,'five plain chats',4000);
 assert.ok(B.chats.filter(m=>/^gg/.test(m.text)).every(m=>m.to==null),'old chat has no to');
 R.push('old clients: chat without to unchanged, not throw-limited');

 // 4. cooldown: second aimed throw inside THROW_COOL is dropped (toast to sender only)
 await wait(THROW_WAIT());
 A.chats=[];B.chats=[];A.toasts=[];
 S(A,{t:'chat',text:'🐕',to:bi});
 await until(()=>B.chats.some(m=>m.text==='🐕'&&m.to===bi),'first dog',4000);
 S(A,{t:'chat',text:'🐈',to:bi});
 await wait(120);
 assert.ok(!B.chats.some(m=>m.text==='🐈'),'cooldown: second throw not broadcast');
 assert.ok(A.toasts.some(m=>/Wait a moment/.test(m.msg||'')),'cooldown: sender toast');
 R.push('cooldown: 2nd throw inside window dropped, toast to sender');

 // 5. max 3 throws per THROW_WINDOW (test env; production is 6 / 20s)
 await wait(500);
 A.chats=[];B.chats=[];A.toasts=[];
 const texts=['🦁','🐯','🦅','🐎'];
 for(const t of texts){S(A,{t:'chat',text:t,to:bi});await wait(100)}
 await wait(80);
 const got=B.chats.filter(m=>m.to===bi).map(m=>m.text);
 assert.deepStrictEqual(got,['🦁','🐯','🦅'],'window cap: first 3 land, 4th dropped');
 assert.ok(A.toasts.some(m=>/Wait a moment/.test(m.msg||'')),'window cap: toast on 4th');
 R.push('window cap: max 3 per test window (prod 6 / 20s)');

 // 6. paid pack keys still go through (ownership is client-side; server has no pack inventory)
 await wait(500);
 A.chats=[];B.chats=[];
 S(A,{t:'chat',text:'§s:royal:0',to:bi});
 await until(()=>B.chats.some(m=>m.text==='§s:royal:0'&&m.to===bi),'paid pack key',4000);
 R.push('paid pack text forwarded; ownership is client-side (no server pack inventory)');

 console.log(R.map(x=>'  ✓ '+x).join('\n'));
 console.log('test-throw ok');
 A.ws.close();B.ws.close();srv.kill();process.exit(0);
 function THROW_WAIT(){return 120}
})().catch(e=>{console.error('FAIL',e);srv.kill();process.exit(1)});
