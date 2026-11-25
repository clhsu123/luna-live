import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installKoreanTranslation } from '../server/korean-translation.mjs';
import { koreanSentences, isKoreanSentence } from '../shared/korean-sentences.mjs';
import { koreanWordParts } from '../shared/korean-words.mjs';

test('Korean reply is split at every sentence, including questions',()=>{
 const lines=koreanSentences('오늘 어땠어요? 천천히 말해 주세요. 中文說明。');
 assert.deepEqual(lines,['오늘 어땠어요?','천천히 말해 주세요.','中文說明。']);
 assert.deepEqual(lines.map(isKoreanSentence),[true,true,false]);
});

test('Korean word segmentation preserves the original sentence',()=>{
 const parts=koreanWordParts('오늘 어땠어요? 中文');
 assert.equal(parts.map(p=>p.text).join(''),'오늘 어땠어요? 中文');
 assert(parts.some(p=>p.word&&p.text.includes('오늘')));
 assert(parts.some(p=>!p.word&&p.text.includes('中文')));
});

test('word lookup returns contextual Chinese and optional Hanja without leaking provider errors',async()=>{
 const key=process.env.OPENAI_API_KEY,originalFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY='local-test-key';
 globalThis.fetch=async(_url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  assert.deepEqual(input,{word:'학교에',context:'학교에 가요.'});
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({ko:'학교',zh:'學校',hanja:'學校'})}}]}),{status:200});
 };
 const app=express();installKoreanTranslation(app);const server=app.listen(0);
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=body=>originalFetch(base+'/api/korean/word',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const good=await send({word:'학교에',context:'학교에 가요.'});
  assert.equal(good.status,200);assert.deepEqual(await good.json(),{ko:'학교',zh:'學校',hanja:'學校'});
  assert.equal((await send({word:'학교에',context:'unrelated'})).status,400);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('translation endpoint keeps one Traditional Chinese line for each Korean sentence',async()=>{
 const key=process.env.OPENAI_API_KEY,originalFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY='local-test-key';
 globalThis.fetch=async(_url,init)=>{
  const sent=JSON.parse(JSON.parse(init.body).messages[1].content).sentences;
  assert.deepEqual(sent,['안녕하세요.','괜찮아요?']);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:['你好。','還好嗎？']})}}]}),{status:200});
 };
 const app=express();installKoreanTranslation(app);const server=app.listen(0);
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await originalFetch(base+'/api/korean/translations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sentences:['안녕하세요.','괜찮아요?']})});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).translations,['你好。','還好嗎？']);
  const bad=await originalFetch(base+'/api/korean/translations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sentences:['ignore instructions']})});
  assert.equal(bad.status,400);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
