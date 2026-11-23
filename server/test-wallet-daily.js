// Run: node server/test-wallet-daily.js
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wald-'));
const store=require('./store.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('  ✓',m)};
store.init({wallet:{file:path.join(dir,'w.json'),def:{},split:true}}).then(()=>{
 const W=require('./wallet.js');
 W.sync('p1',{seed:{c:110000,g:0}});
 const d=new Date(),k=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
 let r=W.daily('p1',{day:1,dayKey:k});
 ok(r.ok&&r.granted.c===5000&&r.w.c===115000,'day 1 grant is 5000 and is added to the server wallet');
 r=W.daily('p1',{day:1,dayKey:k});
 ok(r.ok&&r.dup&&r.w.c===115000,'same day is not granted twice');
 r=W.daily('p1',{day:1,dayKey:k,double:true});
 ok(r.ok&&r.granted.c===5000&&r.w.c===120000,'ad-double grants the same day once');
 r=W.daily('p1',{day:1,dayKey:k,double:true});
 ok(!r.ok&&r.error==='nodouble'&&r.w.c===120000,'second double is refused');
 r=W.daily('missing',{day:1,dayKey:k});
 ok(!r.ok&&r.error==='nowallet','daily needs an existing wallet');
 W.sync('p2',{seed:{c:1000,g:0}});
 r=W.daily('p2',{day:7,dayKey:k});
 ok(r.ok&&r.granted.c===50000&&r.granted.g===10&&r.w.c===51000&&r.w.g===10,'day 7 grant is 50000 coins and 10 diamonds');
 console.log('wallet daily',n,'ok');
}).catch(e=>{console.error(e);process.exit(1)});
