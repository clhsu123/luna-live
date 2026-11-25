import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import './digital.css';
import './characters.css';
import { CompanionVideo } from './CompanionVideo';
import { PcmPlayback } from '../shared/pcm-playback.mjs';
import { useSharedMemory, getMemory, memoryStorageFailed } from './sharedMemory';
import { normalizeHistory } from '../shared/memory.mjs';
import { koreanSentences, isKoreanSentence } from '../shared/korean-sentences.mjs';
import { KoreanText, VocabularySection } from './KoreanVocabulary';
type TurnMode = 'manual' | 'automatic';
type Mode = 'companion' | 'korean' | 'business';
type Entry = { id: string; role: 'user' | 'assistant'; text: string; time: string };
type Configuration = { configured: boolean; sandbox: boolean; roles: string[]; characters?: string[] };
type Session = { id: string; url: string; token: string; ticket: string; sandbox: boolean; sessionToken?: string };
const modes: Record<Mode, string> = { companion: '女友陪伴', korean: '韓文練習', business: '半導體商務模擬' };
export default function DigitalHuman({ anam = false, portrait = false, companion = false }: { anam?: boolean; portrait?: boolean; companion?: boolean }) {
  const api = portrait ? '/api/portrait' : anam ? '/api/anam' : '/api/avatar';
  const [avatarSize, setAvatarSize] = useState<'small' | 'medium' | 'large'>(() => {
    try { const saved = localStorage.getItem('luna.avatar-size.v1'); return saved === 'small' || saved === 'large' ? saved : 'medium'; } catch { return 'medium'; }
  });
  function changeAvatarSize(size: 'small' | 'medium' | 'large') {
    setAvatarSize(size);
    try { localStorage.setItem('luna.avatar-size.v1', size); } catch { /* Still works for this visit. */ }
  }
  const [turnMode, setTurnMode] = useState<TurnMode>(() => {
    try { return localStorage.getItem('luna.turn-mode.v1') === 'automatic' ? 'automatic' : 'manual'; } catch { return 'manual'; }
  });
  function changeTurnMode(value: TurnMode) {
    setTurnMode(value);
    try { localStorage.setItem('luna.turn-mode.v1', value); } catch { /* Works for this visit. */ }
  }
  const [motionChoice, setMotionChoice] = useState<boolean | null>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const motionPaused = motionChoice ?? systemReducedMotion;
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setSystemReducedMotion(media.matches);
    update();media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[]);
  const pcmPlayback = useRef<PcmPlayback | undefined>(undefined);
  function clearPcm() { pcmPlayback.current?.clear(); }
  function playPcm(encoded: string) {
    if (!context.current) throw Error('Audio not ready');
    pcmPlayback.current ||= new PcmPlayback(context.current, setSpeaking);
    pcmPlayback.current.append(encoded);
  }
  const anamClient = useRef<ReturnType<typeof createClient> | undefined>(undefined);
  const anamAudio = useRef<ReturnType<ReturnType<typeof createClient>['createAgentAudioInputStream']> | undefined>(undefined);
  const [config, setConfig] = useState<Configuration>();
  const [mode, setMode] = useState<Mode>('companion');
  const [role, setRole] = useState('Startup CTO');
  const [status, setStatus] = useState('idle');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(''); const [input, setInput] = useState('');
  const [muted, setMuted] = useState(false); const [subtitles, setSubtitles] = useState(true);
  const [speaking, setSpeaking] = useState(false); const [entries, setEntries] = useSharedMemory();
  const [replaying, setReplaying] = useState<string | null>(null);
  const replayGeneration = useRef(0);
  const replayController = useRef<AbortController | null>(null);
  const replayContext = useRef<AudioContext | null>(null);
  const replayPcm = useRef<PcmPlayback | null>(null);
  const replayUsingAnam = useRef(false);
  function stopReplay() {
    replayGeneration.current++;
    replayController.current?.abort(); replayController.current = null;
    if (replayUsingAnam.current) { try { anamClient.current?.interruptPersona(); } catch { /* Session may have closed. */ } replayUsingAnam.current = false; }
    replayPcm.current?.clear(); replayPcm.current = null;
    void replayContext.current?.close().catch(() => {}); replayContext.current = null;
    setReplaying(null);
  }
  async function replayReply(id: string, reply: string) {
    if (replaying) { stopReplay(); return; }
    if (speaking || recordingNow) return;
    stopReplay(); setError(''); setReplaying(id);
    const generation = replayGeneration.current;
    const controller = new AbortController(); replayController.current = controller;
    const viaAnam = anam && status === 'connected' && Boolean(anamAudio.current);
    try {
      // Create/resume the local audio context in the click gesture before awaiting TTS.
      if (!viaAnam) { replayContext.current = new AudioContext(); await replayContext.current.resume(); }
      const response = await fetch('/api/replay-tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: reply }), signal: controller.signal });
      if (!response.ok) throw Error(response.status === 429 ? '重播太頻繁，請稍後再試。' : '暫時無法重播語音。');
      const result = await response.json() as { audio: string; duration: number };
      if (generation !== replayGeneration.current) return;
      if (viaAnam && anamAudio.current) {
        replayUsingAnam.current = true;
        const raw = atob(result.audio);
        for (let offset = 0; offset < raw.length; offset += 12000) {
          if (generation !== replayGeneration.current) return;
          anamAudio.current.sendAudioChunk(btoa(raw.slice(offset, offset + 12000)));
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        anamAudio.current.endSequence();
        if (generation === replayGeneration.current) { replayUsingAnam.current = false; setReplaying(null); }
      } else if (replayContext.current) {
        replayPcm.current = new PcmPlayback(replayContext.current, value => { if (!value && generation === replayGeneration.current) { setReplaying(null); void replayContext.current?.close().catch(() => {}); replayContext.current = null; replayPcm.current = null; } });
        replayPcm.current.append(result.audio); replayPcm.current.end();
      } else throw Error('對話已中斷，請重新連線後再試。');
    } catch (error) {
      if (generation === replayGeneration.current && !controller.signal.aborted) { stopReplay(); setError(error instanceof Error ? error.message : '暫時無法重播語音。'); }
    }
  }
  const [koreanTranslations,setKoreanTranslations]=useState<Record<string,{text:string;items:string[]|null;loading:boolean}>>({});
  const translationRequests=useRef(new Set<string>());
  async function translateEntry(id:string,entryText:string) {
    const sentences=koreanSentences(entryText).filter(isKoreanSentence);
    if(!sentences.length)return;
    const requestKey=id+'\n'+entryText;
    if(translationRequests.current.has(requestKey))return;
    translationRequests.current.add(requestKey);
    setKoreanTranslations(prev=>({...prev,[id]:{text:entryText,items:null,loading:true}}));
    try {
      const result=await request<{translations:string[]}>('/api/korean/translations',{sentences});
      setKoreanTranslations(prev=>({...prev,[id]:{text:entryText,items:result.translations,loading:false}}));
    }catch{
      setKoreanTranslations(prev=>({...prev,[id]:{text:entryText,items:null,loading:false}}));
    }
  }
  useEffect(()=>{if(mode==='korean')entries.filter(e=>e.role==='assistant').slice(-10).forEach(e=>{void translateEntry(e.id,e.text);});},[mode]);
  // The single configured Luna avatar must not depend on retired wardrobe storage.
  const characterId = config?.characters?.includes('luna-office') ? 'luna-office' : config?.characters?.[0] || 'luna-office';
  const [latency, setLatency] = useState<number>(); const [videoReady, setVideoReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const media = useRef<MediaStream | undefined>(undefined);
  const room = useRef<Room | undefined>(undefined); const socket = useRef<WebSocket | undefined>(undefined); const context = useRef<AudioContext | undefined>(undefined);
  const session = useRef<string | undefined>(undefined); const generation = useRef(0); const busy = useRef(false);
  const audioElements = useRef<HTMLMediaElement[]>([]); const muteRef = useRef(false);
  const recording = useRef(false); const recordedAt = useRef(0);
  const pendingText = useRef<{id: string; text: string} | undefined>(undefined);
  const [textSending, setTextSending] = useState(false);
  const [recordingNow, setRecordingNow] = useState(false); const [finishing, setFinishing] = useState(false);
  const messages = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  async function request<T>(path: string, body?: object): Promise<T> {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) } : {});
    const value = await res.json(); if (!res.ok) throw Error(value.error || `Request failed: ${res.status}`); return value;
  }
  async function stop() {
    stopReplay();
    clearPcm(); pcmPlayback.current = undefined; pendingText.current = undefined; setTextSending(false); recording.current = false; setRecordingNow(false); setFinishing(false);
    generation.current++; busy.current = false;
    const previousAnam = anamClient.current; anamClient.current = undefined; anamAudio.current = undefined;
    void previousAnam?.stopStreaming().catch(() => {}); socket.current?.close(); socket.current = undefined;
    media.current?.getTracks().forEach(t => t.stop()); media.current = undefined;
    void context.current?.close().catch(() => {}); context.current = undefined;
    void room.current?.disconnect(); room.current = undefined;
    audioElements.current.forEach(el => { el.pause(); el.srcObject = null; el.remove(); }); audioElements.current = [];
    if (video.current) video.current.srcObject = null;
    const id = session.current; session.current = undefined;
    setStatus('idle'); setVideoReady(false); setSpeaking(false); setPlaybackBlocked(false);
    if (id) { try { await request(`${api}/sessions/${id}/stop`, {}); } catch { /* Server close/TTL also reaps sessions. */ } }
  }
  useEffect(() => {
    void request<Configuration>(`${api}/status`).then(setConfig).catch(() => setError('無法讀取連線設定，請重新整理。'));
    const unload = () => { void stop(); };
    const visibility = () => {
      if (document.hidden && matchMedia('(pointer: coarse)').matches && (session.current || socket.current)) {
        void stop(); setNotice('切換到背景後已結束對話，避免持續收音與計費。回來後可重新開始。');
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', unload);
    return () => { window.removeEventListener('pagehide', unload); document.removeEventListener('visibilitychange', visibility); void stop(); };
  }, []);
  useEffect(() => {
    const panel = messages.current;
    if (panel && followMessages.current) panel.scrollTop = panel.scrollHeight;
  }, [entries]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const focused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      setKeyboardOpen(Boolean(focused && viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 120));
    };
    viewport?.addEventListener('resize', update);
    document.addEventListener('focusin', update); document.addEventListener('focusout', update);
    return () => { viewport?.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);
  function enablePlayback() {
    // Invoke all media APIs directly inside the tap, before awaiting anything.
    void context.current?.resume().catch(() => setError('無法啟用麥克風，請結束後重新連線。'));
    void room.current?.startAudio().catch(() => setPlaybackBlocked(true));
    if (video.current?.srcObject) void video.current.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    audioElements.current.forEach(el => { void el.play().catch(() => setPlaybackBlocked(true)); });
  }
  async function start() {
    if (busy.current) return; busy.current = true;
    const attempt = ++generation.current;
    const stale = () => generation.current !== attempt;
    muteRef.current = false; setMuted(false);
    setStatus('connecting'); setError(''); setNotice(''); setPlaybackBlocked(false); setLatency(undefined);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw Error('請使用支援麥克風與 AudioWorklet 的 HTTPS 瀏覽器。');
      // Resume from the user's tap, not after the microphone permission promise.
      const ac = new AudioContext(); context.current = ac;
      const resumed = ac.resume(); void resumed.catch(() => {});
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (stale()) { mic.getTracks().forEach(t => t.stop()); return; } media.current = mic;
      await resumed; if (stale()) return;
      await ac.audioWorklet.addModule('/pcm-worklet.js'); if (stale()) return;
      const data = await request<Session>(`${api}/sessions`, { mode, role, turnMode, character: characterId, history: normalizeHistory(getMemory(), 40, 16000) });
      if (stale()) { await request(`${api}/sessions/${data.id}/stop`, {}); return; }
      session.current = data.id;
      if (anam) {
        if (!data.sessionToken) throw Error('Anam 未回傳連線憑證。');
        const client = createClient(data.sessionToken, { disableInputAudio: true }); anamClient.current = client;
        client.addListener(AnamEvent.CONNECTION_CLOSED, () => { if (!stale()) { void stop(); setError('Anam 影像連線已結束，請重新開始。'); } });
        await client.streamToVideoElement('luna-avatar-video');
        if (stale()) { await client.stopStreaming(); return; }
        anamAudio.current = client.createAgentAudioInputStream({ encoding: 'pcm_s16le', sampleRate: 24000, channels: 1 });
      } else if (!portrait) {
      const rtc = new Room(); room.current = rtc;
      rtc.on(RoomEvent.TrackSubscribed, track => {
        if (stale()) return;
        if (track.kind === Track.Kind.Video && video.current) {
          track.attach(video.current); void video.current.play().catch(() => setError('請按「啟用播放」允許影片與聲音。'));
        } else if (track.kind === Track.Kind.Audio) {
          const element = track.attach(); audioElements.current.push(element);
          element.autoplay = true; document.body.appendChild(element);
          void element.play().catch(() => setError('請按「啟用播放」允許影片與聲音。'));
        }
      });
      rtc.on(RoomEvent.Reconnecting, () => { if (!stale()) setStatus('reconnecting'); });
      rtc.on(RoomEvent.Reconnected, () => { if (!stale()) setStatus('connected'); });
      rtc.on(RoomEvent.Disconnected, () => { if (!stale()) { void stop(); setError('影像連線已結束，請重新連線。'); } });
      await rtc.connect(data.url, data.token); if (stale()) { await rtc.disconnect(); return; }
      }
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${api}/bridge?ticket=${encodeURIComponent(data.ticket)}`);
      socket.current = ws;
      const capture = new AudioWorkletNode(ac, 'pcm24-capture');
      const source = ac.createMediaStreamSource(mic); const gain = ac.createGain(); gain.gain.value = 0;
      source.connect(capture); capture.connect(gain); gain.connect(ac.destination);
      let ready = false;
      capture.port.onmessage = e => { if (ready && (turnMode === 'automatic' || recording.current) && !muteRef.current && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 24000) ws.send(e.data as ArrayBuffer); };
      ws.onmessage = event => {
        if (stale()) return;
        try {
          const e = JSON.parse(event.data);
          if (e.type === 'portrait.audio') { playPcm(e.audio); }
          if (e.type === 'portrait.interrupt') clearPcm();
          if (e.type === 'portrait.audio.end') pcmPlayback.current?.end();
          if (e.type === 'anam.audio') { setSpeaking(true); if (!anamAudio.current) throw Error('Anam audio not ready'); anamAudio.current.sendAudioChunk(e.audio); }
          if (e.type === 'anam.audio.end') anamAudio.current?.endSequence();
          if (e.type === 'anam.interrupt') { setSpeaking(false); anamClient.current?.interruptPersona(); anamAudio.current?.endSequence(); }
          if (e.type === 'bridge.ready') { ready = true; setStatus('connected'); }
          if ((e.type === 'text.accepted' || e.type === 'turn.text_blocked') && e.client_id === pendingText.current?.id) {
            const pending = pendingText.current; pendingText.current = undefined; setTextSending(false);
            if (pending && e.type === 'text.accepted') {
              setError('');
              setEntries(prev => [...prev, { id: pending.id, role: 'user', text: pending.text, time: '' }]);
              setInput(value => value === pending.text ? '' : value);
            } else if (e.type === 'turn.text_blocked') setError('語音回合尚在處理，請稍後再傳送文字。');
          }
          if (e.type === 'turn.empty') setError('沒有收到足夠音訊，請再按「開始說話」。');
          if (e.type === 'bridge.error') { void stop(); setError(e.message); }
          if (e.type === 'avatar.speaking') { if (!portrait) setSpeaking(e.value); if (typeof e.responseLatencyMs === 'number') setLatency(e.responseLatencyMs); }
          if (e.type === 'conversation.item.input_audio_transcription.completed') setEntries(prev => [...prev.filter(entry => entry.id !== e.item_id), { id: e.item_id, role: 'user', text: e.transcript, time: '' }]);
          if (e.type === 'response.output_audio_transcript.delta' || e.type === 'response.output_audio_transcript.done') {
            if(e.type.endsWith('.done') && mode==='korean' && typeof e.transcript==='string')void translateEntry(e.response_id,e.transcript);
            setEntries(prev => {
              const id = e.response_id; const old = prev.find(x => x.id === id);
              const next: Entry = { id, role: 'assistant', time: '', text: e.type.endsWith('.done') ? e.transcript : (old?.text || '') + e.delta };
              return old ? prev.map(x => x.id === id ? next : x) : [...prev, next];
            });
          }
          if (e.type === 'response.created') stopReplay();
          if (e.type === 'input_audio_buffer.speech_started') { stopReplay(); setSpeaking(false); if (turnMode === 'automatic' && !muteRef.current) setRecordingNow(true); }
          if (e.type === 'input_audio_buffer.speech_stopped' && turnMode === 'automatic') setRecordingNow(false);
        } catch { void stop(); setError('影像音訊傳送失敗，請重新連線。'); }
      };
      ws.onerror = () => { if (!stale()) { void stop(); setError('語音連線失敗，請重新連線。'); } };
      ws.onclose = () => { if (!stale()) { void stop(); setError('對話已結束或超過 session 時限。'); } };
    } catch (e) {
      if (!stale()) { await stop(); setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '請在 Safari 的網站設定允許麥克風，再按開始對話。' : e instanceof Error ? e.message : '無法建立連線'); }
    }
  }
  async function toggleTurn() {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || finishing) return;
    if (!recording.current) {
      try { await context.current?.resume(); } catch { setError('麥克風暫停，請按啟用播放後再試。'); return; }
      if (socket.current !== ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'turn.start' })); recording.current = true; recordedAt.current = Date.now();
      setRecordingNow(true); setSpeaking(false); muteRef.current = false; setMuted(false);
    } else {
      if (Date.now() - recordedAt.current < 300) { setError('請說完一句話後，再按「我說完了」。'); return; }
      setFinishing(true);
      window.setTimeout(() => {
        if (socket.current !== ws || !recording.current) return;
        recording.current = false; setRecordingNow(false); setFinishing(false);
        ws.send(JSON.stringify({ type: 'turn.end' }));
      }, 150);
    }
  }
  function toggleMute() {
    const value = !muteRef.current; muteRef.current = value; setMuted(value);
    if (turnMode === 'automatic') {
      setRecordingNow(false);
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input.mute', muted: value }));
    }
  }
  function text() {
    if (recording.current) { setError('請先按「我說完了」送出語音，再傳文字。'); return; }
    if (turnMode === 'automatic' && recordingNow) { setError('正在收音，請先停頓或靜音，再傳送文字。'); return; }
    if (pendingText.current || !input.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    const pending = { id: crypto.randomUUID(), text: input }; pendingText.current = pending; setTextSending(true);
    socket.current.send(JSON.stringify({ type: 'text', client_id: pending.id, text: pending.text }));
  }
  const active = status !== 'idle';
  return <div className={`dh-app${keyboardOpen ? ' dh-keyboard-open' : ''}`}>
    <header className="dh-header"><a href="/">LUNA<span>LIVE</span></a><span>即時 AI 對話</span><span>你的 AI 女友 · 25+</span></header>
    <nav className="dh-mode-nav" aria-label="人像模式"><a href="/anam" aria-current={!portrait ? 'page' : undefined}>Anam 動態人像</a><a href="/companion" aria-current={companion ? 'page' : undefined}>Luna B 動畫陪伴</a></nav>
    {portrait && <><div className="dh-size-controls"><button type="button" aria-pressed={motionPaused} onClick={()=>setMotionChoice(!motionPaused)}>{motionPaused ? '播放角色動畫' : '暫停角色動畫'}</button>{motionChoice !== null && <button type="button" onClick={()=>setMotionChoice(null)}>依照系統動畫設定</button>}<small role="status">{motionChoice === null && systemReducedMotion ? '系統已減少動態效果；按播放可啟用本頁動畫。' : motionPaused ? '角色動畫已暫停' : '角色動畫播放中。'}</small></div></>}
    <details className="dh-characters dh-memory"><summary>對話記憶 · {entries.length} 則</summary>
      <p className="memory-note">對話記憶：{entries.length} 則 · 保存在此瀏覽器，重新連線可接續。
      <button onClick={async () => { if (window.confirm('清除對話記憶並結束目前對話？')) { await stop(); setEntries([]); } }}>清除對話記憶</button>
      {memoryStorageFailed() && <span role="alert">瀏覽器儲存失敗，目前記憶僅保留到頁面關閉。</span>}</p></details>
    {anam && <>{config && !config.characters?.includes(characterId) && <p className="dh-notice">此造型尚未連結 Anam Avatar ID。請在伺服器設定 ANAM_AVATAR_MAP 後即可使用。</p>}</>}
    <div className="dh-size-controls" role="group" aria-label="人像大小"><span>視窗大小 · 完整上半身</span>{([['small', '小'], ['medium', '中'], ['large', '大']] as const).map(([size, label]) => <button key={size} type="button" aria-pressed={avatarSize === size} onClick={() => changeAvatarSize(size)}>{label}</button>)}</div>
    <main className={`dh-layout dh-size-${avatarSize}`}><section className="dh-stage" aria-label={portrait ? "動畫造型" : "數位人影片"}>
      <div className="dh-status" role="status"><i className={active ? 'on' : ''}/>{status === 'connected' ? speaking ? anam ? 'Luna 語音回覆中' : 'Luna 正在說話' : turnMode === 'automatic' ? muted ? '麥克風已靜音' : recordingNow ? '正在聽你說話' : '自然對話 · 可以直接說話' : recordingNow ? '收音中 · 說完請按按鈕' : '已連線 · 請按開始說話' : status === 'connecting' ? '連線中' : status === 'reconnecting' ? '重新連線中' : '尚未連線'}</div>
      <div className="dh-video-frame" style={companion ? {aspectRatio:'9 / 16'} : undefined}>{portrait && <CompanionVideo paused={motionPaused} speaking={speaking || Boolean(replaying)} getLevel={()=>pcmPlayback.current?.mouthLevel() ?? 0}/>}<video hidden={portrait} id="luna-avatar-video" ref={video} autoPlay playsInline muted={!anam} onLoadedMetadata={() => { void video.current?.play().catch(() => setPlaybackBlocked(true)); }} onPlaying={() => { setVideoReady(true); setPlaybackBlocked(false); }} />
      {!portrait && !videoReady && <div className="dh-placeholder"><span className="dh-orb">L</span><h1>今天，讓我陪你。</h1><p>{active ? '正在建立即時影像連線…' : "開始對話，和 Luna 分享你的今天。"}</p></div>}{playbackBlocked && <button className="dh-play-overlay" onClick={enablePlayback}>點一下啟用影音</button>}</div>
      <div className="dh-caption">{companion ? "Luna 動畫陪伴 · 回覆時切換說話動作（非逐字對嘴）" : portrait ? "角色逐格動畫 · 無語音對嘴" : anam ? "Luna · 每次對話最多 10 分鐘" : config?.sandbox ? 'SANDBOX · Wayne 測試角色 · 約 60 秒' : 'LUNA · AI 數位人'}{latency !== undefined && <small>伺服器語音結束 → avatar 開口事件：{latency} ms（非端到端量測）</small>}</div>
    <footer className="dh-controls">{turnMode === 'manual' && <button className="dh-primary" disabled={status !== 'connected' || finishing} aria-pressed={recordingNow} onClick={() => { void toggleTurn(); }}>{finishing ? '送出中…' : recordingNow ? '我說完了' : '開始說話'}</button>}<button className="dh-primary" onClick={() => { if (active) void stop(); else void start(); }} disabled={!active && (!config?.configured || (anam && !config?.characters?.includes(characterId)))}>{active ? '結束對話' : '開始對話'}</button><button aria-pressed={muted} onClick={toggleMute} disabled={!active}>{muted ? '開啟麥克風' : '靜音'}</button><button disabled={status !== 'connected'} onClick={() => socket.current?.send(JSON.stringify({ type: 'interrupt' }))}>打斷 Luna</button><button aria-pressed={subtitles} onClick={() => setSubtitles(!subtitles)}>逐字稿 {subtitles ? '開' : '關'}</button><button disabled={!active} onClick={enablePlayback}>啟用播放</button></footer>
    <p className="dh-footnote">{turnMode === 'automatic' ? '開始對話後持續收音；停頓後自動回覆，直接開口可打斷。按靜音暫停收音，按結束對話關閉麥克風。' : '按「開始說話」收音，中途可停頓；按「我說完了」才會回答。'}</p>
    </section><aside className="dh-panel">
      <div className="dh-panel-head"><p className="dh-eyebrow">YOUR CONVERSATION</p><h2>與 Luna 對話</h2><label>對話模式<select value={mode} disabled={active} onChange={e => setMode(e.target.value as Mode)}>{Object.entries(modes).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <label>說話方式<select aria-label="說話方式" value={turnMode} disabled={active} onChange={e => changeTurnMode(e.target.value as TurnMode)}><option value="manual">按鈕控制（我說完才回答）</option><option value="automatic">自然對話（停頓後自動回覆）</option></select><small>{active ? '結束對話後可切換說話方式。' : '自然對話會持續收音；使用耳機可減少回音誤觸。'}</small></label>
      {mode === 'business' && <label>模擬客戶角色<select value={role} disabled={active} onChange={e => setRole(e.target.value)}>{config?.roles.map(r => <option key={r}>{r}</option>)}</select><small>虛構演練，不代表真實客戶情報。</small></label>}
      </div><div className="dh-messages" ref={messages} onScroll={e => { const el = e.currentTarget; followMessages.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80; }} aria-live="polite">{entries.length === 0 && <p className="dh-empty">支援繁體中文、한국어、English。<br/>對話記憶保存在此瀏覽器。</p>}{subtitles && entries.map(e => <article key={e.id} className={e.role}><div className="dh-entry-head"><b>{e.role === 'user' ? '你' : 'Luna'}</b>{e.role === 'assistant' && e.text.trim() && <button type="button" aria-label={replaying === e.id ? '停止重播 Luna 回覆' : '重播 Luna 回覆'} disabled={speaking || recordingNow || (Boolean(replaying) && replaying !== e.id)} onClick={() => { void replayReply(e.id, e.text); }}>{replaying === e.id ? '停止重播' : '重播語音'}</button>}</div>{mode==='korean'&&e.role==='assistant'&&koreanSentences(e.text).some(isKoreanSentence) ? <div className="dh-korean-lines">{koreanSentences(e.text).map((sentence,index)=>{const koreanIndex=koreanSentences(e.text).slice(0,index).filter(isKoreanSentence).length;const translation=koreanTranslations[e.id];return <div key={index} className="dh-korean-line"><p>{isKoreanSentence(sentence) ? <KoreanText text={sentence} /> : sentence}</p>{isKoreanSentence(sentence)&&<p className="dh-korean-translation" lang="zh-Hant">{translation?.text===e.text ? translation.loading ? '翻譯中…' : translation.items?.[koreanIndex]||'翻譯暫時無法載入' : '翻譯中…'}</p>}</div>;})}</div> : <p>{isKoreanSentence(e.text) ? <KoreanText text={e.text} /> : e.text}</p>}</article>)}</div>
      <form onSubmit={e => { e.preventDefault(); text(); }}><input aria-label="文字訊息" maxLength={4000} enterKeyHint="send" autoComplete="off" value={input} onChange={e => setInput(e.target.value)} placeholder="想跟我說什麼…" disabled={status !== 'connected'}/><button disabled={status !== 'connected' || textSending || (turnMode === 'automatic' && recordingNow) || !input.trim()}>{textSending ? '傳送中…' : '傳送'}</button></form>
    </aside></main>
    <VocabularySection />
    {!config?.configured && config && <p className="dh-notice">即時人像尚未完成連線設定。{anam && "請在 Render 設定 ANAM_API_KEY，並將 Eric's agent 的 Avatar ID 填入 ANAM_AVATAR_ID。"}</p>}
    {notice && <p className="dh-notice" role="status">{notice}</p>}
    {error && <p className="dh-error" role="alert">{error}</p>}
    <p className="dh-footnote">Luna 是 AI。沒有啟用錄音錄影；供應商資料處理政策另行適用。</p>
  </div>;
}
