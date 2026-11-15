import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import './digital.css';
import { CharacterPicker, useCharacter } from './Characters';
import { useSharedMemory, getMemory, memoryStorageFailed } from './sharedMemory';
import { normalizeHistory } from '../shared/memory.mjs';
type Mode = 'companion' | 'korean' | 'business';
type Entry = { id: string; role: 'user' | 'assistant'; text: string; time: string };
type Configuration = { configured: boolean; sandbox: boolean; roles: string[] };
type Session = { id: string; url: string; token: string; ticket: string; sandbox: boolean };
const modes: Record<Mode, string> = { companion: '日常陪伴', korean: '韓文練習', business: '半導體商務模擬' };
export default function DigitalHuman() {
  const [config, setConfig] = useState<Configuration>();
  const [mode, setMode] = useState<Mode>('companion');
  const [role, setRole] = useState('Startup CTO');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(''); const [input, setInput] = useState('');
  const [muted, setMuted] = useState(false); const [subtitles, setSubtitles] = useState(true);
  const [speaking, setSpeaking] = useState(false); const [entries, setEntries] = useSharedMemory();
  const [character, selectCharacter] = useCharacter();
  const [latency, setLatency] = useState<number>(); const [videoReady, setVideoReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const media = useRef<MediaStream | undefined>(undefined);
  const room = useRef<Room | undefined>(undefined); const socket = useRef<WebSocket | undefined>(undefined); const context = useRef<AudioContext | undefined>(undefined);
  const session = useRef<string | undefined>(undefined); const generation = useRef(0); const busy = useRef(false);
  const audioElements = useRef<HTMLMediaElement[]>([]); const muteRef = useRef(false);
  const recording = useRef(false); const recordedAt = useRef(0);
  const [recordingNow, setRecordingNow] = useState(false); const [finishing, setFinishing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  async function request<T>(path: string, body?: object): Promise<T> {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) } : {});
    const value = await res.json(); if (!res.ok) throw Error(value.error || `Request failed: ${res.status}`); return value;
  }
  async function stop() {
    recording.current = false; setRecordingNow(false); setFinishing(false);
    generation.current++; busy.current = false; socket.current?.close(); socket.current = undefined;
    media.current?.getTracks().forEach(t => t.stop()); media.current = undefined;
    void context.current?.close(); context.current = undefined;
    void room.current?.disconnect(); room.current = undefined;
    audioElements.current.forEach(el => { el.pause(); el.srcObject = null; el.remove(); }); audioElements.current = [];
    if (video.current) video.current.srcObject = null;
    const id = session.current; session.current = undefined;
    setStatus('idle'); setVideoReady(false); setSpeaking(false);
    if (id) { try { await request(`/api/avatar/sessions/${id}/stop`, {}); } catch { /* Server close/TTL also reaps sessions. */ } }
  }
  useEffect(() => {
    void request<Configuration>('/api/avatar/status').then(setConfig).catch(() => setError('無法讀取連線設定，請重新整理。'));
    const unload = () => { socket.current?.close(); media.current?.getTracks().forEach(t => t.stop()); };
    window.addEventListener('pagehide', unload);
    return () => { window.removeEventListener('pagehide', unload); void stop(); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries]);
  async function start() {
    if (busy.current) return; busy.current = true;
    const attempt = ++generation.current;
    const stale = () => generation.current !== attempt;
    setStatus('connecting'); setError(''); setLatency(undefined);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw Error('請使用支援麥克風與 AudioWorklet 的 HTTPS 瀏覽器。');
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (stale()) { mic.getTracks().forEach(t => t.stop()); return; } media.current = mic;
      const ac = new AudioContext(); context.current = ac; await ac.resume();
      await ac.audioWorklet.addModule('/pcm-worklet.js'); if (stale()) return;
      const data = await request<Session>('/api/avatar/sessions', { mode, role, history: normalizeHistory(getMemory(), 40, 16000) });
      if (stale()) { await request(`/api/avatar/sessions/${data.id}/stop`, {}); return; }
      session.current = data.id;
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
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/avatar/bridge?ticket=${encodeURIComponent(data.ticket)}`);
      socket.current = ws;
      const capture = new AudioWorkletNode(ac, 'pcm24-capture');
      const source = ac.createMediaStreamSource(mic); const gain = ac.createGain(); gain.gain.value = 0;
      source.connect(capture); capture.connect(gain); gain.connect(ac.destination);
      let ready = false;
      capture.port.onmessage = e => { if (ready && recording.current && !muteRef.current && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 24000) ws.send(e.data as ArrayBuffer); };
      ws.onmessage = event => {
        if (stale()) return;
        try {
          const e = JSON.parse(event.data);
          if (e.type === 'bridge.ready') { ready = true; setStatus('connected'); }
          if (e.type === 'turn.empty') setError('沒有收到足夠音訊，請再按「開始說話」。');
          if (e.type === 'bridge.error') { void stop(); setError(e.message); }
          if (e.type === 'avatar.speaking') { setSpeaking(e.value); if (typeof e.responseLatencyMs === 'number') setLatency(e.responseLatencyMs); }
          if (e.type === 'conversation.item.input_audio_transcription.completed') setEntries(prev => [...prev, { id: e.item_id, role: 'user', text: e.transcript, time: '' }]);
          if (e.type === 'response.output_audio_transcript.delta' || e.type === 'response.output_audio_transcript.done') {
            setEntries(prev => {
              const id = e.response_id; const old = prev.find(x => x.id === id);
              const next: Entry = { id, role: 'assistant', time: '', text: e.type.endsWith('.done') ? e.transcript : (old?.text || '') + e.delta };
              return old ? prev.map(x => x.id === id ? next : x) : [...prev, next];
            });
          }
          if (e.type === 'input_audio_buffer.speech_started') setSpeaking(false);
        } catch { setError('收到無法辨識的連線資料。'); }
      };
      ws.onerror = () => { if (!stale()) { void stop(); setError('語音連線失敗，請重新連線。'); } };
      ws.onclose = () => { if (!stale()) { void stop(); setError('對話已結束或超過 session 時限。'); } };
    } catch (e) {
      if (!stale()) { await stop(); setError(e instanceof Error ? e.message : '無法建立連線'); }
    }
  }
  function toggleTurn() {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || finishing) return;
    if (!recording.current) {
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
  function text() {
    if (recording.current) { setError('請先按「我說完了」送出語音，再傳文字。'); return; }
    if (!input.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: 'text', text: input }));
    setEntries(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: input, time: '' }]); setInput('');
  }
  const active = status !== 'idle';
  return <div className="dh-app">
    <header className="dh-header"><a href="/">LUNA<span>LIVE</span></a><span>Digital Human · 測試版</span><a href="/">原版語音介面 ↗</a></header>
    <div className="dh-characters"><CharacterPicker selected={character.id} onSelect={selectCharacter}/>
      <p>已選：{character.face} · {character.name}。這 8 款目前用於角色肖像語音模式；下方即時影片仍使用{config?.sandbox ? ' Wayne 測試角色' : '已設定的供應商角色'}。</p>
      <a href="/" onClick={() => { void stop(); }}>使用所選造型開始語音對話 ↗</a>
      <p className="memory-note">共享記憶：{entries.length} 則 · 此瀏覽器保留最多 100 則；重連帶入最近 40 則（最多 16,000 字）。不跨裝置同步。
      <button onClick={async () => { if (window.confirm('清除所有臉模的共享記憶並結束目前對話？')) { await stop(); setEntries([]); } }}>清除共享記憶</button>
      {memoryStorageFailed() && <span role="alert">瀏覽器儲存失敗，目前記憶僅保留到頁面關閉。</span>}</p></div>
    <main className="dh-layout"><section className="dh-stage" aria-label="數位人影片">
      <video ref={video} autoPlay playsInline muted onPlaying={() => setVideoReady(true)} />
      {!videoReady && <div className="dh-placeholder"><span className="dh-orb">L</span><h1>讓對話，面對面。</h1><p>{active ? '正在建立即時影像連線…' : '開始後顯示供應商的即時影片串流'}</p></div>}
      <div className="dh-status" role="status"><i className={active ? 'on' : ''}/>{status === 'connected' ? speaking ? 'Luna 正在說話' : recordingNow ? '收音中 · 說完請按按鈕' : '已連線 · 請按開始說話' : status === 'connecting' ? '連線中' : status === 'reconnecting' ? '重新連線中' : '尚未連線'}</div>
      <div className="dh-caption">{config?.sandbox ? 'SANDBOX · Wayne 測試角色 · 約 60 秒' : 'LUNA · AI 數位人'}{latency !== undefined && <small>伺服器語音結束 → avatar 開口事件：{latency} ms（非端到端量測）</small>}</div>
    </section><aside className="dh-panel">
      <div className="dh-panel-head"><p className="dh-eyebrow">YOUR CONVERSATION</p><h2>今天，想聊什麼？</h2><label>對話模式<select value={mode} disabled={active} onChange={e => setMode(e.target.value as Mode)}>{Object.entries(modes).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      {mode === 'business' && <label>模擬客戶角色<select value={role} disabled={active} onChange={e => setRole(e.target.value)}>{config?.roles.map(r => <option key={r}>{r}</option>)}</select><small>虛構演練，不代表真實客戶情報。</small></label>}
      </div><div className="dh-messages" aria-live="polite">{entries.length === 0 && <p className="dh-empty">支援繁體中文、한국어、English。<br/>與角色語音介面共享記憶，保存在此瀏覽器。</p>}{subtitles && entries.map(e => <article key={e.id} className={e.role}><b>{e.role === 'user' ? '你' : 'Luna'}</b><p>{e.text}</p></article>)}<div ref={end}/></div>
      <form onSubmit={e => { e.preventDefault(); text(); }}><input aria-label="文字訊息" maxLength={4000} value={input} onChange={e => setInput(e.target.value)} placeholder="也可以打字…" disabled={status !== 'connected'}/><button disabled={status !== 'connected' || !input.trim()}>傳送</button></form>
    </aside></main>
    <p className="dh-footnote">按「開始說話」收音，中途可停頓；按「我說完了」才會回答。</p>
    <footer className="dh-controls"><button className="dh-primary" disabled={status !== 'connected' || finishing} aria-pressed={recordingNow} onClick={toggleTurn}>{finishing ? '送出中…' : recordingNow ? '我說完了' : '開始說話'}</button><button className="dh-primary" onClick={() => { if (active) void stop(); else void start(); }} disabled={!active && !config?.configured}>{active ? '結束對話' : '開始對話'}</button><button aria-pressed={muted} onClick={() => { muteRef.current = !muted; setMuted(!muted); }} disabled={!active}>{muted ? '開啟麥克風' : '靜音'}</button><button disabled={status !== 'connected'} onClick={() => socket.current?.send(JSON.stringify({ type: 'interrupt' }))}>打斷 Luna</button><button aria-pressed={subtitles} onClick={() => setSubtitles(!subtitles)}>逐字稿 {subtitles ? '開' : '關'}</button><button disabled={!active} onClick={() => { void room.current?.startAudio(); void video.current?.play(); audioElements.current.forEach(el => { void el.play(); }); }}>啟用播放</button></footer>
    {!config?.configured && config && <p className="dh-notice">尚未完成影像供應商設定，因此即時影片功能未啟用。原版語音介面仍可使用。</p>}
    {error && <p className="dh-error" role="alert">{error}</p>}
    <p className="dh-footnote">Luna 是 AI。沒有啟用錄音錄影；供應商資料處理政策另行適用。鞠躬與指定手勢尚未支援。</p>
  </div>;
}
