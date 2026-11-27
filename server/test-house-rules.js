// 3.17 House Rules online: private room carries the creator's rules to joiners, game state uses them, old apps can't join a rules room,
// per-room turn timer, re-roll off, free entry by default, links removed from match chat. node server/test-house-rules.js
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
const PORT=23080+Math.floor(Math.random()*800);const D=fs.mkdtempSync(path.join(os.tmpdir(),'lshr-'));
const env={...process.env,PORT,TURN_MS:300,BOT_MS:8,OFFLINE_MS:30,QUICK_MS:250,ANIM_MS:5,NOMOVE_MS:5,REROLL_WIN:5,
 DATA_FILE:D+'/s.json',TOUR_FILE:D+'/t.json',EVENTS_FILE:D+'/e.json',LB_FILE:D+'/l.json',LO_FILE:D+'/lo.json',LOP_FILE:D+'/lop.json',WAL_FILE:D+'/w.json',EV3_FILE:D+'/ev3.json'};
delete env.DATABASE_URL;
const srv=spawn('node',[path.join(__dirname,'index.js')],{env,stdio:['ignore','ignore','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function client(name,hr){return new Promise(res=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,room:null,seat:-1,state:null,errors:[],chat:[],rolled:[]};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name,diamonds:500})));
 ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='welcome'){c.pid=m.pid;ws.send(JSON.stringify({t:'caps',bet:1,...(hr?{hr:1}:{})}));setTimeout(()=>res(c),50)}
  if(m.t==='room'){c.room=m;c.seat=m.you}if(m.t==='state')c.state=m;if(m.t==='error')c.errors.push(m);if(m.t==='chat')c.chat.push(m.text);if(m.t==='rolled')c.rolled.push(m)})})}
async function until(f,ms=8000){const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timeout');await wait(20)}}
const tx=(c,m)=>c.ws.send(JSON.stringify(m));
(async()=>{await wait(900);
 const a=await client('Host',true),b=await client('Guest',true),old=await client('OldApp',false);
 tx(a,{t:'create',size:2,opts:{mode:'classic',rules:{unlock:'16',safePair:true,turnSec:20,reroll:false,bogus:1}}});
 await until(()=>a.room);const code=a.room.code;
 assert.deepStrictEqual(Object.keys(a.room.opts.rules).sort(),['capBonus','exact','homeBonus','mustCap','reroll','safePair','six','stars','startOut','three6','turnSec','unlock'].sort(),'normalised rules');
 assert.strictEqual(a.room.opts.rules.unlock,'16');assert.strictEqual(a.room.bet,0,'free room');
 tx(old,{t:'join',code});await until(()=>old.errors.length);assert.strictEqual(old.errors[0].code,'hr','old app refused');
 tx(b,{t:'join',code});await until(()=>b.state);
 assert.strictEqual(b.room.opts.rules.safePair,true,'joiner sees rules');assert.strictEqual(b.state.g.opts.rules.unlock,'16','game uses rules');
 assert.strictEqual(b.state.turnMs,20000,'turn timer 20 s');
 // re-roll offer stays closed with reroll off
 const me=b.state.g.turn===a.seat?a:b;tx(me,{t:'roll'});await until(()=>me.rolled.length);assert.strictEqual(me.rolled[0].canRe,false,'no re-roll');
 tx(a,{t:'chat',text:'join me at www.example.com or https://x.io/a now'});await until(()=>b.chat.length);
 assert.ok(!/example|x\.io|https/.test(b.chat[0]),'links removed: '+b.chat[0]);
 // default room (no rules) unchanged; old apps still join
 const c2=await client('H2',true),o2=await client('Old2',false);tx(c2,{t:'create',size:2,opts:{mode:'classic',rules:{six:true}}});await until(()=>c2.room);
 assert.ok(!c2.room.opts.rules,'all-default rules dropped');tx(o2,{t:'join',code:c2.room.code});await until(()=>o2.state);assert.strictEqual(o2.state.turnMs,300);
 console.log('test-house-rules (server): ALL PASSED');srv.kill();process.exit(0)})().catch(e=>{console.error('FAIL',e);srv.kill();process.exit(1)});
