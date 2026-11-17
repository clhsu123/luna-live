import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {EventEmitter,once} from 'node:events';
import {WebSocket} from 'ws';
import {installDigitalHuman} from '../server/digital-human.mjs';
import {voiceProvider} from '../server/voice-provider.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let n=0;n<200;n++){if(fn())return;await pause(10);}throw Error('event timeout');};

test('manual remains default; VAD uses each provider documented schema',()=>{
 const openai=voiceProvider({CHAT_PROVIDER:'openai',OPENAI_API_KEY:'test',CHAT_OUTPUT:'xai-tts'});
 assert.equal(openai.session('test').audio.input.turn_detection,null);
 assert.deepEqual(openai.session('test','automatic').audio.input.turn_detection,{type:'server_vad',threshold:0.5,prefix_padding_ms:300,silence_duration_ms:800,create_response:true,interrupt_response:true});
 assert.deepEqual(openai.session('test','automatic').output_modalities,['text']);
 const xai=voiceProvider({CHAT_PROVIDER:'xai',XAI_API_KEY:'test'});
 assert.deepEqual(xai.session('test').turn_detection,{type:null});
 assert.deepEqual(xai.session('test','automatic').turn_detection,{type:'server_vad'});
 assert.throws(()=>xai.session('test','typo'),/invalid_turn_mode/);
});

