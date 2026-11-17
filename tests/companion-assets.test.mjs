import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('single-character loops have complete finite per-frame mouth tracks',()=>{
 for(let i=1;i<=3;i++){
  const data=JSON.parse(readFileSync(`public/companion-b/loop-${i}.json`));
  assert.equal(data.fps,24);assert.equal(data.frames.length,42);
  for(const row of data.frames){assert.equal(row.length,5);assert(row.every(Number.isFinite));assert(row[0]>0&&row[0]<data.width);assert(row[1]>0&&row[1]<data.height);assert(row[2]>10);assert(row[4]>=0);}
  assert(readFileSync(`public/companion-b/loop-${i}.mp4`).length>10000);
 }
});
