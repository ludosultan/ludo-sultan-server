(function(M){
// ---------------- CARROM (2 players: You = white coins at the bottom, Computer = black coins at the top) ----------------
// 9 white + 9 black coins + 1 red queen. Shoot the striker from your baseline; pocket your own colour to keep the turn.
// Pocketing an opponent coin leaves it pocketed (it counts for them) and ends your turn. The queen must be "covered": pocket one of
// your own coins on the same shot or the very next shot, otherwise the queen goes back to the centre. Pocketing the striker is a foul:
// the shot ends, coins pocketed on that shot return to the centre, and one of your earlier pocketed coins is put back too.
// You win the board by pocketing all your coins after covering the queen (your last coin returns if the queen is still on the board).
// Score = 1 point per opponent coin left + 3 for the queen if you covered it.
const cr={};
const W=1000,CR=17,SR=21,POCK=46,FR=.985,REST=.78,STOP=.06;
cr.W=W;cr.CR=CR;cr.SR=SR;cr.POCK=POCK;
cr.pockets=[[0,0],[W,0],[0,W],[W,W]];
cr.new=function(o){o=o||{};const coins=[];let id=0;const c0=W/2;coins.push({id:id++,t:'q',x:c0,y:c0,vx:0,vy:0,in:false});
 const rIn=CR*2+.5,rOut=CR*4+1;for(let i=0;i<6;i++){const a=i*Math.PI/3+Math.PI/6;coins.push({id:id++,t:i%2?'b':'w',x:c0+Math.cos(a)*rIn,y:c0+Math.sin(a)*rIn,vx:0,vy:0,in:false})}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const t=(i%4===0||i%4===3)?'w':'b';coins.push({id:id++,t,x:c0+Math.cos(a)*rOut*(i%2?1.0:1.0),y:c0+Math.sin(a)*rOut,vx:0,vy:0,in:false})}
 // balance colours 9/9 : inner has 3w3b ; outer: i%4 in {0,3}->w (6) , {1,2}->b (6)
 const g={game:'carrom',coins,striker:{x:c0,y:W-150,vx:0,vy:0,in:false},turn:0,phase:'aim',pocketed:[[],[]],queen:{by:-1,covered:false,pending:false},winner:-1,foul:null,score:[0,0],shots:0};return g};
cr.baseY=p=>p===0?W-150:150;
cr.side=p=>p===0?'w':'b';
cr.minX=SR+POCK-8;cr.maxX=W-cr.minX;
cr.placeStriker=function(g,x){x=Math.max(cr.minX+40,Math.min(cr.maxX-40,x));g.striker.x=x;g.striker.y=cr.baseY(g.turn);g.striker.vx=g.striker.vy=0;g.striker.in=false;
 // nudge if overlapping a coin on the baseline (allowed only on free spots)
 return !g.coins.some(c=>!c.in&&Math.hypot(c.x-x,c.y-g.striker.y)<CR+SR)};
cr.shoot=function(g,angle,power){if(g.phase!=='aim')throw new Error('not aiming');const sp=Math.max(3,Math.min(32,power));g.striker.vx=Math.cos(angle)*sp;g.striker.vy=Math.sin(angle)*sp;g.phase='roll';g.shotPocketed=[];g.strikerIn=false;g.shots++};
function collide(a,b,ra,rb,ma,mb){const dx=b.x-a.x,dy=b.y-a.y;const d=Math.hypot(dx,dy),min=ra+rb;if(d>=min||d===0)return false;const nx=dx/d,ny=dy/d,ov=min-d;
 a.x-=nx*ov*mb/(ma+mb);a.y-=ny*ov*mb/(ma+mb);b.x+=nx*ov*ma/(ma+mb);b.y+=ny*ov*ma/(ma+mb);
 const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rv>0)return true;const j=-(1+.92)*rv/(1/ma+1/mb);a.vx-=j*nx/ma;a.vy-=j*ny/ma;b.vx+=j*nx/mb;b.vy+=j*ny/mb;return true}
// advance one physics tick; returns true while anything moves
cr.tick=function(g){const bodies=g.coins.filter(c=>!c.in);const S=g.striker;const all=S.in?bodies:bodies.concat([S]);let moving=false;
 for(const b of all){b.x+=b.vx;b.y+=b.vy;b.vx*=FR;b.vy*=FR;if(b.vx*b.vx+b.vy*b.vy<1.44){b.vx*=.93;b.vy*=.93}const r=b===S?SR:CR;
  if(b.x<r){b.x=r;b.vx=-b.vx*REST}else if(b.x>W-r){b.x=W-r;b.vx=-b.vx*REST}if(b.y<r){b.y=r;b.vy=-b.vy*REST}else if(b.y>W-r){b.y=W-r;b.vy=-b.vy*REST}
  if(Math.hypot(b.vx,b.vy)<STOP){b.vx=b.vy=0}else moving=true}
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];collide(a,b,a===S?SR:CR,b===S?SR:CR,a===S?2:1,b===S?2:1)}
 for(const b of all){for(const [px,py] of cr.pockets){if(Math.hypot(b.x-px,b.y-py)<POCK){b.in=true;b.vx=b.vy=0;if(b===S)g.strikerIn=true;else g.shotPocketed.push(b);break}}}
 return moving};
