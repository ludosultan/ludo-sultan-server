// Online country / mini-games: server-authoritative rooms, quick match, private rooms, friend invites.
// Backward compatible: only used when a client sends {game:'callbreak'|...}. Old Ludo clients are unchanged.
const path=require('path'),crypto=require('crypto');
const cards=require(path.join(__dirname,'..','mg','cards.js'));
const DM=require(path.join(__dirname,'..','mg','domino.js')).domino;
const OK=require(path.join(__dirname,'..','mg','okey.js')).okey;
const TV=require(path.join(__dirname,'..','mg','tavla.js')).tavla;
const JK=require(path.join(__dirname,'..','mg','jackaroo.js')).jackaroo;
const CR=require(path.join(__dirname,'..','mg','carrom.js')).carrom;
const CB=cards.callbreak,TN=cards.tarneeb,BL=cards.baloot;

const GAMES={
  callbreak:{size:4,team:false,title:'Callbreak'},
  tarneeb:{size:4,team:true,title:'Tarneeb'},
  baloot:{size:4,team:true,title:'Baloot'},
  jackaroo:{size:4,team:true,title:'Jackaroo'},
  domino:{size:4,team:true,title:'Domino'},
  okey:{size:4,team:false,title:'Okey'},
  tavla:{size:2,team:false,title:'Tavla'},
  carrom:{size:2,team:false,title:'Carrom'}
};
const is=g=>!!GAMES[g];
const size=g=>GAMES[g]?GAMES[g].size:0;
const team=g=>!!(GAMES[g]&&GAMES[g].team);
const rnd=()=>crypto.randomBytes(4).readUInt32BE(0)/2**32;
const short=()=>!!process.env.MG_TEST;

let api={};
function bind(a){api=a;return module.exports}

function newGame(name){
  const o={rnd};if(short()){
    if(name==='callbreak')o.rounds=1;
    if(name==='tarneeb')o.target=7;
    if(name==='baloot')o.target=20;
    if(name==='domino')o.target=10;
  }
  if(name==='callbreak')return CB.new(o);
  if(name==='tarneeb')return TN.new(o);
  if(name==='baloot')return BL.new(o);
  if(name==='domino')return DM.new(o);
  if(name==='okey')return OK.new(o);
  if(name==='tavla')return TV.new(o);
  if(name==='jackaroo')return JK.new(o);
  if(name==='carrom')return CR.new(o);
  throw new Error('unknown game');
}

function hideHands(hands,you){return hands.map((h,i)=>i===you?h:(Array.isArray(h)?h.length:0))}
function cardEq(a,b){if(a==null||b==null)return false;if(typeof a==='number')return a===b;if(Array.isArray(a))return a[0]===b[0]&&a[1]===b[1];if(a.id!=null&&b.id!=null)return a.id===b.id;return a.s===b.s&&a.r===b.r}
function findIn(arr,x){return arr.findIndex(t=>cardEq(t,x))}

