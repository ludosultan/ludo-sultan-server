(function(root){
// ================= SNAKES & LADDERS =================
const SNL_JUMPS={4:14,9:31,21:42,28:84,51:67,72:91,80:99, 17:7,54:34,62:19,64:60,87:24,93:73,95:75,98:79};
// ---- 3.12 levels: more snakes + stricter rules as the level goes up ----
const SNL_LEVELS={
 easy:{n:'Easy',ladders:{4:25,13:46,27:53,33:49,42:63,50:69,62:81,74:92},snakes:{47:26,56:37,64:43,87:67,93:73,98:79},
  rules:{exact:false,start6:false,three6:'none',kick:0,six:true},coins:60},
 medium:{n:'Medium',ladders:{4:14,9:31,21:42,28:84,51:67,72:91,80:99},snakes:{17:7,49:11,54:34,62:19,64:60,87:24,93:73,95:75,98:79},
  rules:{exact:true,start6:false,three6:'lose',kick:0,six:true},coins:90},
 difficult:{n:'Difficult',ladders:{5:24,12:31,26:45,41:59,58:76,71:90},snakes:{16:6,33:14,38:19,47:28,49:11,56:34,62:18,64:43,74:53,87:24,93:73,98:60},
  rules:{exact:true,start6:true,three6:'lose',kick:0,six:true},coins:140},
 hard:{n:'Hard',ladders:{6:27,20:39,35:54,52:71,68:86},snakes:{15:3,22:2,29:9,37:17,44:21,48:11,55:33,59:23,63:28,69:47,76:38,82:57,88:32,92:51,96:42,99:12},
  rules:{exact:true,start6:true,three6:'back',kick:5,six:true},coins:220}};
const SNL_ORDER=['easy','medium','difficult','hard'];
function snlJumpsOf(level){const L=SNL_LEVELS[level];if(!L)return SNL_JUMPS;return Object.assign({},L.ladders,L.snakes)}
function snlRulesText(level){const L=SNL_LEVELS[level],r=L.rules,o=[];
 o.push(Object.keys(L.snakes).length+' snakes · '+Object.keys(L.ladders).length+' ladders');
 o.push(r.exact?'Exact roll needed to reach 100 (too high = stay)':'Too high a roll at the end bounces you back');
 if(r.start6)o.push('Roll a 6 to enter the board');
 o.push(r.three6==='lose'?'Three 6s in a row: turn lost':r.three6==='back'?'Three 6s in a row: turn lost and you go back to where the turn began':'A 6 gives an extra turn');
 if(r.three6!=='none')o.push('A 6 gives an extra turn');
 if(r.kick)o.push('Land on a rival: they slide back '+r.kick+' squares');return o}
function snlNew(n,level){if(!SNL_LEVELS[level])return {n,pos:Array(n).fill(0),turn:0,winner:-1,rank:[],level:'classic',rules:{exact:false,start6:false,three6:'none',kick:0,six:true},jumps:Object.assign({},SNL_JUMPS),sixes:Array(n).fill(0),turnStart:Array(n).fill(0)};const L=SNL_LEVELS[level];
 return {n,pos:Array(n).fill(0),turn:0,winner:-1,rank:[],level,rules:Object.assign({},L.rules),jumps:snlJumpsOf(level),sixes:Array(n).fill(0),turnStart:Array(n).fill(0)}}
// returns {pi,from,land,to,bounce,jump,extra,win,stay,forfeit,kick:[[pi,from,to]]}
function snlMove(g,d){const pi=g.turn,from=g.pos[pi],R=g.rules||{exact:false,start6:false,three6:'none',kick:0};const J=g.jumps||SNL_JUMPS;
 if(g.sixes==null){g.sixes=Array(g.n).fill(0);g.turnStart=Array(g.n).fill(0)}
 const r={pi,from,land:from,to:from,bounce:false,jump:null,win:false,extra:false,stay:false,forfeit:false,kick:[],d};
 if(!(g.sixes[pi]>0))g.turnStart[pi]=from;
 g.sixes[pi]=d===6?g.sixes[pi]+1:0;
 if(d===6&&g.sixes[pi]>=3&&R.three6!=='none'){g.sixes[pi]=0;r.forfeit=true;if(R.three6==='back'){g.pos[pi]=g.turnStart[pi];r.to=r.land=g.pos[pi]}snlNext(g);return r}
 if(from===0&&R.start6){if(d!==6){r.stay=true;snlNext(g);g.sixes[pi]=0;return r}r.land=1;r.to=1;g.pos[pi]=1;r.extra=true;r.enter=true;return r}
 let land=from+d,bounce=false;
 if(land>100){if(R.exact){r.stay=true;r.land=from;r.to=from;if(d!==6)snlNext(g);else r.extra=true;if(d!==6)g.sixes[pi]=0;return r}land=100-(land-100);bounce=true}
 const to=J[land]!=null?J[land]:land;g.pos[pi]=to;r.land=land;r.to=to;r.bounce=bounce;r.jump=to!==land?(to>land?'ladder':'snake'):null;r.win=to===100;r.extra=d===6&&to!==100;
 if(R.kick&&!r.win&&to>1)for(let k=0;k<g.n;k++)if(k!==pi&&g.pos[k]===to&&!g.rank.includes(k)){const nb=Math.max(1,to-R.kick);r.kick.push([k,to,nb]);g.pos[k]=nb}
 if(r.win){g.rank.push(pi);if(g.winner<0)g.winner=pi}
 if(!r.extra||r.win){g.sixes[pi]=0;snlNext(g)}return r}
function snlNext(g){for(let k=1;k<=g.n;k++){const j=(g.turn+k)%g.n;if(!g.rank.includes(j)){g.turn=j;return}}g.turn=-1}
function snlOver(g){return g.winner>=0}
function snlCell(p){// 1..100 -> [row 0 top, col]
 if(p<1)return null;const i=p-1,r=Math.floor(i/10),c=r%2?9-i%10:i%10;return [9-r,c]}
// ================= CHESS =================
// board: 64 array, index = rank*8+file, rank 0 = white back rank. pieces 'P','N','B','R','Q','K' white, lowercase black, '' empty
const VAL={p:100,n:320,b:330,r:500,q:900,k:0};
function chNew(){const b=Array(64).fill('');const back='RNBQKBNR';for(let f=0;f<8;f++){b[f]=back[f];b[8+f]='P';b[48+f]='p';b[56+f]=back[f].toLowerCase()}
 return {b,turn:'w',castle:{K:1,Q:1,k:1,q:1},ep:-1,half:0,full:1,hist:[],status:'play'}}
function chFromFEN(fen){const [pl,t,c,e,h,f]=fen.split(' ');const b=Array(64).fill('');let r=7,fi=0;for(const ch of pl){if(ch==='/'){r--;fi=0}else if(/\d/.test(ch))fi+=+ch;else{b[r*8+fi]=ch;fi++}}
 const ep=e&&e!=='-'?(+e[1]-1)*8+(e.charCodeAt(0)-97):-1;return {b,turn:t,castle:{K:+c.includes('K'),Q:+c.includes('Q'),k:+c.includes('k'),q:+c.includes('q')},ep,half:+h||0,full:+f||1,hist:[],status:'play'}}
const isW=p=>p&&p===p.toUpperCase(),col=p=>p?(isW(p)?'w':'b'):null;
const KN=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],KG=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function attacked(b,sq,by){const r=sq>>3,f=sq&7;const at=(rr,ff)=>rr>=0&&rr<8&&ff>=0&&ff<8?b[rr*8+ff]:null;
 const pd=by==='w'?-1:1;for(const df of [-1,1]){const p=at(r+pd,f+df);if(p&&col(p)===by&&p.toLowerCase()==='p')return true}
 for(const [dr,df] of KN){const p=at(r+dr,f+df);if(p&&col(p)===by&&p.toLowerCase()==='n')return true}
 for(const [dr,df] of KG){const p=at(r+dr,f+df);if(p&&col(p)===by&&p.toLowerCase()==='k')return true}
 for(const [dr,df] of KG){const diag=dr&&df;let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){const p=b[rr*8+ff];if(p){if(col(p)===by){const t=p.toLowerCase();if(t==='q'||(diag&&t==='b')||(!diag&&t==='r'))return true}break}rr+=dr;ff+=df}}
 return false}
