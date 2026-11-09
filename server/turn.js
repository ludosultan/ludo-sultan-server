// Cloudflare Realtime TURN: mints short-lived ICE credentials on the server (3.11.5).
// Needs env CF_TURN_KEY_ID + CF_TURN_API_TOKEN (never shipped in the app). Without them -> null (client stays STUN-only).
const TTL=+process.env.CF_TURN_TTL||14400; // 4 h
const cache=new Map();let win={at:0,n:0};
const enabled=()=>!!(process.env.CF_TURN_KEY_ID&&process.env.CF_TURN_API_TOKEN);
async function iceFor(pid){if(!enabled())return null;const now=Date.now();const c=cache.get(pid);if(c&&now-c.at<3600e3)return c.ice;
 if(now-win.at>60e3)win={at:now,n:0};if(++win.n>120)return c?c.ice:null; // global guard: 120 mints/min
 try{const ac=new AbortController();const to=setTimeout(()=>ac.abort(),5000);
  const r=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(process.env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`,
   {method:'POST',headers:{Authorization:'Bearer '+process.env.CF_TURN_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({ttl:TTL}),signal:ac.signal});
  clearTimeout(to);if(!r.ok){console.warn('turn: cloudflare',r.status);return c?c.ice:null}
  const j=await r.json();const ice=(j.iceServers||[]).map(s=>({...s,urls:[].concat(s.urls||[]).filter(u=>!/:53(\?|$)/.test(u))})).filter(s=>s.urls.length);
  cache.set(pid,{at:now,ice});if(cache.size>5000)for(const [k,v] of cache)if(now-v.at>3600e3)cache.delete(k);return ice}
 catch(e){console.warn('turn:',e.message);return c?c.ice:null}}
module.exports={iceFor,enabled,TTL};
