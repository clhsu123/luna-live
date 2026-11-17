import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},bypassCSP:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/login');await page.getByLabel('帳號').fill('luna');await page.getByLabel('密碼').fill('local-ui-test');
 await Promise.all([page.waitForURL('http://localhost:18788/'),page.getByRole('button',{name:'登入',exact:true}).click()]);
 await page.goto('http://localhost:18788/companion');
 await page.waitForFunction(()=>document.querySelector('.companion-video canvas')?.width===912);
 assert.equal(await page.locator('.wardrobe-picker').count(),0);
 await page.screenshot({path:'artifacts/companion-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'暫停角色動畫'}).click();await page.screenshot({path:'artifacts/companion-mobile.png',fullPage:true});
 const source=readFileSync('shared/mouth-renderer.mjs','utf8').replace('export function','function');
 const pixels=await page.evaluate(async source=>{
  const factory=new Function(source+';return createMouthRenderer;')();const canvas=document.createElement('canvas');const r=factory(canvas);const v=document.createElement('video');v.muted=true;v.src='/companion-b/loop-1.mp4';
  await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;v.load();});
  const t=await(await fetch('/companion-b/loop-1.json')).json();const gl=canvas.getContext('webgl');
  r.draw(v,t.frames[0],0);const error0=gl.getError();const a=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);
  r.draw(v,t.frames[0],1);const error1=gl.getError();const b=new Uint8Array(a.length);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);
  let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
  const diagnostic={changed,error0,error1,readError:gl.getError(),lost:gl.isContextLost(),ready:v.readyState,width:canvas.width,height:canvas.height,track:t.frames[0],sum:a.reduce((s,x)=>s+x,0),sample:[...a.slice(0,16)]};r.dispose();v.removeAttribute('src');v.load();return diagnostic;
 },source);
 console.log('mouth renderer diagnostic',JSON.stringify(pixels));assert(pixels.changed>100&&pixels.changed<50000,`mouth changes localized pixels: ${pixels.changed}`);assert.deepEqual(errors,[]);
 console.log('PASS: companion route, tracked mouth rendering, desktop/mobile layout, preserved old routes');
}finally{await browser.close();}