function kingSq(b,c){const k=c==='w'?'K':'k';return b.indexOf(k)}
function inCheck(g,c){c=c||g.turn;return attacked(g.b,kingSq(g.b,c),c==='w'?'b':'w')}
function pseudo(g){const b=g.b,c=g.turn,ms=[],opp=c==='w'?'b':'w';
 for(let s=0;s<64;s++){const p=b[s];if(!p||col(p)!==c)continue;const t=p.toLowerCase(),r=s>>3,f=s&7;
  const add=(to,x)=>ms.push(Object.assign({from:s,to,piece:p,cap:b[to]},x||{}));
  if(t==='p'){const dir=c==='w'?1:-1,start=c==='w'?1:6,last=c==='w'?7:0;const one=s+dir*8;
   const push=(to,x)=>{if((to>>3)===last)for(const pr of 'qrbn')add(to,Object.assign({promo:c==='w'?pr.toUpperCase():pr},x||{}));else add(to,x)};
   if(r+dir>=0&&r+dir<8&&!b[one]){push(one);if(r===start&&!b[one+dir*8])add(one+dir*8,{double:true})}
   for(const df of [-1,1]){const ff=f+df,rr=r+dir;if(ff<0||ff>7||rr<0||rr>7)continue;const to=rr*8+ff;if(b[to]&&col(b[to])===opp)push(to);else if(to===g.ep)add(to,{epcap:true,cap:c==='w'?'p':'P'})}}
  else if(t==='n'||t==='k'){for(const [dr,df] of (t==='n'?KN:KG)){const rr=r+dr,ff=f+df;if(rr<0||rr>7||ff<0||ff>7)continue;const to=rr*8+ff;if(!b[to]||col(b[to])===opp)add(to)}
   if(t==='k'){const rk=c==='w'?0:56,K=c==='w'?'K':'k',Q=c==='w'?'Q':'q';
    if(s===rk+4&&g.castle[K]&&!b[rk+5]&&!b[rk+6]&&b[rk+7]===(c==='w'?'R':'r')&&!attacked(b,rk+4,opp)&&!attacked(b,rk+5,opp)&&!attacked(b,rk+6,opp))add(rk+6,{castle:'K'});
    if(s===rk+4&&g.castle[Q]&&!b[rk+3]&&!b[rk+2]&&!b[rk+1]&&b[rk]===(c==='w'?'R':'r')&&!attacked(b,rk+4,opp)&&!attacked(b,rk+3,opp)&&!attacked(b,rk+2,opp))add(rk+2,{castle:'Q'})}}
  else{const dirs=t==='b'?KG.slice(4):t==='r'?KG.slice(0,4):KG;for(const [dr,df] of dirs){let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){const to=rr*8+ff;if(b[to]){if(col(b[to])===opp)add(to);break}add(to);rr+=dr;ff+=df}}}}
 return ms}
