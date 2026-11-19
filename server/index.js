// Ludo Sultan server entry: load persisted data (Postgres via DATABASE_URL, else JSON files), then start the app.
const path=require('path'),store=require('./store.js');
store.init({
 social:{file:process.env.DATA_FILE||path.join(__dirname,'data','social.json'),def:{users:{},dms:{},reports:[],clubs:{}},split:true},
 tours:{file:process.env.TOUR_FILE||path.join(__dirname,'data','tours.json'),def:{pending:{}}},
 events:{file:process.env.EVENTS_FILE||path.join(__dirname,'data','events.json'),def:{events:[],log:[],rewards:{},joins:{}}},
 leaderboard:{file:process.env.LB_FILE||path.join(__dirname,'data','leaderboard.json'),def:[]},
 // 3.14 liveops: config/mail/codes/moderation/audit/OTA/themes (one row per section in Postgres) + device registry
 liveops:{file:process.env.LO_FILE||path.join(__dirname,'data','liveops.json'),def:{},split:true},
 loplayers:{file:process.env.LOP_FILE||path.join(__dirname,'data','loplayers.json'),def:{}},
 // 3.15: server wallet (one row per player) and events v3 scores/joins (one row per event)
 wallet:{file:process.env.WAL_FILE||path.join(__dirname,'data','wallet.json'),def:{},split:true},
 ev3:{file:process.env.EV3_FILE||path.join(__dirname,'data','ev3.json'),def:{},split:true}
}).then(()=>require('./app.js')).catch(e=>{console.error('FATAL: could not load data store:',e.message);process.exit(1)});
