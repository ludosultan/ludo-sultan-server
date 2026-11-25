// iOS (3.16 iOS): App Store verification without third-party packages.
// 1) StoreKit 2 signed transactions (JWS, ES256, x5c chain leaf -> Apple WWDR intermediate -> Apple Root CA - G3).
//    The root in the chain must be byte-identical to the pinned apple-root-ca-g3.pem (SHA-256 63:34:3A:...:91:79),
//    each cert must be signed by the next one and valid at signedDate, the leaf must carry Apple's receipt-signing OID
//    1.2.840.113635.100.6.11.1 and the intermediate 1.2.840.113635.100.6.2.1 (same checks as Apple's App Store Server Library).
// 2) Sign in with Apple identity tokens (RS256 JWT against https://appleid.apple.com/auth/keys).
// Env: APPLE_BUNDLE_ID (default com.ludosultan.game, comma list allowed), APPLE_IAP_SANDBOX=0 refuses Sandbox transactions
// (keep it on: App Review buys with Sandbox accounts against the production server).
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const ROOT=new crypto.X509Certificate(fs.readFileSync(path.join(__dirname,'apple-root-ca-g3.pem')));
const ROOT_SHA256='63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
if(ROOT.fingerprint256!==ROOT_SHA256)throw new Error('apple root certificate file changed');
const BUNDLES=()=>String(process.env.APPLE_BUNDLE_ID||'com.ludosultan.game').split(',').map(s=>s.trim()).filter(Boolean);
const b64u=s=>Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'),'base64');
// DER encoding of an OID (tag 06 + length + base-128 arcs)
function oidDer(oid){const a=oid.split('.').map(Number);const out=[a[0]*40+a[1]];for(const n of a.slice(2)){const b=[n&127];let x=Math.floor(n/128);while(x>0){b.unshift((x&127)|128);x=Math.floor(x/128)}out.push(...b)}return Buffer.from([6,out.length,...out])}
const OID_LEAF=oidDer('1.2.840.113635.100.6.11.1'),OID_WWDR=oidDer('1.2.840.113635.100.6.2.1');
const isJws=t=>typeof t==='string'&&t.length>200&&t.length<20000&&/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t);
// verify a StoreKit 2 JWS. opts: {root: X509Certificate (tests only), now}
function verifyJws(jws,opts){opts=opts||{};if(!isJws(jws))throw new Error('not a jws');
 const [h,p,s]=jws.split('.');let head,body;try{head=JSON.parse(b64u(h));body=JSON.parse(b64u(p))}catch(e){throw new Error('bad json')}
 if(head.alg!=='ES256')throw new Error('bad alg');if(!Array.isArray(head.x5c)||head.x5c.length!==3)throw new Error('bad x5c');
 let certs;try{certs=head.x5c.map(c=>new crypto.X509Certificate(Buffer.from(c,'base64')))}catch(e){throw new Error('bad cert')}
 const root=opts.root||ROOT;if(!certs[2].raw.equals(root.raw))throw new Error('untrusted root');
 if(!certs[0].verify(certs[1].publicKey)||!certs[1].verify(certs[2].publicKey)||!certs[2].verify(certs[2].publicKey))throw new Error('bad chain');
 if(!certs[1].ca||!certs[2].ca)throw new Error('bad ca');
 if(!certs[0].raw.includes(OID_LEAF))throw new Error('leaf oid');if(!certs[1].raw.includes(OID_WWDR))throw new Error('wwdr oid');
 const at=+body.signedDate||opts.now||Date.now();for(const c of certs){if(at<Date.parse(c.validFrom)||at>Date.parse(c.validTo))throw new Error('cert expired')}
 const ok=crypto.verify('sha256',Buffer.from(h+'.'+p),{key:certs[0].publicKey,dsaEncoding:'ieee-p1363'},b64u(s));if(!ok)throw new Error('bad signature');
 return body}
// a consumable / one-time purchase for productId sku. Returns the fields the wallet needs.
function verifyTransaction(jws,sku,opts){const t=verifyJws(jws,opts);opts=opts||{};
 if(!BUNDLES().includes(t.bundleId))throw new Error('wrong bundle');if(sku&&t.productId!==sku)throw new Error('wrong product');
 if(!t.transactionId)throw new Error('no transaction');if(t.revocationDate)throw new Error('revoked');
 if(t.type&&!['Consumable','Non-Consumable'].includes(t.type))throw new Error('wrong type');
 const env=t.environment||'Production';if(env!=='Production'&&!(env==='Sandbox'&&process.env.APPLE_IAP_SANDBOX!=='0'))throw new Error('environment '+env);
 return {transactionId:String(t.transactionId),originalTransactionId:String(t.originalTransactionId||t.transactionId),productId:t.productId,environment:env,
  quantity:t.quantity|0||1,purchaseDate:+t.purchaseDate||0,appAccountToken:t.appAccountToken||''}}
// ---- Sign in with Apple ----
let aKeys={at:0,keys:[]};
async function appleKeys(){if(Date.now()-aKeys.at<3600e3&&aKeys.keys.length)return aKeys.keys;const r=await fetch('https://appleid.apple.com/auth/keys');if(!r.ok)throw new Error('apple keys '+r.status);const j=await r.json();aKeys={at:Date.now(),keys:j.keys||[]};return aKeys.keys}
// nonce: optional raw nonce the app sent to Apple (Apple puts its SHA-256 hex, or the raw value, into the token)
async function verifyAppleId(idToken,nonce,keysOverride){const parts=String(idToken||'').split('.');if(parts.length!==3||idToken.length>4096)throw new Error('bad token');
 let head,body;try{head=JSON.parse(b64u(parts[0]));body=JSON.parse(b64u(parts[1]))}catch(e){throw new Error('bad token')}
 if(head.alg!=='RS256')throw new Error('bad alg');const keys=keysOverride||await appleKeys();let jwk=keys.find(k=>k.kid===head.kid);
 if(!jwk&&!keysOverride){aKeys.at=0;jwk=(await appleKeys()).find(k=>k.kid===head.kid)}if(!jwk)throw new Error('unknown key');
 if(!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),b64u(parts[2])))throw new Error('bad signature');
 if(body.iss!=='https://appleid.apple.com')throw new Error('bad issuer');if(!BUNDLES().includes(body.aud))throw new Error('wrong audience');
 if(!(body.exp*1000>Date.now()-60e3))throw new Error('expired');
 if(nonce){const hn=crypto.createHash('sha256').update(String(nonce)).digest('hex');if(body.nonce!==hn&&body.nonce!==String(nonce))throw new Error('bad nonce')}
 const ev=body.email_verified===true||body.email_verified==='true';
 return {sub:String(body.sub),email:ev?String(body.email||'').toLowerCase():'',name:'',photo:'',privateRelay:body.is_private_email===true||body.is_private_email==='true'}}
module.exports={verifyJws,verifyTransaction,verifyAppleId,isJws,oidDer,ROOT,ROOT_SHA256};