function make(g,m){const b=g.b;const u={m,castle:Object.assign({},g.castle),ep:g.ep,half:g.half,capP:b[m.to]};
 b[m.to]=m.promo||m.piece;b[m.from]='';if(m.epcap){const cs=m.to+(g.turn==='w'?-8:8);u.epSq=cs;u.epP=b[cs];b[cs]=''}
 if(m.castle){const rk=g.turn==='w'?0:56;if(m.castle==='K'){b[rk+5]=b[rk+7];b[rk+7]=''}else{b[rk+3]=b[rk];b[rk]=''}}
 const t=m.piece.toLowerCase();if(t==='k'){if(g.turn==='w'){g.castle.K=g.castle.Q=0}else{g.castle.k=g.castle.q=0}}
 for(const [sq,k] of [[0,'Q'],[7,'K'],[56,'q'],[63,'k']])if(m.from===sq||m.to===sq)g.castle[k]=0;
 g.ep=m.double?(m.from+m.to)/2:-1;g.half=(t==='p'||m.cap)?0:g.half+1;if(g.turn==='b')g.full++;g.turn=g.turn==='w'?'b':'w';g.hist.push(u)}
function unmake(g){const u=g.hist.pop(),m=u.m,b=g.b;g.turn=g.turn==='w'?'b':'w';if(g.turn==='b')g.full--;
 b[m.from]=m.piece;b[m.to]=u.capP;if(m.epcap)b[u.epSq]=u.epP;
 if(m.castle){const rk=g.turn==='w'?0:56;if(m.castle==='K'){b[rk+7]=b[rk+5];b[rk+5]=''}else{b[rk]=b[rk+3];b[rk+3]=''}}
 g.castle=u.castle;g.ep=u.ep;g.half=u.half}
function legalMoves(g){const c=g.turn;return pseudo(g).filter(m=>{make(g,m);const ok=!attacked(g.b,kingSq(g.b,c),g.turn);unmake(g);return ok})}
function key(g){return g.b.join(',')+g.turn+JSON.stringify(g.castle)+g.ep}
function status(g){const lm=legalMoves(g);if(!lm.length)return inCheck(g)?'mate':'stalemate';if(g.half>=100)return 'draw50';
 const pcs=g.b.filter(Boolean).map(p=>p.toLowerCase()).sort().join('');if(pcs==='kk'||pcs==='bkk'||pcs==='kkn')return 'material';return inCheck(g)?'check':'play'}
