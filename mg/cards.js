// ===== Mini games engine, part 1: trick-taking games: Callbreak, Tarneeb, Baloot (pure logic, no DOM) =====
// Card = suit*16+rank ; suit 0 spades,1 hearts,2 diamonds,3 clubs ; rank 2..14 (11 J,12 Q,13 K,14 A)
(function(M){
const S=c=>c>>4,R=c=>c&15,mk=(s,r)=>s*16+r;
const SUITS=['♠','♥','♦','♣'],RN={11:'J',12:'Q',13:'K',14:'A'};
const rname=r=>RN[r]||String(r);
const cardName=c=>rname(R(c))+SUITS[S(c)];
function deck(minRank){const d=[];for(let s=0;s<4;s++)for(let r=minRank||2;r<=14;r++)d.push(mk(s,r));return d}
function shuffle(a,rnd){rnd=rnd||Math.random;for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function sortHand(h,trump){return h.slice().sort((a,b)=>{const sa=S(a),sb=S(b);if(sa!==sb)return sa-sb;return R(b)-R(a)})}
const C={S,R,mk,SUITS,rname,cardName,deck,shuffle,sortHand};M.cards=C;

// ================= CALLBREAK =================
// 4 players, 52 cards, 13 each, spades always trump, 5 rounds. Bid 1-8 (tricks promised).
// Must follow suit and beat the highest card of the suit if able; if void must play a spade (and over-trump if able).
// Score: tricks>=bid -> bid + 0.1*(extra tricks) ; else -bid.  Scores are stored in tenths (integers).
const cb={};
cb.new=function(o){o=o||{};const g={game:'callbreak',rounds:o.rounds||5,round:0,dealer:o.dealer==null?3:o.dealer,scores:[0,0,0,0],log:[],rnd:o.rnd||Math.random};cb.deal(g);return g};
cb.deal=function(g){const d=shuffle(deck(),g.rnd);g.round++;g.hands=[0,1,2,3].map(i=>sortHand(d.slice(i*13,i*13+13)));g.bids=[null,null,null,null];g.tricks=[0,0,0,0];g.trick=[];g.phase='bid';g.dealer=(g.dealer+1)%4;g.turn=(g.dealer+1)%4;g.leader=g.turn;g.last=null;return g};
cb.aiBid=function(hand){let t=0;const bySuit=[[],[],[],[]];hand.forEach(c=>bySuit[S(c)].push(R(c)));
 const sp=bySuit[0];sp.forEach(r=>{if(r===14)t+=1;else if(r===13)t+=(sp.length>=2?.9:.4);else if(r===12)t+=(sp.length>=3?.7:.3);else if(r===11&&sp.length>=4)t+=.5});if(sp.length>3)t+=(sp.length-3)*.55;
 for(let s=1;s<4;s++){const a=bySuit[s];if(a.includes(14))t+=.85;if(a.includes(13)&&a.length>=2)t+=.5;if(a.length===0&&sp.length>=2)t+=.5;else if(a.length===1&&sp.length>=2)t+=.2}
 return Math.max(1,Math.min(8,Math.round(t)))};
cb.bid=function(g,p,bid){if(g.phase!=='bid'||g.turn!==p)throw new Error('not your bid');bid=Math.max(1,Math.min(8,bid|0));g.bids[p]=bid;g.turn=(p+1)%4;if(g.bids.every(b=>b!=null)){g.phase='play';g.turn=g.leader}return bid};
function curBest(g){// winning card so far in current trick
 if(!g.trick.length)return null;const L=S(g.trick[0].c);let best=g.trick[0];for(const t of g.trick){const a=S(t.c),b=S(best.c);if(a===0&&b!==0)best=t;else if(a===b&&R(t.c)>R(best.c))best=t}return best}
cb.legal=function(g,p){const h=g.hands[p];if(!g.trick.length)return h.slice();const L=S(g.trick[0].c),best=curBest(g);
 const same=h.filter(c=>S(c)===L);
 if(same.length){if(S(best.c)===0&&L!==0)return same;// trick already trumped: any card of the suit
  const hi=same.filter(c=>R(c)>R(best.c));return hi.length?hi:same}
 const sp=h.filter(c=>S(c)===0);
 if(sp.length){if(S(best.c)===0){const hi=sp.filter(c=>R(c)>R(best.c));return hi.length?hi:sp}return sp}
 return h.slice()};
cb.winnerOf=function(trick){let best=trick[0];for(const t of trick){const a=S(t.c),b=S(best.c);if(a===0&&b!==0)best=t;else if(a===b&&R(t.c)>R(best.c))best=t}return best.p};
cb.play=function(g,p,c){if(g.phase!=='play'||g.turn!==p)throw new Error('not your turn');if(!cb.legal(g,p).includes(c))throw new Error('illegal card');
 g.hands[p].splice(g.hands[p].indexOf(c),1);g.trick.push({p,c});const r={trickDone:false,winner:-1,roundDone:false,gameDone:false};
 if(g.trick.length===4){const w=cb.winnerOf(g.trick);g.tricks[w]++;g.last={trick:g.trick.slice(),winner:w};g.trick=[];g.leader=w;g.turn=w;r.trickDone=true;r.winner=w;
  if(g.hands[0].length===0){r.roundDone=true;const sc=cb.score(g);g.scores=g.scores.map((s,i)=>s+sc[i]);g.log.push({bids:g.bids.slice(),tricks:g.tricks.slice(),sc});g.phase=g.round>=g.rounds?'over':'between';if(g.phase==='over')r.gameDone=true}}
 else g.turn=(p+1)%4;return r};
cb.score=function(g){return g.bids.map((b,i)=>g.tricks[i]>=b?b*10+(g.tricks[i]-b):-b*10)};
cb.next=function(g){if(g.phase==='between')cb.deal(g)};
cb.aiPlay=function(g,p){const L=cb.legal(g,p);if(L.length===1)return L[0];const need=g.bids[p]-g.tricks[p];const asc=L.slice().sort((a,b)=>val(a)-val(b));
 function val(c){return (S(c)===0?100:0)+R(c)}
 if(!g.trick.length){// lead: high non-spade ace/king if we still need tricks, else lowest non-spade
  if(need>0){const aces=L.filter(c=>R(c)===14&&S(c)!==0);if(aces.length)return aces[0];const ks=L.filter(c=>R(c)===13&&S(c)!==0);if(ks.length)return ks[0]}
  const ns=asc.filter(c=>S(c)!==0);return ns.length?ns[0]:asc[0]}
 const best=curBest(g);const wins=L.filter(c=>cb.winnerOf(g.trick.concat([{p,c}]))===p);
 if(need>0&&wins.length){// win with the cheapest winning card (last player: cheapest, otherwise take it with a decent card)
  return wins.slice().sort((a,b)=>val(a)-val(b))[0]}
 const losers=L.filter(c=>!wins.includes(c));if(losers.length)return losers.slice().sort((a,b)=>val(a)-val(b))[0];
 return asc[0]};
M.callbreak=cb;

// ================= TARNEEB =================
// 4 players, 2 partnerships (0&2 vs 1&3). 13 cards each. Bid 7..13 (tricks), highest bidder names trump and leads.
// One round of bidding starting left of the dealer; if all pass the dealer must bid 7.
// Follow suit; trump wins, then highest of the led suit. Bidders making the contract score their tricks (13 -> 26), failing lose the bid (13 -> 26).
// Defenders score the tricks they take. First team to 31 wins (a team at -31 loses).
const tn={};
tn.new=function(o){o=o||{};const g={game:'tarneeb',target:o.target||31,dealer:o.dealer==null?3:o.dealer,score:[0,0],round:0,log:[],rnd:o.rnd||Math.random};tn.deal(g);return g};
tn.deal=function(g){const d=shuffle(deck(),g.rnd);g.round++;g.dealer=(g.dealer+1)%4;g.hands=[0,1,2,3].map(i=>sortHand(d.slice(i*13,i*13+13)));g.phase='bid';g.turn=(g.dealer+1)%4;g.bidLog=[];g.passed=[false,false,false,false];g.high=0;g.bidder=-1;g.trump=-1;g.tricks=[0,0,0,0];g.trick=[];g.leader=-1;g.last=null;return g};
tn.canPass=function(g,p){return !(g.bidder<0&&p===g.dealer)};
tn.bid=function(g,p,b){if(g.phase!=='bid'||g.turn!==p)throw new Error('not your bid');
 if(b>0){if(b<7||b>13||b<=g.high)throw new Error('bid too low');g.high=b;g.bidder=p;g.bidLog.push([p,b])}else{if(!tn.canPass(g,p))throw new Error('dealer must bid');g.passed[p]=true;g.bidLog.push([p,0])}
 // one round of bidding: ends after the dealer has spoken (or at the maximum bid 13)
 if(g.bidder>=0&&(p===g.dealer||b===13)){g.phase='trump';g.turn=g.bidder;return}
 let n=(p+1)%4;for(let k=0;k<4&&g.passed[n];k++)n=(n+1)%4;g.turn=n};
tn.chooseTrump=function(g,s){if(g.phase!=='trump')throw new Error('no');g.trump=s;g.phase='play';g.leader=g.bidder;g.turn=g.bidder};
tn.aiBid=function(g,p){const h=g.hands[p];let best=0,bs=0;for(let s=0;s<4;s++){const a=h.filter(c=>S(c)===s);let v=a.length*1.1+a.filter(c=>R(c)===14).length*1.2+a.filter(c=>R(c)===13).length*.7+a.filter(c=>R(c)===12).length*.3;if(v>best){best=v;bs=s}}
 let est=Math.floor(best*.9+h.filter(c=>S(c)!==bs&&R(c)===14).length*.6+h.filter(c=>S(c)!==bs&&R(c)===13).length*.2)+ (g.bidder>=0&&(g.bidder+2)%4===p?0:0);est=Math.min(13,est);
 const want=Math.max(0,est);if(want<7)return tn.canPass(g,p)?0:7;return want>g.high?want:(tn.canPass(g,p)?0:7)};
tn.aiTrump=function(g,p){const h=g.hands[p];let bs=0,bv=-1;for(let s=0;s<4;s++){const a=h.filter(c=>S(c)===s);const v=a.length*3+a.reduce((x,c)=>x+(R(c)>=11?R(c)-9:0),0);if(v>bv){bv=v;bs=s}}return bs};
tn.legal=function(g,p){const h=g.hands[p];if(!g.trick.length)return h.slice();const L=S(g.trick[0].c);const same=h.filter(c=>S(c)===L);return same.length?same:h.slice()};
tn.winnerOf=function(trick,trump){let best=trick[0];for(const t of trick){const a=S(t.c),b=S(best.c);if(a===trump&&b!==trump)best=t;else if(a===b&&R(t.c)>R(best.c))best=t}return best.p};
const team=p=>p%2;
tn.play=function(g,p,c){if(g.phase!=='play'||g.turn!==p)throw new Error('not your turn');if(!tn.legal(g,p).includes(c))throw new Error('illegal card');
 g.hands[p].splice(g.hands[p].indexOf(c),1);g.trick.push({p,c});const r={trickDone:false,winner:-1,roundDone:false,gameDone:false};
 if(g.trick.length===4){const w=tn.winnerOf(g.trick,g.trump);g.tricks[w]++;g.last={trick:g.trick.slice(),winner:w};g.trick=[];g.leader=w;g.turn=w;r.trickDone=true;r.winner=w;
  if(g.hands[0].length===0){r.roundDone=true;const t=[g.tricks[0]+g.tricks[2],g.tricks[1]+g.tricks[3]],bt=team(g.bidder);const made=t[bt]>=g.high;const sc=[0,0];
   sc[bt]=made?(g.high===13?26:t[bt]):-(g.high===13?26:g.high);sc[1-bt]=t[1-bt];g.score[0]+=sc[0];g.score[1]+=sc[1];
   g.log.push({bidder:g.bidder,bid:g.high,trump:g.trump,tricks:t,made,sc});
   let win=-1;if(g.score[bt]>=g.target)win=bt;else if(g.score[1-bt]>=g.target)win=1-bt;else if(g.score[bt]<=-g.target)win=1-bt;else if(g.score[1-bt]<=-g.target)win=bt;
   g.winner=win;g.phase=win>=0?'over':'between';r.gameDone=win>=0}}
 else g.turn=(p+1)%4;return r};
tn.next=function(g){if(g.phase==='between')tn.deal(g)};
tn.aiPlay=function(g,p){const L=tn.legal(g,p);if(L.length===1)return L[0];const val=c=>(S(c)===g.trump?100:0)+R(c);const asc=L.slice().sort((a,b)=>val(a)-val(b));
 if(!g.trick.length){const aces=L.filter(c=>R(c)===14&&S(c)!==g.trump);if(aces.length)return aces[0];if(team(p)===team(g.bidder)&&L.some(c=>S(c)===g.trump&&R(c)>=12)&&g.hands[p].filter(c=>S(c)===g.trump).length>=3)return asc[asc.length-1];return asc[0]}
 const cur=g.trick.slice();const wp=tn.winnerOf(cur,g.trump);const partnerWinning=team(wp)===team(p);
 const wins=L.filter(c=>tn.winnerOf(cur.concat([{p,c}]),g.trump)===p);
 if(partnerWinning&&g.trick.length>=2){const lose=asc.filter(c=>!wins.includes(c));return (lose.length?lose:asc)[0]}
 if(wins.length)return wins.slice().sort((a,b)=>val(a)-val(b))[0];return asc[0]};
M.tarneeb=tn;

// ================= BALOOT (Saudi, 32 cards 7..A, 8 each, partnerships 0&2 vs 1&3) =================
// Bidding: 5 cards each + one open card. Round 1 each player may say Hokm (trump = open card's suit), Sun (no trump) or Pass.
// Round 2: Hokm in any other suit, Sun or Pass. All pass twice -> redeal. Buyer takes the open card + 2 more, others 3.
// Hokm trump order J 9 A 10 K Q 8 7 (pts 20 14 11 10 4 3 0 0); plain/Sun order A 10 K Q J 9 8 7 (pts 11 10 4 3 2 0 0 0). Last trick +10.
// Hokm total 162, Sun 130. Buyer must score more than half or loses the round (opponents take all).
// Game points: Hokm = raw/10 rounded, Sun = raw/5 rounded (double). "Baloot": K+Q of trump played by one hand = +2 game points. Game to 152.
const bl={};
const BPT_PLAIN={14:11,10:10,13:4,12:3,11:2,9:0,8:0,7:0},BPT_TRUMP={11:20,9:14,14:11,10:10,13:4,12:3,8:0,7:0};
const BORD_PLAIN=[14,10,13,12,11,9,8,7],BORD_TRUMP=[11,9,14,10,13,12,8,7];
const bstr=(c,trump)=>{const o=(trump>=0&&S(c)===trump)?BORD_TRUMP:BORD_PLAIN;return 8-o.indexOf(R(c))};
const bpts=(c,trump)=>((trump>=0&&S(c)===trump)?BPT_TRUMP:BPT_PLAIN)[R(c)];
bl.pts=bpts;bl.str=bstr;
bl.new=function(o){o=o||{};const g={game:'baloot',target:o.target||152,dealer:o.dealer==null?3:o.dealer,score:[0,0],round:0,log:[],rnd:o.rnd||Math.random};bl.deal(g);return g};
bl.deal=function(g){const d=shuffle(deck(7),g.rnd);g.round++;g.dealer=(g.dealer+1)%4;g.hands=[0,1,2,3].map(i=>d.slice(i*5,i*5+5));g.open=d[20];g.rest=d.slice(21);g.phase='bid';g.bidRound=1;g.turn=(g.dealer+1)%4;g.bidCount=0;g.mode=null;g.trump=-1;g.buyer=-1;g.tricks=[0,0,0,0];g.pts=[0,0];g.trick=[];g.won=[[],[]];g.baloot=[0,0];g.last=null;g.leader=-1;return g};
// action: 'pass' | 'sun' | 'hokm' (with suit: round1 must equal open suit)
bl.bid=function(g,p,act,suit){if(g.phase!=='bid'||g.turn!==p)throw new Error('not your bid');
 if(act==='pass'){g.bidCount++;if(g.bidCount>=4){if(g.bidRound===1){g.bidRound=2;g.bidCount=0;g.turn=(g.dealer+1)%4}else{g.phase='redeal'}}else g.turn=(p+1)%4;return act}
 if(act==='hokm'){if(g.bidRound===1)suit=S(g.open);else if(suit==null||suit===S(g.open))throw new Error('pick another suit');g.mode='hokm';g.trump=suit}
 else if(act==='sun'){g.mode='sun';g.trump=-1}else throw new Error('bad bid');
 g.buyer=p;
 // distribute: buyer gets open + 2, others 3
 const rest=g.rest.slice();g.hands[p].push(g.open);g.hands[p].push(rest.shift(),rest.shift());for(let k=1;k<4;k++){const q=(p+k)%4;g.hands[q].push(rest.shift(),rest.shift(),rest.shift())}
 for(let i=0;i<4;i++)g.hands[i]=sortHand(g.hands[i]);
 g.phase='play';g.leader=(g.dealer+1)%4;g.turn=g.leader;return act};
bl.aiBid=function(g,p){const h=g.hands[p];const tr=s=>{const a=h.concat(g.bidRound===1&&s===S(g.open)?[g.open]:[]).filter(c=>S(c)===s);let v=0;a.forEach(c=>{v+=bpts(c,s)});return v+(a.length>=4?8:0)};
 let bestS=-1,bv=0;for(let s=0;s<4;s++){if(g.bidRound===1&&s!==S(g.open))continue;if(g.bidRound===2&&s===S(g.open))continue;const v=tr(s);if(v>bv){bv=v;bestS=s}}
 const sunV=h.reduce((x,c)=>x+(R(c)===14?11:R(c)===10?6:R(c)===13?3:0),0);
 if(sunV>=26)return ['sun'];if(bv>=(g.bidRound===1?27:30)&&bestS>=0)return ['hokm',bestS];return ['pass']};
bl.legal=function(g,p){const h=g.hands[p];if(!g.trick.length)return h.slice();const L=S(g.trick[0].c);const same=h.filter(c=>S(c)===L);const T=g.trump;
 if(g.mode==='hokm'){const curW=bl.winnerOf(g.trick,g);const partnerWin=curW%2===p%2;
  if(same.length){if(L===T){const best=g.trick.filter(t=>S(t.c)===T).reduce((a,t)=>bstr(t.c,T)>a?bstr(t.c,T):a,0);const hi=same.filter(c=>bstr(c,T)>best);return hi.length?hi:same}return same}
  const tr=h.filter(c=>S(c)===T);if(tr.length&&!partnerWin){const best=g.trick.filter(t=>S(t.c)===T).reduce((a,t)=>bstr(t.c,T)>a?bstr(t.c,T):a,0);const hi=tr.filter(c=>bstr(c,T)>best);return hi.length?hi:tr}
  return h.slice()}
 return same.length?same:h.slice()};
bl.winnerOf=function(trick,g){const T=g.mode==='hokm'?g.trump:-1;let best=trick[0];for(const t of trick){const a=S(t.c),b=S(best.c);if(T>=0&&a===T&&b!==T)best=t;else if(a===b&&bstr(t.c,T)>bstr(best.c,T))best=t}return best.p};
bl.play=function(g,p,c){if(g.phase!=='play'||g.turn!==p)throw new Error('not your turn');if(!bl.legal(g,p).includes(c))throw new Error('illegal card');
 const hadK=g.hands[p].some(x=>S(x)===g.trump&&R(x)===13),hadQ=g.hands[p].some(x=>S(x)===g.trump&&R(x)===12);
 g.hands[p].splice(g.hands[p].indexOf(c),1);g.trick.push({p,c});const r={trickDone:false,winner:-1,roundDone:false,gameDone:false,baloot:false};
 if(g.mode==='hokm'&&S(c)===g.trump&&(R(c)===13||R(c)===12)){g._bk=g._bk||{};const key=p;const had=g._bk[key]=g._bk[key]||{};had[R(c)]=1;if(had[13]&&had[12]&&!had.done){had.done=1;g.baloot[p%2]+=2;r.baloot=true}}
 if(g.trick.length===4){const w=bl.winnerOf(g.trick,g);const T=g.mode==='hokm'?g.trump:-1;const pts=g.trick.reduce((a,t)=>a+bpts(t.c,T),0);g.pts[w%2]+=pts;g.tricks[w]++;g.last={trick:g.trick.slice(),winner:w,pts};g.trick=[];g.leader=w;g.turn=w;r.trickDone=true;r.winner=w;
  if(g.hands[0].length===0){g.pts[w%2]+=10;r.roundDone=true;bl.finishRound(g);r.gameDone=g.phase==='over'}}
 else g.turn=(p+1)%4;return r};
bl.finishRound=function(g){const sun=g.mode==='sun',total=sun?130:162,bt=g.buyer%2;let raw=[g.pts[0],g.pts[1]];
 const made=raw[bt]>total/2;if(!made){raw[bt]=0;raw[1-bt]=total}
 const gp=raw.map(v=>sun?Math.round(v/5):Math.round(v/10));// sun counts double of hokm per 10
 if(sun){gp[0]=Math.round(raw[0]/5);gp[1]=Math.round(raw[1]/5)}
 gp[0]+=g.baloot[0];gp[1]+=g.baloot[1];g.score[0]+=gp[0];g.score[1]+=gp[1];g.log.push({buyer:g.buyer,mode:g.mode,trump:g.trump,raw:g.pts.slice(),made,gp});
 const t=g.target;if(g.score[0]>=t||g.score[1]>=t){g.winner=g.score[0]===g.score[1]?bt:(g.score[0]>g.score[1]?0:1);g.phase='over'}else g.phase='between'};
bl.next=function(g){if(g.phase==='between'||g.phase==='redeal'){const keep={score:g.score,log:g.log,round:g.round,dealer:g.dealer,target:g.target,rnd:g.rnd};bl.deal(Object.assign(g,keep,{dealer:g.dealer}))}};
bl.aiPlay=function(g,p){const L=bl.legal(g,p);if(L.length===1)return L[0];const T=g.mode==='hokm'?g.trump:-1;const val=c=>bstr(c,T)+(T>=0&&S(c)===T?20:0);const asc=L.slice().sort((a,b)=>val(a)-val(b));const pv=c=>bpts(c,T);
 if(!g.trick.length){const top=L.filter(c=>S(c)!==T&&R(c)===14);if(top.length)return top[0];if(g.mode==='hokm'&&g.buyer%2===p%2){const j=L.find(c=>S(c)===T&&R(c)===11);if(j)return j}return asc.filter(c=>pv(c)===0)[0]||asc[0]}
 const cur=g.trick.slice();const wp=bl.winnerOf(cur,g);const partner=wp%2===p%2;const wins=L.filter(c=>bl.winnerOf(cur.concat([{p,c}]),g)===p);
 if(partner){return L.slice().sort((a,b)=>pv(b)-pv(a))[0]}// feed points to a winning partner
 if(wins.length){const trickPts=cur.reduce((a,t)=>a+pv(t.c),0);if(trickPts>0||g.trick.length===3)return wins.slice().sort((a,b)=>val(a)-val(b))[0]}
 return L.slice().sort((a,b)=>pv(a)-pv(b)||val(a)-val(b))[0]};
M.baloot=bl;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