for(const provider of ['openai','xai'])test(`${provider}: automatic input, VAD interruption, transcript, mute and stale-output guards`,async t=>{
 const old={...process.env},app=express(),server=createServer(app);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 Object.assign(process.env,{APP_ORIGIN:origin,OPENAI_API_KEY:'test',XAI_API_KEY:'test',CHAT_PROVIDER:provider,CHAT_OUTPUT:provider==='openai'?'xai-tts':''});
 const sent=[],events=[],synthCalls=[];let ai,ws,pending;
 const close=installDigitalHuman(app,server,{portrait:true,
  synthesize:async(text,{signal})=>{synthCalls.push({text,signal});if(text==='pending')return new Promise(resolve=>{pending=resolve;});return{audio:Buffer.alloc(48000).toString('base64')};},
  aiSocketFactory:()=>{ai=new EventEmitter();ai.readyState=1;ai.bufferedAmount=0;ai.close=()=>{};ai.send=raw=>{const e=JSON.parse(raw);sent.push(e);if(e.type==='session.update')queueMicrotask(()=>ai.emit('message',JSON.stringify({type:'session.updated'})));};queueMicrotask(()=>ai.emit('open'));return ai;}
 });
 t.after(async()=>{ws?.terminate();await close();server.close();for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);});
 const status=await fetch(origin+'/api/portrait/status'),cookie=status.headers.get('set-cookie').split(';')[0];
 const create=turnMode=>fetch(origin+'/api/portrait/sessions',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({mode:'companion',turnMode})});
 assert.equal((await create('unknown')).status,400);
 const res=await create('automatic');assert.equal(res.status,200);const session=await res.json();
 ws=new WebSocket(origin.replace('http','ws')+'/api/portrait/bridge?ticket='+session.ticket,{origin,headers:{Cookie:cookie}});ws.on('message',raw=>events.push(JSON.parse(raw)));await once(ws,'open');await until(()=>events.some(e=>e.type==='bridge.ready'));
 assert.equal((provider==='openai'?sent[0].session.audio.input.turn_detection:sent[0].session.turn_detection).type,'server_vad');
 const emit=e=>ai.emit('message',JSON.stringify(e));
 const count=type=>sent.filter(e=>e.type===type).length;
 // Audio must reach VAD before any speech_started event or manual turn.start.
 ws.send(Buffer.alloc(4800));await until(()=>count('input_audio_buffer.append')===1);
 emit({type:'input_audio_buffer.speech_started',item_id:'u1',audio_start_ms:0});
 ws.send(JSON.stringify({type:'text',client_id:'typed-while-speaking',text:'keep this draft'}));
 await until(()=>events.some(e=>e.type==='turn.text_blocked'&&e.client_id==='typed-while-speaking'));
 assert.equal(count('response.create'),0);assert(!sent.some(e=>e.item?.content?.[0]?.text==='keep this draft'));
 assert(!events.some(e=>e.type==='bridge.error'));
 emit({type:'input_audio_buffer.speech_stopped',item_id:'u1',audio_end_ms:300});
 ws.send(JSON.stringify({type:'text',client_id:'typed-before-response',text:'not a competing response'}));
 await until(()=>events.some(e=>e.type==='turn.text_blocked'&&e.client_id==='typed-before-response'));
 assert.equal(count('response.create'),0);assert(!sent.some(e=>e.item?.content?.[0]?.text==='not a competing response'));
 emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'你好'});
 await until(()=>events.some(e=>e.item_id==='u1'&&e.transcript==='你好'));
 // VAD owns commit/create/cancel. Stale manual controls must not duplicate them.
 ws.send(JSON.stringify({type:'turn.start'}));ws.send(JSON.stringify({type:'turn.end'}));await pause(20);
 assert.equal(count('input_audio_buffer.commit'),0);assert.equal(count('response.create'),0);assert.equal(count('response.cancel'),0);
 emit({type:'response.created',response:{id:'r1'}});
 if(provider==='openai'){
  emit({type:'response.output_text.delta',response_id:'r1',delta:'pending'});emit({type:'response.done',response:{id:'r1',status:'completed'}});await until(()=>pending);
 }else{
  emit({type:'response.audio.delta',response_id:'r1',item_id:'assistant1',delta:Buffer.alloc(480).toString('base64')});await until(()=>events.some(e=>e.type==='portrait.audio'));
 }
 const interruptions=events.filter(e=>e.type==='portrait.interrupt').length;
 emit({type:'input_audio_buffer.speech_started',item_id:'u2',audio_start_ms:500});await until(()=>events.filter(e=>e.type==='portrait.interrupt').length>interruptions);
 if(provider==='openai'){assert.equal(synthCalls[0].signal.aborted,true);pending({audio:Buffer.alloc(480).toString('base64')});}
 const framesAfterInterrupt=events.filter(e=>e.type==='portrait.audio').length;
 emit({type:'response.audio.delta',response_id:'r1',item_id:'assistant1',delta:Buffer.alloc(480).toString('base64')});
 emit({type:'response.done',response:{id:'r1',status:'failed',status_details:{error:{message:'late failure'}}}});
 emit({type:'response.audio_transcript.done',response_id:'r1',transcript:'stale completion'});
 await pause(30);assert.equal(events.filter(e=>e.type==='portrait.audio').length,framesAfterInterrupt);assert.equal(count('response.cancel'),0);assert(!events.some(e=>e.type==='bridge.error'));assert(!events.some(e=>e.transcript==='stale completion'));
 ws.send(JSON.stringify({type:'input.mute',muted:true}));await until(()=>count('input_audio_buffer.clear')===1);
 const appends=count('input_audio_buffer.append');ws.send(Buffer.alloc(4800));await pause(20);assert.equal(count('input_audio_buffer.append'),appends);
 // A delayed stop for the input cleared by mute must not create a pending turn.
 emit({type:'input_audio_buffer.speech_stopped',item_id:'u2',audio_end_ms:1000});
 ws.send(JSON.stringify({type:'input.mute',muted:false}));ws.send(Buffer.alloc(4800));await until(()=>count('input_audio_buffer.append')===appends+1);
 ws.send(JSON.stringify({type:'text',client_id:'after-mute',text:'accepted after cleared utterance'}));
 await until(()=>events.some(e=>e.type==='text.accepted'&&e.client_id==='after-mute'));
 assert.equal(count('response.create'),1);
 assert.equal(events.some(e=>e.type==='turn.text_blocked'&&e.client_id==='after-mute'),false);
 emit({type:'response.created',response:{id:'typed-after-mute'}});emit({type:'response.done',response:{id:'typed-after-mute',status:'completed'}});
 emit({type:'input_audio_buffer.speech_started',item_id:'u-next',audio_start_ms:1100});
 // An obsolete stop must not steal ownership of the current utterance either.
 emit({type:'input_audio_buffer.speech_stopped',item_id:'u2',audio_end_ms:1000});
 ws.send(JSON.stringify({type:'text',client_id:'during-next',text:'not accepted during next speech'}));
 await until(()=>events.some(e=>e.type==='turn.text_blocked'&&e.client_id==='during-next'));
 assert.equal(count('response.create'),1);
 emit({type:'input_audio_buffer.speech_stopped',item_id:'u-next',audio_end_ms:1400});emit({type:'response.created',response:{id:'r2'}});
 // A stale completion cannot make a newer response inactive.
 emit({type:'response.done',response:{id:'r1',status:'cancelled'}});
 if(provider==='openai'){
  emit({type:'response.output_text.delta',response_id:'r2',delta:'long answer'});emit({type:'response.done',response:{id:'r2',status:'completed'}});await until(()=>events.filter(e=>e.type==='portrait.audio').length>framesAfterInterrupt);
  emit({type:'input_audio_buffer.speech_started',item_id:'u3',audio_start_ms:1500});await until(()=>synthCalls[1].signal.aborted);
  const stopped=events.filter(e=>e.type==='portrait.audio').length;await pause(300);assert.equal(events.filter(e=>e.type==='portrait.audio').length,stopped);
  // Close while a later TTS request is pending; its completion cannot restart playback.
  pending=undefined;emit({type:'response.created',response:{id:'r3'}});emit({type:'response.output_text.delta',response_id:'r3',delta:'pending'});emit({type:'response.done',response:{id:'r3',status:'completed'}});await until(()=>pending);ws.close();await until(()=>synthCalls[2].signal.aborted);pending({audio:Buffer.alloc(480).toString('base64')});await pause(20);
 }else{
  // An explicit user interruption still cancels the current native response.
  ws.send(JSON.stringify({type:'interrupt'}));await until(()=>count('response.cancel')===1);assert.equal(sent.find(e=>e.type==='response.cancel').response_id,'r2');ws.close();
 }
 assert.equal(count('input_audio_buffer.commit'),0);assert.equal(count('response.create'),1);assert(!events.some(e=>e.type==='bridge.error'));
});