cr.settle=function(g){for(const c of g.coins){c.vx=c.vy=0}g.striker.vx=g.striker.vy=0};
cr.simulate=function(g,maxTicks){let n=0;while(cr.tick(g)&&n++<(maxTicks||1800));if(n>=(maxTicks||1800))cr.settle(g);return n};
cr.back=function(g,c){c.in=false;c.vx=c.vy=0;const cx=W/2,cy=W/2;let x=cx,y=cy,k=0;while(g.coins.some(o=>o!==c&&!o.in&&Math.hypot(o.x-x,o.y-y)<CR*2+1)&&k<60){k++;const a=k*2.4,r=k*5;x=cx+Math.cos(a)*r;y=cy+Math.sin(a)*r}c.x=x;c.y=y};
// resolve the shot after everything stopped. returns {again:bool,events:[]}
cr.resolve=function(g){const p=g.turn,q=1-p,me=cr.side(p),ev=[];const pk=g.shotPocketed.slice();g.phase='aim';const S=g.striker;
 const own=pk.filter(c=>c.t===me),opp=pk.filter(c=>c.t===cr.side(q)),queen=pk.find(c=>c.t==='q');
 if(g.strikerIn){// foul
  ev.push({t:'foul'});for(const c of pk){cr.back(g,c);}
  if(g.queen.pending&&g.queen.by===p){const qc=g.coins.find(c=>c.t==='q');if(qc&&qc.in){cr.back(g,qc);g.queen={by:-1,covered:false,pending:false}}}
  const mine=g.coins.filter(c=>c.in&&c.t===me);if(mine.length){cr.back(g,mine[mine.length-1]);ev.push({t:'penalty'})}
  g.pocketed[p]=g.coins.filter(c=>c.in&&c.t===me);g.pocketed[q]=g.coins.filter(c=>c.in&&c.t===cr.side(q));
  return cr.endTurn(g,ev)}
 let keep=false;
 if(queen){g.queen={by:p,covered:own.length>0,pending:own.length===0};if(own.length>0)ev.push({t:'queen',covered:true});else{ev.push({t:'queen',covered:false});keep=true}}
 else if(g.queen.pending&&g.queen.by===p){// was this the cover shot?
  if(own.length){g.queen.covered=true;g.queen.pending=false;ev.push({t:'queen-covered'})}else{const qc=g.coins.find(c=>c.t==='q');cr.back(g,qc);g.queen={by:-1,covered:false,pending:false};ev.push({t:'queen-lost'})}}
 if(own.length)keep=true;
 if(opp.length)ev.push({t:'gave',n:opp.length});
 if(opp.length&&!own.length)keep=false;
 // all own coins gone?
 const left=g.coins.filter(c=>!c.in&&c.t===me).length;
 if(left===0){const qc=g.coins.find(c=>c.t==='q');if(qc.in&&g.queen.covered){return cr.win(g,p,ev)}else if(!qc.in||g.queen.by!==p){// queen not owned: last coin returns
   const last=own[own.length-1];if(last){cr.back(g,last);ev.push({t:'last-back'})}}}
 // opponent finished by your pocketing of their coins? check
 const oppLeft=g.coins.filter(c=>!c.in&&c.t===cr.side(q)).length;if(oppLeft===0){const qc=g.coins.find(c=>c.t==='q');if(qc.in&&g.queen.covered)return cr.win(g,q,ev)}
 g.pocketed[p]=g.coins.filter(c=>c.in&&c.t===me);g.pocketed[q]=g.coins.filter(c=>c.in&&c.t===cr.side(q));
 if(keep&&g.phase==='aim'){g.shotKept=true;return {again:true,events:ev}}
 return cr.endTurn(g,ev)};
// shot limit: a board that cannot be finished (coins wedged, queen loops) ends after MAXSHOTS shots; most coins pocketed wins (+3 covered queen), tie -> the player who did not shoot last
cr.MAXSHOTS=160;
const _res=cr.resolve;cr.resolve=function(g){const r=_res(g);if(g.phase!=='over'&&(g.shots|0)>=cr.MAXSHOTS){const pts=[0,1].map(i=>g.coins.filter(c=>c.in&&c.t===cr.side(i)).length+(g.queen.by===i&&g.queen.covered?3:0));
 const w=pts[0]>pts[1]?0:pts[1]>pts[0]?1:g.turn;g.winner=w;g.phase='over';g.score[w]=Math.max(1,pts[w]-pts[1-w]);r.events.push({t:'limit'},{t:'win',p:w});r.again=false;r.win=true}return r};
