import { useEffect, useRef, useState } from 'react';

/** Finite generated-motion preview; live conversation audio is independent. */
export function CompanionVideo({paused}:{paused:boolean;getLevel:()=>number}) {
 const video=useRef<HTMLVideoElement>(null);
 const [ended,setEnded]=useState(false);
 useEffect(()=>{
  const v=video.current;
  if(!v||ended||paused||document.hidden){v?.pause();return;}
  void v.play().catch(()=>{});
 },[ended,paused]);
 useEffect(()=>{
  const onVisibility=()=>{const v=video.current;if(!v)return;if(document.hidden)v.pause();else if(!paused&&!ended)void v.play().catch(()=>{});};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>document.removeEventListener('visibilitychange',onVisibility);
 },[paused,ended]);
 return <div className="companion-video" style={{width:'100%',aspectRatio:'9 / 16',background:'#170f20'}}>
  <video ref={video} src="/prototype/luna-stitch-demo.mp4" poster="/prototype/luna-first-frame.png" muted playsInline preload="metadata" onEnded={()=>setEnded(true)} aria-label="Luna 動畫角色預覽" style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}} />
 </div>;
}