function view(r,you){
  const g=r.g,name=r.mg,pub={t:'mgstate',game:name,code:r.code,you,phase:g.phase,turn:g.turn,started:!!r.started,deadline:r.deadline||0,left:Math.max(0,(r.deadline||0)-Date.now()),bet:r.bet||0,
    players:r.seats.map((s,i)=>({i,name:s.name,avatar:s.avatar,avx:(s.pid&&api.clients.get(s.pid)&&api.clients.get(s.pid).avx)||s.avx||undefined,bot:!!s.bot&&!s.fill,fill:!!s.fill,online:s.bot||!!(s.pid&&api.clients.get(s.pid)&&api.clients.get(s.pid).ws&&api.clients.get(s.pid).ws.readyState===1),fid:s.pid?api.fidOf(s.pid):null}))};
  if(name==='callbreak')Object.assign(pub,{round:g.round,rounds:g.rounds,scores:g.scores,bids:g.bids,tricks:g.tricks,trick:g.trick,last:g.last,leader:g.leader,dealer:g.dealer,hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),legal:g.phase==='play'&&g.turn===you?CB.legal(g,you):[]});
  else if(name==='tarneeb')Object.assign(pub,{round:g.round,score:g.score,target:g.target,high:g.high,bidder:g.bidder,trump:g.trump,tricks:g.tricks,trick:g.trick,last:g.last,leader:g.leader,dealer:g.dealer,bidLog:g.bidLog,canPass:g.phase==='bid'?TN.canPass(g,you):false,hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),legal:g.phase==='play'&&g.turn===you?TN.legal(g,you):[],winner:g.winner});
  else if(name==='baloot')Object.assign(pub,{round:g.round,score:g.score,target:g.target,mode:g.mode,trump:g.trump,buyer:g.buyer,bidRound:g.bidRound,open:g.open,pts:g.pts,tricks:g.tricks,trick:g.trick,last:g.last,leader:g.leader,dealer:g.dealer,baloot:g.baloot,hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),legal:g.phase==='play'&&g.turn===you?BL.legal(g,you):[],winner:g.winner});
  else if(name==='domino')Object.assign(pub,{round:g.round,score:g.score,target:g.target,chain:g.chain,ends:g.ends,mustOpen66:!!g.mustOpen66,hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),moves:g.phase==='play'&&g.turn===you?DM.moves(g,you):[],winner:g.winner,roundWinner:g.roundWinner,last:g.last});
  else if(name==='okey')Object.assign(pub,{round:g.round,score:g.score,indicator:g.indicator,okey:g.okey,drew:g.drew&&g.turn===you,lastDrawn:g.drew&&g.turn===you?g.lastDrawn:null,stock:g.stock.length,discards:g.discards.map((d,i)=>d.length?d[d.length-1]:null),nDiscards:g.discards.map(d=>d.length),hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),winner:g.winner,canWin:g.drew&&g.turn===you?OK.winningDiscards(g,g.hands[you]).map(t=>t.id):[]});
  else if(name==='tavla')Object.assign(pub,{pts:g.pts,bar:g.bar,off:g.off,dice:g.dice,left:g.left,done:g.done,phase:g.phase,turn:g.turn,winner:g.winner,value:g.value,noMove:!!g.noMove,steps:g.phase==='move'&&g.turn===you?TV.nextSteps(g):[]});
  else if(name==='jackaroo')Object.assign(pub,{m:g.m,hand:g.hands[you]||[],nHands:g.hands.map(h=>h.length),legal:g.phase==='play'&&g.turn===you?JK.legal(g,you).map(mv=>({card:mv.card,steps:mv.steps})):[] ,winner:g.winner,controlled:JK.controlled(g,you)});
  else if(name==='carrom')Object.assign(pub,{coins:g.coins,striker:g.striker,queen:g.queen,pocketed:g.pocketed,score:g.score,winner:g.winner,phase:g.phase,turn:g.turn,shot:r.lastShot||null,events:r.lastEvents||[]});
  return pub;
}

function seatOfClient(r,c){return r.seats.findIndex(s=>s.pid&&api.clients.get(s.pid)===c)}
function sendTo(r,c,i){if(!c||!c.ws)return;if(i==null)i=seatOfClient(r,c);if(i<0)return;api.send(c.ws,view(r,i))}
function sendAll(r){r.seats.forEach((s,i)=>{const c=s.pid&&api.clients.get(s.pid);if(c&&c.room===r.code)sendTo(r,c,i)})}

