import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},bypassCSP:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18788/login');await page.getByLabel('帳號').fill('luna');await page.getByLabel('密碼').fill('local-ui-test');
 await Promise.all([page.waitForURL('http://localhost:18788/'),page.getByRole('button',{name:'登入',exact:true}).click()]);
 await page.goto('http://localhost:18788/companion');
 await page.waitForFunction(()=>document.querySelector('.companion-video canvas')?.width===912);
 assert.equal(await page.locator('.wardrobe-picker').count(),0);
 await page.waitForFunction(()=>[...document.querySelectorAll('.companion-video canvas')].some(c=>getComputedStyle(c).opacity==='1'));
 assert.equal(await page.locator('nav a[aria-current=page]').getAttribute('href'),'/companion');
 await page.screenshot({path:'artifacts/companion-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'暫停角色動畫'}).click();await page.screenshot({path:'artifacts/companion-mobile.png',fullPage:true});
 const source=readFileSync('shared/mouth-renderer.mjs','utf8').replace('export function','function');
 const pixels=await page.evaluate(async source=>{
  const factory=new Function(source+';return createMouthRenderer;')();const canvas=document.createElement('canvas');const r=factory(canvas);const v=document.createElement('video');v.muted=true;v.src='/companion-b/loop-1.mp4';
  await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;v.load();});
  await new Promise((resolve,reject)=>{v.requestVideoFrameCallback(resolve);v.play().catch(reject);});v.pause();
  const t=await(await fetch('/companion-b/loop-1.json')).json();const track=t.frames[Math.min(t.frames.length-1,Math.floor(v.currentTime*t.fps))];const gl=canvas.getContext('webgl');
  document.body.append(canvas);canvas.id='mouth-test';
  await new Promise(requestAnimationFrame);
  r.draw(v,track,0);const error0=gl.getError();const a=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);
  const closed=canvas.toDataURL();r.draw(v,track,1);const error1=gl.getError();const b=new Uint8Array(a.length);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);
  let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
  const diagnostic={changed,closed,open:canvas.toDataURL(),error0,error1,readError:gl.getError(),lost:gl.isContextLost(),ready:v.readyState,width:canvas.width,height:canvas.height,track:track,sum:a.reduce((s,x)=>s+x,0),sample:[...a.slice(0,16)]};r.dispose();canvas.remove();v.removeAttribute('src');v.load();return diagnostic;
 },source);
 const {closed,open,...diagnostic}=pixels;console.log('mouth renderer diagnostic',JSON.stringify(diagnostic));for(const [name,data]of Object.entries({closed,open}))writeFileSync(`artifacts/mouth-${name}.png`,Buffer.from(data.split(',')[1],'base64'));assert(pixels.changed>100&&pixels.changed<50000,`mouth changes localized pixels: ${pixels.changed}`);assert.deepEqual(errors,[]);
 console.log('PASS: companion route, tracked mouth rendering, desktop/mobile layout, preserved old routes');
}finally{await browser.close();}
