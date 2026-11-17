import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const context=await browser.newContext({httpCredentials:{username:'luna',password:'local-ui-test'},viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/portraits');await page.getByText('20 款靜態造型 · 已選',{exact:false}).click();
 const buttons=page.locator('.wardrobe-grid button');assert.equal(await buttons.count(),20);
 const views=new Set();
 for(let i=0;i<20;i++){await buttons.nth(i).click();const main=page.locator('.dh-video-frame>.wardrobe-portrait');assert.equal(await main.getAttribute('aria-label'),await buttons.nth(i).getAttribute('aria-label'));views.add((await main.locator('image').getAttribute('href'))+await main.getAttribute('viewBox'));}
 assert.equal(views.size,20);
 await page.reload();assert.match(await page.locator('.dh-video-frame>.wardrobe-portrait').getAttribute('aria-label'),/^20/);
 await page.screenshot({path:'wardrobe-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'wardrobe-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Anam 動態人像'}).click();await page.locator('#luna-avatar-video').waitFor();assert.equal(await page.locator('.wardrobe-picker').count(),0);
 await page.getByLabel('對話模式').selectOption('business');assert.equal(await page.getByLabel('模擬客戶角色').locator('option').count(),7);
 assert.deepEqual(errors,[]);console.log('PASS: 20 unique original viewports, persistence, desktop/mobile layout, Anam coexistence and seven business roles');
} finally {await browser.close();}
