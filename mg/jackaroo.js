(function(M){
// ---------------- JACKAROO (Gulf marble-and-card race, 4 players, partners across: 0&2 vs 1&3) ----------------
// Ring of 64 cells, each player starts on cell 16*player. Every player has 4 marbles waiting in the base.
// A marble travels the whole ring (progress 0..63, cell = 16*owner+progress) and then 4 home cells (64..67). Landing on a marble
// (anyone's, including your partner's) sends it back to its base - except a marble standing on its OWN start cell, which is safe.
// A turn = play one card from your 4-card hand (new hands of 4 when all are empty):
//   A  bring a marble out of the base  OR move 1 OR move 11        K  bring a marble out  OR  move 13
//   Q  move 12      10 move 10      9,8,6,3,2 move that many
//   5  move ANY marble on the ring 5 steps (even a rival's or your partner's)
//   4  move one of your marbles 4 steps BACKWARDS (a marble on its start cell can go back and be 4 cells from home)
//   7  move 7, split between two of your marbles if you like; every marble passed over or landed on by a 7 is sent to its base
//   J  swap one of your marbles on the ring with any other marble on the ring (not a safe one)
// You can never land on your own marble and never jump over your own marbles inside the home cells. If no card can be played you
// discard one. When all 4 of your marbles fill the home cells you move your partner's marbles. First team with all 8 home wins.
const jk={};
const RING=64,HOME_LAST=67;
function shuf(a,rnd){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
jk.RANKS={A:14,K:13,Q:12,J:11};
jk.new=function(o){o=o||{};const g={game:'jackaroo',rnd:o.rnd||Math.random,m:[0,1,2,3].map(()=>[-1,-1,-1,-1]),hands:[[],[],[],[]],deck:[],turn:0,phase:'play',winner:-1,dealer:0,log:[]};jk.deal(g);g.turn=0;return g};
jk.deal=function(g){if(g.deck.length<16){const d=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({s,r});g.deck=shuf(d,g.rnd)}for(let p=0;p<4;p++)for(let k=0;k<4;k++)g.hands[p].push(g.deck.pop())};
const cell=(o,pr)=>(16*o+pr)%RING;
jk.cell=cell;
jk.done=(g,o)=>{const s=g.m[o].slice().sort((a,b)=>a-b);return s[0]===64&&s[1]===65&&s[2]===66&&s[3]===67};
jk.controlled=(g,p)=>jk.done(g,p)?(p+2)%4:p;// whose marbles p moves
jk.occ=function(g){const o=new Map();for(let a=0;a<4;a++)for(let k=0;k<4;k++){const pr=g.m[a][k];if(pr>=0&&pr<RING)o.set(cell(a,pr),{o:a,k})}return o};
const safe=(g,a,k)=>g.m[a][k]===0;
// is moving marble (a,k) forward n legal ? returns target pr or -1
jk.fwd=function(g,a,k,n,occ){const pr=g.m[a][k];if(pr<0||n<=0)return -1;const t=pr+n;if(t>HOME_LAST)return -1;
 for(let q=0;q<4;q++){if(q===k)continue;const o=g.m[a][q];if(o>=64&&o>pr&&o<=t&&(t>=64))return -1;// cannot jump over / land on own marble in the home cells
  if(o===t)return -1}// own marble on the landing cell
 if(t<RING){occ=occ||jk.occ(g);const e=occ.get(cell(a,t));if(e&&e.o!==a&&safe(g,e.o,e.k))return -1}
 return t};
jk.back=function(g,a,k,n,occ){const pr=g.m[a][k];if(pr<0||pr>=RING)return -1;let t=pr-n;if(t<0)t+=RING;
 for(let q=0;q<4;q++)if(q!==k&&g.m[a][q]===t)return -1;occ=occ||jk.occ(g);const e=occ.get(cell(a,t));if(e&&e.o!==a&&safe(g,e.o,e.k))return -1;return t};
function clone(g){return {m:g.m.map(r=>r.slice())}}
// apply one step on state s (only .m is used). returns list of events
function applyStep(s,st,burn){const ev=[];const {o:a,k}=st;const from=s.m[a][k];
 if(st.kind==='swap'){const b=s.m[st.o2][st.k2];const ca=cell(a,from),cb=cell(st.o2,b);s.m[a][k]=((cb-16*a)%RING+RING)%RING;s.m[st.o2][st.k2]=((ca-16*st.o2)%RING+RING)%RING;ev.push({t:'swap',o:a,k,o2:st.o2,k2:st.k2});return ev}
 let to=st.to;
 if(st.kind==='enter'){to=0;from;}
 // cells passed (7): strictly between and landing
 const hitCell=c=>{for(let x=0;x<4;x++)for(let y=0;y<4;y++){if(x===a&&y===k)continue;const pr=s.m[x][y];if(pr>=0&&pr<RING&&cell(x,pr)===c&&pr!==0){s.m[x][y]=-1;ev.push({t:'kill',o:x,k:y,by:a})}else if(pr===0&&cell(x,pr)===c&&x!==a&&st.kind==='enter'){s.m[x][y]=-1;ev.push({t:'kill',o:x,k:y,by:a})}}};
 if(burn&&st.kind==='fwd'){for(let q=from+1;q<to&&q<RING;q++)hitCell(cell(a,q))}
 s.m[a][k]=to;ev.push({t:'move',o:a,k,from,to});
 if(to<RING)hitCell(cell(a,to));return ev}
// kill by landing: marbles at the landing cell of any owner (non-safe) go home; own landing is excluded by legality
jk.movesFor=function(g,p,card){const out=[];const ctrl=jk.controlled(g,p);const occ=jk.occ(g);const r=card.r;
 const add=(c,steps,txt)=>out.push({card:c,steps,text:txt});
 const mine=[0,1,2,3].filter(k=>g.m[ctrl][k]>=0);
 const enter=()=>{const k=g.m[ctrl].findIndex(x=>x<0);if(k<0)return;if(g.m[ctrl].includes(0))return;const e=occ.get(cell(ctrl,0));if(e&&e.o===ctrl)return;add(card,[{kind:'enter',o:ctrl,k,to:0}],'enter')};
 const fw=n=>{for(const k of mine){const t=jk.fwd(g,ctrl,k,n,occ);if(t>=0)add(card,[{kind:'fwd',o:ctrl,k,to:t,n}],'move '+n)}};
 if(r===14){enter();fw(1);fw(11)}else if(r===13){enter();fw(13)}else if(r===12)fw(12);else if(r===10)fw(10);else if([9,8,6,3,2].includes(r))fw(r);
 else if(r===4){for(const k of mine){const t=jk.back(g,ctrl,k,4,occ);if(t>=0)add(card,[{kind:'back',o:ctrl,k,to:t,n:4}],'back 4')}}
 else if(r===5){for(let a=0;a<4;a++)for(let k=0;k<4;k++){const pr=g.m[a][k];if(pr<0||pr>=RING)continue;if(pr===0&&a!==ctrl&&a!==(ctrl+2)%4)continue;const t=jk.fwd(g,a,k,5,occ);if(t>=0)add(card,[{kind:'fwd',o:a,k,to:t,n:5}],'move 5')}}
 else if(r===11){const ring=[];for(let a=0;a<4;a++)for(let k=0;k<4;k++){const pr=g.m[a][k];if(pr>0&&pr<RING)ring.push({a,k})}
  for(const m of mine){const pr=g.m[ctrl][m];if(!(pr>0&&pr<RING))continue;for(const e of ring){if(e.a===ctrl&&e.k===m)continue;add(card,[{kind:'swap',o:ctrl,k:m,o2:e.a,k2:e.k}],'swap')}}}
 else if(r===7){for(const k of mine){const t=jk.fwd(g,ctrl,k,7,occ);if(t>=0)add(card,[{kind:'fwd',o:ctrl,k,to:t,n:7,burn:true}],'move 7')}
  for(const k1 of mine)for(let n1=1;n1<=6;n1++){const s=clone(g);const t1=jk.fwd(g,ctrl,k1,n1,occ);if(t1<0)continue;const st1={kind:'fwd',o:ctrl,k:k1,to:t1,n:n1,burn:true};applyStep(s,st1,true);const occ2=jk.occ(s);
   for(const k2 of mine){if(k2===k1)continue;if(s.m[ctrl][k2]<0)continue;const t2=jk.fwd(s,ctrl,k2,7-n1,occ2);if(t2>=0)add(card,[st1,{kind:'fwd',o:ctrl,k:k2,to:t2,n:7-n1,burn:true}],'split '+n1+'+'+(7-n1))}}}
 return out};
jk.legal=function(g,p){const all=[];for(const c of g.hands[p])all.push(...jk.movesFor(g,p,c));return all};
jk.apply=function(g,mv){const ev=[];for(const st of mv.steps){ev.push(...applyStep(g,st,!!st.burn))}return ev};
jk.play=function(g,p,mv){if(g.phase!=='play'||g.turn!==p)throw new Error('not your turn');const i=g.hands[p].indexOf(mv.card);if(i<0)throw new Error('card not in hand');
 const legal=jk.movesFor(g,p,mv.card);const same=legal.find(l=>JSON.stringify(l.steps)===JSON.stringify(mv.steps));if(!same)throw new Error('illegal move');
 g.hands[p].splice(i,1);const ev=jk.apply(g,same);jk.after(g,p);return ev};
jk.discard=function(g,p,card){if(g.turn!==p)throw new Error('not your turn');if(jk.legal(g,p).length)throw new Error('you have a move');const i=g.hands[p].indexOf(card);if(i<0)throw new Error('card not in hand');g.hands[p].splice(i,1);jk.after(g,p)};
jk.after=function(g,p){for(const t of [0,1]){if(jk.done(g,t)&&jk.done(g,t+2)){g.winner=t;g.phase='over';return}}
 g.turn=(p+1)%4;if(g.hands.every(h=>h.length===0)){jk.deal(g)}};
function evalState(g,team){let s=0;for(let a=0;a<4;a++){const w=a%2===team?1:-1;for(let k=0;k<4;k++){const pr=g.m[a][k];if(pr<0)s-=w*8;else if(pr>=64)s+=w*(120+(pr-64)*8);else s+=w*(pr*1.6+(pr===0?12:0)+(pr>=48?(pr-48)*1.5:0))}}return s}
jk.aiMove=function(g,p){const L=jk.legal(g,p);if(!L.length)return null;const team=p%2;let best=null,bs=-1e9;
 for(const mv of L){const s=clone(g);const ev=[];for(const st of mv.steps)ev.push(...applyStep(s,st,!!st.burn));let sc=evalState(s,team)-evalState(g,team);
  for(const e of ev)if(e.t==='kill'){const w=e.o%2===team?-1:1;sc+=w*35}
  sc+=Math.random()*3;if(sc>bs){bs=sc;best=mv}}return best};
jk.aiDiscard=function(g,p){const h=g.hands[p].slice().sort((a,b)=>a.r-b.r);return h[0]};
jk.cardName=c=>({14:'A',13:'K',12:'Q',11:'J'}[c.r]||String(c.r))+['♠','♥','♦','♣'][c.s];
M.jackaroo=jk;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
