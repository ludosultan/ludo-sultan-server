// ================= Ludo Sultan 3.6: 6-player hexagonal Ludo (pure logic, no DOM) =================
(function(root){
const COLORS6=['red','green','yellow','blue','purple','orange'];
const N=5,ARM=2*N+1,TL=6*ARM;            // arm length 5, 11 track squares per arm, 66 on the ring
const LAST=TL-2,HOME0=LAST+1,FIN=LAST+N; // rel 0..64 ring, 65..68 home lane, 69 = Royal Throne (finished)
const START=[0,1,2,3,4,5].map(k=>k*ARM+N+2);
const STARS=[0,1,2,3,4,5].map(k=>k*ARM+(N-3));
const SAFE=new Set([...START,...STARS]);
const ARMS={2:[0,3],3:[0,2,4],4:[0,1,3,4],5:[0,1,2,3,4],6:[0,1,2,3,4,5]};
// team modes: id -> [players, team of seat]
const TEAMS={'2v2':[4,s=>s%2],'2v2v2':[6,s=>s%3],'3v3':[6,s=>s%2]};
function HR(){try{if(typeof Ludo!=='undefined'&&Ludo.normRules)return Ludo;if(typeof module!=='undefined')return require('./logic.js')}catch(e){}return null}
function R(g){return (g&&g.opts&&g.opts.rules)||(HR()&&HR().RULE_DEF)||{unlock:'6',six:true,three6:true,capBonus:true,homeBonus:true,safePair:false,stars:true,mustCap:false,exact:true,startOut:false,reroll:true,turnSec:10}}
function isSafe(g,a){if(START.includes(a))return true;if(STARS.includes(a))return R(g).stars!==false;return false}
function newGame(n,opts){const o=Object.assign({mode:'solo',three6:true,shift:0},opts||{});o.three6=true;
 if(TEAMS[o.mode])n=TEAMS[o.mode][0];else o.mode='solo';n=Math.max(2,Math.min(6,n|0));
 {const H=HR();const nr=H&&H.normRules&&H.normRules(o.rules);if(nr)o.rules=nr;else delete o.rules}
 const arms=ARMS[n].slice(),players=arms.map(a=>COLORS6[(a+o.shift)%6]);
 const team=TEAMS[o.mode]?arms.map((_,s)=>TEAMS[o.mode][1](s)):null;
 const out=!!(o.rules&&o.rules.startOut);
 return {v:6,n,arms,players,team,tokens:arms.map(()=>out?[0,-1,-1,-1]:[-1,-1,-1,-1]),turn:0,rank:[],queue:[],sixes:0,bonus:0,lastCap:{},opts:o,moves:0};}
const isTeam=g=>!!g.team;
function ally(g,a,b){return a===b||(!!g.team&&g.team[a]===g.team[b]);}
function done(g,pi){return g.tokens[pi].every(p=>p===FIN);}
function teamOf(g,pi){return g.team?g.players.map((_,j)=>j).filter(j=>g.team[j]===g.team[pi]):[pi];}
function teamDone(g,pi){return teamOf(g,pi).every(j=>done(g,j));}
function abs(g,pi,p){return (START[g.arms[pi]]+p)%TL;}
function canMove(p,d){if(p===FIN)return false;if(p<0)return d===6;return p+d<=FIN;}
function gateShut(g,pj,p,d){return !!(R(g).mustCap&&p>=0&&p<=LAST&&p+d>LAST&&!(g.capd&&g.capd[pj])&&g.players.some((_,oj)=>!ally(g,pj,oj)&&g.tokens[oj].some(op=>op>=0&&op<=LAST)))}
function canMoveG(g,pj,p,d,noGate){const r=R(g);if(p===FIN)return false;
 if(p<0)return r.unlock==='any'?true:r.unlock==='16'?(d===6||d===1):d===6;
 if(!noGate&&gateShut(g,pj,p,d))return false;
 return r.exact===false?true:p+d<=FIN;}
function blockAt(g,pi,a){if(!g.opts||!g.opts.blockade)return false;
 for(let oj=0;oj<g.n;oj++){if(ally(g,pi,oj))continue;let n=0;for(const op of g.tokens[oj])if(op>=0&&op<=LAST&&abs(g,oj,op)===a)n++;if(n>=2)return true;}return false;}
function pathFree(g,pj,p,d){if(!g.opts||!g.opts.blockade)return true;
 const from=p<0?0:p+1,to=p<0?0:Math.min(p+d,LAST);for(let q=from;q<=to;q++)if(blockAt(g,pj,abs(g,pj,q)))return false;return true;}
function legal(g,pi,pj,ti,d){const p=g.tokens[pj][ti];if(!canMoveG(g,pj,p,d,true)||!pathFree(g,pj,p,d))return false;
 if(gateShut(g,pj,p,d))return !controls(g,pi).some(qj=>g.tokens[qj].some((pp,tj)=>(qj!==pj||tj!==ti)&&canMoveG(g,qj,pp,d)&&pathFree(g,qj,pp,d)));return true;}
// whose tokens may seat pi move? its own, or (finished team player) its unfinished teammates
function controls(g,pi){if(!done(g,pi)||!g.team)return [pi];return teamOf(g,pi).filter(j=>j!==pi&&!done(g,j));}
function canPlay(g,pi){return g.team?!teamDone(g,pi):!g.rank.includes(pi);}
function stopAt(g){return g.opts.stopAt||Math.min(g.n-1,3);}
function over(g){if(g.team){const t=new Set(g.team);for(const x of t)if(g.team.every((tt,j)=>tt!==x||done(g,j)))return true;return false;}
 if(g.opts.endWhen&&g.opts.endWhen.length&&g.opts.endWhen.every(j=>g.rank.includes(j)))return true;
 return g.rank.length>=stopAt(g);}
function winTeam(g){if(!g.team)return -1;for(const x of new Set(g.team))if(g.team.every((tt,j)=>tt!==x||done(g,j)))return x;return -1;}
function homeCount(g,pi){return g.tokens[pi].filter(p=>p===FIN).length;}
function progress(g,pi){return g.tokens[pi].reduce((a,p)=>a+(p<0?-5:p),0);}
function standings(g){const all=g.players.map((_,i)=>i),by=(a,b)=>homeCount(g,b)-homeCount(g,a)||progress(g,b)-progress(g,a);
 if(g.team){const wt=winTeam(g);const tp=t=>all.filter(j=>g.team[j]===t).reduce((s,j)=>s+homeCount(g,j)*100+progress(g,j),0);
  const teams=[...new Set(g.team)].sort((a,b)=>(a===wt?-1:b===wt?1:tp(b)-tp(a)));
  return [].concat(...teams.map(t=>all.filter(j=>g.team[j]===t).sort((a,b)=>(g.rank.indexOf(a)+1||99)-(g.rank.indexOf(b)+1||99)||by(a,b))));}
 return g.rank.concat(all.filter(i=>!g.rank.includes(i)).sort(by));}
// ---- dice queue (same model as the 4-player game: 6 rolls again, then use the values in any order) ----
function rollPush(g,d){const six=R(g).six!==false;if(d===6&&six)g.sixes++;else g.sixes=0;
 if(g.sixes>=3&&R(g).three6!==false){g.queue=[];return {forfeit:true,again:false,queue:[]};}
 g.queue.push(d);return {forfeit:false,again:d===6&&six,queue:g.queue.slice()};}
function options(g,pi){const out=[],seen=new Set();g.queue.forEach((d,di)=>controls(g,pi).forEach(pj=>g.tokens[pj].forEach((p,ti)=>{
  if(!legal(g,pi,pj,ti,d))return;const k=d+':'+pj+':'+p;if(seen.has(k))return;seen.add(k);out.push({di,d,pj,ti});})));return out;}
function canUse(g,pi,o){return !!o&&o.di>=0&&o.di<g.queue.length&&controls(g,pi).includes(o.pj)&&legal(g,pi,o.pj,o.ti,g.queue[o.di]);}
// apply option o={di,pj,ti} for the seat in turn pi
function useDie(g,pi,o){const d=g.queue[o.di];g.queue.splice(o.di,1);const pj=o.pj,ti=o.ti;const p0=g.tokens[pj][ti];const RR=R(g);let p=p0<0?0:p0+d;if(p>FIN)p=FIN;g.tokens[pj][ti]=p;g.moves++;
 const res={d,pj,ti,from:p0,to:p,captured:[],finished:p===FIN,revenge:false,throne:-1,star:false,done:false,bonus:false};
 if(p<=LAST){const a=abs(g,pj,p);res.star=STARS.includes(a);if(!isSafe(g,a))g.players.forEach((_,oj)=>{if(ally(g,pj,oj))return;const here=[];g.tokens[oj].forEach((op,ok)=>{if(op>=0&&op<=LAST&&abs(g,oj,op)===a)here.push(ok)});
   if(RR.safePair&&here.length>=2)return;here.forEach(ok=>{if(g.shield&&g.shield[oj+':'+ok]){delete g.shield[oj+':'+ok];(res.shielded=res.shielded||[]).push([oj,ok]);return;}g.tokens[oj][ok]=-1;res.captured.push([oj,ok]);});});}
 let extra=0;
 if(res.captured.length){(g.capd=g.capd||{})[pj]=1;if(RR.capBonus!==false){extra++;const vs=[...new Set(res.captured.map(c=>c[0]))];if(vs.includes(g.lastCap[pj])){res.revenge=true;extra++;delete g.lastCap[pj];}vs.forEach(v=>{g.lastCap[v]=pj;});}else{const vs=[...new Set(res.captured.map(c=>c[0]))];vs.forEach(v=>{g.lastCap[v]=pj;});}}
 if(res.finished){if(RR.homeBonus!==false)extra++;const bi=g.tokens[pj].indexOf(-1);if(bi>=0){g.tokens[pj][bi]=0;res.throne=bi;}}
 if(done(g,pj)&&!g.rank.includes(pj)){g.rank.push(pj);res.done=true;}
 if(extra&&!over(g)&&canPlay(g,pi)){g.bonus+=extra;res.bonus=true;res.extra=extra;}
 return res;}
function nextTurn(g){const n=g.n;for(let k=1;k<=n;k++){const j=(g.turn+k)%n;if(canPlay(g,j)){g.turn=j;return j;}}return -1;}
function endDice(g){g.queue=[];if(over(g))return -1;if(g.bonus>0&&canPlay(g,g.turn)){g.bonus--;g.sixes=0;return g.turn;}g.bonus=0;g.sixes=0;return nextTurn(g);}
// ---- AI / AUTO: capture > reach throne > leave base > safe square > advance furthest ----
function aiScore(g,pi,o,d){const pj=o.pj,p=g.tokens[pj][o.ti];const np=p<0?0:p+d;let s=0;
 if(np===FIN)s+=100;else if(np>LAST)s+=30;if(p<0)s+=60;
 if(np<=LAST){const a=abs(g,pj,np);g.players.forEach((_,oj)=>{if(ally(g,pj,oj))return;g.tokens[oj].forEach(op=>{if(op<0||op>LAST)return;const oa=abs(g,oj,op);
   if(oa===a&&!isSafe(g,a))s+=120+op+(g.lastCap[pj]===oj?40:0);const dist=(a-oa+TL)%TL;if(dist>0&&dist<=6&&!isSafe(g,a))s-=40;});});if(isSafe(g,a))s+=25;}
 if(p>=0&&p<=LAST){const a0=abs(g,pj,p);if(!isSafe(g,a0))g.players.forEach((_,oj)=>{if(ally(g,pj,oj))return;g.tokens[oj].forEach(op=>{if(op<0||op>LAST)return;const dist=(a0-abs(g,oj,op)+TL)%TL;if(dist>0&&dist<=6)s+=35;});});}
 return s+np*0.5;}
function aiChoose(g,pi,rnd){const os=options(g,pi);if(!os.length)return null;let b=os[0],bs=-1e9;for(const o of os){const s=aiScore(g,pi,o,o.d)+o.d*0.3+(rnd===false?0:Math.random());if(s>bs){bs=s;b=o;}}return b;}
// ---- geometry (board units, centre 0,0; arm 0 points down, arms go clockwise) ----
const APO=1.5*Math.sqrt(3);
function armVec(k){const t=(90+60*k)*Math.PI/180;return {u:[Math.cos(t),Math.sin(t)],v:[-Math.sin(t),Math.cos(t)],deg:90+60*k};}
function armCell(k,i,j){const {u,v}=armVec(k);const r=APO+i+0.5;return [u[0]*r+v[0]*j,u[1]*r+v[1]*j];}
// ring square a -> [x,y]
function ringXY(a){const k=Math.floor(a/ARM),o=a%ARM;if(o<N)return armCell(k,o,-1);if(o===N)return armCell(k,N-1,0);return armCell(k,2*N-o,1);}
function yardXY(k,ti){const t=(90+60*k+30)*Math.PI/180,u=[Math.cos(t),Math.sin(t)],v=[-Math.sin(t),Math.cos(t)];const D=5.55,s=0.62;
 const a=(ti%2?1:-1)*s,b=(ti<2?-1:1)*s;return [u[0]*(D+b)+v[0]*a,u[1]*(D+b)+v[1]*a];}
function yardCenter(k){const t=(90+60*k+30)*Math.PI/180;return [Math.cos(t)*5.55,Math.sin(t)*5.55];}
function cellXY(g,pi,p,ti){const k=g.arms[pi];if(p<0)return yardXY(k,ti);if(p<=LAST)return ringXY(abs(g,pi,p));
 if(p<FIN)return armCell(k,N-2-(p-HOME0),0);const {u,v}=armVec(k);const a=(ti%2?1:-1)*0.42,b=(ti<2?0:1)*0.5;return [u[0]*(1.05+b)+v[0]*a,u[1]*(1.05+b)+v[1]*a];}
const L6={R,isSafe,canMoveG,legal,blockAt,COLORS6,N,ARM,TL,LAST,HOME0,FIN,START,STARS,SAFE,ARMS,TEAMS,newGame,isTeam,ally,done,teamOf,teamDone,abs,canMove,controls,canPlay,over,winTeam,homeCount,progress,standings,
 rollPush,options,canUse,useDie,nextTurn,endDice,aiScore,aiChoose,APO,armVec,armCell,ringXY,yardXY,yardCenter,cellXY};
if(typeof module!=='undefined')module.exports=L6;else root.Ludo6=L6;})(this);
