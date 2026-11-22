// 3.15.6 profile photos + Photo to cartoon.
//  POST /avatar            {pid,key,img}   device key check, webp or jpeg, max 30 KB, 10 uploads per day. -> {ok,ver,url}
//  POST /avatar/delete     {pid,key}       removes the player's photo
//  GET  /avatar/<FID>.webp                 the photo (404 when none or hidden), cached by ?v=<ver>
//  POST /avatar/report     {pid,key,fid,why} one report per player per photo; hidden by itself after AV_AUTOHIDE (5) reports
//  POST /avatar/toon/status {pid,key}      -> {configured, nextAt}
//  POST /avatar/toon       {pid,key,consent,photo} one cartoon per player per 30 days (server side), photo kept in memory only
//  GET  /avatar/toon/<job>                 -> {status, image}
//  admin: GET /admin/api/avatars (reported or hidden), POST /admin/api/avatars/hide {fid,hidden}
// Storage: Postgres table ls_avatars when DATABASE_URL is set, else a JSON file (AV_FILE).
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const store=require('./store.js');
const TBL=/^[a-z_]{1,40}$/.test(process.env.AV_TABLE||'')?process.env.AV_TABLE:'ls_avatars';
const FILE=process.env.AV_FILE||path.join(__dirname,'data','avatars.json');
const MAXB=30*1024,DAY_UP=+process.env.AV_DAY_UPLOADS||10,TOON_DAYS=+process.env.AV_TOON_DAYS||30,AUTOHIDE=+process.env.AV_AUTOHIDE||5;
const FIDRE=/^[0-9A-F]{6}$/;
module.exports=function(ctx){const {fidOf,LO,GEN}=ctx;
 const M=new Map();// fid -> {fid,pid,mime,ver,hidden,reports:[{by,t,why}],toonAt,img(Buffer|null|undefined=not loaded)}
 const cache=[];// LRU of fids whose img is in memory (pg mode)
 let ready=null;const jobs=new Map(),upDay=new Map();
 function load(){if(ready)return ready;ready=(async()=>{
  if(store.pg){await store.query(`CREATE TABLE IF NOT EXISTS ${TBL}(fid text PRIMARY KEY, pid text NOT NULL, img bytea, mime text, ver int NOT NULL DEFAULT 0, hidden text, reports jsonb NOT NULL DEFAULT '[]', toon_at bigint, updated_at timestamptz NOT NULL DEFAULT now())`);
   const {rows}=await store.query(`SELECT fid,pid,mime,ver,hidden,reports,toon_at,(img IS NOT NULL) AS has FROM ${TBL}`);
   rows.forEach(r=>M.set(r.fid,{fid:r.fid,pid:r.pid,mime:r.mime,ver:r.ver|0,hidden:r.hidden||null,reports:Array.isArray(r.reports)?r.reports:[],toonAt:r.toon_at?+r.toon_at:0,has:!!r.has}))}
  else{try{JSON.parse(fs.readFileSync(FILE,'utf8')).forEach(r=>{r.img=r.img?Buffer.from(r.img,'base64'):null;r.has=!!r.img;M.set(r.fid,r)})}catch(e){}}})();
  ready.catch(e=>{console.error('avatars load',e.message);ready=null});return ready}
 let ft=null;function saveFile(){clearTimeout(ft);ft=setTimeout(()=>{try{fs.mkdirSync(path.dirname(FILE),{recursive:true});
  fs.writeFileSync(FILE+'.tmp',JSON.stringify([...M.values()].map(r=>({fid:r.fid,pid:r.pid,mime:r.mime,ver:r.ver,hidden:r.hidden,reports:r.reports,toonAt:r.toonAt,img:r.img?r.img.toString('base64'):null}))));fs.renameSync(FILE+'.tmp',FILE)}catch(e){console.error('avatars file',e.message)}},100)}
 async function put(r,withImg){if(!store.pg)return saveFile();
  if(withImg)await store.query(`INSERT INTO ${TBL}(fid,pid,img,mime,ver,hidden,reports,toon_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now()) ON CONFLICT(fid) DO UPDATE SET pid=EXCLUDED.pid,img=EXCLUDED.img,mime=EXCLUDED.mime,ver=EXCLUDED.ver,hidden=EXCLUDED.hidden,reports=EXCLUDED.reports,toon_at=EXCLUDED.toon_at,updated_at=now()`,[r.fid,r.pid,r.img||null,r.mime||null,r.ver|0,r.hidden||null,JSON.stringify(r.reports||[]),r.toonAt||null]);
  else await store.query(`INSERT INTO ${TBL}(fid,pid,ver,hidden,reports,toon_at,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,now()) ON CONFLICT(fid) DO UPDATE SET hidden=EXCLUDED.hidden,reports=EXCLUDED.reports,toon_at=EXCLUDED.toon_at,updated_at=now()`,[r.fid,r.pid,r.ver|0,r.hidden||null,JSON.stringify(r.reports||[]),r.toonAt||null])}
 async function img(r){if(!r||!r.has)return null;if(r.img)return r.img;if(!store.pg)return null;
  const {rows}=await store.query(`SELECT img FROM ${TBL} WHERE fid=$1`,[r.fid]);r.img=rows[0]&&rows[0].img||null;
  cache.push(r.fid);while(cache.length>300){const o=M.get(cache.shift());if(o&&!cache.includes(o.fid))o.img=undefined}return r.img}
 function row(pid){const fid=fidOf(pid);let r=M.get(fid);if(!r){r={fid,pid,mime:null,ver:0,hidden:null,reports:[],toonAt:0,has:false,img:null};M.set(fid,r)}r.pid=pid;return r}
 // image check: data URI, real webp or jpeg bytes, size limit
 function decode(s){const m=/^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(s||''));if(!m)return null;const b=Buffer.from(m[2],'base64');if(!b.length||b.length>MAXB)return null;
  const webp=b.length>12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP',jpg=b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF;
  if(m[1]==='webp'&&!webp||m[1]==='jpeg'&&!jpg)return null;return {buf:b,mime:'image/'+m[1]}}
 function J(res,c,o,h){res.writeHead(c,Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},h||{}));res.end(JSON.stringify(o))}
 function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
 function body(req,max){return new Promise(ok=>{let b=[],n=0,big=false;req.on('data',d=>{n+=d.length;if(n>max){big=true;req.destroy();ok(null)}else b.push(d)});req.on('end',()=>{if(big)return;try{ok(JSON.parse(Buffer.concat(b).toString()||'{}'))}catch(e){ok(null)}});req.on('error',()=>ok(null))})}
 const authed=m=>{const pid=String(m&&m.pid||'').slice(0,64);const a=LO.authDev({pid,key:String(m&&m.key||'')});return a?pid:null};
 const url=r=>'/avatar/'+r.fid+'.webp?v='+r.ver;
 const nextToon=r=>r&&r.toonAt?r.toonAt+TOON_DAYS*864e5:0;
 // avx sent in hello: a painted avatar key or ph:<ver> (own photo)
 function clean(x){x=String(x||'');return /^(ph:\d{1,6}|[a-z0-9_]{1,24})$/.test(x)?x:undefined}
 async function handle(req,res,u){
  if(u.startsWith('/admin/api/avatars'))return admin(req,res,u);
  cors(res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  await load();
  const g=/^\/avatar\/([0-9A-Fa-f]{6})\.(webp|jpg)$/.exec(u);
  if(g&&req.method==='GET'){const r=M.get(g[1].toUpperCase());const b=r&&!r.hidden?await img(r):null;
   if(!b){res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'public, max-age=120','Access-Control-Allow-Origin':'*'});return res.end('none')}
   const tag='"'+r.fid+'-'+r.ver+'"';if(req.headers['if-none-match']===tag){res.writeHead(304,{ETag:tag});return res.end()}
   const v=/[?&]v=\d+/.test(req.url||'');
   res.writeHead(200,{'Content-Type':r.mime||'image/webp','Content-Length':b.length,ETag:tag,'Cache-Control':v?'public, max-age=2592000, immutable':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(b)}
  if(u.startsWith('/avatar/toon/')&&req.method==='GET'){const j=jobs.get(u.slice(13));if(!j)return J(res,404,{error:'unknown job'});
   const o={job:j.id,status:j.status,image:j.status==='done'?j.image:undefined,nextAt:j.nextAt};if(j.status==='done')j.fetched=1;return J(res,200,o)}
  if(req.method!=='POST')return J(res,405,{error:'method'});
  if(LO.limited(req,'avatar',30,60e3))return J(res,429,{error:'slow down'});
  const m=await body(req,u==='/avatar/toon'?4e6:64e3);if(!m)return J(res,400,{error:'bad json'});
  if(u==='/avatar/toon/status'){const pid=authed(m);const r=pid&&M.get(fidOf(pid));const n=nextToon(r);return J(res,200,{configured:GEN.configured(),nextAt:n>Date.now()?n:0,days:TOON_DAYS})}
  if(u==='/avatar/toon'){if(!m.consent)return J(res,400,{error:'consent required'});
   if(!(typeof m.photo==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(m.photo)&&m.photo.length<3e6))return J(res,400,{error:'bad photo'});
   if(!GEN.configured())return J(res,200,{job:null,status:'unconfigured'});
   const pid=authed(m);if(!pid)return J(res,403,{error:'auth'});if(LO.banned&&LO.banned(pid))return J(res,403,{error:'banned'});
   for(const j of jobs.values())if(j.pid===pid&&j.status==='processing')return J(res,202,{job:j.id,status:'processing'});
   const r=row(pid);const n=nextToon(r);if(n>Date.now())return J(res,429,{error:'limit',nextAt:n,days:TOON_DAYS});
   const prev=r.toonAt||0;r.toonAt=Date.now();await put(r,false);
   const id=crypto.randomUUID();const job={id,pid,status:'processing',created:Date.now(),nextAt:nextToon(r)};jobs.set(id,job);
   GEN.avatar(m.photo).then(out=>{job.image=out;job.status='done'}).catch(e=>{job.status='failed';job.nextAt=0;r.toonAt=prev;put(r,false).catch(()=>{});console.error('[avatar toon] failed',String(e.message||e).slice(0,160))});
   return J(res,202,{job:id,status:'processing'})}
  const pid=authed(m);if(!pid)return J(res,403,{error:'auth'});
  if(u==='/avatar'){if(LO.banned&&LO.banned(pid))return J(res,403,{error:'banned'});const d=decode(m.img);if(!d)return J(res,400,{error:'bad image',max:MAXB});
   const r=row(pid);if(r.hidden)return J(res,403,{error:'hidden'});
   const dk=pid+'|'+new Date().toISOString().slice(0,10),dn=upDay.get(dk)|0;if(dn>=DAY_UP)return J(res,429,{error:'daily limit'});upDay.set(dk,dn+1);
   r.img=d.buf;r.mime=d.mime;r.has=true;r.ver=(r.ver|0)+1;r.reports=[];await put(r,true);return J(res,200,{ok:true,ver:r.ver,url:url(r)})}
  if(u==='/avatar/delete'){const r=M.get(fidOf(pid));if(r&&r.has){r.img=null;r.has=false;r.mime=null;r.reports=[];await put(r,true)}return J(res,200,{ok:true})}
  if(u==='/avatar/report'){const fid=String(m.fid||'').toUpperCase();const r=M.get(fid);const me=fidOf(pid);if(!FIDRE.test(fid)||!r||!r.has)return J(res,404,{error:'no photo'});if(fid===me)return J(res,400,{error:'self'});
   if(!r.reports.some(x=>x.by===me)){r.reports.push({by:me,t:Date.now(),why:String(m.why||'').replace(/[<>]/g,'').slice(0,60),ver:r.ver});if(r.reports.length>=AUTOHIDE&&!r.hidden)r.hidden='auto';await put(r,false)}
   return J(res,200,{ok:true})}
  return J(res,404,{error:'unknown'})}
 async function admin(req,res,u){const a=req.lsAdmin;if(!a)return J(res,401,{error:'login'});await load();
  if(u==='/admin/api/avatars'&&req.method==='GET'){const list=[...M.values()].filter(r=>r.has&&(r.reports.length||r.hidden)).sort((x,y)=>(y.reports.length-x.reports.length)||((y.reports.slice(-1)[0]||{}).t|0)-((x.reports.slice(-1)[0]||{}).t|0)).slice(0,200)
    .map(r=>({fid:r.fid,ver:r.ver,hidden:r.hidden,reports:r.reports.length,last:(r.reports.slice(-1)[0]||{}).t||0,why:[...new Set(r.reports.map(x=>x.why).filter(Boolean))].slice(0,5),img:r.img?'data:'+(r.mime||'image/webp')+';base64,'+r.img.toString('base64'):null}));
   for(const x of list)if(!x.img){const r=M.get(x.fid);const b=await img(r);if(b)x.img='data:'+(r.mime||'image/webp')+';base64,'+b.toString('base64')}
   return J(res,200,{list})}
  if(u==='/admin/api/avatars/hide'&&req.method==='POST'){if(req.headers['x-ls-admin']!=='1')return J(res,403,{error:'csrf'});const m=await body(req,4096);const fid=String(m&&m.fid||'').toUpperCase();const r=M.get(fid);if(!r)return J(res,404,{error:'unknown'});
   r.hidden=m.hidden?'admin':null;if(!m.hidden)r.reports=[];await put(r,false);try{LO.audit(a.user,m.hidden?'avatar-hide':'avatar-show',fid,(m.hidden?'Hid':'Showed')+' profile photo of '+fid)}catch(e){}return J(res,200,{ok:true,hidden:r.hidden})}
  return J(res,404,{error:'unknown'})}
 // account deleted: the photo and its row go too
 async function purge(pid){await load();const fid=fidOf(pid);const r=M.get(fid);if(!r)return;M.delete(fid);if(store.pg)await store.query(`DELETE FROM ${TBL} WHERE fid=$1`,[fid]);else saveFile()}
 setInterval(()=>{const t=Date.now();for(const [k,j] of jobs)if(t-j.created>30*60e3)jobs.delete(k);const d=new Date().toISOString().slice(0,10);for(const k of upDay.keys())if(!k.endsWith(d))upDay.delete(k)},5*60e3).unref();
 return {handle,clean,purge,load,_M:M,configured:()=>GEN.configured()}};
