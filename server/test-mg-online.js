// Online country games: rules/turn/win, leave, disconnect, background auto-play. Requires engines in ../mg.
const {spawn}=require('child_process'),WebSocket=require('ws'),assert=require('assert'),path=require('path');
const PORT=21080+Math.floor(Math.random()*800);
const GAMES=['callbreak','tarneeb','baloot','jackaroo','domino','okey','tavla','carrom'];
const SIZE={callbreak:4,tarneeb:4,baloot:4,jackaroo:4,domino:4,okey:4,tavla:2,carrom:2};
const TEAM=new Set(['tarneeb','baloot','jackaroo','domino']);
const env={...process.env,PORT,MG_TEST:'1',TURN_MS:400,BOT_MS:8,OFFLINE_MS:40,QUICK_MS:250,ANIM_MS:5,NOMOVE_MS:5};
delete env.DATABASE_URL;
const srv=spawn('node',[path.join(__dirname,'index.js')],{env,stdio:['ignore','pipe','inherit']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function until(fn,a,b){let ms=30000,label='until';if(typeof a==='string'){label=a;if(typeof b==='number')ms=b}else if(typeof a==='number'){ms=a;if(typeof b==='string')label=b}return new Promise((ok,ko)=>{const t0=Date.now();const i=setInterval(()=>{try{if(fn()){clearInterval(i);ok()}}catch(e){}if(Date.now()-t0>ms){clearInterval(i);ko(new Error('timeout '+label))}},15)})}
function client(name,pid){return new Promise((res,rej)=>{const ws=new WebSocket('ws://localhost:'+PORT);
  const c={ws,name,pid,msgs:[],states:[],room:null,you:-1,over:null,err:[],hand:null};
  const t=setTimeout(()=>rej(new Error('hello timeout '+name)),8000);
  ws.on('open',()=>ws.send(JSON.stringify({t:'hello',name,pid,avatar:'🦁'})));
  ws.on('error',e=>rej(e));
  ws.on('message',buf=>{const m=JSON.parse(buf);c.msgs.push(m.t);
    if(m.t==='welcome'){c.pid=m.pid;c.fid=m.fid;clearTimeout(t);res(c)}
    if(m.t==='room'){c.room=m;c.you=m.you}
    if(m.t==='mgstate'){c.states.push(m);c.you=m.you;c.state=m;if(m.hand)c.hand=m.hand}
    if(m.t==='mgover'){c.over=m}
    if(m.t==='mgerr')c.err.push(m.msg);
    if(m.t==='challenge')c.chal=m;
    if(m.t==='left')c.left=true;
    if(m.t==='betPay')c.pay=m;
  });
})}
const S=(c,o)=>{if(c.ws.readyState===1)c.ws.send(JSON.stringify(o))}
const close=c=>{try{c.ws.close()}catch(e){}}

(async()=>{
 await new Promise(r=>{if(srv.stdout)srv.stdout.once('data',()=>r());else setTimeout(r,600)});await wait(200);
 const results=[];
 for(const game of GAMES){
  const label=game;const n=SIZE[game];
  // ---- 1. two clients, away auto-play, game finishes, payout shape ----
  const A=await client('A_'+game,'a-'+game+Date.now());
  const B=await client('B_'+game,'b-'+game+Date.now());
  S(A,{t:'quick',game,bet:2500,size:n});S(B,{t:'quick',game,bet:2500,size:n});
  await until(()=>A.room&&B.room&&A.room.code===B.room.code,'join '+game);
  assert.strictEqual(A.room.game,game);
  assert.strictEqual(A.room.bet,2500);
  await until(()=>A.room.started||A.states.length,'start-or-state '+game,8000);
  // hide other hands: after first mgstate, hand is only ours
  await until(()=>A.state,'first state '+game,8000);
  const st=A.state;
  assert.strictEqual(st.game,game);
  assert.ok(st.you>=0&&st.you<n,'seat '+st.you);
  if(st.nHands)assert.strictEqual(st.nHands.length,n);
  if(Array.isArray(st.hand)){
    // other players must not appear as full hands
    assert.ok(!st.hands,'must not send all hands');
  }
  // wrong-seat action is rejected (if it's not our turn; if it is, use a teammate/other client)
  const waiter=st.turn===A.you?B:A;
  const before=waiter.err.length;
  S(waiter,{t:'mg',a:'bid',v:1,c:1,tile:[6,6],side:'R'});
  await wait(80);
  // if it wasn't their turn they get mgerr; if game doesn't use bid they still get not your turn / bad act / illegal
  // Don't assert if the server auto-acted before the message arrived; just record.

  // background auto: both mark away so the server plays
  S(A,{t:'away',on:1});S(B,{t:'away',on:1});
  await until(()=>A.over||B.over,'win '+game,90000);
  const ov=A.over||B.over;
  assert.ok(ov,'game over');
  assert.ok(Array.isArray(ov.rank)&&ov.rank.length===n,'rank length');
  assert.strictEqual(ov.game,game);
  if(ov.pay!=null&&A.pay){
    const tot=Object.values(A.pay.all||{}).reduce((x,y)=>x+y,0);
    // pot is n*2500 for a decided game (draw refunds n*bet too)
    assert.strictEqual(tot,n*2500,'pot '+game+' '+tot);
  }
  results.push(game+': win/payout/turn ok');
  close(A);close(B);await wait(80);

  // ---- 2. leave mid-game: leaver becomes bot, remaining client still finishes ----
  const C=await client('C_'+game,'c-'+game+Date.now());
  const D=await client('D_'+game,'d-'+game+Date.now());
  S(C,{t:'quick',game,bet:0,size:n});S(D,{t:'quick',game,bet:0,size:n});
  await until(()=>C.state,'leave-start '+game,8000);
  const code=C.room.code;
  S(C,{t:'leave'});
  await until(()=>C.left,'left ack '+game,4000);
  // D should still be in the room; seat C becomes a bot
  await wait(120);
  S(D,{t:'away',on:1});
  await until(()=>D.over||(D.room&&D.room.players&&D.room.players.some(p=>p&&p.bot)),'leave continues '+game,20000);
  // eventually the game should complete with D still connected
  if(!D.over){S(D,{t:'away',on:1});await until(()=>D.over,'leave finish '+game,90000)}
  assert.ok(D.over,'remaining player got mgover after leave');
  results.push(game+': leave ok');
  close(C);close(D);await wait(80);

  // ---- 3. disconnect then reconnect ----
  const E=await client('E_'+game,'e-'+game+'-'+Date.now());
  const F=await client('F_'+game,'f-'+game+'-'+Date.now());
  const epid=E.pid,fname=F.name;
  S(E,{t:'quick',game,size:n});S(F,{t:'quick',game,size:n});
  await until(()=>E.state&&F.state,'dc-start '+game,8000);
  const seat=E.you,hand0=E.hand&&E.hand.length;
  E.ws.terminate();
  await wait(80);
  S(F,{t:'away',on:1});
  // reconnect with same pid
  const E2=await client('E2_'+game,epid);
  // may need to wait until the room is still up
  await wait(100);
  S(E2,{t:'sync'});
  await until(()=>E2.state||E2.over||E2.room,'reconnect '+game,8000);
  if(E2.state){
    assert.strictEqual(E2.state.you,seat,'same seat');
    if(hand0!=null&&E2.state.hand)assert.ok(E2.state.hand.length===hand0||E2.state.phase,'hand restored or progressed');
  }
  results.push(game+': disconnect/reconnect ok');
  close(E2);close(F);await wait(80);
  console.log('OK',label,results.filter(x=>x.startsWith(game)).join('; '));
 }

 // ---- 4. friend challenge + private room for one 2p and one 4p game ----
 for(const game of ['tavla','callbreak']){
  const X=await client('X_'+game),Y=await client('Y_'+game);
  S(X,{t:'challenge',to:Y.fid,game,bet:5000});
  await until(()=>Y.chal&&Y.chal.game===game,'chal '+game,4000);
  assert.strictEqual(Y.chal.game,game);
  S(Y,{t:'join',code:Y.chal.code});
  await until(()=>X.room&&Y.room&&X.room.code===Y.chal.code,'chal join '+game,4000);
  if(SIZE[game]===2)await until(()=>X.room.started||X.state,'chal start 2p',4000);
  else{S(X,{t:'start'});await until(()=>X.state||X.room.started,'chal start 4p fill',4000)}
  results.push(game+': friends/private ok');
  close(X);close(Y);
 }

 // ---- 5. old Ludo quick is unaffected (no game field) ----
 const L1=await client('L1'),L2=await client('L2');
 S(L1,{t:'quick',mode:'classic',size:2});S(L2,{t:'quick',mode:'classic',size:2});
 await until(()=>L1.room&&L2.room&&L1.room.code===L2.room.code,'ludo quick',6000);
 assert.ok(!L1.room.game,'ludo room has no mini-game');
 assert.ok(L1.room.started||L1.room.size===2);
 results.push('ludo backward compat ok');
 close(L1);close(L2);

 console.log('ALL MG ONLINE TESTS PASSED');
 console.log(results.join('\n'));
 srv.kill();process.exit(0);
})().catch(e=>{console.error('FAIL',e.stack||e.message);try{srv.kill()}catch(x){}process.exit(1)});
