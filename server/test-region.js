// 3.16: region-aware Quick Match. Same-region players share a room first; after REGION_WAIT a waiting room takes anyone.
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const PORT=22080+Math.floor(Math.random()*800);const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'lsreg-'));
const env={...process.env,PORT,QUICK_MS:60000,REGION_WAIT:1500,DATA_FILE:TMP+'/s.json',TOUR_FILE:TMP+'/t.json',LB_FILE:TMP+'/l.json',ACC_FILE:TMP+'/a.json'};delete env.DATABASE_URL;
const srv=spawn('node',[__dirname+'/index.js'],{env,stdio:['ignore','ignore','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function client(name){return new Promise(res=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,room:null};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name})));ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='welcome')res(c);if(m.t==='room')c.room=m})})}
async function until(f,ms=10000){const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timeout');await wait(20)}}
const q=(c,reg,size=4)=>c.ws.send(JSON.stringify({t:'quick',size,mode:'classic',reg}));
(async()=>{await wait(900);try{
 const A=await client('EU1'),B=await client('SA1'),C=await client('EU2'),D=await client('ME1'),E=await client('NoReg');
 q(A,'EU');await until(()=>A.room);q(B,'SA');await until(()=>B.room);
 assert.notStrictEqual(A.room.code,B.room.code,'different regions do not share a fresh room');console.log('ok fresh rooms stay in region');
 q(C,'EU');await until(()=>C.room);assert.strictEqual(C.room.code,A.room.code,'same region joins');console.log('ok same region shares a room');
 await wait(1700);q(D,'ME');await until(()=>D.room);assert.ok([A.room.code,B.room.code].includes(D.room.code),'after REGION_WAIT anyone may join');console.log('ok falls back to any region after wait');
 q(E,'');await until(()=>E.room);assert.ok([A.room.code,B.room.code].includes(E.room.code),'no region joins any room');console.log('ok no-region player joins any room');
 q(A,'xx<script>');console.log('REGION TESTS PASSED');process.exitCode=0}catch(e){console.error(e);process.exitCode=1}finally{srv.kill();setTimeout(()=>process.exit(),100)}})();
