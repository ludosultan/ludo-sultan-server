// Run: node server/test-ev3-unit.js  (temp data dir; scoring, 100-player rule, caps, milestones, ranks, admin review, religion filter, normEvent)
const os=require('os'),path=require('path'),fs=require('fs'),assert=require('assert');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ev3u-'));const now0=Date.now(),D=864e5;
const real=JSON.parse(fs.readFileSync(path.join(__dirname,'ev3-schedule.json'),'utf8'));
const fl=JSON.parse(JSON.stringify(real.events.find(e=>e.id==='sul261204')));
const base=(id,comm,extra)=>Object.assign(JSON.parse(JSON.stringify(fl)),{id,community:comm,name:{en:'Test '+id},start:now0+1200,end:now0+D},extra||{});
const evs=[base('tflag','all'),base('tmulti','all'),base('tfew','all'),base('tmus','muslim'),base('thin','hindu'),
 Object.assign(base('tlater','all'),{start:now0+10*D,end:now0+12*D}),Object.assign(base('tfar','all'),{start:now0+30*D,end:now0+32*D})];
evs[0].v2.antiFarm.maxCountedMatchesPerDay=12;
const SCH=path.join(dir,'sched.json');fs.writeFileSync(SCH,JSON.stringify({catalog:real.catalog,events:evs}));
process.env.EV3_SCHEDULE=SCH;process.env.EV3_TICK_MS='999999';
const store=require('./store.js');let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('  ✓',m)};
store.init({events:{file:path.join(dir,'e.json'),def:{events:[],log:[],rewards:{},joins:{}}},liveops:{file:path.join(dir,'lo.json'),def:{},split:true},loplayers:{file:path.join(dir,'lop.json'),def:{}},
 wallet:{file:path.join(dir,'w.json'),def:{},split:true},ev3:{file:path.join(dir,'ev3.json'),def:{},split:true}}).then(async()=>{
 const E=require('./events3.js'),EVS=require('./events.js'),LO=require('./liveops.js'),W=require('./wallet.js');
 E.boot();ok(EVS.db().events.filter(e=>e.v2).length===7,'schedule imported (7 test events)');
 const again=E.importSchedule();ok(again.added===0,'re-import adds nothing, keeps admin edits');
 ok(EVS.publicConfig().events.every(e=>!e.v2&&!['tflag','tfew'].includes(e.id)),'legacy /api/events (3.14.x) does not get v3 events');
 // religion filter
 const ids=c=>E.list(c).map(e=>e.id);
 ok(!ids(null).includes('tmus')&&!ids(null).includes('thin')&&ids(null).includes('tflag'),'no community: only "all" events');
 ok(ids('muslim').includes('tmus')&&!ids('muslim').includes('thin'),'muslim community sees muslim events');
 ok(!ids('hindu').includes('tmus')&&ids('hindu').includes('thin'),'hindu community sees hindu events, never muslim ones');
 ok(!ids('general').includes('tmus')&&!ids('christian').includes('tmus'),'other communities never see muslim events');
 ok(!ids(null).includes('tfar')&&ids(null).includes('tlater'),'list shows events up to 14 days ahead');
 ok(E.join('tmus','p1',{comm:null}).error==='community','cannot join a muslim event without community muslim');
 // registration
 ok(E.status(EVS.db().events.find(e=>e.id==='tflag'))==='registration','status registration before start');
 const tl=EVS.db().events.find(e=>e.id==='tlater');ok(E.regOpens(tl)===tl.start-7*D,'registration opens exactly 7 days before start');
 ok(E.join('tlater','p1',{}).error==='notOpen','join before registration opens is refused');
 for(let i=0;i<100;i++)E.join('tflag','p'+i,{name:'P'+i,comm:null});for(let i=55;i<75;i++)E.join('tmulti','p'+i,{name:'P'+i});for(let i=0;i<19;i++)E.join('tfew','p'+i,{name:'P'+i});
 const j1=E.join('tflag','p1',{});ok(j1.ok&&j1.joined===100,'join is idempotent, 100 joined (min is 20)');
 ok(E.list(null,'p5').find(e=>e.id==='tflag').me.joinedAt>0,'my join state in list');
 await new Promise(r=>setTimeout(r,1400));
 const ev=id=>EVS.db().events.find(e=>e.id===id);
 ok(E.status(ev('tflag'))==='live','100 joined (>= 20) -> starts on time');ok(E.status(ev('tfew'))==='notStarted','19 joined (< 20) -> not started');
 ok(E.join('tflag','late1',{}).error==='registrationClosed','no late join after start');
 // scoring
 const room=(pids,order,caps,extra)=>Object.assign({public:true,ev:'tflag',g:{},startedAt:Date.now(),seats:pids.map(p=>p?{pid:p,name:'N'+p}:{bot:true,fill:true,name:'Ali'}),caps:caps||pids.map(()=>0)},extra||{});
 // 3.15.4: event matches only. Normal matches (no room.ev) never count, one match credits ONLY its own event, eligibility check
 ok(E.MIN_PLAYERS===20,'default minimum players is 20');
 ok(EVS.db().events.filter(e=>e.v2&&e.v2.registration.minPlayers!==20).length===0,'every event has minPlayers 20');
 ok(E.onMatchOver(room(['p1','p2'],[0,1],null,{ev:undefined}),[0,1])===0,'normal online match (no room.ev) gives 0 event points');
 ok(!E.board(ev('tflag'),'p1').me.games,'normal match did not add to the joined live event');
 ok(E.eligible('tflag','p1').ok&&E.eligible('tflag','p1').name.en==='Test tflag','eligible: live and joined');
 ok(E.eligible('tflag','nobody').error==='notJoined','ineligible: not joined');ok(E.eligible('nope','p1').error==='unknown','ineligible: unknown event');
 ok(E.eligible('tfew','p1').error==='notStarted','ineligible: event not started');ok(E.eligible('tlater','p1').error==='notLive','ineligible: not live yet');
 // multi-event: p60 joined tflag AND tfew2 (live, 20 joined); a match tagged tflag credits tflag only
 ok(E.onMatchOver(room(['p60','p61'],[0,1],null,{ev:'tflag'}),[0,1])===2,'match tagged with event A scores event A');
 ok(E.board(ev('tflag'),'p60').me.games===1&&!E.board(ev('tmulti'),'p60').me.games,'...and event B (also joined, also live) gets nothing');
 {const r=room(['p62','p63'],[0,1],null,{ev:'tflag'});E.onMatchOver(r,[0,1]);ok(r.evPts&&r.evPts[0]===40&&r.evPts[1]===0+10,'evPts per seat: win 40, loss 10 ('+JSON.stringify(r.evPts)+')')}
 ok(E.onMatchOver(room(['p60','p61'],[0,1],null,{ev:'tmulti'}),[0,1])===2&&E.board(ev('tmulti'),'p60').me.games===1&&E.board(ev('tflag'),'p60').me.games===1,'match tagged with event B scores B only');
 ok(E.onMatchOver(room(['p60','p61'],[0,1],null,{ev:'tfew'}),[0,1])===0,'match tagged with a not-started event gives 0');
 ok(E.onMatchOver(room(['p60',null],[0,1],null,{ev:'tflag'}),[0,1])===0,'practice (bot fill) event match gives 0');
 // migration: old events imported with minPlayers 100 are lowered once
 {const o=ev('tlater');o.v2.registration.minPlayers=100;E._S().meta.min20=0;ok(E.migrateMin()>=1&&o.v2.registration.minPlayers===20,'migration lowers old minPlayers 100 to 20')}
 ok(E.onMatchOver(room(['p1',null],[0,1]),[0,1])===0,'bot-only (fill) match ignored');
 ok(E.onMatchOver(room(['p1','p2'],[0,1],null,{public:false}),[0,1])===0,'private / friend table ignored');
 ok(E.onMatchOver(room(['p1','p2'],[0,1],null,{mg:'chess'}),[0,1])===0,'mini-game ignored');
 ok(E.onMatchOver(room(['p1','late1'],[0,1]),[0,1])===1,'only joined players get points');
 const r0=E.board(ev('tflag'),'p1').me;ok(r0.pts===40&&r0.games===1,'played 10 + win 30 per match, server computed ('+r0.pts+')');
 ok(E.onMatchOver(room(['p1','p2'],[1,0],[8,1]),[1,0])===2,'second match counted');
 // p1 lost: +10 + capture 8*2=16 (cap 8). p2 won: +40 +2
 ok(E.board(ev('tflag'),'p1').me.pts===66,'captures add 2 each, capped at 8 per match');
 ok(E.onMatchOver(room(['p1','p2'],[0,1]),[0,1])===2,'2nd match vs same opponent counted');ok(E.onMatchOver(room(['p1','p2'],[0,1]),[0,1])===2,'3rd match vs same opponent counted');
 ok(E.onMatchOver(room(['p1','p2'],[0,1]),[0,1])===0,'4th match vs same opponent same day: not counted');
 // daily cap 12: p10 plays 15 matches vs different opponents
 let c=0;for(let i=0;i<15;i++){if(E.onMatchOver(room(['p10','p'+(20+i)],[0,1]),[0,1]))c++}
 ok(E.board(ev('tflag'),'p10').me.games===12,'daily cap: 12 counted matches max ('+E.board(ev('tflag'),'p10').me.games+')');
 // 3 player match second place
 E.onMatchOver(room(['p40','p41','p42'],[2,0,1]),[2,0,1]);ok(E.board(ev('tflag'),'p40').me.pts===25,'2nd place +15 in 3+ player matches');
 // left early = seat became bot, no points
 {const r=room(['p43','p44','p45'],[0,1,2]);r.seats[2]={bot:true,name:'x (left)',pid:null};E.onMatchOver(r,[2,0,1])}
 ok(!E.board(ev('tflag'),'p45').me.games,'player who left early gets nothing');
 // not-started event never scores
 ok(!E.board(ev('tfew'),'p1').me.games,'not-started event gives no points');
 // milestones -> mail (server grants)
 const mail=LO._S().mail.filter(g=>g.pid==='p10');ok(mail.length===1&&mail[0].coins===200000&&mail[0].kind==='event','milestone 300 pts paid as server mail, 800 pts not yet (480 pts)');
 ok(!LO._S().mail.some(g=>g.pid==='p1'&&g.gems===200),'milestone not reached -> no mail');
 // ranking needs 10 matches: p10 has 12, p1 has 3
 ok(E.board(ev('tflag'),'p1').me.rank===0&&E.board(ev('tflag'),'p10').me.rank===1,'ranking needs at least 10 matches');
 // finalize after end: rank 1 flagship -> review queue, not paid
 const fin=E.finalize(ev('tflag').end+1000);ok(fin>=1,'finalize after end');
 const rv=E._S().meta.review.find(r=>r.eid==='tflag');ok(rv&&rv.status==='pending'&&rv.pid==='p10'&&rv.gems===1000000&&rv.coins===20000000,'Sultan of Sultans waits for admin review');
 ok(!LO._S().mail.some(g=>g.pid==='p10'&&g.gems===1000000),'rank 1 prize not paid before approval');
 ok(E.showcase()===null,'no showcase before approval');
 ok(E._S().meta.final.tfew.status==='notStarted'&&E._S().meta.final.tfew.paid===0,'not started event: no prizes');
 // wallet exists for p10 -> claim credits it
 W.sync('p10',{seed:{c:1000,g:10}});E.review(rv.id,'approve','khawar');
 const big=LO._S().mail.find(g=>g.pid==='p10'&&g.gems===1000000);ok(big&&big.coins===20000000,'approved: 1,000,000 diamonds + 20,000,000 coins mailed');
 ok(LO._S().mail.filter(g=>g.pid==='p10'&&g.item&&['r29','r53','r21','r56','r72','r82'].includes(g.item.id)).length===6,'approved: title, Taj, frame, trophy, holo, crown drop items');
 const sh=E.showcase();ok(sh&&sh.name==='Np10'&&sh.until-sh.from===7*D&&!sh.pid,'showcase for 1 week, pid hidden');
 const p=LO._P();p.p10={k:'x',first:0,c:[]};const cl=LO.claim('p10',p.p10,big.id);ok(cl.ok,'claim ok');
 ok(W.get('p10').g===1000010&&W.get('p10').c===20001000,'mail claim credits server wallet');
 try{E.review(rv.id,'approve','x');ok(false,'double approve')}catch(e){ok(/Already/.test(e.message),'cannot approve twice')}
 // normEvent: v2 kept, gem clamp > 100000 for ranks, coins by rank, audience, 12 rewards
 const ne=EVS.normEvent({name:{en:'X'},rewards:Array(15).fill({type:'coins',n:5}),v2:{ranks:[{from:1,to:1,gems:5e6,coins:3e7,items:['r29','bad']}]},audience:'everyone'});
 ok(ne.rewards.length===12&&ne.rewards[0].type==='coins','normEvent: 12 rewards with coins');ok(ne.v2.ranks[0].gems===2e6&&ne.v2.ranks[0].coins===3e7&&ne.v2.ranks[0].items.length===1,'normEvent v2: gems clamp 2,000,000, coins by rank, only valid items');
 ok(ne.audience==='everyone'&&ne.v2.registration.minPlayers===20&&ne.v2.registration.days===7&&ne.v2.fee===0,'normEvent: audience + registration rule + fee 0');
 const legacy=EVS.normEvent({name:{en:'L'},rewards:[{type:'gems',n:9e9}]});ok(legacy.rewards[0].n===1e5&&!legacy.v2,'legacy event unchanged (gems clamp 100,000)');
 console.log('test-ev3-unit: ALL PASSED ('+n+' checks)');setTimeout(()=>process.exit(0),300)}).catch(e=>{console.error('FAIL',e);process.exit(1)});
