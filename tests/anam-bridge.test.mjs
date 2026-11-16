import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { WebSocket } from 'ws';
import { installDigitalHuman } from '../server/digital-human.mjs';
const waitFor = async fn => { for(let i=0;i<100;i++){if(fn()) return; await new Promise(r=>setTimeout(r,10));} throw Error('event timeout'); };
for (const providerName of ['openai', 'xai']) test(providerName + ': Anam bridge coexists with LiveAvatar and forwards manual turns, memory, PCM and interrupts', async t => {
  const app=express(), server=createServer(app); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const previous={origin:process.env.APP_ORIGIN,key:process.env.OPENAI_API_KEY, xai:process.env.XAI_API_KEY, provider:process.env.AI_PROVIDER};
  process.env.APP_ORIGIN=origin; process.env.OPENAI_API_KEY='test'; process.env.XAI_API_KEY='xai-test'; process.env.AI_PROVIDER=providerName;
  const sent=[]; let ai;
  const closeLive=installDigitalHuman(app,server);
  const closeAnam=installDigitalHuman(app,server,{anam:true,providerOverride:{create:async()=>({id:'test-session',client:{sessionToken:'scoped'}}),stop:async()=>{}},aiSocketFactory:(url,options)=>{
    assert.equal(new URL(url).hostname,providerName==='xai'?'api.x.ai':'api.openai.com');
    assert.equal(options.headers.Authorization,providerName==='xai'?'Bearer xai-test':'Bearer test');
    ai=new EventEmitter();ai.readyState=1;ai.bufferedAmount=0;ai.close=()=>{};
    ai.send=raw=>{const e=JSON.parse(raw);sent.push(e);if(e.type==='session.update')queueMicrotask(()=>ai.emit('message',JSON.stringify({type:'session.updated'})));};
    queueMicrotask(()=>ai.emit('open'));return ai;
  }});
  let ws;
  t.after(async()=>{for(const [key,value] of [['XAI_API_KEY',previous.xai],['AI_PROVIDER',previous.provider]]) {if(value===undefined)delete process.env[key];else process.env[key]=value;} ws?.terminate();await closeLive();await closeAnam();server.close();if(previous.origin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous.origin;if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;});
  const status=await fetch(origin+'/api/anam/status'); const cookie=status.headers.get('set-cookie').split(';')[0];
  const res=await fetch(origin+'/api/anam/sessions',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({mode:'companion',character:'luna-office',history:[{id:'old',role:'user',text:'記得烏龍茶'}]})});
  assert.equal(res.status,200);const session=await res.json();
  ws=new WebSocket(origin.replace('http','ws')+'/api/anam/bridge?ticket='+session.ticket,{origin,headers:{Cookie:cookie}});
  const events=[];ws.on('message',raw=>events.push(JSON.parse(raw)));await once(ws,'open');
  await waitFor(()=>events.some(e=>e.type==='bridge.ready'));
  if(providerName==='openai'){assert.equal(sent[0].session.type,'realtime');assert.equal(sent[0].session.audio.input.turn_detection,null);}else{assert.equal(sent[0].session.turn_detection.type,null);assert.equal(sent[0].session.voice,'eve');assert.equal(sent[0].session.audio.output.format.rate,24000);assert.equal(sent[0].session.type,undefined);}
  assert.ok(sent.some(e=>e.item?.content?.[0]?.text==='記得烏龍茶'));
  for(const id of ['first','second']){
    ws.send(JSON.stringify({type:'turn.start'}));ws.send(Buffer.alloc(4800));ws.send(JSON.stringify({type:'turn.end'}));
    await waitFor(()=>sent.filter(e=>e.type==='response.create').length===(id==='first'?1:2));
    ai.emit('message',JSON.stringify({type:'response.created',response:{id}}));
    ai.emit('message',JSON.stringify({type:providerName==='xai'?'response.audio.delta':'response.output_audio.delta',response_id:id,item_id:id,delta:Buffer.alloc(4800).toString('base64')}));
    ai.emit('message',JSON.stringify({type:providerName==='xai'?'response.audio.done':'response.output_audio.done',response_id:id}));
    ai.emit('message',JSON.stringify({type:'response.done',response:{status:'completed'}}));
    await waitFor(()=>events.filter(e=>e.type==='anam.audio.end').length===(id==='first'?1:2));
  }
  ws.send(JSON.stringify({type:'interrupt'}));await waitFor(()=>events.some(e=>e.type==='anam.interrupt'));
  assert.equal(events.filter(e=>e.type==='anam.audio').length,2);
  assert.equal(sent.filter(e=>e.type==='input_audio_buffer.commit').length,2);
});
