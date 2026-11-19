// Make Your Own Emojis endpoint: unconfigured -> 'unconfigured' (app shows Coming soon, no charge); mock backend -> job done with emojis;
// device key required; one running job per player; 3 jobs per day.
const {spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');const sl=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0,bad=0;const T=(c,m)=>{if(c){ok++;console.log('ok',m)}else{bad++;console.log('FAIL',m)}};
const PH='data:image/jpeg;base64,'+Buffer.from('fakejpeg').toString('base64');
async function run(port,extra,fn){const D=fs.mkdtempSync(path.join(os.tmpdir(),'emo'));const env=Object.assign({},process.env,{PORT:String(port),DATA_FILE:D+'/s.json',TOUR_FILE:D+'/t.json',EVENTS_FILE:D+'/e.json',LB_FILE:D+'/lb.json',ACC_FILE:D+'/a.json',LO_FILE:D+'/lo.json',LOP_FILE:D+'/lop.json',LO_DATA_DIR:D,WAL_FILE:D+'/w.json',EV3_FILE:D+'/ev3.json',EV3_AUTOIMPORT:'0'},extra);
 delete env.DATABASE_URL;delete env.XAI_API_KEY;delete env.EMOJI_GEN_URL;delete env.EMOJI_GEN_KEY;if(!extra.EMOJI_GEN_MOCK)delete env.EMOJI_GEN_MOCK;
 const s=spawn(process.execPath,[path.join(__dirname,'index.js')],{env,stdio:'ignore'});const B='http://127.0.0.1:'+port;
 for(let i=0;i<40;i++){try{if((await fetch(B+'/health')).ok)break}catch(e){}await sl(200)}
 try{await fn(B)}finally{s.kill();fs.rmSync(D,{recursive:true,force:true})}}
const post=(B,b)=>fetch(B+'/custom-emoji',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({s:r.status,j:await r.json().catch(()=>null)}));
(async()=>{
 await run(18791,{},async B=>{const st=await (await fetch(B+'/custom-emoji/status')).json();T(st.configured===false,'status: not configured');
  const r=await post(B,{pid:'player0001',key:'x',consent:true,photos:[PH]});T(r.j&&r.j.status==='unconfigured'&&!r.j.job,'unconfigured -> no job (app keeps Coming soon, no charge)');
  T((await post(B,{pid:'player0001',consent:false,photos:[PH]})).s===400,'consent required')});
 await run(18792,{EMOJI_GEN_MOCK:'1'},async B=>{const h=await (await fetch(B+'/api/hello',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pid:'player0001',ver:'3.15.1'})})).json();
  T((await post(B,{pid:'player0001',key:'wrong',consent:true,photos:[PH]})).s===403,'wrong device key -> 403');
  T((await post(B,{pid:'player0001',key:h.key,consent:true,photos:['http://x']})).s===400,'bad photo rejected');
  const r=await post(B,{pid:'player0001',key:h.key,consent:true,photos:[PH,PH,PH,PH,PH]});T(r.s===202&&r.j.job,'job accepted');
  let d;for(let i=0;i<20;i++){d=await (await fetch(B+'/custom-emoji/'+r.j.job)).json();if(d.status!=='processing')break;await sl(100)}
  T(d.status==='done'&&d.emojis.length>=4&&d.emojis.length<=8,'job done with '+(d.emojis||[]).length+' emojis');
  await post(B,{pid:'player0001',key:h.key,consent:true,photos:[PH]});await sl(100);await post(B,{pid:'player0001',key:h.key,consent:true,photos:[PH]});await sl(100);
  T((await post(B,{pid:'player0001',key:h.key,consent:true,photos:[PH]})).s===429,'4th job in a day -> 429')});
 console.log(bad?'test-emoji: FAILED '+bad:'test-emoji: ALL PASSED ('+ok+' checks)');process.exit(bad?1:0)})();
