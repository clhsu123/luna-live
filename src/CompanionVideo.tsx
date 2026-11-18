import { useEffect, useRef, useState } from 'react';

/** A finite preview of the generated character. Conversation audio remains separate. */
export function CompanionVideo({paused}:{paused:boolean;getLevel:()=>number}) {
 const video = useRef<HTMLVideoElement>(null);
 const [ended,setEnded] = useState(false);
 useEffect(()=>{
  const v=video.current;
  if(!v || ended || document.hidden || paused) {v?.pause();return;}
  void v.play().catch(()=>{});
 },[paused,ended]);
 useEffect(()=>{
  const visibility=()=>{const v=video.current;if(!v)return;if(document.hidden)v.pause();else if(!paused&&!ended)void v.play().catch(()=>{});};
  document.addEventListener('visibilitychange',visibility);
  return()=>document.removeEventListener('visibilitychange',visibility);
 },[paused,ended]);
 return <div className="companion-video" style={{width:'100%',aspectRatio:'9 / 16',background:'#170f20'}}>
  <video ref={video} src="/prototype/luna-eve-6s.mp4" poster="/prototype/luna-first-frame.png" muted playsInline preload="metadata" onEnded={()=>setEnded(true)} aria-label="Luna 動畫角色預覽" style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}} />
 </div>;
}
