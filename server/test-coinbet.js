// 3.14.4 coin entry at friend challenges + private Ludo tables (caps.bet, bet table, balance check, old-client guard, betPay)
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),os=require('os'),fs=require('fs'),path=require('path');
const PORT=20080+Math.floor(Math.random()*800);
// run a temp copy of the repo so test data never touches server/data
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lscbr-'));require('child_process').execSync(`cp -r ${path.join(__dirname,'..')}/{server,logic.js,logic6.js,games.js,powers.js,mg,node_modules,package.json} ${root}/ 2>/dev/null || true`,{shell:'/bin/bash'});
const srv=spawn('node',[path.join(root,'server','index.js')],{env:{...process.env,PORT,DATABASE_URL:'',TURN_MS:300,BOT_MS:5,ANIM_MS:5,NOMOVE_MS:5,OFFLINE_MS:20},stdio:['ignore','ignore','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function client(name,caps){return new Promise(res=>{const ws=new WebSocket('ws://localhost:'+PORT);const c={ws,name,msgs:[],room:null};
 ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name})));
 ws.on('message',b=>{const m=JSON.parse(b);c.msgs.push(m);if(m.t==='room')c.room=m;
  if(m.t==='welcome'){c.pid=m.pid;c.fid=m.fid;if(caps)ws.send(JSON.stringify({t:'caps',bet:1}));setTimeout(()=>res(c),60)}});});}
const S=(c,m)=>c.ws.send(JSON.stringify(m));const last=(c,t)=>[...c.msgs].reverse().find(m=>m.t===t);
async function until(f,ms=8000){const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timeout');await wait(20)}}
let n=0,A_;const ok=(v,m)=>{n++;assert.ok(v,m);console.log('ok',m)};
(async()=>{await wait(800);try{
 // 1) private table with entry 1000
 const A=A_=await client('A',1),B=await client('B',1),O=await client('Old',0),P=await client('Poor',1);
 S(A,{t:'create',size:2,opts:{mode:'quick'},bet:1000,coins:5000});await until(()=>A.room);ok(A.room.bet===1000,'private table keeps the 1000 entry');
 S(O,{t:'join',code:A.room.code,coins:999999});await until(()=>last(O,'error'));ok(/update/i.test(last(O,'error').msg)&&!O.room,'old app cannot join a coin table');
 S(P,{t:'join',code:A.room.code,coins:200});await until(()=>last(P,'error'));ok(/coins/i.test(last(P,'error').msg)&&!P.room,'player without enough coins is refused');
 S(B,{t:'join',code:A.room.code,coins:1000});await until(()=>B.room&&B.room.started);S(A,{t:'away',on:true});S(B,{t:'away',on:true});ok(B.room.bet===1000&&B.room.code===A.room.code,'guest joins, sees entry, game starts');
 // 2) invalid bet / no caps / short balance => free table
 const C=await client('C',1);S(C,{t:'create',size:2,opts:{mode:'classic'},bet:1234,coins:1e6});await until(()=>C.room);ok(!C.room.bet,'bet outside the table is ignored');
 const D=await client('D',0);S(D,{t:'create',size:2,opts:{mode:'classic'},bet:1000,coins:1e6});await until(()=>D.room);ok(!D.room.bet,'client without caps gets a free table');
 const E=await client('E',1);S(E,{t:'create',size:2,opts:{mode:'classic'},bet:5000,coins:100});await until(()=>E.room);ok(!E.room.bet,'creator short of coins gets a free table');
 // 3) friend challenge with entry
 const F=await client('F',1),G=await client('G',1),H=await client('H',0);
 S(F,{t:'challenge',to:G.fid,mode:'classic',bet:2500,coins:3000});await until(()=>last(G,'challenge'));ok(last(G,'challenge').bet===2500,'friend sees the 2500 entry in the challenge');ok(F.room&&F.room.bet===2500,'challenger room has the entry');
 S(G,{t:'join',code:last(G,'challenge').code,coins:2500});await until(()=>G.room&&G.room.started);ok(G.room.bet===2500,'friend accepted, coin game started');
 S(F,{t:'challenge',to:H.fid,mode:'classic',bet:2500,coins:3000});await until(()=>last(H,'challenge')&&last(F,'toast'));ok(last(H,'challenge').bet===0&&last(F,'toast').code==='freebet','challenge to an old app becomes free and the challenger is told');
 // 4) payout from the server at the end of the private table game (both players away -> auto play)
 await until(()=>last(A,'betPay')&&last(B,'betPay'),150000);const bp=last(A,'betPay');
 ok(bp.bet===1000&&Object.values(bp.all).reduce((a,b)=>a+b,0)===2000&&last(A,'betPay').pay+last(B,'betPay').pay===2000,'server pays the 2000 pot to the winner '+JSON.stringify(bp.all));
 console.log('ALL COIN BET TESTS PASSED ('+n+')');srv.kill();process.exit(0)}catch(e){try{const cnt={};A_.msgs.forEach(m=>cnt[m.t]=(cnt[m.t]||0)+1);console.error('A msgs',JSON.stringify(cnt),JSON.stringify(last(A_,'state')&&last(A_,'state').g.tokens))}catch(x){}console.error('FAIL',e.message);srv.kill();process.exit(1)}})();
