(function(M){
// ---------------- OKEY (Turkish rummy, 106 tiles) ----------------
// 2 sets of 1..13 in 4 colours + 2 fake jokers. One tile is turned over as the indicator; the okey (wild) is the tile of the same
// colour with the next number (13 -> 1). The two real okey tiles are wild; a fake joker stands for the okey tile itself.
// 4 players, 14 tiles each (the first player gets 15). Turn: draw the stock top OR take the discard of the player on your right
// (previous player), then discard one tile. Win by arranging ALL 14 remaining tiles into runs (3+ consecutive, same colour, 1 may follow 13)
// and groups (3-4 equal numbers, different colours).
const ok={};
function shuf(a,rnd){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
ok.allTiles=function(){const t=[];let id=0;for(let k=0;k<2;k++)for(let c=0;c<4;c++)for(let n=1;n<=13;n++)t.push({id:id++,c,n,fake:false});t.push({id:id++,c:-1,n:0,fake:true});t.push({id:id++,c:-1,n:0,fake:true});return t};
ok.new=function(o){o=o||{};const g={game:'okey',rnd:o.rnd||Math.random,score:[0,0,0,0],round:0,log:[],dealer:o.dealer==null?3:o.dealer};ok.deal(g);return g};
ok.deal=function(g){let t=shuf(ok.allTiles(),g.rnd);g.round++;g.dealer=(g.dealer+1)%4;
 let ind;do{ind=t.shift();if(ind.fake)t.push(ind)}while(ind.fake);g.indicator=ind;g.okey={c:ind.c,n:ind.n===13?1:ind.n+1};
 const first=(g.dealer+1)%4;g.hands=[0,1,2,3].map(i=>t.splice(0,i===first?15:14));g.stock=t;g.discards=[[],[],[],[]];g.turn=first;g.drew=true;g.phase='play';g.winner=-1;return g};
ok.isWild=(g,t)=>!t.fake&&t.c===g.okey.c&&t.n===g.okey.n;
// what a tile is worth in a hand: [c,n] or null for wild. Fake joker = the okey tile.
ok.face=(g,t)=>t.fake?[g.okey.c,g.okey.n]:(ok.isWild(g,t)?null:[t.c,t.n]);
ok.canWin=function(g,hand){if(hand.length!==14)return false;let w=0;const cnt=[];for(let c=0;c<4;c++)cnt.push(Array(15).fill(0));
 for(const t of hand){const f=ok.face(g,t);if(!f)w++;else cnt[f[0]][f[1]]++}return solve(cnt,w)};
function solve(cnt,w){let c=-1,n=-1;outer:for(let cc=0;cc<4;cc++)for(let nn=1;nn<=13;nn++)if(cnt[cc][nn]>0){c=cc;n=nn;break outer}
 if(c<0)return w<=2;// leftover wilds extend any set
 // A) run starting at (c,n)
 for(let len=3;len<=14-n;len++){// numbers n..n+len-1 must be <=13
  if(n+len-1>13)break;const need=[];let ww=w,ok2=true;for(let k=0;k<len;k++){if(cnt[c][n+k]>0)need.push(n+k);else{ww--;if(ww<0){ok2=false;break}}}
  if(!ok2)break;need.forEach(x=>cnt[c][x]--);const r=solve(cnt,ww);need.forEach(x=>cnt[c][x]++);if(r)return true}
 // C) run ending with 1 as the high tile: (c,m..13,1)
 if(n===1){for(let m=12;m>=10;m--){let ww=w,ok2=true;const need=[1];for(let x=m;x<=13;x++){if(cnt[c][x]>0)need.push(x);else{ww--;if(ww<0){ok2=false;break}}}
   if(!ok2)continue;need.forEach(x=>cnt[c][x]--);const r=solve(cnt,ww);need.forEach(x=>cnt[c][x]++);if(r)return true}}
 // B) group of number n containing colour c with colours > c
 const others=[];for(let cc=c+1;cc<4;cc++)others.push(cc);
 for(let mask=0;mask<(1<<others.length);mask++){const cols=others.filter((_,i)=>mask&(1<<i));// colours that are used in this group (real or wild)
  if(cols.length<2||cols.length>3)continue;let ww=w,ok2=true;const used=[c];for(const cc of cols){if(cnt[cc][n]>0)used.push(cc);else{ww--;if(ww<0){ok2=false;break}}}
  if(!ok2)continue;used.forEach(x=>cnt[x][n]--);const r=solve(cnt,ww);used.forEach(x=>cnt[x][n]++);if(r)return true}
 return false}
// all discards that complete the hand (hand has 15 tiles)
ok.winningDiscards=function(g,hand){if(hand.length!==15)return[];const out=[];for(let i=0;i<15;i++){const rest=hand.filter((_,k)=>k!==i);if(ok.canWin(g,rest))out.push(hand[i])}return out};
ok.draw=function(g,p,from){if(g.turn!==p||g.drew)throw new Error('cannot draw');let t;
 if(from==='discard'){const prev=(p+3)%4;t=g.discards[prev].pop();if(!t)throw new Error('no discard')}else{t=g.stock.shift();if(!t){g.phase='over';g.winner=-1;return null}}
 g.hands[p].push(t);g.drew=true;g.lastDrawn=t;return t};
ok.discard=function(g,p,tile){if(g.turn!==p||!g.drew)throw new Error('draw first');const h=g.hands[p];const i=h.indexOf(tile);if(i<0)throw new Error('no such tile');
 const win=ok.canWin(g,h.filter(t=>t!==tile));h.splice(i,1);g.discards[p].push(tile);g.last={p,tile};
 if(win){g.phase='over';g.winner=p;g.log.push({winner:p});return {win:true}}
 g.turn=(p+1)%4;g.drew=false;if(!g.stock.length){g.phase='over';g.winner=-1}return {win:false}};
// how well a tile connects with the rest of the hand (higher = keep)
function conn(g,hand,t){const f=ok.face(g,t);if(!f)return 100;let s=0;for(const u of hand){if(u===t)continue;const h=ok.face(g,u);if(!h){s+=1.2;continue}
  if(h[0]===f[0]){const d=Math.abs(h[1]-f[1]);if(d===0)s+=1.1;else if(d===1)s+=2;else if(d===2)s+=1.2;else if((f[1]===1&&h[1]>=12)||(h[1]===1&&f[1]>=12))s+=(Math.abs(13-Math.max(f[1],h[1]))<=1?1.5:.6)}
  else if(h[1]===f[1])s+=1.5}return s}
ok.aiDiscard=function(g,p){const h=g.hands[p];const wd=ok.winningDiscards(g,h);if(wd.length)return wd[0];
 let best=null,bs=1e9;for(const t of h){let s=conn(g,h,t);if(t===g.lastDrawn&&false)s+=.1;if(s<bs){bs=s;best=t}}return best};
ok.aiDraw=function(g,p){const prev=(p+3)%4,top=g.discards[prev][g.discards[prev].length-1];if(top){const h=g.hands[p];if(ok.winningDiscards(g,h.concat([top])).length)return 'discard';
  const gain=conn(g,h.concat([top]),top);if(gain>=4.6&&!top.fake)return 'discard'}return 'stock'};
ok.name=function(g,t){return t.fake?'★':String(t.n)};
M.okey=ok;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
