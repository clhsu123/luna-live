import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { WebSocket } from 'ws';
import { installDigitalHuman } from '../server/digital-human.mjs';
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async fn => { for(let i=0;i<200;i++){if(fn()) return; await pause(10);} throw Error('event timeout'); };
for (const portrait of [false, true]) test((portrait ? 'portrait: ' : 'Anam: ') + 'split bridge preserves user transcript, routes only completed current text to xAI and cancels pending speech', async t => {
  const old = {...process.env};
  const app=express(), server=createServer(app); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env,{APP_ORIGIN:origin,OPENAI_API_KEY:'test',XAI_API_KEY:'test',CHAT_PROVIDER:'openai',CHAT_OUTPUT:'xai-tts'});
  const sent=[], calls=[], events=[]; let ai, ws, pending;
  const prefix=portrait?'/api/portrait':'/api/anam';
  const audioPrefix=portrait?'portrait':'anam';
  const close=installDigitalHuman(app,server,{anam:!portrait,portrait,
    ...(portrait ? {} : {providerOverride:{create:async()=>({id:'split-test',client:{sessionToken:'scoped'}}),stop:async()=>{}}}),
    synthesize:async(text,{signal})=>{calls.push({text,signal});if(text==='pending')return new Promise((resolve,reject)=>{pending={resolve,reject};});return {audio:Buffer.alloc(text==='long' ? 48000 : 480).toString('base64')};},
    aiSocketFactory:(url)=>{assert.equal(new URL(url).hostname,'api.openai.com');ai=new EventEmitter();ai.readyState=1;ai.bufferedAmount=0;ai.close=()=>{};ai.send=raw=>{const e=JSON.parse(raw);sent.push(e);if(e.type==='session.update')queueMicrotask(()=>ai.emit('message',JSON.stringify({type:'session.updated'})));};queueMicrotask(()=>ai.emit('open'));return ai;}
  });
  t.after(async()=>{ws?.terminate();await close();server.close(); for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);});
  const status=await fetch(origin+prefix+'/status'), cookie=status.headers.get('set-cookie').split(';')[0];
  assert.equal((await status.json()).speechProvider,'xai-tts');
  const res=await fetch(origin+prefix+'/sessions',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({mode:'companion',character:'luna-office'})});
  assert.equal(res.status,200);const session=await res.json();
  ws=new WebSocket(origin.replace('http','ws')+prefix+'/bridge?ticket='+session.ticket,{origin,headers:{Cookie:cookie}});
  ws.on('message',raw=>events.push(JSON.parse(raw)));await once(ws,'open');await until(()=>events.some(e=>e.type==='bridge.ready'));
  assert.deepEqual(sent[0].session.output_modalities,['text']);
  const emit=e=>ai.emit('message',JSON.stringify(e));
  const response=(id,text,status='completed')=>{emit({type:'response.created',response:{id}});emit({type:'response.output_text.delta',response_id:id,delta:text});emit({type:'response.done',response:{id,status}});};
  ws.send(JSON.stringify({type:'turn.start'}));ws.send(Buffer.alloc(4800));ws.send(JSON.stringify({type:'turn.end'}));await until(()=>sent.some(e=>e.type==='input_audio_buffer.commit'));
  emit({type:'conversation.item.input_audio_transcription.completed',item_id:'user1',transcript:'你好'});
  response('r1','你好');await until(()=>events.some(e=>e.type===audioPrefix+'.audio.end'));
  assert.ok(events.some(e=>e.item_id==='user1'&&e.transcript==='你好'));
  assert.ok(events.some(e=>e.type==='response.created'&&e.response.id==='r1'));
  assert.ok(events.some(e=>e.type==='response.output_audio_transcript.done'&&e.response_id==='r1'&&e.transcript==='你好'));
  emit({type:'response.done',response:{id:'r1',status:'completed'}});await pause(20);assert.equal(calls.length,1);
  response('cancelled','do not speak','cancelled');await pause(20);assert.equal(calls.length,1);
  response('pending','pending');await until(()=>pending);
  ws.send(JSON.stringify({type:'interrupt'}));await until(()=>calls[1].signal.aborted);
  pending.reject(Error('late provider failure'));await pause(30);assert.equal(events.some(e=>e.type==='bridge.error'),false);
  ws.send(JSON.stringify({type:'text',text:'second turn'}));await until(()=>sent.some(e=>e.item?.content?.[0]?.text==='second turn'));
  response('r2','second answer');await until(()=>events.filter(e=>e.type===audioPrefix+'.audio.end').length===2);
  assert.deepEqual(calls.map(c=>c.text),['你好','pending','second answer']);
  // A stale completion must not speak the latest response's buffer.
  emit({type:'response.created',response:{id:'r3'}});emit({type:'response.output_text.delta',response_id:'r3',delta:'new text'});
  emit({type:'response.done',response:{id:'r2',status:'completed'}});await pause(20);assert.equal(calls.length,3);
  ws.send(JSON.stringify({type:'interrupt'}));await until(()=>sent.some(e=>e.type==='response.cancel'));
  emit({type:'response.done',response:{id:'r3',status:'cancelled'}});await pause(20);assert.equal(calls.length,3);
  // A new response invalidates older REST synthesis even without a client turn.
  pending=undefined;response('r4','pending');await until(()=>pending);
  const previous=pending;response('r5','fresh');await until(()=>calls.length===5);
  assert.equal(calls[3].signal.aborted,true);
  previous.resolve({audio:Buffer.alloc(480).toString('base64')});
  await until(()=>events.filter(e=>e.type===audioPrefix+'.audio.end').length===3);
  assert.equal(events.some(e=>e.type==='bridge.error'),false);
  const beforeFrames=events.filter(e=>e.type===audioPrefix+'.audio').length;
  response('long-response','long');await until(()=>events.filter(e=>e.type===audioPrefix+'.audio').length>beforeFrames);
  ws.send(JSON.stringify({type:'interrupt'}));await until(()=>calls[5].signal.aborted);
  const stoppedFrames=events.filter(e=>e.type===audioPrefix+'.audio').length;
  await pause(300);assert.equal(events.filter(e=>e.type===audioPrefix+'.audio').length,stoppedFrames);
  assert.equal(events.filter(e=>e.type===audioPrefix+'.audio.end').length,3);
  pending=undefined;response('r6','pending');await until(()=>pending);
  ws.close();await until(()=>calls[6].signal.aborted);
  pending.reject(Error('provider failed after close'));await pause(20);

});

test('portrait split refuses missing speech credentials before allocating a session', async t => {
 const old={...process.env};const app=express(),server=createServer(app);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 Object.assign(process.env,{APP_ORIGIN:origin,OPENAI_API_KEY:'test',CHAT_PROVIDER:'openai',CHAT_OUTPUT:'xai-tts'});delete process.env.XAI_API_KEY;
 const close=installDigitalHuman(app,server,{portrait:true,providerOverride:{create:()=>{throw Error('must not allocate');}}});
 t.after(async()=>{await close();server.close();for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);});
 assert.equal((await (await fetch(origin+'/api/portrait/status')).json()).configured,false);
 const res=await fetch(origin+'/api/portrait/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({mode:'companion'})});
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'xai_tts_not_configured'});
});
