// 3.16.1: explicit Leave vs disconnect in online Ludo. node server/test-leave.js
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const PORT=22080+Math.floor(Math.random()*800);const D=fs.mkdtempSync(path.join(os.tmpdir(),'lsleave-'));
const env={...process.env,PORT,TURN_MS:300,BOT_MS:8,OFFLINE_MS:30,QUICK_MS:250,ANIM_MS:5,NOMOVE_MS:5,REROLL_WIN:5,FORGET_MS:600000,
 DATA_FILE:D+'/s.json',TOUR_FILE:D+'/t.json',EVENTS_FILE:D+'/e.json',LB_FILE:D+'/l.json',LO_FILE:D+'/lo.json',LOP_FILE:D+'/lop.json',WAL_FILE:D+'/w.json',EV3_FILE:D+'/ev3.json'};
delete env.DATABASE_URL;
const srv=spawn('node',[path.join(__dirname,'index.js')],{env,stdio:['ignore','pipe','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=(fn,label,ms=20000)=>new Promise((ok,ko)=>{const t0=Date.now();const i=setInterval(()=>{let v=false;try{v=fn()}catch(e){}if(v){clearInterval(i);ok()}else if(Date.now()-t0>ms){clearInterval(i);ko(new Error('timeout '+label))}},10)});
function client(name,pid){return new Promise((res,rej)=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,pid:pid||('t-'+name+'-'+Math.random().toString(36).slice(2,8)),room:null,state:null,over:null,rolled:[],left:false};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name,pid:c.pid})));ws.on('error',rej);
 ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='welcome')res(c);if(m.t==='room')c.room=m;if(m.t==='state')c.state=m;if(m.t==='rolled')c.rolled.push(m);if(m.t==='over')c.over=m;if(m.t==='left')c.left=true})})}
const S=(c,o)=>c.ws.send(JSON.stringify(o));
async function match(n,bots){const A=await client('A'+n),B=await client('B'+n);S(A,{t:'create',size:n,opts:{mode:'classic'}});await until(()=>A.room&&A.room.code,'room');
 S(B,{t:'join',code:A.room.code});await until(()=>A.room.players.length===2,'join');for(let i=0;i<bots;i++){S(A,{t:'addbot'});await wait(50)}
 if(!A.room.started)S(A,{t:'start'});await until(()=>A.state&&B.state,'start');return [A,B]}
(async()=>{await new Promise(r=>srv.stdout.on('data',d=>{if(/server on/.test(d))r()}));const R=[];
 // 1. two humans: B leaves -> match ends at once, A ranks first, B last
 {const [A,B]=await match(2,0);await wait(300);const bi=B.room.you;S(B,{t:'leave'});await until(()=>B.left,'left ack');
  await until(()=>A.over,'over after leave',3000);assert.strictEqual(A.over.rank[0],A.room.you,'remaining human wins');assert.strictEqual(A.over.rank[A.over.rank.length-1],bi,'leaver last');
  assert.ok(A.room.players[bi].left&&/\(left\)/.test(A.room.players[bi].name),'leaver shown as left');R.push('2 humans: leave ends match, stayer wins');A.ws.close();B.ws.close()}
 // 2. two humans + a computer: B leaves -> game goes on, B never rolls again, B pawns back in base
 {const [A,B]=await match(3,1);await wait(200);const bi=B.room.you;S(B,{t:'leave'});await until(()=>B.left,'left ack');await wait(50);const n0=A.rolled.length;
  await until(()=>A.rolled.length>n0+12||A.over,'game continues',30000);assert.ok(!A.over||A.over.rank[A.over.rank.length-1]===bi,'leaver last if over');
  assert.ok(A.rolled.slice(n0+1).every(m=>m.pi!==bi),'leaver seat never rolls after leaving');assert.ok(A.state.g.tokens[bi].every(t=>t===-1),'leaver pawns in base');
  R.push('2 humans + computer: leaver skipped, game continues');A.ws.close();B.ws.close()}
 // 3. disconnect (app minimised / killed) is NOT a leave: seat stays, server auto-plays it, match keeps going
 {const [A,B]=await match(2,0);const bi=B.room.you;B.ws.close();await wait(100);const n0=A.rolled.length;await until(()=>A.rolled.slice(n0).some(m=>m.pi===bi)||A.over,'auto-play for disconnected',20000);
  assert.ok(!A.room.players[bi].left,'disconnect is not left');R.push('disconnect: seat auto-plays (unchanged)');A.ws.close()}
 // 4. leaver who reconnects (app relaunch) is not put back into the match
 {const [A,B]=await match(3,1);S(B,{t:'leave'});await until(()=>B.left,'ack');B.ws.close();await wait(100);const B2=await client('B4',B.pid);await wait(400);
  assert.ok(!B2.room&&!B2.state,'no room/state after relaunch');R.push('leaver relaunch: not resumed');A.ws.close();B2.ws.close()}
 console.log(R.map(x=>'  ✓ '+x).join('\n'));console.log('test-leave ok');srv.kill();process.exit(0)})().catch(e=>{console.error('FAIL',e);srv.kill();process.exit(1)});