function standings(r){
  const g=r.g,name=r.mg,n=r.size;
  if(!g)return [...Array(n).keys()];
  if(name==='callbreak')return [...Array(4).keys()].sort((a,b)=>g.scores[b]-g.scores[a]||a-b);
  if(name==='okey'){if(g.winner>=0)return [g.winner,...[0,1,2,3].filter(i=>i!==g.winner)];return [0,1,2,3]}
  if(name==='tavla'||name==='carrom'){const w=g.winner>=0?g.winner:0;return [w,1-w]}
  // team games: winning team first, then the other
  let wt=0;
  if(name==='tarneeb'||name==='baloot'||name==='domino'||name==='jackaroo')wt=g.winner|0;
  const a=[...Array(n).keys()].filter(i=>i%2===wt),b=[...Array(n).keys()].filter(i=>i%2!==wt);
  return a.concat(b);
}

function payout(r){
  if(!r.bet)return;
  const order=standings(r),n=r.size,bet=r.bet,pay={};
  order.forEach(pi=>pay[pi]=0);
  const draw=(r.mg==='okey'&&r.g&&r.g.winner<0)||(r.mg==='domino'&&r.g&&r.g.winner==null&&r.g.phase==='over');
  if(draw){order.forEach(pi=>pay[pi]=bet)}
  else if(team(r.mg)){const wt=order[0]%2;const ws=order.filter(pi=>pi%2===wt);const each=Math.floor(bet*n/ws.length);ws.forEach(pi=>pay[pi]=each)}
  else{const W=api.W30||{2:[2],3:[2,1],4:[3,1],5:[3,2],6:[4,2]};(W[n]||[n]).forEach((w,k)=>{if(order[k]!=null)pay[order[k]]=bet*w})}
  r.seats.forEach((s,i)=>{if(s.pid&&api.clients.get(s.pid))api.send(api.clients.get(s.pid).ws,{t:'betPay',bet,pay:pay[i]|0,all:pay})});
  r.mgPay=pay;return pay;
}

function finish(r){
  r.phase='over';clearTimeout(r.timer);clearTimeout(r.nxt);
  const order=standings(r);r.overRank=order;let pay=null;
  try{pay=payout(r)}catch(e){console.error('mg betPay',e.message)}
  r.seats.forEach((s,i)=>{const c=s.pid&&api.clients.get(s.pid);if(c&&c.ws)api.send(c.ws,{t:'mgover',game:r.mg,you:i,rank:order,winner:r.g&&r.g.winner,pay:pay?pay[i]|0:0,all:pay,score:r.g&&(r.g.scores||r.g.score),value:r.g&&r.g.value})});
  try{api.sendRoom(r)}catch(e){}
}

function needAction(r){
  const g=r.g;if(!g||g.phase==='over'||g.phase==='wait')return false;
  if(g.phase==='between'||g.phase==='redeal')return false;
  return g.turn>=0;
}

function maybeNext(r){
  const g=r.g,name=r.mg;if(!g)return;
  if(g.phase==='over'){finish(r);return}
  if(g.phase==='between'||g.phase==='redeal'){
    clearTimeout(r.nxt);
    r.nxt=setTimeout(()=>{
      try{
        if(name==='callbreak')CB.next(g);
        else if(name==='tarneeb')TN.next(g);
        else if(name==='baloot')BL.next(g);
        else if(name==='domino')DM.next(g);
      }catch(e){console.error('mg next',e.message)}
      after(r);
    },short()?40:800);
    sendAll(r);
  }
}

function after(r){
  if(!r.started)return;
  r.phase=r.g?r.g.phase:'wait';
  if(r.g&&r.g.phase==='over'){finish(r);return}
  if(r.g&&(r.g.phase==='between'||r.g.phase==='redeal')){maybeNext(r);return}
  r.deadline=Date.now()+(api.TURN_MS||10000);
  sendAll(r);schedule(r);
}

function startGame(r){
  clearTimeout(r.qt);r.fillAt=null;r.size=r.seats.length||size(r.mg);r.started=true;
  r.g=newGame(r.mg);r.phase=r.g.phase;r.lastShot=null;r.lastEvents=null;
  try{api.social&&api.social.onGameStart&&api.social.onGameStart(r)}catch(e){}
  try{api.sendRoom(r)}catch(e){}
  after(r);
}

