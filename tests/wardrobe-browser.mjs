import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/login');
 await page.getByLabel('帳號').fill('luna');await page.getByLabel('密碼').fill('local-ui-test');
 await Promise.all([page.waitForURL('http://localhost:18788/'),page.getByRole('button',{name:'登入',exact:true}).click()]);
 assert.ok((await context.cookies()).some(cookie=>cookie.name==='luna_session'&&cookie.httpOnly));
 await page.goto('http://localhost:18788/portraits');await page.getByText('20 款動畫造型 · 已選',{exact:false}).click();
 const buttons=page.locator('.wardrobe-grid button');assert.equal(await buttons.count(),20);
 const views=new Set();
 for(let i=0;i<20;i++){await buttons.nth(i).click();const main=page.locator('.dh-video-frame>.wardrobe-portrait');await page.waitForFunction(()=>document.querySelector('.wardrobe-motion')?.getAttribute('data-loaded')==='true');assert.ok((await main.getAttribute('aria-label')).startsWith(await buttons.nth(i).getAttribute('aria-label')));views.add((await main.locator('image').getAttribute('href'))+await main.getAttribute('viewBox'));}
 assert.equal(views.size,20);
 await page.waitForFunction(()=>Number(document.querySelector('.wardrobe-motion')?.getAttribute('data-frame'))>0);
 await page.getByRole('button',{name:'暫停角色動畫'}).click();await page.waitForFunction(()=>document.querySelector('.wardrobe-motion')?.getAttribute('data-frame')==='0');await page.waitForTimeout(200);assert.equal(await page.locator('.wardrobe-motion').getAttribute('data-frame'),'0');
 await page.getByRole('button',{name:'播放角色動畫'}).click();
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.wardrobe-motion')?.getAttribute('data-frame')==='0');assert.equal(await page.locator('.wardrobe-motion').getAttribute('data-frame'),'0');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.reload();assert.match(await page.locator('.dh-video-frame>.wardrobe-portrait').getAttribute('aria-label'),/^20/);
 await page.screenshot({path:'artifacts/wardrobe-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByText('20 款動畫造型 · 已選',{exact:false}).click();
 for(let i=0;i<20;i++){await buttons.nth(i).click();await page.waitForFunction(()=>document.querySelector('.wardrobe-motion')?.getAttribute('data-loaded')==='true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'artifacts/wardrobe-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Anam 動態人像'}).click();await page.locator('#luna-avatar-video').waitFor();assert.equal(await page.locator('.wardrobe-picker').count(),0);
 await page.getByLabel('對話模式').selectOption('business');assert.equal(await page.getByLabel('模擬客戶角色').locator('option').count(),7);
 assert.deepEqual(errors,[]);console.log('PASS: 20 unique animation sheets, frame changes, pause/reduced-motion, persistence, desktop/mobile layout, Anam coexistence and seven business roles');
} finally {await browser.close();}
