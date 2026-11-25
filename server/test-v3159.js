// 3.15.9: a finished match result is delivered once; after the player got it, a reconnect (app force-stop + relaunch) does not replay it
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const PORT=21080+Math.floor(Math.random()*800),QMS=500;const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'ls3159-'));
const env={...process.env,PORT,TURN_MS:300,BOT_MS:5,OFFLINE_MS:20,QUICK_MS:QMS,ANIM_MS:5,NOMOVE_MS:5,DATA_FILE:TMP+'/s.json',TOUR_FILE:TMP+'/t.json',LB_FILE:TMP+'/l.json',ACC_FILE:TMP+'/a.json'};delete env.DATABASE_URL;
const srv=spawn('node',[__dirname+'/index.js'],{env,stdio:['ignore','ignore','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function client(name,pid,play){return new Promise(res=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,play,room:null,seat:-1,all:[],m:{}};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name,pid})));
 ws.on('message',b=>{const m=JSON.parse(b);c.all.push(m);c.m[m.t]=m;if(m.t==='welcome'){c.pid=m.pid;res(c)}if(m.t==='room'){c.room=m;c.seat=m.you}
  if(m.t==='state'&&c.play&&m.phase==='roll'&&m.g.turn===c.seat)ws.send(JSON.stringify({t:'roll'}));
  if(m.t==='rolled'&&c.play&&m.pi===c.seat&&m.moves.length){const o=m.moves[0];ws.send(JSON.stringify(Object.assign({t:'move'},o)))}})})}
async function until(f,ms=90000){const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timeout');await wait(20)}}
let n=0;const ok=(c,m)=>{n++;assert.ok(c,m)};
(async()=>{await wait(800);
 const A=await client('Once1',null,true);A.ws.send(JSON.stringify({t:'quick',size:2,mode:'quick'}));
 await until(()=>A.m.over,120000);const o=A.all.filter(m=>m.t==='over');ok(o.length===1,'one result');ok(typeof o[0].gid==='string'&&o[0].gid.length>3,'result carries a game id');
 const pid=A.pid;A.ws.close();await wait(300);
 const B=await client('Once1',pid,false);await wait(1500);ok(!B.all.some(m=>m.t==='over'),'no replayed result after reconnect');ok(!B.all.some(m=>m.t==='state'),'no replayed board after reconnect');
 B.ws.close();await wait(200);const C=await client('Once1',pid,false);await wait(1000);ok(!C.all.some(m=>m.t==='over'),'still none on the next launch');
 console.log('v3159 ok',n);C.ws.close();srv.kill();process.exit(0)})().catch(e=>{console.error('FAIL',e.message);srv.kill();process.exit(1)});
