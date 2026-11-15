// Run after production build and starting a local server with APP_PASSWORD=local-ui-test on port 18788.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'] });
try {
  const context = await browser.newContext({ httpCredentials:{username:'luna',password:'local-ui-test'}, viewport:{width:1440,height:1000} });
  const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:18788/digital');
  await page.getByText('尚未完成影像供應商設定', {exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'開始對話'}).isDisabled(),true);
  await page.getByLabel('對話模式').selectOption('business');
  assert.equal(await page.getByLabel('模擬客戶角色').locator('option').count(),7);
  await page.screenshot({path:'/workspace/scratch/488594c89c9f/digital-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'/workspace/scratch/488594c89c9f/digital-mobile.png',fullPage:true});
  await page.route('**/api/avatar/status',route=>route.fulfill({json:{configured:true,sandbox:true,roles:['Startup CTO']}}));
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Microphone permission denied','NotAllowedError')}});
  await page.reload(); await page.getByRole('button',{name:'開始對話'}).click();
  await page.getByRole('alert').filter({hasText:'Microphone permission denied'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'開始對話'}).isEnabled(),true);
  await page.goto('http://localhost:18788/'); await page.getByText('日常陪伴',{exact:false}).first().waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop UI, mobile overflow, seven roles, configuration gate, simulated microphone denial/retry, legacy page render, no page exceptions');
} finally { await browser.close(); }
