import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT || 8787);
const modes = {
  companion: `You are Luna, a friendly, warm and grounded adult AI conversation partner. Be natural, supportive, curious and concise. Do not imply you are human. Speak Traditional Chinese by default unless user switches languages. Ask one thoughtful follow-up at a time.`,
  korean: `You are Luna, a Korean language speaking partner and tutor for a Traditional Chinese speaker. Speak Korean at a natural but accessible pace. Prefer polite 해요체; give short corrections and Chinese explanations when needed. Practice realistic daily and business dialogues.`,
  business: `You are Luna, a realistic Korean semiconductor customer roleplay partner. Roleplay a CTO or sourcing manager of a Korean SoC / ASIC / edge AI company, discussing RISC-V CPU IP, PPA, toolchains, license fees, royalties and integration risks. Ask one challenging question at a time. Give specific sales feedback when asked. Speak English by default; switch to Korean or Traditional Chinese on request.`
};
const cache = new Map();
app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
app.get('/api/health', (_req,res)=>res.json({ok:true,configured:Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('REPLACE_ME'))}));
// Single-user password gate for initial private deployment. Browser will ask for credentials.
// For a public product, replace with account authentication, quotas and abuse prevention.
app.use((req,res,next)=>{
  const secret=process.env.APP_PASSWORD;
  if(!secret) return res.status(503).send('APP_PASSWORD is not configured.');
  const auth=req.get('authorization') || '';
  let user='',password='';
  if(auth.startsWith('Basic ')) {
    try { const plain=Buffer.from(auth.slice(6),'base64').toString('utf8'); const idx=plain.indexOf(':'); if(idx>=0){user=plain.slice(0,idx);password=plain.slice(idx+1);} }catch{}
  }
  const expected=createHash('sha256').update(secret).digest();
  const actual=createHash('sha256').update(password).digest();
  if(user==='luna' && timingSafeEqual(actual,expected)) return next();
  res.set('WWW-Authenticate','Basic realm="Luna Live Private"');
  res.status(401).send('Login required');
});
app.post('/api/session', express.text({type:['application/sdp','text/plain'],limit:'64kb'}), async(req,res)=>{
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('REPLACE_ME')) return res.status(503).send('請先在 .env 設定 OPENAI_API_KEY。');
  const mode = typeof req.query.mode === 'string' && Object.hasOwn(modes,req.query.mode) ? req.query.mode : 'companion';
  if(typeof req.body !== 'string' || !req.body.startsWith('v=')) return res.status(400).send('Invalid SDP offer.');
  // Local MVP: basic per-IP session throttle. Put proper authentication/rate limiting in front before public deployment.
  const ip = req.ip || 'local'; const now = Date.now();
  const history = (cache.get(ip) || []).filter(t=>now-t<60_000);
  if(history.length >= 8) return res.status(429).send('Too many sessions; try again shortly.');
  history.push(now); cache.set(ip,history);
  const form = new FormData();
  form.set('sdp',req.body);
  form.set('session',JSON.stringify({
    type:'realtime', model:process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini',
    instructions:modes[mode],
    output_modalities:['audio'],
    audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},turn_detection:{type:'server_vad'}},output:{voice:'marin'}}
  }));
  const userHash=createHash('sha256').update(ip).digest('hex');
  try {
    const upstream=await fetch('https://api.openai.com/v1/realtime/calls',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'OpenAI-Safety-Identifier':userHash},body:form,signal:AbortSignal.timeout(25000)
    });
    const body=await upstream.text();
    res.status(upstream.status).type(upstream.ok?'application/sdp':'text/plain').send(upstream.ok?body:`OpenAI connection failed (${upstream.status}): ${body.slice(0,900)}`);
  }catch(err){console.error('Realtime session error',err);res.status(502).send('OpenAI realtime connection temporarily unavailable.');}
});
// In production deploy the built frontend with this server.
if(process.env.NODE_ENV==='production'){
  app.use(express.static(resolve('dist')));
  app.get('*', (_req,res)=>res.type('html').send(readFileSync(resolve('dist/index.html'),'utf8')));
}
app.listen(port,'0.0.0.0',()=>console.log(`Luna API running at http://127.0.0.1:${port}`));
