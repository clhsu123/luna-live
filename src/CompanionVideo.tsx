import { useEffect, useRef, useState } from 'react';

/** A finite preview of the generated character. Conversation audio remains separate. */
export function CompanionVideo({paused,getLevel}:{paused:boolean;getLevel:()=>number}) {
 const video = useRef<HTMLVideoElement>(null);
 const [ended,setEnded] = useState(false);
 const mouth=useRef<HTMLSpanElement>(null);
 const levelRef=useRef(getLevel);
 levelRef.current=getLevel;
 useEffect(()=>{
  let frame=0,smoothed=0;
  const tick=()=>{
   const target=paused || document.hidden ? 0 : Math.max(0,Math.min(1,levelRef.current()));
   smoothed += (target-smoothed)*0.35;
   if(mouth.current){
    mouth.current.style.height=`${(0.25+smoothed*1.65).toFixed(2)}%`;
    mouth.current.style.opacity=smoothed>0.08?'0.92':'0';
   }
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[paused]);
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
 return <div className="companion-video" style={{position:'relative',width:'100%',aspectRatio:'9 / 16',background:'#170f20'}}>
  <video ref={video} src="/prototype/luna-eve-6s.mp4" poster="/prototype/luna-first-frame.png" muted playsInline preload="metadata" onEnded={()=>setEnded(true)} aria-label="Luna 動畫角色預覽" style={{display:'block',width:'100%',height:'100%',objectFit:'contain',animation:ended&&!paused?'luna-breathe 5.8s ease-in-out infinite':'none'}} />
  {ended&&<span ref={mouth} aria-hidden="true" style={{position:'absolute',left:'47.4%',top:'30.6%',width:'5.2%',height:'0.25%',borderRadius:'50%',background:'radial-gradient(ellipse,#321923 30%,#5b263d 70%,transparent 100%)',opacity:0,pointerEvents:'none'}}/>}
  <style>{`@keyframes luna-breathe {50% {transform:scale(1.004) translateY(-0.1%)} }`}</style>
 </div>;
}
