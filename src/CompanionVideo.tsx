import { useEffect, useRef, useState } from 'react';
import { createMouthRenderer } from '../shared/mouth-renderer.mjs';
type Track = {fps:number;frames:(number[]|null)[]};
export function CompanionVideo({paused,getLevel}:{paused:boolean;getLevel:()=>number}) {
 const canvases=[useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null)];
 const pauseRef=useRef(paused), levelRef=useRef(getLevel);
 pauseRef.current=paused;levelRef.current=getLevel;
 const [message,setMessage]=useState('載入 Luna 動作…');
 const resumeRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false,raf=0,active=0,current=0,cycles=0,lastTime=0,busy=false,started=false,playPending=false,playBlocked=false;
  let seen=[0],limit=2+Math.floor(Math.random()*3);
  const controller=new AbortController();
  const videos=[document.createElement('video'),document.createElement('video')];
  videos.forEach(v=>{v.muted=true;v.playsInline=true;v.loop=true;v.preload='auto';});
  let renderers:ReturnType<typeof createMouthRenderer>[]=[];
  let tracks:Track[]=[];const selected=[0,0];
  const hidden=()=>document.hidden||pauseRef.current;
  const play=()=>{if(hidden()||playPending||playBlocked||disposed)return;playPending=true;void videos[active].play().then(()=>{if(!disposed)setMessage('');}).catch(()=>{playBlocked=true;if(!disposed)setMessage('點一下啟用角色動畫');}).finally(()=>{playPending=false;});};
  resumeRef.current=()=>{playBlocked=false;play();};
  const visibility=()=>{if(document.hidden)videos.forEach(v=>v.pause());else play();};
  document.addEventListener('visibilitychange',visibility);
  async function load(v:HTMLVideoElement,id:number){
   await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>{cleanup();reject(Error('影片載入逾時'));},15000);
    const cleanup=()=>{clearTimeout(timeout);v.removeEventListener('loadeddata',yes);v.removeEventListener('error',no);controller.signal.removeEventListener('abort',no);};
    const yes=()=>{cleanup();resolve();};const no=()=>{cleanup();reject(Error('影片無法載入'));};
    v.addEventListener('loadeddata',yes);v.addEventListener('error',no);controller.signal.addEventListener('abort',no);
    v.src=`/companion-b/loop-${id+1}.mp4`;v.load();
   });
  }
  async function change(){
   if(busy||hidden())return;busy=true;
   const options=[0,1,2].filter(i=>!seen.includes(i));const pool=options.length?options:[0,1,2].filter(i=>i!==current);
   const id=pool[Math.floor(Math.random()*pool.length)], next=1-active;
   try{await load(videos[next],id);if(disposed)return;if(hidden()){busy=false;return;}await videos[next].play();if(disposed||hidden()){videos[next].pause();busy=false;return;}
    const old=active;selected[next]=id;current=id;active=next;seen=[...seen,id].slice(-2);cycles=0;lastTime=0;limit=2+Math.floor(Math.random()*3);
    canvases[next].current!.style.opacity='1';canvases[old].current!.style.opacity='0';
    setTimeout(()=>{videos[old].pause();busy=false;},350);
   }catch{busy=false;if(!disposed)setMessage('動作切換失敗，繼續目前片段。');}
  }
  function tick(){
   if(disposed)return;
   if(hidden())videos.forEach(v=>v.pause());
   else if(started&&videos[active].paused)play();
   for(let i=0;i<2;i++){
    const v=videos[i],t=tracks[selected[i]];
    if(t&&v.readyState>=2)renderers[i]?.draw(v,t.frames[Math.min(t.frames.length-1,Math.floor(v.currentTime*t.fps))],hidden()?0:levelRef.current());
   }
   const time=videos[active].currentTime;
   if(time<lastTime-.2&&!hidden()){cycles++;if(cycles>=limit)void change();}
   lastTime=time;raf=requestAnimationFrame(tick);
  }
  async function init(){try{
   renderers=canvases.map(c=>createMouthRenderer(c.current!));
   tracks=await Promise.all([1,2,3].map(async id=>{const r=await fetch(`/companion-b/loop-${id}.json`,{signal:controller.signal});if(!r.ok)throw Error('動作資料載入失敗');return r.json();}));
   await load(videos[0],0);if(disposed)return;canvases[0].current!.style.opacity='1';started=true;play();tick();
  }catch{if(!disposed)setMessage('此瀏覽器無法載入角色動畫，請重新整理或使用支援 WebGL 的瀏覽器。');}}
  void init();
  return()=>{disposed=true;document.removeEventListener('visibilitychange',visibility);controller.abort();cancelAnimationFrame(raf);videos.forEach(v=>{v.pause();v.removeAttribute('src');v.load();});renderers.forEach(r=>r.dispose());};
 },[]);
 return <div className="companion-video" style={{position:'relative',width:'100%',aspectRatio:'912 / 992'}}>
  {canvases.map((ref,i)=><canvas key={i} ref={ref} aria-label="Luna B · 本地動作與音量嘴型" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',opacity:0,transition:'opacity 320ms linear'}}/>)}
  {message&&<button type="button" onClick={()=>resumeRef.current()} style={{position:'absolute',bottom:12,left:'10%',width:'80%'}}>{message}</button>}
 </div>;
}