function perft(g,d){if(!d)return 1;let n=0;for(const m of legalMoves(g)){make(g,m);n+=perft(g,d-1);unmake(g)}return n}
// evaluation with piece-square tables (white perspective)
const PST={p:[0,0,0,0,0,0,0,0,5,10,10,-20,-20,10,10,5,5,-5,-10,0,0,-10,-5,5,0,0,0,20,20,0,0,0,5,5,10,25,25,10,5,5,10,10,20,30,30,20,10,10,50,50,50,50,50,50,50,50,0,0,0,0,0,0,0,0],
 n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,5,5,0,-20,-40,-30,5,10,15,15,10,5,-30,-30,0,15,20,20,15,0,-30,-30,5,15,20,20,15,5,-30,-30,0,10,15,15,10,0,-30,-40,-20,0,0,0,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
 b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,5,0,0,0,0,5,-10,-10,10,10,10,10,10,10,-10,-10,0,10,10,10,10,0,-10,-10,5,5,10,10,5,5,-10,-10,0,5,10,10,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-10,-10,-10,-10,-20],
 r:[0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0],
 q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,5,0,0,0,0,-10,-10,5,5,5,5,5,0,-10,0,0,5,5,5,5,0,-5,-5,0,5,5,5,5,0,-5,-10,0,5,5,5,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
 k:[20,30,10,0,0,10,30,20,20,20,0,0,0,0,20,20,-10,-20,-20,-20,-20,-20,-20,-10,-20,-30,-30,-40,-40,-30,-30,-20,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30]};
function evalB(b){let s=0;for(let i=0;i<64;i++){const p=b[i];if(!p)continue;const t=p.toLowerCase();if(isW(p))s+=VAL[t]+PST[t][i];else s-=VAL[t]+PST[t][(7-(i>>3))*8+(i&7)]}return s}
function order(ms){return ms.sort((a,b)=>((b.cap?VAL[b.cap.toLowerCase()]*10-VAL[b.piece.toLowerCase()]:0)+(b.promo?800:0))-((a.cap?VAL[a.cap.toLowerCase()]*10-VAL[a.piece.toLowerCase()]:0)+(a.promo?800:0)))}
function search(g,d,al,be,ply,ctx){if(++ctx.n>ctx.max)ctx.stop=true;const ms=legalMoves(g);if(!ms.length)return inCheck(g)?-100000+ply:0;
 if(d<=0)return quies(g,al,be,4,ctx);order(ms);for(const m of ms){make(g,m);const v=-search(g,d-1,-be,-al,ply+1,ctx);unmake(g);if(ctx.stop)return al;if(v>=be)return be;if(v>al)al=v}return al}
function quies(g,al,be,d,ctx){ctx.n++;const sp=(g.turn==='w'?1:-1)*evalB(g.b);if(sp>=be)return be;if(sp>al)al=sp;if(!d)return al;
 const ms=order(pseudo(g).filter(m=>m.cap||m.promo));for(const m of ms){const c=g.turn;make(g,m);if(attacked(g.b,kingSq(g.b,c),g.turn)){unmake(g);continue}const v=-quies(g,-be,-al,d-1,ctx);unmake(g);if(v>=be)return be;if(v>al)al=v}return al}
function aiMove(g,level){const depth=level||3;const ms=order(legalMoves(g).sort(()=>Math.random()-.5));if(!ms.length)return null;let best=ms[0];
 for(let d=1;d<=depth;d++){const ctx={n:0,max:d<3?1e9:60000,stop:false};let bv=-1e9,bm=null;for(const m of ms){make(g,m);const v=-search(g,d-1,-1e9,-bv,1,ctx);unmake(g);if(ctx.stop)break;if(v>bv){bv=v;bm=m}}
  if(ctx.stop&&d>1)break;if(bm){best=bm;ms.splice(ms.indexOf(bm),1);ms.unshift(bm)}}
 return best}
function sqName(s){return 'abcdefgh'[s&7]+((s>>3)+1)}
const API={SNL_JUMPS,SNL_LEVELS,SNL_ORDER,snlJumpsOf,snlRulesText,snlNew,snlMove,snlOver,snlCell,chNew,chFromFEN,legalMoves,make,unmake,inCheck,status,perft,aiMove,evalB,sqName,col};
if(typeof module!=='undefined')module.exports=API;else root.Games=API})(this);
