import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/login');
 await page.getByLabel('帳號').fill('luna');await page.getByLabel('密碼').fill('local-ui-test');
 await Promise.all([page.waitForURL('http://localhost:18788/'),page.getByRole('button',{name:'登入',exact:true}).click()]);
 await page.evaluate(()=>localStorage.setItem('luna.appearance.v1','19-evening'));
 for (const route of ['/anam','/companion','/portraits']) {
  await page.goto('http://localhost:18788'+route);
  if(route==='/portraits')await page.waitForURL('**/anam');
  await page.getByRole('link',{name:'Anam 動態人像'}).waitFor();
  assert.equal(await page.locator('.dh-mode-nav a').count(),2);
  assert.equal(await page.getByRole('link',{name:'Luna 動畫原型'}).count(),0);
  assert.equal(await page.locator('.character-picker,.wardrobe-picker,.wardrobe-portrait').count(),0);
  assert.equal(await page.getByRole('link',{name:'20 款動畫造型'}).count(),0);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'artifacts/clean-'+route.slice(1)+'-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
 }
 await page.route('**/api/korean/translations',async route=>{
  const body=route.request().postDataJSON();
  assert.deepEqual(body.sentences,['오늘 어땠어요?','괜찮아요?']);
  await route.fulfill({json:{translations:['今天過得如何？','還好嗎？']}});
 });
 await page.evaluate(()=>localStorage.setItem('luna.shared-memory.v1',JSON.stringify([{id:'korean-fixture',role:'assistant',text:'오늘 어땠어요? 괜찮아요?',time:''}])));
 await page.reload();
 await page.getByLabel('對話模式').selectOption('korean');
 await page.getByText('今天過得如何？').waitFor();
 assert.equal(await page.locator('article.assistant .dh-korean-line').count(),2);
 assert.deepEqual(await page.locator('article.assistant .dh-korean-translation').allTextContents(),['今天過得如何？','還好嗎？']);
 await page.route('**/api/korean/word',async route=>{
  const body=route.request().postDataJSON();
  assert.equal(body.word,'오늘');
  await route.fulfill({json:{ko:'오늘',zh:'今天',hanja:''}});
 });
 await page.getByRole('button',{name:'오늘，查詢單字'}).click();
 await page.getByText('今天', {exact:true}).waitFor();
 await page.getByRole('button',{name:'加入單字庫'}).click();
 assert.equal(await page.getByRole('heading',{name:/韓文單字庫/}).count(),1);
 await page.getByRole('button',{name:'單字測驗'}).click();
 await page.getByRole('button',{name:'顯示答案'}).click();
 await page.getByRole('button',{name:'答對了'}).click();
 await page.reload();
 await page.getByText('答對 1 · 待複習 0').waitFor();
 await page.getByLabel('對話模式').selectOption('business');
 assert.equal(await page.getByLabel('模擬客戶角色').locator('option').count(),7);
 assert.deepEqual(errors,[]);
 console.log('PASS: only Anam and companion navigation, no wardrobe sections, retired URL fallback and mobile layout');
} finally {await browser.close();}
