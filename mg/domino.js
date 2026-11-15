// ===== Domino (double-six block game, 4 players, partnerships 0&2 vs 1&3) + Okey (106 tiles) =====
(function(M){
// ---------------- DOMINO ----------------
// 28 tiles, 7 each. The holder of [6|6] opens round 1 (afterwards the previous round's winner opens with any tile).
// No drawing: a player with no matching tile passes. Round ends when a hand is empty (that team scores the pips left in the
// two opponents' hands) or when everyone is blocked (team with fewer pips wins and scores the opponents' pips; a tie scores nothing).
// First team to the target (default 100) wins.
const dm={};
dm.tiles=function(){const t=[];for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)t.push([a,b]);return t};
function shuf(a,rnd){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const pips=h=>h.reduce((x,t)=>x+t[0]+t[1],0);
dm.new=function(o){o=o||{};const g={game:'domino',target:o.target||100,score:[0,0],round:0,log:[],rnd:o.rnd||Math.random,starter:-1};dm.deal(g);return g};
dm.deal=function(g){const d=shuf(dm.tiles(),g.rnd);g.round++;g.hands=[0,1,2,3].map(i=>d.slice(i*7,i*7+7));g.chain=[];g.ends=null;g.passes=0;g.phase='play';g.passedOn=[[],[],[],[]];
 if(g.starter<0){g.turn=g.hands.findIndex(h=>h.some(t=>t[0]===6&&t[1]===6));g.mustOpen66=true}else{g.turn=g.starter;g.mustOpen66=false}g.last=null;return g};
dm.moves=function(g,p){const h=g.hands[p],out=[];
 if(!g.chain.length){if(g.mustOpen66){const t=h.find(t=>t[0]===6&&t[1]===6);return t?[{tile:t,side:'R'}]:[]}h.forEach(t=>out.push({tile:t,side:'R'}));return out}
 const [L,Rr]=g.ends;h.forEach(t=>{if(t[0]===L||t[1]===L)out.push({tile:t,side:'L'});if(t[0]===Rr||t[1]===Rr){if(!(L===Rr&&(t[0]===L||t[1]===L)&&false))out.push({tile:t,side:'R'})}});return out};
dm.play=function(g,p,mv){if(g.phase!=='play'||g.turn!==p)throw new Error('not your turn');
 const legal=dm.moves(g,p);if(!legal.some(m=>m.tile===mv.tile&&m.side===mv.side))throw new Error('illegal tile');
 const h=g.hands[p];h.splice(h.indexOf(mv.tile),1);const t=mv.tile;let placed;
 if(!g.chain.length){placed={t:[t[0],t[1]],a:t[0],b:t[1],side:'R'};g.chain.push(placed);g.ends=[t[0],t[1]]}
 else if(mv.side==='L'){const e=g.ends[0];const a=t[0]===e?t[1]:t[0];placed={t:[t[0],t[1]],a,b:e,side:'L'};g.chain.unshift(placed);g.ends[0]=a}
 else{const e=g.ends[1];const b=t[0]===e?t[1]:t[0];placed={t:[t[0],t[1]],a:e,b,side:'R'};g.chain.push(placed);g.ends[1]=b}
 g.mustOpen66=false;g.passes=0;g.last={p,placed};const r={roundDone:false,gameDone:false,blocked:false};
 if(h.length===0){dm.finish(g,p%2,pips(g.hands[(p+1)%4])+pips(g.hands[(p+3)%4]),'out');r.roundDone=true;r.gameDone=g.phase==='over';return r}
 g.turn=(p+1)%4;return r};
dm.pass=function(g,p){if(g.turn!==p)throw new Error('not your turn');if(dm.moves(g,p).length)throw new Error('you have a tile');g.passedOn[p].push(g.ends[0],g.ends[1]);g.passes++;const r={roundDone:false,gameDone:false,blocked:false};
 if(g.passes>=4){const t0=pips(g.hands[0])+pips(g.hands[2]),t1=pips(g.hands[1])+pips(g.hands[3]);r.blocked=true;r.roundDone=true;
  if(t0===t1)dm.finish(g,-1,0,'block');else if(t0<t1)dm.finish(g,0,t1,'block');else dm.finish(g,1,t0,'block');r.gameDone=g.phase==='over';return r}
 g.turn=(p+1)%4;return r};
dm.finish=function(g,team,pts,how){if(team>=0)g.score[team]+=pts;g.log.push({team,pts,how,left:g.hands.map(pips)});g.starter=team>=0?(g.last&&g.last.p%2===team?g.last.p:team):(g.starter<0?0:g.starter);
 if(how==='out')g.starter=g.last.p;
 g.roundWinner=team;if(g.score[0]>=g.target||g.score[1]>=g.target){g.winner=g.score[0]>=g.score[1]?0:1;g.phase='over'}else g.phase='between'};
dm.next=function(g){if(g.phase==='between')dm.deal(g)};
dm.aiMove=function(g,p){const L=dm.moves(g,p);if(!L.length)return null;
 const h=g.hands[p];const cnt=v=>h.reduce((x,t)=>x+(t[0]===v)+(t[1]===v),0);const partnerPassed=g.passedOn[(p+2)%4],oppPassed=g.passedOn[(p+1)%4].concat(g.passedOn[(p+3)%4]);
 let best=null,bs=-1e9;
 for(const m of L){const t=m.tile;let s=t[0]+t[1]+(t[0]===t[1]?4:0);
  let newEnd;if(!g.chain.length)newEnd=null;else{const e=m.side==='L'?g.ends[0]:g.ends[1];newEnd=t[0]===e?t[1]:t[0]}
  if(newEnd!=null){s+=cnt(newEnd)*1.5;if(partnerPassed.includes(newEnd))s-=6;if(oppPassed.includes(newEnd))s+=5;}
  if(g.chain.length&&g.ends[0]===g.ends[1]&&false)s-=0;
  s+=Math.random()*.3;if(s>bs){bs=s;best=m}}
 return best};
dm.pips=pips;
M.domino=dm;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
