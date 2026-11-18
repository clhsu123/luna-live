import { useEffect, useRef } from 'react';

/** Generated-motion preview; live conversation audio is independent. */
export function CompanionVideo({paused}:{paused:boolean;getLevel:()=>number}) {
 const video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
  const v=video.current;
  if(!v||paused||document.hidden){v?.pause();return;}
  void v.play().catch(()=>{});
 },[paused]);
 useEffect(()=>{
  const onVisibility=()=>{const v=video.current;if(!v)return;if(document.hidden)v.pause();else if(!paused)void v.play().catch(()=>{});};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>document.removeEventListener('visibilitychange',onVisibility);
 },[paused]);
 return <div className="companion-video" style={{width:'100%',aspectRatio:'9 / 16',background:'#170f20'}}>
  <video ref={video} src="/prototype/luna-loop.mp4" poster="/prototype/luna-first-frame.png" muted loop playsInline preload="metadata" aria-label="Luna 動畫角色預覽" style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}} />
 </div>;
}
