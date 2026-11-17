// 3.14.3 Google Play Integrity API: decode tokens on the server and judge the verdicts.
// Env (never committed, never logged):
//   GOOGLE_SA_JSON                       service account key JSON (raw JSON or base64 of it) from the Cloud project linked in Play Console
//   PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER  Google Cloud project NUMBER (digits), sent to the app for the Standard API
//   PLAY_INTEGRITY_PACKAGE               optional, default com.ludosultan.game
// Without both env values the feature is "not configured" and every mode behaves as "off".
// The app sends: action + ts + token (+ kind 'standard'|'classic'). The request hash binds the token to
// pid, action and ts: base64url(sha256('ls-pi|'+action+'|'+pid+'|'+ts)). Classic tokens carry it as the nonce.
const crypto=require('crypto');
const PKG=()=>process.env.PLAY_INTEGRITY_PACKAGE||'com.ludosultan.game';
const CPN=()=>{const v=String(process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER||'').trim();return /^\d{6,20}$/.test(v)?v:''};
const MODES=['off','log','enforce'];
const ACTIONS=['session','claim','redeem','purchase','match'];
let fetchImpl=(...a)=>fetch(...a);
function _setFetch(f){fetchImpl=f;tokenCache=null}
function sa(){const raw=String(process.env.GOOGLE_SA_JSON||'').trim();if(!raw)return null;
 try{const j=JSON.parse(raw.startsWith('{')?raw:Buffer.from(raw,'base64').toString('utf8'));if(j&&j.client_email&&j.private_key)return j}catch(e){}return null}
function configured(){return !!(CPN()&&sa())}
function requestHash(action,pid,ts){return crypto.createHash('sha256').update('ls-pi|'+action+'|'+pid+'|'+ts).digest('base64url')}
// effective settings from the live-ops config section (cfg.integrity)
function settings(c){c=c||{};return {mode:MODES.includes(c.mode)?c.mode:'log',ttlMin:Math.max(1,Math.min(1440,+c.ttlMin||60)),maxAgeSec:Math.max(30,Math.min(3600,+c.maxAgeSec||300)),
 needDevice:c.needDevice!==false,needLicensed:c.needLicensed!==false,actions:Array.isArray(c.actions)?c.actions.filter(a=>ACTIONS.includes(a)):['claim','redeem','match']}}
function effectiveMode(c){return configured()?settings(c).mode:'off'}
// ---- OAuth2 access token from the service account (JWT bearer, RS256) ----
let tokenCache=null;
async function accessToken(){if(tokenCache&&tokenCache.exp>Date.now()+60e3)return tokenCache.tok;const k=sa();if(!k)throw new Error('not configured');
 const now=Math.floor(Date.now()/1000),aud=k.token_uri||'https://oauth2.googleapis.com/token';
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:k.client_email,scope:'https://www.googleapis.com/auth/playintegrity',aud,iat:now,exp:now+3600});
 const sig=crypto.sign('RSA-SHA256',Buffer.from(unsigned),k.private_key).toString('base64url');
 const r=await fetchImpl(aud,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+unsigned+'.'+sig});
 const j=await r.json().catch(()=>({}));if(!r.ok||!j.access_token)throw new Error('oauth '+r.status);
 tokenCache={tok:j.access_token,exp:Date.now()+(+j.expires_in||3600)*1000};return tokenCache.tok}
async function decode(token){const at=await accessToken();
 const r=await fetchImpl('https://playintegrity.googleapis.com/v1/'+encodeURIComponent(PKG())+':decodeIntegrityToken',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+at},body:JSON.stringify({integrity_token:String(token)})});
 const j=await r.json().catch(()=>({}));if(!r.ok||!j.tokenPayloadExternal)throw new Error('decode '+r.status+(j.error&&j.error.status?' '+j.error.status:''));return j.tokenPayloadExternal}
// ---- verdict evaluation (pure, unit tested) ----
// payload = tokenPayloadExternal, expect = {hash, maxAgeSec, needDevice, needLicensed, now}
function evaluate(p,expect){const now=expect.now||Date.now(),rd=p.requestDetails||{},ai=p.appIntegrity||{},di=p.deviceIntegrity||{},ac=p.accountDetails||{};
 const dev=Array.isArray(di.deviceRecognitionVerdict)?di.deviceRecognitionVerdict:[];
 const out={app:ai.appRecognitionVerdict||'NONE',dev:dev.includes('MEETS_STRONG_INTEGRITY')?'STRONG':dev.includes('MEETS_DEVICE_INTEGRITY')?'DEVICE':dev.includes('MEETS_BASIC_INTEGRITY')?'BASIC':(dev.includes('MEETS_VIRTUAL_INTEGRITY')?'VIRTUAL':'NONE'),
  lic:ac.appLicensingVerdict||'NONE',vc:+ai.versionCode||0,reasons:[]};
 const R=out.reasons;
 if(rd.requestPackageName!==PKG())R.push('package');
 if(ai.packageName&&ai.packageName!==PKG())R.push('package');
 const got=rd.requestHash!=null?rd.requestHash:rd.nonce;if(!got||got!==expect.hash)R.push('hash');
 const ts=+rd.timestampMillis||0;if(!ts||Math.abs(now-ts)>expect.maxAgeSec*1000)R.push('stale');
 if(out.app!=='PLAY_RECOGNIZED')R.push('app');
 if(expect.needDevice&&!(out.dev==='DEVICE'||out.dev==='STRONG'))R.push('device');
 if(expect.needLicensed&&out.lic!=='LICENSED')R.push('license');
 out.reasons=[...new Set(R)];out.pass=!out.reasons.length;return out}
// ---- replay guard: a request hash is accepted once ----
const seen=new Map();
function fresh(hash,ttlMs){const t=Date.now();if(seen.size>20000)for(const [k,v] of seen)if(v<t)seen.delete(k);if(seen.has(hash)&&seen.get(hash)>t)return false;seen.set(hash,t+ttlMs);return true}
// verify one report from the app. Never throws. Returns {pass, reasons, app, dev, lic, err?}
async function verify(m,cfg){const st=settings(cfg),pid=String(m.pid||''),action=ACTIONS.includes(m.action)?m.action:'session',ts=+m.ts||0;
 if(!configured())return {pass:false,reasons:['off'],off:true};
 if(!m.token)return {pass:false,reasons:['notoken'],err:String(m.err||'none').slice(0,40)};
 if(!ts||Math.abs(Date.now()-ts)>st.maxAgeSec*1000)return {pass:false,reasons:['stale']};
 const hash=requestHash(action,pid,ts);if(!fresh(hash,st.maxAgeSec*2000))return {pass:false,reasons:['replay']};
 let p;try{p=await decode(m.token)}catch(e){return {pass:false,reasons:['decode'],err:String(e.message||e).slice(0,60)}}
 return evaluate(p,{hash,maxAgeSec:st.maxAgeSec,needDevice:st.needDevice,needLicensed:st.needLicensed})}
module.exports={configured,effectiveMode,settings,requestHash,evaluate,verify,decode,MODES,ACTIONS,PKG,CPN,_setFetch,_seen:seen};
