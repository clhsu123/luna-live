import { useEffect, useRef } from 'react';

/** Muted visual clips: the live response audio is played separately. */
export function CompanionVideo({paused,speaking}:{paused:boolean;speaking:boolean;getLevel:()=>number}) {
 const idle=useRef<HTMLVideoElement>(null);
 const talk=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
  const idleVideo=idle.current,talkVideo=talk.current;
  if(!idleVideo||!talkVideo)return;
  if(paused||document.hidden){idleVideo.pause();talkVideo.pause();return;}
  if(speaking){idleVideo.pause();if(talkVideo.currentTime===0)talkVideo.currentTime=0;void talkVideo.play().catch(()=>{});}
  else{talkVideo.pause();talkVideo.currentTime=0;void idleVideo.play().catch(()=>{});}
 },[paused,speaking]);
 useEffect(()=>{
  const onVisibility=()=>{
   const idleVideo=idle.current,talkVideo=talk.current;
   if(!idleVideo||!talkVideo)return;
   if(document.hidden){idleVideo.pause();talkVideo.pause();}
   else if(!paused)void (speaking?talkVideo:idleVideo).play().catch(()=>{});
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>document.removeEventListener('visibilitychange',onVisibility);
 },[paused,speaking]);
 return <div className="companion-video" style={{position:'relative',width:'100%',aspectRatio:'9 / 16',background:'#170f20'}}>
  <video ref={idle} src="/prototype/luna-loop.mp4" poster="/prototype/luna-first-frame.png" muted loop playsInline preload="metadata" aria-label="Luna 聆聽動畫" style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}} />
  <video ref={talk} src="/prototype/luna-speaking.mp4" muted loop playsInline preload="metadata" aria-label="Luna 說話動畫" aria-hidden={!speaking} style={{position:'absolute',inset:0,display:'block',width:'100%',height:'100%',objectFit:'contain',opacity:speaking?1:0,transition:'opacity 180ms ease',pointerEvents:'none'}} />
 </div>;
}