function isAuto(r,i){return api.isAuto(r,i)}

function schedule(r,extra=0){
  if(!r.started||!r.g||r.g.phase==='over'||r.phase==='over')return;
  if(r.g.phase==='between'||r.g.phase==='redeal')return;
  clearTimeout(r.timer);
  const i=r.g.turn;if(i==null||i<0)return;
  const a=isAuto(r,i);
  const ms=a?a+extra:Math.max(0,(r.deadline||Date.now())-Date.now())+extra;
  r.timer=setTimeout(()=>{try{autoAct(r)}catch(e){console.error('mg auto',e.stack||e.message)}},ms);
}

function autoAct(r){
  if(!r.started||!r.g||r.g.phase==='over')return;
  const p=r.g.turn,g=r.g,name=r.mg;
  if(p==null||p<0)return;
  try{aiPlay(name,g,p,r)}catch(e){console.error('mg ai',name,e.stack||e.message)}
  after(r);
}

function aiPlay(name,g,p,r){
  if(name==='callbreak'){
    if(g.phase==='bid')CB.bid(g,p,CB.aiBid(g.hands[p]));
    else if(g.phase==='play')CB.play(g,p,CB.aiPlay(g,p));
  }else if(name==='tarneeb'){
    if(g.phase==='bid')TN.bid(g,p,TN.aiBid(g,p));
    else if(g.phase==='trump'&&g.bidder===p)TN.chooseTrump(g,TN.aiTrump(g,p));
    else if(g.phase==='play')TN.play(g,p,TN.aiPlay(g,p));
  }else if(name==='baloot'){
    if(g.phase==='bid'){const a=BL.aiBid(g,p);BL.bid(g,p,a[0],a[1])}
    else if(g.phase==='play')BL.play(g,p,BL.aiPlay(g,p));
  }else if(name==='domino'){
    const mv=DM.aiMove(g,p);if(mv)DM.play(g,p,mv);else DM.pass(g,p);
  }else if(name==='okey'){
    if(!g.drew)OK.draw(g,p,OK.aiDraw(g,p));
    if(g.phase==='play'&&g.drew&&g.turn===p)OK.discard(g,p,OK.aiDiscard(g,p));
  }else if(name==='tavla'){
    if(g.phase==='roll')TV.roll(g);
    if(g.phase==='move'&&g.turn===p){const seq=TV.aiSequence(g)||[];for(const m of seq){if(g.phase!=='move')break;TV.move(g,m)}}
  }else if(name==='jackaroo'){
    const mv=JK.aiMove(g,p);if(mv)JK.play(g,p,mv);else{const c=JK.aiDiscard(g,p);if(c)JK.discard(g,p,c)}
  }else if(name==='carrom'){
    if(g.phase!=='aim')return;
    const sh=CR.aiShot(g,1);CR.placeStriker(g,sh.x);CR.shoot(g,sh.ang,sh.pow);CR.simulate(g);
    const ev=CR.resolve(g);r.lastShot=sh;r.lastEvents=(ev&&ev.events)||[];
    if(ev&&ev.again&&g.phase==='aim'&&g.turn===p&&g.phase!=='over'){/* one extra AI shot if they keep the turn, but after() will schedule */}
  }
}

