import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeWithXai } from '../server/xai-tts.mjs';
import { voiceProvider } from '../server/voice-provider.mjs';
test('split configuration requires both keys and keeps legacy provider overrides',()=>{
 const v=voiceProvider({CHAT_PROVIDER:'openai',AI_PROVIDER:'xai',CHAT_OUTPUT:'xai-tts',OPENAI_API_KEY:'test'});
 assert.equal(v.name,'openai');assert.equal(v.xaiTts,true);assert.equal(v.xaiTtsConfigured,false);
 assert.deepEqual(v.session('rules').output_modalities,['text']);
});
test('xAI requests timestamped 24kHz PCM in output_format and bounds text',async()=>{
 const signal=new AbortController().signal;
 const result=await synthesizeWithXai('a'.repeat(5000),{env:{XAI_API_KEY:'test'},signal,fetchImpl:async(url,options)=>{
 assert.equal(url,'https://api.x.ai/v1/tts');assert.equal(options.signal,signal);
 const body=JSON.parse(options.body);assert.deepEqual(body.output_format,{codec:'pcm',sample_rate:24000});assert.equal(body.codec,undefined);assert.equal(body.with_timestamps,true);assert.equal(body.text.length,4000);
 return {ok:true,json:async()=>({audio:'AAAA'})};}});
 assert.equal(result.audio,'AAAA');
});
test('TTS errors never include provider response body or secret',async()=>{
 for(const status of [401,429,500])await assert.rejects(synthesizeWithXai('hi',{env:{XAI_API_KEY:'secret'},fetchImpl:async()=>({ok:false,status,text:async()=>'secret'})}),e=>!e.message.includes('secret'));
 await assert.rejects(synthesizeWithXai('hi',{env:{},fetchImpl:()=>{throw Error('must not call')}}));
 await assert.rejects(synthesizeWithXai('hi',{env:{XAI_API_KEY:'test'},fetchImpl:async()=>({ok:true,json:async()=>({})})}));
});
