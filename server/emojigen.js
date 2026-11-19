// "Make Your Own Emojis" generator (3.15.1). Pluggable backend, chosen by env (no key in code):
//   xAI image edits:  XAI_API_KEY (+ optional EMOJI_GEN_MODEL, default grok-imagine-image-2.0)
//   any HTTP backend: EMOJI_GEN_URL + EMOJI_GEN_KEY. Contract: POST {photos:[dataUri], style, prompt} -> {image:dataUri}
//   tests only:       EMOJI_GEN_MOCK=1 (echoes the first photo)
// Nothing configured -> configured() is false, the server answers status:'unconfigured', the app shows
// "Coming soon" and charges nothing. Photos are only held in memory for the job and dropped right after.
const STYLES=[
 ['happy','a big happy smile'],['laugh','laughing out loud with tears of joy'],['cool','wearing dark sunglasses, looking cool and confident'],
 ['angry','angry and frowning, red cheeks'],['love','in love with heart eyes'],['wow','surprised with an open mouth'],
 ['wink','a playful wink and thumbs up'],['sultan','wearing a royal golden sultan crown, proud']];
const N=Math.max(1,Math.min(8,+process.env.EMOJI_GEN_COUNT||6));
function provider(){if(process.env.EMOJI_GEN_MOCK)return 'mock';if(process.env.EMOJI_GEN_URL&&process.env.EMOJI_GEN_KEY)return 'http';if(process.env.XAI_API_KEY)return 'xai';return ''}
const prompt=d=>`Turn the person in the photo into a cute cartoon emoji sticker: ${d}. Keep the face recognizable as the same person. `+
 'Head and shoulders only, bold clean outlines, bright game-style colors, centered, plain white background, no text, no frame.';
async function post(url,key,body,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms||90000);
 try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body),signal:c.signal});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error('backend '+r.status+(j&&j.error?': '+String(j.error.message||j.error).slice(0,120):''));return j}finally{clearTimeout(t)}}
async function one(photos,s){const p=provider();
 if(p==='xai'){const j=await post('https://api.x.ai/v1/images/edits',process.env.XAI_API_KEY,{model:process.env.EMOJI_GEN_MODEL||'grok-imagine-image-2.0',prompt:prompt(s[1]),
   image:{url:photos[0],type:'image_url'},response_format:'b64_json'});const d=j&&j.data&&j.data[0];
  if(d&&d.b64_json)return 'data:image/jpeg;base64,'+d.b64_json;
  if(d&&d.url){const r=await fetch(d.url);if(!r.ok)throw new Error('image fetch '+r.status);return 'data:'+(r.headers.get('content-type')||'image/jpeg')+';base64,'+Buffer.from(await r.arrayBuffer()).toString('base64')}
  throw new Error('no image')}
 if(p==='http'){const j=await post(process.env.EMOJI_GEN_URL,process.env.EMOJI_GEN_KEY,{photos,style:s[0],prompt:prompt(s[1])});if(j&&typeof j.image==='string'&&/^data:image\//.test(j.image))return j.image;throw new Error('no image')}
 if(p==='mock')return photos[0];
 throw new Error('not configured')}
module.exports={
 STYLES:STYLES.map(s=>s[0]),provider,
 configured(){return !!provider()},
 // photos: data URIs (jpeg/png/webp). Resolves with N data URIs; fails if fewer than 4 came back (then nothing is charged).
 async generate(photos){const out=[];const list=STYLES.slice(0,N);
  for(let i=0;i<list.length;i+=2){const r=await Promise.allSettled(list.slice(i,i+2).map(s=>one(photos,s)));r.forEach(x=>{if(x.status==='fulfilled'&&x.value)out.push(x.value)})}
  if(out.length<Math.min(4,N))throw new Error('only '+out.length+' emojis');return out}};
