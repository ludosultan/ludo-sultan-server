// unit + socket test for per-game leaderboards
const assert=require('assert');const lbg=require('./lbg.js');
assert.deepStrictEqual(lbg.clean({ludo:{g:10,w:99},snl:{g:-5,w:3},evil:{g:1,w:1},chess:{g:'7',w:2}}),{ludo:{g:10,w:10},chess:{g:7,w:2}});
assert.deepStrictEqual(lbg.clean(null),{});assert.deepStrictEqual(lbg.clean('x'),{});
const E=[{pid:'a',fid:'AAA',name:'A',gm:{ludo:{g:10,w:5},snl:{g:2,w:2}}},{pid:'b',fid:'BBB',name:'B',gm:{ludo:{g:20,w:5}}},{pid:'c',fid:'CCC',name:'C',gm:{chess:{g:1,w:0}}},{pid:'d',fid:'DDD',name:'D'}];
let t=lbg.top(E,'ludo','a',100);assert.strictEqual(t.total,2);assert.strictEqual(t.rank,2);assert.strictEqual(t.rows[0].fid,'BBB');// 5*3+20=35 > 5*3+10=25
t=lbg.top(E,'snl','a');assert.strictEqual(t.rank,1);t=lbg.top(E,'snl','zzz');assert.strictEqual(t.rank,0);assert.strictEqual(t.me,null);
assert.deepStrictEqual(lbg.ranksFor(E,'a'),{ludo:{rank:2,total:2,g:10,w:5},snl:{rank:1,total:1,g:2,w:2}});assert.deepStrictEqual(lbg.ranksFor(E,'d'),{});
// end to end over WebSocket
const {spawn}=require('child_process');const WebSocket=require('ws');const port=18000+Math.floor(Math.random()*500);
const dir=require('fs').mkdtempSync(require('os').tmpdir()+'/lbg-');
const srv=spawn('node',['index.js'],{cwd:__dirname,env:Object.assign({},process.env,{PORT:port,DATA_FILE:dir+'/s.json',LB_FILE:dir+'/l.json',TOUR_FILE:dir+'/t.json'}),stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function client(name){return new Promise(res=>{const ws=new WebSocket('ws://127.0.0.1:'+port);const inbox=[];ws.on('message',d=>inbox.push(JSON.parse(d)));ws.on('open',()=>res({ws,inbox,send:o=>ws.send(JSON.stringify(o)),wait:async(tt,ms=2000)=>{const t0=Date.now();while(Date.now()-t0<ms){const i=inbox.findIndex(x=>x.t===tt);if(i>=0)return inbox.splice(i,1)[0];await sleep(30)}throw new Error('timeout '+tt)}}))})}
(async()=>{try{await sleep(900);const A=await client('a'),B=await client('b');
 A.send({t:'hello',name:'Ann',pid:'pa'+port});B.send({t:'hello',name:'Bob',pid:'pb'+port});await sleep(300);
 A.send({t:'lbpost',name:'Ann',av:'🦁',tr:10,wins:3,cc:'ES',city:'Madrid',gm:{snl:{g:4,w:3},ludo:{g:9,w:4},hack:{g:5,w:5}}});
 B.send({t:'lbpost',name:'Bob',av:'🐯',tr:5,wins:1,cc:'PK',city:'Lahore',gm:{snl:{g:10,w:3}}});await sleep(300);
 A.send({t:'lbg',game:'snl',scope:'global'});let r=await A.wait('lbg');assert.strictEqual(r.game,'snl');assert.strictEqual(r.total,2);assert.strictEqual(r.rank,2);assert.strictEqual(r.rows[0].name,'Bob');assert.ok(!('pid' in r.rows[0]));
 B.send({t:'lbg',game:'snl',scope:'national',cc:'PK'});r=await B.wait('lbg');assert.strictEqual(r.total,1);assert.strictEqual(r.rank,1);
 A.send({t:'lbmy'});r=await A.wait('lbmy');assert.deepStrictEqual(Object.keys(r.ranks).sort(),['ludo','snl']);assert.strictEqual(r.ranks.snl.rank,2);
 A.send({t:'lbg',game:'nope',scope:'x'});r=await A.wait('lbg');assert.strictEqual(r.game,'ludo');assert.strictEqual(r.scope,'global');
 // posting without gm keeps the old games
 A.send({t:'lbpost',name:'Ann',av:'🦁',tr:11,wins:3,cc:'ES',city:'Madrid'});await sleep(200);A.send({t:'lbmy'});r=await A.wait('lbmy');assert.ok(r.ranks.snl);
 console.log('test-lbg OK');process.exitCode=0}catch(e){console.error('test-lbg FAIL',e);process.exitCode=1}finally{srv.kill();process.exit()}})();
