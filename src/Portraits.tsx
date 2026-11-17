import { useEffect, useState } from 'react';
import { motionSource, portraitFrame } from '../shared/portrait-motion.mjs';
// Viewports reference the approved original sheets without generating new faces.
export const portraits = Array.from({length:20}, (_, index) => ({id:index+1, label:`${String(index+1).padStart(2,'0')} · ${index<10?'After Hours':'Office'}`}));
export function usePortrait() {
  const [id,setId]=useState(()=>{try {const saved=Number(localStorage.getItem('luna.portrait.v1'));return portraits.some(p=>p.id===saved)?saved:1;}catch{return 1;}});
  return [id,(value:number)=>{if(!portraits.some(p=>p.id===value))return;setId(value);try{localStorage.setItem('luna.portrait.v1',String(value));}catch{}}] as const;
}
export function Portrait({id}: {id:number}) {
  const office=id>10, cell=(id-1)%10, col=cell%5, row=Math.floor(cell/5);
  const xs=office?[2,311,620,924,1229]:[10,320,624,925,1227];
  const widths=office?[305,305,299,301,305]:[300,293,291,291,299];
  const y=office?(row?534:54):(row?532:47), height=office?(row?457:447):(row?460:452);
  return <svg className="wardrobe-portrait" viewBox={`${xs[col]} ${y} ${widths[col]} ${height}`} role="img" aria-label={portraits[id-1].label} preserveAspectRatio="xMidYMid meet"><image href={`/wardrobe/${office?'office':'after-hours'}.png`} width="1536" height="1024"/></svg>;
}
export function PortraitPicker({selected,onSelect}:{selected:number;onSelect:(id:number)=>void}) {
 return <details className="wardrobe-picker"><summary>角色與造型 · 20 款動畫造型 · 已選 {String(selected).padStart(2,'0')}</summary><p>20 款角色有眨眼、轉頭與動作，以逐格動畫播放，不含語音嘴型同步。更換造型不會中斷對話。</p><div className="wardrobe-grid">{portraits.map(p=><button type="button" key={p.id} aria-label={p.label} aria-pressed={selected===p.id} onClick={()=>onSelect(p.id)}><Portrait id={p.id}/><span>{p.label}</span></button>)}</div></details>;
}

// Mounted with key=id, so changing character cannot retain an older load or timer.
export function AnimatedPortrait({id,speaking,paused}: {id:number;speaking:boolean;paused:boolean}) {
 const [frame,setFrame]=useState(0), [loaded,setLoaded]=useState(false), [failed,setFailed]=useState(false);
 useEffect(()=>{
  // HTMLImageElement reliably reports cached and fresh loads; SVG image load
  // events are not consistently forwarded by React's event delegation.
  let active=true;
  const image=new Image();
  image.onload=()=>{if(active)setLoaded(true);};
  image.onerror=()=>{if(active)setFailed(true);};
  image.src=motionSource(id);
  return ()=>{active=false;image.onload=null;image.onerror=null;};
 },[id]);
 useEffect(()=>{
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  let timer: ReturnType<typeof setInterval> | undefined;
  const update=()=>{
   clearInterval(timer);setFrame(0);
   if (!loaded || failed || paused || preference.matches || document.hidden) return;
   const start=performance.now();
   timer=setInterval(()=>setFrame(portraitFrame(performance.now()-start,speaking)),70);
  };
  update();preference.addEventListener('change',update);document.addEventListener('visibilitychange',update);
  return ()=>{clearInterval(timer);preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
 },[loaded,failed,paused,speaking]);
 if(failed)return <><Portrait id={id}/><span className="motion-load-error" role="status">動畫載入失敗，暫時顯示原圖。</span></>;
 return <svg className="wardrobe-portrait wardrobe-motion" viewBox="0 0 384 512" role="img" aria-label={`${portraits[id-1].label} · 逐格動畫`} data-frame={frame} data-loaded={loaded} preserveAspectRatio="xMidYMid meet">
  <image href={motionSource(id)} width="1536" height="1024" x={-(frame%4)*384} y={-Math.floor(frame/4)*512}/>
  {!loaded&&<text x="192" y="256" textAnchor="middle" fill="white">載入角色動畫…</text>}
 </svg>;
}
