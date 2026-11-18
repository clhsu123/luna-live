import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://localhost:18788/login');
 await page.getByLabel('帳號').fill('luna');await page.getByLabel('密碼').fill('local-ui-test');
 await Promise.all([page.waitForURL('http://localhost:18788/'),page.getByRole('button',{name:'登入',exact:true}).click()]);
 await page.goto('http://localhost:18788/companion');
 const video=page.locator('.companion-video video');await video.waitFor();
 await page.waitForFunction(()=>document.querySelector('.companion-video video')?.readyState>=2);
 assert.deepEqual(await video.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,loop:v.loop,muted:v.muted})),{width:720,height:1280,loop:true,muted:true});
 assert.equal(await page.locator('.companion-video canvas,.companion-video span').count(),0);
 assert.match(await video.getAttribute('src'),/luna-loop\.mp4$/);
 assert((await video.evaluate(v=>v.duration))>36);
 await video.evaluate(v=>{v.currentTime=v.duration-0.25;return v.play();});
 await page.waitForFunction(()=>{const v=document.querySelector('.companion-video video');return v && v.currentTime<2 && !v.paused;},{timeout:5000});
 assert.equal(await page.locator('.wardrobe-picker,.character-picker').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'暫停角色動畫'}).click();
 assert(await video.evaluate(v=>v.paused));
 console.log('PASS: Luna anime preview replaces B loops, continuous stitched playback without fake mouth, pause control and mobile layout');
}finally{await browser.close();}