function act(r,pi,m){
  const g=r.g,name=r.mg,a=m.a||m.act;
  if(!g||g.phase==='over')throw new Error('game over');
  if(g.turn!==pi&&a!=='sync')throw new Error('not your turn');
  if(name==='callbreak'){
    if(a==='bid')CB.bid(g,pi,m.v);else if(a==='play')CB.play(g,pi,m.c);else throw new Error('bad act');
  }else if(name==='tarneeb'){
    if(a==='bid')TN.bid(g,pi,m.v);else if(a==='trump')TN.chooseTrump(g,m.v);else if(a==='play')TN.play(g,pi,m.c);else throw new Error('bad act');
  }else if(name==='baloot'){
    if(a==='bid')BL.bid(g,pi,m.v,m.suit);else if(a==='play')BL.play(g,pi,m.c);else throw new Error('bad act');
  }else if(name==='domino'){
    if(a==='pass')DM.pass(g,pi);else if(a==='play'){const mv={tile:m.tile,side:m.side};const legal=DM.moves(g,pi).find(x=>cardEq(x.tile,mv.tile)&&x.side===mv.side);if(!legal)throw new Error('illegal tile');DM.play(g,pi,legal)}else throw new Error('bad act');
  }else if(name==='okey'){
    if(a==='draw')OK.draw(g,pi,m.from==='discard'?'discard':'stock');
    else if(a==='discard'){const i=findIn(g.hands[pi],m.tile);if(i<0)throw new Error('no such tile');OK.discard(g,pi,g.hands[pi][i])}
    else throw new Error('bad act');
  }else if(name==='tavla'){
    if(a==='roll')TV.roll(g);else if(a==='move')TV.move(g,m.m);else throw new Error('bad act');
  }else if(name==='jackaroo'){
    if(a==='play'){const i=findIn(g.hands[pi],m.card);if(i<0)throw new Error('card not in hand');JK.play(g,pi,{card:g.hands[pi][i],steps:m.steps})}
    else if(a==='discard'){const i=findIn(g.hands[pi],m.card);if(i<0)throw new Error('card not in hand');JK.discard(g,pi,g.hands[pi][i])}
    else throw new Error('bad act');
  }else if(name==='carrom'){
    if(a==='place'){if(!CR.placeStriker(g,m.x))throw new Error('bad place')}
    else if(a==='shoot'){if(m.x!=null)CR.placeStriker(g,m.x);const sx=g.striker.x;CR.shoot(g,+m.ang,+m.pow);CR.simulate(g);const ev=CR.resolve(g);r.lastShot={x:sx,ang:+m.ang,pow:+m.pow};r.lastEvents=(ev&&ev.events)||[]}
    else throw new Error('bad act');
  }else throw new Error('unknown game');
}

function handle(m,pid,c,ws,r){
  if(!r||!r.mg)return false;
  if(m.t==='mg'||m.t==='mgact'){
    const pi=api.seatOf(r,pid);if(pi<0){api.send(ws,{t:'mgerr',msg:'not seated'});return true}
    if(!r.started){api.send(ws,{t:'mgerr',msg:'not started'});return true}
    try{act(r,pi,m);after(r)}catch(e){api.send(ws,{t:'mgerr',msg:String(e.message||e)});sendTo(r,c)}
    return true;
  }
  if(m.t==='sync'||m.t==='mgsync'){if(r.started)sendTo(r,c);if(r.phase==='over')resendOver(r,ws,api.seatOf(r,pid));return true}
  if(m.t==='roll'||m.t==='move'||m.t==='reroll')return true; // ignore Ludo verbs in a mini-game room
  return false;
}

function resendOver(r,ws,you){
  if(r.phase==='over'&&r.overRank)setTimeout(()=>api.send(ws,{t:'mgover',game:r.mg,you,rank:r.overRank,winner:r.g&&r.g.winner,pay:r.mgPay?r.mgPay[you]|0:0,all:r.mgPay,score:r.g&&(r.g.scores||r.g.score)}),40);
}

function onJoinStarted(r,c){sendTo(r,c);if(r.phase==='over')resendOver(r,c.ws,api.seatOf(r,c.pid))}

function roomPatch(info,r){if(r.mg){info.game=r.mg;info.mg=r.mg}return info}

module.exports={bind,is,size,team,GAMES,newGame,view,sendTo,sendAll,startGame,schedule,autoAct,act,handle,standings,payout,finish,onJoinStarted,resendOver,roomPatch,after};
