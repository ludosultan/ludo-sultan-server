(function(M){
// ---------------- TAVLA (Turkish backgammon: standard backgammon rules, no doubling cube) ----------------
// 15 checkers each. White (player 0) moves from point 24 down to 1 (home = points 1-6), black (player 1) the other way.
// Roll two dice and play each number with one checker (doubles = four moves). You may not land on a point with 2+ enemy checkers;
// a single enemy checker is hit and goes to the bar; a player on the bar must enter first. You must play as many dice as possible
// (if only one can be played it must be the larger when possible). Bear off only when all 15 checkers are home.
// First to bear off all wins: 1 point, gammon (loser bore off none) 2, backgammon (loser has a checker on the bar or in the winner's home) 3.
// idx 0..23 ; white count positive, black negative.  White home idx 0-5, black home idx 18-23.
const tv={};
tv.new=function(o){o=o||{};const pts=Array(24).fill(0);pts[23]=2;pts[12]=5;pts[7]=3;pts[5]=5;pts[0]=-2;pts[11]=-5;pts[16]=-3;pts[18]=-5;
 const g={game:'tavla',pts,bar:[0,0],off:[0,0],turn:0,dice:[],left:[],seqs:[],done:[],phase:'roll',rnd:o.rnd||Math.random,winner:-1,value:0};g.turn=g.rnd()<.5?0:1;return g};
const own=(g,p,i)=>p===0?g.pts[i]>0:g.pts[i]<0;
const cntOwn=(g,p,i)=>p===0?Math.max(0,g.pts[i]):Math.max(0,-g.pts[i]);
const cntOpp=(g,p,i)=>p===0?Math.max(0,-g.pts[i]):Math.max(0,g.pts[i]);
tv.allHome=function(g,p){if(g.bar[p])return false;for(let i=0;i<24;i++)if(cntOwn(g,p,i)&&!(p===0?i<=5:i>=18))return false;return true};
// single moves for one die value
tv.stepMoves=function(g,p,d){const out=[],dir=p===0?-1:1;
 if(g.bar[p]){const to=p===0?24-d:d-1;if(cntOpp(g,p,to)<=1)out.push({from:'bar',to,die:d});return out}
 const home=tv.allHome(g,p);let far=-1;// farthest-from-exit own checker
 for(let k=0;k<24;k++){const i=p===0?23-k:k;if(cntOwn(g,p,i)){far=i;break}}
 for(let i=0;i<24;i++){if(!cntOwn(g,p,i))continue;const j=i+dir*d;
  if(j>=0&&j<=23){if(cntOpp(g,p,j)<=1)out.push({from:i,to:j,die:d})}
  else if(home){const exact=p===0?(i===d-1):(i===24-d);const higher=p===0?(d-1>i&&far===i):(24-d<i&&far===i);if(exact||higher)out.push({from:i,to:'off',die:d})}}
 return out};
tv.apply=function(g,p,m){const u={m,hit:false};if(m.from==='bar')g.bar[p]--;else g.pts[m.from]+=p===0?-1:1;
 if(m.to==='off'){g.off[p]++}else{if(cntOpp(g,p,m.to)===1){g.pts[m.to]=0;g.bar[1-p]++;u.hit=true}g.pts[m.to]+=p===0?1:-1}return u};
tv.undo=function(g,p,u){const m=u.m;if(m.to==='off')g.off[p]--;else{g.pts[m.to]-=p===0?1:-1;if(u.hit){g.bar[1-p]--;g.pts[m.to]=p===0?-1:1}}if(m.from==='bar')g.bar[p]++;else g.pts[m.from]-=p===0?-1:1};
const key=m=>m.from+'>'+m.to+'/'+m.die;
tv.sequences=function(g,p,dice){let best=0;const all=[];
 (function rec(left,cur){let any=false;const tried=new Set();
  for(let k=0;k<left.length;k++){const d=left[k];if(tried.has(d))continue;tried.add(d);const mv=tv.stepMoves(g,p,d);
   for(const m of mv){any=true;const u=tv.apply(g,p,m);const nl=left.slice();nl.splice(k,1);cur.push(m);rec(nl,cur);cur.pop();tv.undo(g,p,u)}}
  if(!any){if(cur.length>best)best=cur.length;all.push(cur.slice())}})(dice.slice(),[]);
 let seqs=all.filter(s=>s.length===best);
 if(best===1&&dice.length===2&&dice[0]!==dice[1]){const hi=Math.max(dice[0],dice[1]);const big=seqs.filter(s=>s[0].die===hi);if(big.length)seqs=big}
 // de-duplicate identical sequences
 const seen=new Set(),out=[];for(const s of seqs){const k=s.map(key).join('|');if(!seen.has(k)){seen.add(k);out.push(s)}}return {seqs:out,len:best}};
tv.roll=function(g,d1,d2){if(g.phase!=='roll')throw new Error('roll first');const a=d1||1+Math.floor(g.rnd()*6),b=d2||1+Math.floor(g.rnd()*6);g.dice=[a,b];g.left=a===b?[a,a,a,a]:[a,b];
 const r=tv.sequences(g,g.turn,g.left);g.seqs=r.seqs;g.maxLen=r.len;g.done=[];g.phase=r.len?'move':'roll';if(!r.len){g.noMove=true;tv.endTurn(g)}else g.noMove=false;return g.dice};
// next legal single steps given moves already played this turn
tv.nextSteps=function(g){const out=[],seen=new Set();for(const s of g.seqs){let ok=true;for(let i=0;i<g.done.length;i++)if(!s[i]||key(s[i])!==key(g.done[i])){ok=false;break}
  if(!ok||s.length<=g.done.length)continue;const m=s[g.done.length];const k=key(m);if(!seen.has(k)){seen.add(k);out.push(m)}}return out};
tv.move=function(g,m){if(g.phase!=='move')throw new Error('not moving');const ok=tv.nextSteps(g).find(x=>key(x)===key(m));if(!ok)throw new Error('illegal move');
 const p=g.turn;const u=tv.apply(g,p,ok);g.done.push(ok);const i=g.left.indexOf(ok.die);g.left.splice(i,1);const res={hit:u.hit,off:ok.to==='off',win:false};
 if(g.off[p]===15){g.winner=p;const q=1-p;let v=1;if(g.off[q]===0){v=2;const inHome=(i)=>q===0?i>=18:i<=5;let back=g.bar[q]>0;for(let k=0;k<24;k++)if(cntOwn(g,q,k)&&(p===0?k<=5:k>=18))back=true;if(back)v=3}g.value=v;g.phase='over';res.win=true;return res}
 if(g.done.length>=g.maxLen)tv.endTurn(g);return res};
tv.endTurn=function(g){g.turn=1-g.turn;g.phase='roll';g.dice=[];g.left=[];g.seqs=[];g.done=[]};
tv.pip=function(g,p){let s=g.bar[p]*25;for(let i=0;i<24;i++){const c=cntOwn(g,p,i);if(c)s+=c*(p===0?i+1:24-i)}return s};
tv.evalPos=function(g,p){let s=0;const q=1-p;s+=(tv.pip(g,q)-tv.pip(g,p))*1;s+=g.bar[q]*18-g.bar[p]*22+g.off[p]*10-g.off[q]*10;
 for(let i=0;i<24;i++){const c=cntOwn(g,p,i);if(!c)continue;const prog=p===0?23-i:i;// 0 = start of journey
  if(c===1){// blot: exposed to enemy checkers behind it (+bar)
   let risk=0;for(let j=0;j<24;j++){const e=cntOpp(g,p,j);if(!e)continue;const dist=p===0?i-j:j-i;// enemy moves toward... enemy q needs to travel to i
    const d=q===0?j-i:i-j;if(d>0&&d<=6)risk+=e*(d<=3?1.4:1)}if(g.bar[q])risk+=3;s-=risk*(prog>=17?3.5:6)}
  else{s+=4+(prog>=18?3:0)+(prog>=12&&prog<18?1:0)}}
 return s};
tv.aiSequence=function(g){const p=g.turn;let best=null,bs=-1e9;for(const s of g.seqs){const us=[];for(const m of s)us.push(tv.apply(g,p,m));let sc=tv.evalPos(g,p)+Math.random()*.4;for(let k=us.length-1;k>=0;k--)tv.undo(g,p,us[k]);if(sc>bs){bs=sc;best=s}}return best||[]};
tv.checkers=function(g,p){let n=g.bar[p]+g.off[p];for(let i=0;i<24;i++)n+=cntOwn(g,p,i);return n};
tv.cnt=cntOwn;
M.tavla=tv;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
