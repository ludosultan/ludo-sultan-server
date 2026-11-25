// Run: node server/test-apple.js  — iOS: App Store JWS transactions, wallet credit once, Sign in with Apple tokens, CORS for capacitor://localhost
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert'),crypto=require('crypto'),http=require('http');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apple-'));const FX=path.join(__dirname,'test-fixtures','apple');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('  ✓',m)};
const throwsMsg=(f,re,m)=>{let e=null;try{f()}catch(x){e=x}ok(e&&re.test(e.message),m+(e?' ('+e.message+')':' (no error)'))};
const A=require('./apple.js');
const rd=f=>fs.readFileSync(path.join(FX,f),'utf8');const der=pem=>new crypto.X509Certificate(pem).raw.toString('base64');
const ROOT=new crypto.X509Certificate(rd('root.pem'));const CHAIN=[der(rd('leaf.pem')),der(rd('wwdr.pem')),der(rd('root.pem'))];
const b64u=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
function jws(payload,o){o=o||{};const h=b64u({alg:'ES256',x5c:o.x5c||CHAIN});const p=b64u(payload);
 const s=crypto.sign('sha256',Buffer.from(h+'.'+p),{key:crypto.createPrivateKey(rd(o.key||'leaf.key')),dsaEncoding:'ieee-p1363'}).toString('base64url');return h+'.'+p+'.'+s}
let tx=1000;const T=(x)=>Object.assign({transactionId:String(++tx),originalTransactionId:String(tx),bundleId:'com.ludosultan.game',productId:'ls_gems_500',type:'Consumable',
 purchaseDate:Date.now(),signedDate:Date.now(),quantity:1,environment:'Sandbox',storefront:'ESP'},x||{});
