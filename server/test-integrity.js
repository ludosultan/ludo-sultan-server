// Run: node server/test-integrity.js  (Play Integrity: verdict rules, OAuth + decode with mocked Google, live-ops endpoint/gate/admin; no network)
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert'),crypto=require('crypto'),http=require('http');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-'));
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const SA={type:'service_account',client_email:'pi-test@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'};
delete process.env.DATABASE_URL;
Object.assign(process.env,{LO_FILE:path.join(dir,'lo.json'),LOP_FILE:path.join(dir,'lop.json'),LO_DATA_DIR:dir,ADMIN_USER:'khawar',ADMIN_PASS_HASH:(()=>{const s=crypto.randomBytes(16);return 'scrypt$16384$'+s.toString('hex')+'$'+crypto.scryptSync('pw-123456',s,32,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex')})()});
delete process.env.GOOGLE_SA_JSON;delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
let ok=0;const T=(name,c)=>{assert.ok(c,name);ok++;console.log('  ✓',name)};
const IG=require('./integrity.js');
// ---- mocked Google ----
let calls={oauth:0,decode:0},nextPayload=null,decodeStatus=200;
IG._setFetch(async(url,o)=>{const res=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j});
 if(url==='https://oauth2.googleapis.com/token'){calls.oauth++;const a=new URLSearchParams(o.body).get('assertion').split('.');
  const good=crypto.verify('RSA-SHA256',Buffer.from(a[0]+'.'+a[1]),publicKey,Buffer.from(a[2],'base64url'));const c=JSON.parse(Buffer.from(a[1],'base64url'));
  if(!good||c.scope!=='https://www.googleapis.com/auth/playintegrity'||c.iss!==SA.client_email)return res(400,{error:'bad jwt'});return res(200,{access_token:'at-1',expires_in:3600})}
 if(url==='https://playintegrity.googleapis.com/v1/com.ludosultan.game:decodeIntegrityToken'){calls.decode++;
  if(o.headers.Authorization!=='Bearer at-1')return res(401,{error:{status:'UNAUTHENTICATED'}});if(decodeStatus!==200)return res(decodeStatus,{error:{status:'INVALID_ARGUMENT'}});
  return res(200,{tokenPayloadExternal:nextPayload})}
 return res(404,{})});
const good=(hash,o={})=>Object.assign({requestDetails:{requestPackageName:'com.ludosultan.game',requestHash:hash,timestampMillis:String(Date.now()-2000)},
 appIntegrity:{appRecognitionVerdict:'PLAY_RECOGNIZED',packageName:'com.ludosultan.game',certificateSha256Digest:['x'],versionCode:'50'},
 deviceIntegrity:{deviceRecognitionVerdict:['MEETS_BASIC_INTEGRITY','MEETS_DEVICE_INTEGRITY']},accountDetails:{appLicensingVerdict:'LICENSED'}},o);
(async()=>{
 console.log('verdict rules');
 const h=IG.requestHash('claim','pid-123456',1700000000000);
 T('request hash is base64url sha256 (43 chars, valid classic nonce)',/^[A-Za-z0-9_-]{43}$/.test(h));
 const X={hash:h,maxAgeSec:300,needDevice:true,needLicensed:true};
 let e=IG.evaluate(good(h),X);T('good token passes',e.pass&&e.app==='PLAY_RECOGNIZED'&&e.dev==='DEVICE'&&e.lic==='LICENSED'&&e.vc===50);
 T('strong integrity counts as device',IG.evaluate(good(h,{deviceIntegrity:{deviceRecognitionVerdict:['MEETS_BASIC_INTEGRITY','MEETS_DEVICE_INTEGRITY','MEETS_STRONG_INTEGRITY']}}),X).pass);
 T('wrong package fails',IG.evaluate(good(h,{requestDetails:{requestPackageName:'com.evil.clone',requestHash:h,timestampMillis:String(Date.now())}}),X).reasons.includes('package'));
 T('wrong request hash fails',IG.evaluate(good('x'.repeat(43)),X).reasons.includes('hash'));
 T('old token fails',IG.evaluate(good(h,{requestDetails:{requestPackageName:'com.ludosultan.game',requestHash:h,timestampMillis:String(Date.now()-600e3)}}),X).reasons.includes('stale'));
 T('classic nonce accepted as hash',IG.evaluate(good(h,{requestDetails:{requestPackageName:'com.ludosultan.game',nonce:h,timestampMillis:String(Date.now())}}),X).pass);
 e=IG.evaluate(good(h,{appIntegrity:{appRecognitionVerdict:'UNRECOGNIZED_VERSION',packageName:'com.ludosultan.game'}}),X);T('modded/sideloaded build fails app check',!e.pass&&e.reasons.includes('app'));
 e=IG.evaluate(good(h,{deviceIntegrity:{deviceRecognitionVerdict:['MEETS_BASIC_INTEGRITY']}}),X);T('basic-only (rooted/emulator) fails device check',!e.pass&&e.dev==='BASIC'&&e.reasons.includes('device'));
 T('basic-only passes when device check is off',IG.evaluate(good(h,{deviceIntegrity:{deviceRecognitionVerdict:['MEETS_BASIC_INTEGRITY']}}),Object.assign({},X,{needDevice:false})).pass);
 e=IG.evaluate(good(h,{deviceIntegrity:{}}),X);T('empty device verdict fails',e.dev==='NONE'&&e.reasons.includes('device'));
 e=IG.evaluate(good(h,{accountDetails:{appLicensingVerdict:'UNLICENSED'}}),X);T('unlicensed fails',!e.pass&&e.reasons.includes('license'));
 T('unevaluated licence passes when licence check is off',IG.evaluate(good(h,{accountDetails:{appLicensingVerdict:'UNEVALUATED'}}),Object.assign({},X,{needLicensed:false})).pass);
 console.log('configuration');
 T('not configured = off',!IG.configured()&&IG.effectiveMode({mode:'enforce'})==='off');
 T('verify when not configured never calls Google',(await IG.verify({pid:'p',action:'claim',ts:Date.now(),token:'t'},{})).off===true&&calls.oauth===0);
 process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER='123456789012';T('project number alone is not enough',!IG.configured());
 process.env.GOOGLE_SA_JSON='{bad json';T('broken SA JSON = not configured',!IG.configured());
 process.env.GOOGLE_SA_JSON=Buffer.from(JSON.stringify(SA)).toString('base64');T('base64 SA JSON accepted',IG.configured());
 process.env.GOOGLE_SA_JSON=JSON.stringify(SA);T('raw SA JSON accepted, default mode log',IG.configured()&&IG.effectiveMode({})==='log'&&IG.effectiveMode({mode:'enforce'})==='enforce'&&IG.effectiveMode({mode:'bogus'})==='log');
 console.log('verify with mocked Google');
 const pid='pid-abcdef12',ts=Date.now();nextPayload=good(IG.requestHash('claim',pid,ts));
 let v=await IG.verify({pid,action:'claim',ts,token:'tok'},{});T('valid token verifies (JWT signed RS256, bearer used)',v.pass&&calls.oauth===1&&calls.decode===1);
 v=await IG.verify({pid,action:'claim',ts,token:'tok'},{});T('same request hash replayed is rejected',!v.pass&&v.reasons[0]==='replay'&&calls.decode===1);
 const ts2=Date.now()+1;nextPayload=good(IG.requestHash('claim',pid,ts2));v=await IG.verify({pid,action:'claim',ts:ts2,token:'tok'},{});T('access token is cached',v.pass&&calls.oauth===1);
 const ts3=Date.now()+2;nextPayload=good(IG.requestHash('claim','someone-else',ts3));v=await IG.verify({pid,action:'claim',ts:ts3,token:'tok'},{});T('token made for another player fails hash',!v.pass&&v.reasons.includes('hash'));
 const ts4=Date.now()+3;nextPayload=good(IG.requestHash('match',pid,ts4));v=await IG.verify({pid,action:'claim',ts:ts4,token:'tok'},{});T('token made for another action fails hash',!v.pass&&v.reasons.includes('hash'));
 T('client ts too old is rejected before Google',(await IG.verify({pid,action:'claim',ts:Date.now()-3600e3,token:'tok'},{})).reasons[0]==='stale');
 T('no token = notoken with error code',(r=>r.reasons[0]==='notoken'&&r.err==='-1')(await IG.verify({pid,action:'session',ts:Date.now(),err:'-1'},{})));
 decodeStatus=400;v=await IG.verify({pid,action:'claim',ts:Date.now()+4,token:'tok'},{});T('Google decode error is soft (decode reason)',!v.pass&&v.reasons[0]==='decode');decodeStatus=200;
 console.log('live-ops endpoint, gate and admin');
 const store=require('./store.js');await store.init({liveops:{file:process.env.LO_FILE,def:{},split:true},loplayers:{file:process.env.LOP_FILE,def:{}},social:{file:path.join(dir,'s.json'),def:{users:{}}},events:{file:path.join(dir,'e.json'),def:{events:[],log:[],rewards:{},joins:{}}}});
 const LO=require('./liveops.js');const srv=http.createServer((q,r)=>{let u=q.url.split('?')[0];if(!LO.handle(q,r,u)){r.statusCode=404;r.end()}});await new Promise(r=>srv.listen(0,r));
 const B='http://127.0.0.1:'+srv.address().port;const J=async(p,b,hd)=>{const r=await fetch(B+p,b?{method:'POST',headers:Object.assign({'Content-Type':'application/json'},hd||{}),body:JSON.stringify(b)}:{headers:hd||{}});return {s:r.status,j:await r.json().catch(()=>null),h:r.headers}};
 let c=await J('/api/config');T('public config tells the app mode + project number',c.j.integrity.mode==='log'&&c.j.integrity.cpn==='123456789012'&&c.j.integrity.actions.includes('match'));
 const P1='player-11111111';const hk=(await J('/api/hello',{pid:P1,vc:50})).j.key;
 T('integrity endpoint needs device key',(await J('/api/integrity',{pid:P1,key:'bad',action:'session'})).s===401);
 let t=Date.now();nextPayload=good(IG.requestHash('session',P1,t),{accountDetails:{appLicensingVerdict:'UNLICENSED'}});
 let r=await J('/api/integrity',{pid:P1,key:hk,action:'session',ts:t,token:'tok',kind:'standard'});T('endpoint logs a failed verdict (log mode)',r.s===200&&r.j.mode==='log'&&r.j.pass===false&&r.j.reasons.includes('license'));
 T('log mode never blocks a claim',(await J('/api/mail/claim',{pid:P1,key:hk,ids:['gx']})).s===200);
 T('gate allows match in log mode',LO.gate(P1,'match')===true);
 // switch to enforce through the admin API
 const l=await J('/admin/api/login',{user:'khawar',pass:'pw-123456'});const ck=l.h.get('set-cookie').split(';')[0];const A=(p,b)=>J('/admin/api/lo/'+p,b,b?{Cookie:ck,'X-LS-Admin':'1'}:{Cookie:ck});
 T('bad mode rejected',(await A('config/save',{section:'integrity',value:{mode:'strict'}})).s===400);
 T('admin sets enforce',(await A('config/save',{section:'integrity',value:{mode:'enforce',ttlMin:30,maxAgeSec:300,needDevice:true,needLicensed:true,actions:['claim','redeem','match']}})).j.cfg.integrity.mode==='enforce');
 T('enforce blocks claim without a pass',(await J('/api/mail/claim',{pid:P1,key:hk,ids:['gx']})).s===403);
 T('enforce blocks redeem without a pass',(await J('/api/redeem',{pid:P1,key:hk,code:'X'})).s===403);
 T('enforce blocks online match without a pass',LO.gate(P1,'match')===false);
 T('actions not protected stay open',LO.gate(P1,'purchase')===true);
 t=Date.now();nextPayload=good(IG.requestHash('claim',P1,t));r=await J('/api/integrity',{pid:P1,key:hk,action:'claim',ts:t,token:'tok'});T('passing check recorded',r.j.pass===true&&r.j.mode==='enforce');
 T('claim allowed after a pass',(await J('/api/mail/claim',{pid:P1,key:hk,ids:['gx']})).s===200);
 T('match allowed after a pass',LO.gate(P1,'match')===true);
 t=Date.now()+5;r=await J('/api/integrity',{pid:P1,key:hk,action:'match',ts:t,err:'-2'});T('a later no-token report keeps the earlier pass',r.j.pass===false&&LO.gate(P1,'match')===true);
 const ig=(await A('integrity')).j;T('admin counts',ig.configured&&ig.effective==='enforce'&&ig.tot.total===3&&ig.tot.pass===1&&ig.tot.fail===2&&ig.tot.notoken===1&&ig.tot.blocked===3&&ig.tot.wouldBlock===2&&ig.days[0].lic.UNLICENSED===1);
 T('admin recent list has no token data',ig.recent.length===3&&!JSON.stringify(ig.recent).includes('tok"')&&ig.recent[0].a==='match');
 T('admin view never shows the key',!JSON.stringify(ig).includes('PRIVATE KEY'));
 delete process.env.GOOGLE_SA_JSON;T('removing env = off: gate opens even in enforce',LO.gate('player-22222222','match')===true);
 
 srv.close();await store.flush();console.log('\nALL '+ok+' CHECKS PASSED');process.exit(0)
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
