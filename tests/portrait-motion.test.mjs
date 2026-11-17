import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {portraitFrame,motionSource} from '../shared/portrait-motion.mjs';
test('20 characters use separate motion assets and reject invalid identities',()=>{
 assert.equal(new Set(Array.from({length:20},(_,i)=>motionSource(i+1))).size,20);
 for(const id of [0,21,1.5,NaN])assert.throws(()=>motionSource(id));
});
test('idle sequence includes real blink, head and gesture frames and loops',()=>{
 const seen=new Set();for(let t=0;t<20000;t+=10)seen.add(portraitFrame(t));
 assert.deepEqual([...seen].sort(),[0,1,2,3,4,5,6,7]);
 assert.equal(portraitFrame(0),0);assert.equal(portraitFrame(3000),1);assert.equal(portraitFrame(3140),2);
 assert.equal(portraitFrame(-1),0);
});
test('speaking changes pose timing without claiming phoneme alignment',()=>{
 assert.notEqual(portraitFrame(1150,false),portraitFrame(1150,true));
 for(let t=0;t<30000;t+=70)assert.ok(portraitFrame(t,true)>=0 && portraitFrame(t,true)<8);
});

test('all twenty animation sheets exist, have eight correctly sized cells and unique bytes',()=>{
 const hashes=new Set();
 for(let id=1;id<=20;id++){
  const png=readFileSync(new URL('../public'+motionSource(id),import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1536);assert.equal(png.readUInt32BE(20),1024);
  hashes.add(createHash('sha256').update(png).digest('hex'));
 }
 assert.equal(hashes.size,20);
});