cr.endTurn=function(g,ev){const p=g.turn;if(g.queen.pending&&g.queen.by===p){const qc=g.coins.find(c=>c.t==='q');if(qc.in){cr.back(g,qc);ev.push({t:'queen-lost'})}g.queen={by:-1,covered:false,pending:false}}
 g.turn=1-p;g.pocketed=[0,1].map(i=>g.coins.filter(c=>c.in&&c.t===cr.side(i)));return {again:false,events:ev}};
cr.win=function(g,p,ev){g.winner=p;g.phase='over';const q=1-p;const left=g.coins.filter(c=>!c.in&&c.t===cr.side(q)).length;g.score[p]=left+(g.queen.by===p&&g.queen.covered?3:0);ev.push({t:'win',p});return {again:false,events:ev,win:true}};
cr.ghost=function(c,pocket,rr){// striker centre position to send coin c into pocket
 const dx=pocket[0]-c.x,dy=pocket[1]-c.y,d=Math.hypot(dx,dy)||1;return [c.x-dx/d*(CR+rr),c.y-dy/d*(CR+rr)]};
// AI: try geometric candidates, test by simulation, pick best
cr.aiShot=function(g,skill){skill=skill==null?1:skill;const p=g.turn,me=cr.side(p),by=cr.baseY(p);const cands=[];const qOn=g.coins.some(c=>c.t==='q'&&!c.in),ownLeft=g.coins.filter(c=>!c.in&&c.t===me).length,lastOnly=qOn&&ownLeft===1&&!g.queen.pending;/* last coin would just come back: go for the queen first */
 const mine=g.coins.filter(c=>!c.in&&((c.t===me&&!lastOnly)||(c.t==='q'&&!g.queen.pending))),needQ=g.queen.pending&&g.queen.by===p;
 const xs=[];for(let x=cr.minX+60;x<=cr.maxX-60;x+=(cr.maxX-cr.minX-120)/8)xs.push(x);
 for(const c of mine){if(needQ&&c.t==='q')continue;for(const pk of cr.pockets){const gp=cr.ghost(c,pk,SR);for(const sx of xs){const ang=Math.atan2(gp[1]-by,gp[0]-sx);if(Math.sin(ang)*(p===0?-1:1)<=0.05)continue;
   // striker must not hit another coin first: rough line check
   const dist=Math.hypot(gp[0]-sx,gp[1]-by);const dpk=Math.hypot(pk[0]-c.x,pk[1]-c.y);cands.push({x:sx,ang,pow:Math.min(30,6+dist/55+dpk/70)})}}}
 if(!cands.length){for(let i=0;i<8;i++){const sx=xs[i];cands.push({x:sx,ang:(p===0?-1:1)*(Math.PI/2)+(Math.random()-.5)*.8,pow:14+Math.random()*8})}}
 // random subset for speed
 const pick=[];const tot=Math.min(cands.length,48);for(let i=0;i<tot;i++)pick.push(cands.splice(Math.floor(Math.random()*cands.length),1)[0]);
 let best=null,bs=-1e9;const t0=Date.now();for(const cd of pick){if(best&&Date.now()-t0>250)break;const h=cr.clone(g);if(!cr.placeStriker(h,cd.x))continue;const noise=(1-skill)*0.3;const ang=cd.ang+(Math.random()-.5)*noise;cr.shoot(h,ang,cd.pow);cr.simulate(h);
  const pk=h.shotPocketed;const own=pk.filter(c=>c.t===me).length,opp=pk.filter(c=>c.t===cr.side(1-p)).length,qn=pk.some(c=>c.t==='q');let sc=(lastOnly&&!qn?-own*6:own*10)-opp*8+(qn?(own?14:3):0)-(h.strikerIn?25:0)+Math.random()*1.5;
  if(sc>bs){bs=sc;best={x:cd.x,ang,pow:cd.pow}}}
 return best||{x:W/2,ang:(p===0?-1:1)*Math.PI/2,pow:15}};
cr.clone=function(g){return {game:'carrom',coins:g.coins.map(c=>Object.assign({},c)),striker:Object.assign({},g.striker),turn:g.turn,phase:g.phase,queen:Object.assign({},g.queen),pocketed:[[],[]],shotPocketed:[],strikerIn:false,winner:-1,score:[0,0]}};
M.carrom=cr;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.MG=window.MG||{}));