const opt={root:ROOT};
(async()=>{
 // ---- pinned Apple root ----
 ok(A.ROOT.fingerprint256===A.ROOT_SHA256&&/Apple Root CA - G3/.test(A.ROOT.subject),'pinned root is Apple Root CA - G3 (SHA-256 63:34:3A…91:79)');
 // ---- JWS transactions ----
 const good=jws(T());let r=A.verifyTransaction(good,'ls_gems_500',opt);
 ok(r.transactionId===String(tx)&&r.productId==='ls_gems_500'&&r.environment==='Sandbox','valid signed transaction (test chain) is accepted');
 throwsMsg(()=>A.verifyTransaction(good,'ls_gems_500'),/untrusted root/,'same transaction is refused against the real pinned Apple root');
 const [h,p,s]=good.split('.');const p2=b64u(Object.assign(JSON.parse(Buffer.from(p,'base64url')),{productId:'ls_gems_10000'}));
 throwsMsg(()=>A.verifyTransaction(h+'.'+p2+'.'+s,'ls_gems_10000',opt),/bad signature/,'edited payload (bigger pack) fails the signature');
 throwsMsg(()=>A.verifyTransaction(jws(T()),'ls_gems_1000',opt),/wrong product/,'product must match the requested sku');
 throwsMsg(()=>A.verifyTransaction(jws(T({bundleId:'com.cityvia.app'})),'ls_gems_500',opt),/wrong bundle/,'another app\'s transaction is refused');
 throwsMsg(()=>A.verifyTransaction(jws(T({revocationDate:Date.now()})),'ls_gems_500',opt),/revoked/,'refunded/revoked transaction is refused');
 throwsMsg(()=>A.verifyTransaction(jws(T({type:'Auto-Renewable Subscription'})),'ls_gems_500',opt),/wrong type/,'subscription type is refused for packs');
 throwsMsg(()=>A.verifyTransaction(jws(T(),{key:'plain.key',x5c:[der(rd('plain.pem')),CHAIN[1],CHAIN[2]]}),'ls_gems_500',opt),/leaf oid/,'leaf without Apple receipt-signing OID is refused');
 throwsMsg(()=>A.verifyTransaction(jws(T(),{key:'plain.key'}),'ls_gems_500',opt),/bad signature/,'signature by a key that is not the leaf is refused');
 throwsMsg(()=>A.verifyTransaction(jws(T(),{x5c:[CHAIN[0],CHAIN[1]]}),'ls_gems_500',opt),/bad x5c/,'chain must have 3 certificates');
 throwsMsg(()=>A.verifyTransaction(jws(T(),{x5c:[CHAIN[0],CHAIN[2],CHAIN[2]]}),'ls_gems_500',opt),/bad chain/,'leaf must be signed by the intermediate');
 throwsMsg(()=>A.verifyTransaction(jws(T({signedDate:Date.parse('2001-01-01')})),'ls_gems_500',opt),/cert expired/,'certificates must be valid at signedDate');
 process.env.APPLE_IAP_SANDBOX='0';throwsMsg(()=>A.verifyTransaction(jws(T()),'ls_gems_500',opt),/environment Sandbox/,'APPLE_IAP_SANDBOX=0 refuses Sandbox');delete process.env.APPLE_IAP_SANDBOX;
 ok(A.verifyTransaction(jws(T({environment:'Production'})),'ls_gems_500',opt).environment==='Production','Production transaction is accepted');
 ok(!A.isJws('tok-123456789')&&A.isJws(good),'Play tokens are not mistaken for JWS');
 // ---- wallet: credit once per transactionId, one player only ----
 const store=require('./store.js');await store.init({wallet:{file:path.join(dir,'w.json'),def:{},split:true},iap_ios:{file:path.join(dir,'i.json'),def:{},split:true}});
 const W=require('./wallet.js');W.sync('pa',{seed:{c:0,g:0}});W.sync('pb',{seed:{c:0,g:0}});const wo={apple:opt};
 const buy=jws(T());r=W.iap('pa','ls_gems_500',buy,wo);ok(r.ok&&r.granted.g===1250&&r.w.g===1250,'verified iOS purchase credits 1250 diamonds from the server table');
 r=W.iap('pa','ls_gems_500',buy,wo);ok(r.ok&&r.dup&&r.w.g===1250,'same transaction is credited once');
 const same=jws(T({transactionId:String(tx),originalTransactionId:String(tx)}));r=W.iap('pa','ls_gems_500',same,wo);ok(r.ok&&r.dup&&r.w.g===1250,'re-signed copy of the same transactionId is credited once');
 r=W.iap('pb','ls_gems_500',buy,wo);ok(!r.ok&&r.error==='token'&&W.get('pb').g===0,'same transaction on another player is refused');
 r=W.iap('pa','ls_gems_500',buy);ok(!r.ok&&r.error==='token','without the test root (real server) the fake chain is refused');
 r=W.iap('pa','ls_coins_10k',jws(T({productId:'ls_coins_10k'})),wo);ok(r.ok&&r.granted.c===1e4,'coin pack works the same way');
 r=W.iap('pa','ls_gems_500','tok-123456789');ok(r.ok&&r.granted.g===1250,'Android token path unchanged');
 // ---- Sign in with Apple ----
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const jwk=Object.assign(publicKey.export({format:'jwk'}),{kid:'TESTKID',alg:'RS256',use:'sig'});
 const idt=(b,kid)=>{const h=b64u({alg:'RS256',kid:kid||'TESTKID'}),p=b64u(Object.assign({iss:'https://appleid.apple.com',aud:'com.ludosultan.game',sub:'001234.abcd',exp:Math.floor(Date.now()/1e3)+600,iat:Math.floor(Date.now()/1e3),email:'X@privaterelay.appleid.com',email_verified:'true',is_private_email:'true'},b||{}));
  return h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url')};
 const rej=async(pr,re,m)=>{let e=null;try{await pr}catch(x){e=x}ok(e&&re.test(e.message),m+(e?' ('+e.message+')':''))};
 let u=await A.verifyAppleId(idt(),null,[jwk]);ok(u.sub==='001234.abcd'&&u.email==='x@privaterelay.appleid.com'&&u.privateRelay,'valid Apple identity token gives sub + verified email');
 const nonce='n-'+crypto.randomUUID();u=await A.verifyAppleId(idt({nonce:crypto.createHash('sha256').update(nonce).digest('hex')}),nonce,[jwk]);ok(u.sub,'hashed nonce is checked');
 await rej(A.verifyAppleId(idt({nonce:'other'}),nonce,[jwk]),/bad nonce/,'wrong nonce refused');
 await rej(A.verifyAppleId(idt({aud:'com.cityvia.app'}),null,[jwk]),/wrong audience/,'token for another app refused');
 await rej(A.verifyAppleId(idt({iss:'https://evil.example'}),null,[jwk]),/bad issuer/,'wrong issuer refused');
 await rej(A.verifyAppleId(idt({exp:Math.floor(Date.now()/1e3)-600}),null,[jwk]),/expired/,'expired token refused');
 await rej(A.verifyAppleId(idt({},'NOPE'),null,[jwk]),/unknown key/,'unknown key id refused');
 const t=idt().split('.');await rej(A.verifyAppleId(t[0]+'.'+b64u({iss:'https://appleid.apple.com',aud:'com.ludosultan.game',sub:'evil',exp:9e9})+'.'+t[2],null,[jwk]),/bad signature/,'edited token refused');
 // accounts: acc_social provider apple creates one account per Apple sub and logs it in again
 process.env.ACC_FILE=path.join(dir,'acc.json');const sent=[];const ACC=require('./accounts.js')({send:(ws,m)=>sent.push(m),social:{},appleKeys:[jwk]});
 const wait=async()=>{for(let i=0;i<50&&!sent.length;i++)await new Promise(r=>setTimeout(r,20));return sent.shift()};
 ACC.handle({t:'acc_social',provider:'apple',token:idt(),name:'Khawar'},'pid-ios-1',{name:'Guest'},{});let m=await wait();
 ok(m&&m.ok&&m.acct.prov==='apple'&&m.acct.name==='Khawar'&&m.token&&m.pid==='pid-ios-1','Sign in with Apple creates an account owning this device pid');
 ACC.handle({t:'acc_social',provider:'apple',token:idt()},'pid-other',{name:'Guest'},{});m=await wait();
 ok(m&&m.ok&&m.pid==='pid-ios-1'&&m.created===false,'second Apple login finds the same account');
 ACC.handle({t:'acc_social',provider:'apple',token:idt({aud:'com.cityvia.app'})},'pid-x',{name:'Guest'},{});m=await wait();ok(m&&!m.ok&&m.code==='verify','bad Apple token gives a verify error');
 ACC.handle({t:'acc_cfg'},'pid-x',{},{});m=await wait();ok(m&&m.t==='acccfg'&&m.apple===true,'acc_cfg tells the app Apple sign-in is on');
 // ---- CORS: iOS WebView origin capacitor://localhost ----
 const srv=http.createServer((req,res)=>{if(!W.handle(req,res,req.url)){res.statusCode=404;res.end()}}).listen(0);await new Promise(r=>srv.on('listening',r));
 const res=await fetch('http://127.0.0.1:'+srv.address().port+'/api/wallet',{method:'OPTIONS',headers:{Origin:'capacitor://localhost','Access-Control-Request-Method':'POST'}});
 ok(res.status===204&&res.headers.get('access-control-allow-origin')==='*','wallet API answers the capacitor://localhost preflight (Access-Control-Allow-Origin *)');srv.close();
 await store.flush();console.log(`\n${n} checks passed`);process.exit(0)})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
