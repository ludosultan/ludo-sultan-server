// Per-game leaderboards (Ludo, Snakes & Ladders, Chess and each mini game). Pure helpers, used by app.js and test-lbg.js.
const GKEYS=['ludo','snl','chess','callbreak','tarneeb','baloot','jackaroo','domino','okey','tavla','carrom'];
const cap=(n,m)=>Math.max(0,Math.min(m,n|0));
// client sends {key:{g,w}}; keep only known games, ints, w<=g
function clean(gm){const out={};if(!gm||typeof gm!=='object')return out;for(const k of GKEYS){const x=gm[k];if(!x||typeof x!=='object')continue;const g=cap(x.g,1e6),w=Math.min(g,cap(x.w,1e6));if(g>0)out[k]={g,w}}return out}
const score=x=>x.w*3+x.g;                 // 3 points per win, 1 per game played
// entries: [{pid,fid,name,av,cc,city,gm}] -> sorted rows of one game
function board(entries,game){return entries.filter(e=>e&&e.gm&&e.gm[game]&&e.gm[game].g>0).map(e=>({e,x:e.gm[game]})).sort((a,b)=>score(b.x)-score(a.x)||b.x.w-a.x.w||a.x.g-b.x.g||String(a.e.fid).localeCompare(String(b.e.fid)))}
const row=(r,i)=>({rank:i+1,fid:r.e.fid||'',name:r.e.name,av:r.e.av,cc:r.e.cc||'',g:r.x.g,w:r.x.w,pts:score(r.x)});
function top(entries,game,pid,n){const b=board(entries,game);const i=b.findIndex(r=>r.e.pid===pid);return {rows:b.slice(0,n||100).map(row),rank:i<0?0:i+1,total:b.length,me:i<0?null:row(b[i],i)}}
function ranksFor(entries,pid){const out={};for(const k of GKEYS){const b=board(entries,k);const i=b.findIndex(r=>r.e.pid===pid);if(i>=0)out[k]={rank:i+1,total:b.length,g:b[i].x.g,w:b[i].x.w}}return out}
module.exports={GKEYS,clean,score,board,top,ranksFor};
