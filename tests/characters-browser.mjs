import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const context = await browser.newContext({httpCredentials:{username:'luna',password:'local-ui-test'},viewport:{width:1440,height:1000}});
 const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/');
 await page.evaluate(()=>localStorage.setItem('luna.shared-memory.v1',JSON.stringify([{id:'remember',role:'user',text:'我喜歡烏龍茶',time:'12:00'}])));
 await page.reload();
 await page.getByRole('button',{name:/角色與造型/}).click();
 assert.equal(await page.locator('.character-grid button').count(),8);
 for (const button of await page.locator('.character-grid button').all()) {
  await button.click(); assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('.character-portrait').evaluate(img=>img.getAttribute('src').startsWith('/characters/')));
 }
 await page.waitForFunction(()=>[...document.querySelectorAll('.character-grid img')].every(i=>i.complete && i.naturalWidth>0));
 await page.reload(); assert.match(await page.locator('.character-portrait').getAttribute('src'),/20-evening/);
 await page.getByText('我喜歡烏龍茶',{exact:true}).waitFor();
 await page.getByRole('button',{name:/角色與造型/}).click();
 await page.screenshot({path:'/workspace/scratch/488594c89c9f/characters-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/workspace/scratch/488594c89c9f/characters-mobile.png',fullPage:true});
 await page.goto('http://localhost:18788/digital');
 await page.getByText('我喜歡烏龍茶',{exact:true}).waitFor();
 await page.getByRole('button',{name:/角色與造型/}).click();
 await page.getByRole('button',{name:/Luna · 黑白 OL/}).click();
 await page.getByRole('link',{name:/使用所選造型/}).click();
 assert.match(await page.locator('.character-portrait').getAttribute('src'),/luna-office/);
 // Mock only transport: assert history is actually sent on reconnect, not just displayed.
 await page.addInitScript(()=>{
  window.sent=[]; window.peers=0;
  navigator.mediaDevices.getUserMedia=async()=>({getAudioTracks:()=>[],getTracks:()=>[]});
  window.RTCPeerConnection=class {
   constructor(){window.peers++;}
   createDataChannel(){this.dc={readyState:'open',send:raw=>window.sent.push(JSON.parse(raw)),close(){}};return this.dc;}
   async createOffer(){return {sdp:'v=0'};} async setLocalDescription(){} async setRemoteDescription(){this.dc.onopen();}
   close(){} addTrack(){}
  };
 });
 await page.route('**/api/session?*',r=>r.fulfill({status:200,body:'v=0'}));
 await page.reload();
 await page.getByRole('button',{name:'開始對話',exact:true}).click();
 await page.waitForFunction(()=>window.sent.length>0);
 assert.equal(await page.evaluate(()=>window.sent[0].item.content[0].text),'我喜歡烏龍茶');
 await page.getByRole('button',{name:/角色與造型/}).click();
 await page.getByRole('button',{name:/19 · 墨綠晚裝/}).click();
 assert.equal(await page.evaluate(()=>window.peers),1);
 assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='conversation.item.create').length),1);
 await page.getByRole('button',{name:'開始說話',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='response.create').length),0);
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='response.create').length),0);
 await page.getByRole('button',{name:'我說完了',exact:true}).click();
 await page.waitForFunction(()=>window.sent.some(e=>e.type==='response.create'));
 assert.equal(await page.evaluate(()=>window.sent.filter(e=>e.type==='input_audio_buffer.commit').length),1);
 page.on('dialog',d=>d.accept()); await page.getByRole('button',{name:'清除共享記憶',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('luna.shared-memory.v1')).length),0);
 await page.reload(); assert.equal(await page.getByText('我喜歡烏龍茶',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS 8 portraits, images loaded, character persistence, desktop/mobile, memory across interfaces/reload, realtime history replay, no reconnect on appearance change, clear memory');
} finally { await browser.close(); }
