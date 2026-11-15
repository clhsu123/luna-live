import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioBatcher } from '../server/audio-batcher.mjs';
test('multiple PCM fragments preserve exact samples in one provider frame', () => {
  const frames=[]; const batch=new AudioBatcher(audio=>frames.push(Buffer.from(audio,'base64')));
  batch.append(Buffer.from([1,2,3,4]).toString('base64')); batch.append(Buffer.from([5,6]).toString('base64'));
  batch.flush(); assert.equal(frames.length,1); assert.deepEqual([...frames[0]],[1,2,3,4,5,6]);
});
test('interruption discards pending speech and never contaminates next utterance', async () => {
  const frames=[]; const batch=new AudioBatcher(audio=>frames.push(Buffer.from(audio,'base64')), {delayMs:10});
  batch.append(Buffer.from([1,2]).toString('base64')); batch.clear();
  await new Promise(r=>setTimeout(r,25)); assert.equal(frames.length,0);
  batch.append(Buffer.from([3,4]).toString('base64')); batch.flush(); assert.deepEqual([...frames[0]],[3,4]);
});
test('short utterance tail flushes by deadline; failed asynchronous send invokes cleanup', async () => {
  let failure=false; const batch=new AudioBatcher(()=>{throw Error('closed')}, {delayMs:5,onError:()=>{failure=true}});
  batch.append(Buffer.from([1,2]).toString('base64')); await new Promise(r=>setTimeout(r,20)); assert.equal(failure,true);
});
