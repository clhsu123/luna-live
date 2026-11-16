// Run after build and local server on :18788 with APP_PASSWORD=local-ui-test.
// Synthetic video: no provider calls, microphone use or billable sessions.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const output=process.env.PORTRAIT_TEST_OUTPUT || join(tmpdir(),'luna-portrait-tests');
mkdirSync(output,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
try {
 const context = await browser.newContext({extraHTTPHeaders:{Authorization:'Basic '+Buffer.from('luna:local-ui-test').toString('base64')}});
 const page = await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18788/anam');
 await page.getByRole('heading',{name:'與 Luna 對話'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'開始對話',exact:true}).isDisabled(),true);
 for (const [width,height] of [[2560,1600],[1440,1000],[402,874],[390,844],[320,720],[844,390]]) {
  await page.setViewportSize({width,height});
  for (const size of ['小','中','大']) {
   await page.getByRole('button',{name:size,exact:true}).click();
   const bounds=await page.evaluate(()=>{
    const frame=document.querySelector('.dh-video-frame').getBoundingClientRect();
    const controls=document.querySelector('.dh-controls').getBoundingClientRect();
    const status=document.querySelector('.dh-status').getBoundingClientRect();
    const style=getComputedStyle(document.querySelector('video'));
    return {ratio:frame.width/frame.height,fit:style.objectFit,transform:style.transform,overflow:document.documentElement.scrollWidth>innerWidth,controlsBelow:controls.top>=frame.bottom,statusAbove:status.bottom<=frame.top};
   });
   assert.ok(Math.abs(bounds.ratio-2/3)<.002,JSON.stringify({width,size,bounds}));
   assert.equal(bounds.fit,'contain');assert.equal(bounds.transform,'none');assert.equal(bounds.overflow,false);
   assert.equal(bounds.controlsBelow,true);assert.equal(bounds.statusAbove,true);
  }
 }
 await page.getByLabel('對話模式').selectOption('business');
 assert.equal(await page.getByLabel('模擬客戶角色').locator('option').count(),7);
 await page.getByLabel('對話模式').selectOption('companion');
 assert.equal(await page.getByLabel('對話模式').inputValue(),'companion');
 await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'中',exact:true}).click();
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1152;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#264d47';ctx.fillRect(0,0,768,1152);
  ctx.strokeStyle='#a6f4d6';ctx.lineWidth=24;ctx.strokeRect(12,12,744,1128);
  ctx.fillStyle='white';ctx.font='32px sans-serif';ctx.fillText('PORTRAIT TEST 768 × 1152',120,576);
  const video=document.querySelector('video');video.muted=true;video.srcObject=canvas.captureStream(1);await video.play();
 });
 await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:402,height:874});
 await page.screenshot({path:join(output,'mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: 18 viewport/size combinations; portrait ratio; full-frame contain; controls/status outside video; no overflow; mode switching; synthetic stream; zero browser errors.');
} finally {await browser.close();}
