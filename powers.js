// ================= Ludo Sultan 3.7: Sultan Power Cards (pure logic, works on the 4P and 6P boards through an adapter) =================
(function(root){
const CARDS=['shield','double','teleport','jinn','wrath','freeze'];
const GRANT_TURNS=[3,9],MAX_CARDS=2;
// adapter A: {TL,LAST,FIN,abs(g,pi,p),safe(a),ally(g,a,b),canPlay(g,j),move(g,pi,ti,d)->res}
function init(g){const n=g.players.length;g.pw={hand:g.players.map(()=>[]),got:g.players.map(()=>0),turns:g.players.map(()=>0),frozen:{},dbl:{},usedTurn:-1,turnNo:0};g.shield=g.shield||{};return g.pw;}
function rnd(r){return CARDS[Math.floor((r||Math.random)()*CARDS.length)];}
function grant(g,pi,r){const w=g.pw;if(!w||w.got[pi]>=MAX_CARDS||w.hand[pi].length>=MAX_CARDS)return null;const c=rnd(r);w.hand[pi].push(c);w.got[pi]++;return c;}
// call once at the start of every turn of seat pi. returns {frozen, granted}
function turnStart(g,pi,r){const w=g.pw;if(!w)return {};w.turnNo++;if(w.frozen[pi]){delete w.frozen[pi];return {frozen:true};}w.turns[pi]++;let granted=null;if(GRANT_TURNS.includes(w.turns[pi]))granted=grant(g,pi,r);return {granted};}
function onCapture(g,pi,r){return grant(g,pi,r);}
const ring=(A,p)=>p>=0&&p<=A.LAST;
function enemyTokens(g,A,pi){const out=[];g.players.forEach((_,oj)=>{if(A.ally(g,pi,oj))return;g.tokens[oj].forEach((p,ok)=>{if(ring(A,p))out.push({oj,ok,p,a:A.abs(g,oj,p)});});});return out;}
function threat(g,A,pi,a){if(A.safe(a))return 0;let best=0;for(const e of enemyTokens(g,A,pi)){const d=(a-e.a+A.TL)%A.TL;if(d>0&&d<=6)best=Math.max(best,7-d);}return best;}
const shielded=(g,pi,ti)=>!!(g.shield&&g.shield[pi+':'+ti]);
// ---- targets (best choice per card), null if the card can't be used now ----
function target(g,A,pi,card){const me=g.tokens[pi];
 if(card==='double')return g.pw.dbl[pi]?null:{v:40};
 if(card==='shield'){let b=null;me.forEach((p,ti)=>{if(!ring(A,p)||shielded(g,pi,ti))return;const v=threat(g,A,pi,A.abs(g,pi,p))*12+p*0.2;if(!b||v>b.v)b={ti,v};});if(b&&b.v<12)b.v=Math.min(b.v,8);return b;}
 if(card==='teleport'){let b=null;me.forEach((p,ti)=>{if(p<0||p+3>A.FIN)return;const np=p+3;let v=np*0.1;if(np===A.FIN)v+=100;else if(np>A.LAST)v+=30;else{const a=A.abs(g,pi,np);if(!A.safe(a)&&enemyTokens(g,A,pi).some(e=>e.a===a&&!shielded(g,e.oj,e.ok)))v+=120;if(A.safe(a))v+=25;v-=threat(g,A,pi,a)*5;}
   if(ring(A,p))v+=threat(g,A,pi,A.abs(g,pi,p))*5;if(!b||v>b.v)b={ti,v};});return b;}
 if(card==='jinn'){let b=null;const es=enemyTokens(g,A,pi).filter(e=>!shielded(g,e.oj,e.ok));me.forEach((p,ti)=>{if(!ring(A,p))return;const a=A.abs(g,pi,p),s0=A.abs(g,pi,0);
   for(const e of es){const d=Math.min((a-e.a+A.TL)%A.TL,(e.a-a+A.TL)%A.TL);if(d<1||d>6)continue;const myNew=(e.a-s0+A.TL)%A.TL,opNew=(a-A.abs(g,e.oj,0)+A.TL)%A.TL;if(myNew>A.LAST||opNew>A.LAST)continue;
    const v=(myNew-p)*5+(e.p-opNew)*3;if(!b||v>b.v)b={ti,oj:e.oj,ok:e.ok,myNew,opNew,v};}});return b;}
 if(card==='wrath'){let b=null;const mine=me.map((p,ti)=>ring(A,p)?A.abs(g,pi,p):-1);for(const e of enemyTokens(g,A,pi)){if(shielded(g,e.oj,e.ok))continue;for(const a of mine){if(a<0)continue;const d=(a-e.a+A.TL)%A.TL;if(d>=1&&d<=4&&(!b||d<b.d))b={oj:e.oj,ok:e.ok,d,np:Math.max(0,e.p-4),v:60};}}return b;}
 if(card==='freeze'){const n=g.players.length;for(let k=1;k<n;k++){const j=(pi+k)%n;if(!A.ally(g,pi,j)&&A.canPlay(g,j)&&!g.pw.frozen[j])return {oj:j,v:35};}return null;}
 return null;}
function canUse(g,A,pi,idx){const w=g.pw;if(!w||w.usedTurn===w.turnNo)return false;const c=w.hand[pi][idx];return !!c&&!!target(g,A,pi,c);}
// apply card idx for seat pi -> effect description (teleport also returns the move result)
function use(g,A,pi,idx){if(!canUse(g,A,pi,idx))return null;const w=g.pw,card=w.hand[pi][idx],t=target(g,A,pi,card);w.hand[pi].splice(idx,1);w.usedTurn=w.turnNo;const ef={card,pi,t};
 if(card==='double')w.dbl[pi]=true;
 else if(card==='shield')g.shield[pi+':'+t.ti]=true;
 else if(card==='freeze')w.frozen[t.oj]=true;
 else if(card==='wrath'){ef.from=g.tokens[t.oj][t.ok];g.tokens[t.oj][t.ok]=t.np;}
 else if(card==='jinn'){ef.from=[g.tokens[pi][t.ti],g.tokens[t.oj][t.ok]];g.tokens[pi][t.ti]=t.myNew;g.tokens[t.oj][t.ok]=t.opNew;}
 else if(card==='teleport'){ef.from=g.tokens[pi][t.ti];ef.res=A.move(g,pi,t.ti,3);}
 return ef;}
function takeDouble(g,pi){if(g.pw&&g.pw.dbl[pi]){delete g.pw.dbl[pi];return true;}return false;}
// bots / AUTO: pick the most useful card (or -1)
function aiPick(g,A,pi,r){const w=g.pw;if(!w||w.usedTurn===w.turnNo)return -1;let bi=-1,bv=0;w.hand[pi].forEach((c,i)=>{const t=target(g,A,pi,c);if(!t)return;let v=t.v;if(c==='shield'&&v<12)v=0;if(c==='teleport'&&v<25)v=0;if(c==='jinn'&&v<15)v=0;if(v>bv){bv=v;bi=i;}});
 if(bi>=0&&(r||Math.random)()<0.75)return bi;return -1;}
function adapter4(L){return {TL:52,LAST:50,FIN:56,abs:(g,pi,p)=>L.trackIdx(g.players[pi],p),safe:a=>L.SAFE.has(a),ally:(g,a,b)=>L.ally(g,a,b),canPlay:(g,j)=>!g.rank.includes(j),
 move:(g,pi,ti,d)=>{g.queue=g.queue||[];g.queue.push(d);g.noKillRule=true;try{return L.useDie(g,pi,g.queue.length-1,ti);}finally{delete g.noKillRule}}};}
function adapter6(L6){return {TL:L6.TL,LAST:L6.LAST,FIN:L6.FIN,abs:L6.abs,safe:a=>L6.SAFE.has(a),ally:L6.ally,canPlay:L6.canPlay,
 move:(g,pi,ti,d)=>{g.queue.push(d);return L6.useDie(g,pi,{di:g.queue.length-1,pj:pi,ti});}};}
const PW={adapter4,adapter6,CARDS,GRANT_TURNS,MAX_CARDS,init,grant,turnStart,onCapture,target,canUse,use,takeDouble,aiPick,threat};
if(typeof module!=='undefined')module.exports=PW;else root.Power=PW;})(this);
