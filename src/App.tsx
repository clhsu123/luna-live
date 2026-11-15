
import { useEffect, useRef, useState } from 'react';
import { CharacterPicker, useCharacter, portraitUrl } from './Characters';
import { useSharedMemory, getMemory, memoryStorageFailed } from './sharedMemory';
import { replayEvents } from '../shared/memory.mjs';
import {
  AudioLines, BookOpen, BriefcaseBusiness, Check, CircleHelp,
  Heart, Headphones, Menu, MessageCircle, Mic, MicOff,
  Phone, PhoneOff, Send, Settings2, ShieldCheck,
  Sparkles, Volume2, X
} from 'lucide-react';

type Mode = 'companion' | 'korean' | 'business';
type Status = 'idle' | 'connecting' | 'connected' | 'error';
type Message = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  time: string;
};

const MODES: {
  id: Mode;
  title: string;
  subtitle: string;
  emoji: string;
}[] = [
  {
    id: 'companion',
    title: '日常陪伴',
    subtitle: '自在聊天，分享今天',
    emoji: '✦'
  },
  {
    id: 'korean',
    title: '韓文練習',
    subtitle: '自然對話，隨時訂正',
    emoji: '가'
  },
  {
    id: 'business',
    title: '商務模擬',
    subtitle: '科技客戶，實戰演練',
    emoji: '↗'
  }
];

const promptForMode: Record<Mode, string> = {
  companion:
    'You are Luna, a warm, friendly, grounded AI conversation partner. Speak Traditional Chinese by default. Keep replies short and natural, ask one thoughtful question at a time. Never claim you are human.',
  korean:
    'You are Luna, a Korean tutor and conversation partner. Focus on Korean speaking practice using polite 해요체, with brief Traditional Chinese corrections when helpful. Speak slowly and ask one question at a time.',
  business:
    'You are Luna, roleplaying a Korean semiconductor CTO or purchasing manager. Discuss RISC-V CPU IP, PPA, licensing, royalties, SoC integration and evaluation. Challenge the user with realistic questions and provide specific feedback if requested. Use English unless asked otherwise.'
};

const clock = () =>
  new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

const createMessage = (
  role: Message['role'],
  text: string
): Message => ({
  id: crypto.randomUUID(),
  role,
  text,
  time: clock()
});

export default function App() {
  const [mode, setMode] = useState<Mode>('companion');
  const [status, setStatus] = useState<Status>('idle');

  const [messages, setMessages] = useSharedMemory();
  const [character, selectCharacter] = useCharacter();

  const [input, setInput] = useState('');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const responseText = useRef('');
  const activeResponseId = useRef<string | null>(null);
  const isConnecting = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [messages]);

  useEffect(() => {
    if (status !== 'connected') return;

    const id = window.setInterval(() => {
      setSeconds(t => t + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    return () => {
      peer.current?.close();

      localStream.current
        ?.getTracks()
        .forEach(t => t.stop());

      audio.current?.pause();
      void audioContextRef.current?.close();
    };
  }, []);

  const sendEvent = (event: object) => {
    if (channel.current?.readyState === 'open') {
      channel.current.send(JSON.stringify(event));
    }
  };

  const stop = () => {
    analyserRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;

    if (channel.current) channel.current.onmessage = null;
    channel.current?.close();
    channel.current = null;

    peer.current?.close();
    peer.current = null;

    localStream.current
      ?.getTracks()
      .forEach(t => t.stop());

    localStream.current = null;

    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }

    setSpeaking(false);
    setListening(false);
    setStatus('idle');
    setSeconds(0);

    isConnecting.current = false;
  };

  const onEvent = (event: MessageEvent) => {
    let d: any;

    try {
      d = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (d.type) {
      case 'input_audio_buffer.speech_started':
        setListening(true);
        setSpeaking(false);
        break;

      case 'input_audio_buffer.speech_stopped':
        setListening(false);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (d.transcript?.trim()) {
          setMessages(prev => [
            ...prev,
            createMessage('user', d.transcript.trim())
          ]);
        }
        break;

      case 'response.created':
        activeResponseId.current = d.response?.id || null;
        responseText.current = '';
        setSpeaking(true);
        break;

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const delta = d.delta || '';
        responseText.current += delta;

        const id =
          activeResponseId.current || 'live-response';

        setMessages(prev => {
          const last = prev[prev.length - 1];

          return last?.id === id
            ? [
                ...prev.slice(0, -1),
                {
                  ...last,
                  text: responseText.current
                }
              ]
            : [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  text: responseText.current,
                  time: clock()
                }
              ];
        });

        break;
      }

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (d.transcript) {
          const id =
            activeResponseId.current || 'live-response';

          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === id);

            return idx < 0
              ? [
                  ...prev,
                  {
                    id,
                    role: 'assistant',
                    text: d.transcript,
                    time: clock()
                  }
                ]
              : prev.map((m, i) =>
                  i === idx
                    ? { ...m, text: d.transcript }
                    : m
                );
          });
        }
        break;

      case 'response.done':
        setSpeaking(false);
        activeResponseId.current = null;
        break;

      case 'output_audio_buffer.started':
        setSpeaking(true);
        break;

      case 'output_audio_buffer.stopped':
        setSpeaking(false);
        break;

      case 'error':
        setError(
          d.error?.message || 'Realtime API 發生錯誤'
        );
        break;
    }
  };

  const start = async () => {
    if (isConnecting.current || status === 'connected') {
      return;
    }

    isConnecting.current = true;
    setStatus('connecting');
    setError('');

    let pc: RTCPeerConnection | null = null;
    let ms: MediaStream | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Error(
          '請使用 localhost 或 HTTPS，並允許麥克風權限。'
        );
      }

      ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      localStream.current = ms;

      pc = new RTCPeerConnection();
      peer.current = pc;

      pc.onconnectionstatechange = () => {
        if (
          pc?.connectionState === 'failed' ||
          pc?.connectionState === 'disconnected'
        ) {
          setError('語音連線中斷，請重新連線。');
          stop();
        }
      };

      if (!audio.current) {
        audio.current = new Audio();
      }

      audio.current.autoplay = true;

      pc.ontrack = e => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0];

          audio.current.play().catch(() => {
            setError('請點擊頁面以啟用音訊播放。');
          });
        }

        try {
          const ac = new AudioContext();
          audioContextRef.current = ac;

          const src = ac.createMediaStreamSource(
            e.streams[0]
          );

          const analyser = ac.createAnalyser();

          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.72;

          src.connect(analyser);
          analyserRef.current = analyser;

          void ac.resume();
        } catch (err) {
          console.warn(
            'Audio visualizer unavailable',
            err
          );
        }
      };

      ms.getAudioTracks().forEach(t =>
        pc!.addTrack(t, ms!)
      );

      const dc = pc.createDataChannel('oai-events');
      channel.current = dc;
      dc.onmessage = onEvent;

      dc.onopen = () => {
        for (const event of replayEvents(getMemory())) dc.send(JSON.stringify(event));
        setStatus('connected');
        setSeconds(0);


      };

      dc.onerror = () => {
        setError('資料通道發生問題。');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const r = await fetch(
        `/api/session?mode=${mode}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sdp'
          },
          body: offer.sdp || ''
        }
      );

      const answer = await r.text();

      if (!r.ok) {
        throw Error(
          answer || `Server returned ${r.status}`
        );
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answer
      });
    } catch (err) {
      pc?.close();

      ms?.getTracks().forEach(t => t.stop());

      peer.current = null;
      localStream.current = null;

      setStatus('error');

      setError(
        err instanceof Error
          ? err.message
          : '無法建立連線'
      );
    } finally {
      isConnecting.current = false;
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setSidebar(false);

    if (channel.current?.readyState === 'open') {
      sendEvent({
        type: 'session.update',
        session: {
          instructions: promptForMode[m]
        }
      });
    }
  };

  const sendText = () => {
    const text = input.trim();
    if (!text) return;

    if (channel.current?.readyState !== 'open') {
      setError(
        '請先按「開始對話」連線，才能傳送文字。'
      );
      return;
    }

    setInput('');

    setMessages(prev => [
      ...prev,
      createMessage('user', text)
    ]);

    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text
          }
        ]
      }
    });

    sendEvent({
      type: 'response.create'
    });
  };

  const toggleMute = () => {
    const next = !muted;

    localStream.current
      ?.getAudioTracks()
      .forEach(t => {
        t.enabled = !next;
      });

    setMuted(next);
  };

  const activeMode = MODES.find(
    m => m.id === mode
  )!;

  return (
    <div className="app">
      <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">
            <Sparkles size={19} />
          </div>

          <span>
            LUNA
            <span className="brand-light">.live</span>
          </span>

          <button
            className="hide-mobile"
            onClick={() => setSidebar(false)}
            aria-label="收起選單"
          >
            <X size={20} />
          </button>
        </div>

        <div className="side-label">
          CONVERSATION SPACE
        </div>

        <div className="nav-list">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`nav-item ${
                mode === m.id ? 'selected' : ''
              }`}
              onClick={() => switchMode(m.id)}
            >
              <span className="nav-icon">
                {m.id === 'companion' ? (
                  <Heart size={19} />
                ) : m.id === 'korean' ? (
                  <BookOpen size={19} />
                ) : (
                  <BriefcaseBusiness size={19} />
                )}
              </span>

              <span className="nav-copy">
                <strong>{m.title}</strong>
                <small>{m.subtitle}</small>
              </span>

              {mode === m.id && (
                <span className="selected-dot" />
              )}
            </button>
          ))}
        </div>

        <div className="side-divider" />

        <div className="side-label">YOUR SPACE</div>

        <div className="side-note">
          <MessageCircle size={18} />
          <span>
            所有臉模共享記憶，儲存在此瀏覽器。重新整理後仍可接續。
          </span>
        </div>

        <div className="side-bottom">
          <div className="privacy">
            <ShieldCheck size={18} />
            <span>安全的 API 金鑰管理</span>
            <Check size={15} />
          </div>

          <button
            className="settings"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 size={18} />
            設定與說明
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setSidebar(true)}
          >
            <Menu size={22} />
          </button>

          <div className="crumb">
            Your space <span>/</span>
            <strong>{activeMode.title}</strong>
          </div>

          <div className="top-right">
            <span className={`connection-pill ${status}`}>
              <span className="live-dot" />
              {status === 'connected'
                ? '已連線'
                : status === 'connecting'
                ? '連線中'
                : '尚未連線'}
            </span>

            <span className="user-circle">YOU</span>
          </div>
        </header>

        <div className="workspace">
          <section className="center-stage">
            <div className="stage-header">
              <div>
                <div className="eyebrow">
                  <span className="tiny-star">✦</span>
                  YOUR AI CONVERSATION PARTNER
                </div>

                <h1>和 Luna，自然地聊聊天。</h1>
                <p>
                  讓每一次對話，都更接近真實的交流。
                </p>
              </div>

              <div className="mode-chip">
                <span>{activeMode.emoji}</span>
                {activeMode.title}
              </div>
            </div>

            <div className="avatar-scene">
              <div className="avatar-glow" />

              <div className="portrait-wrap">
                <img className="character-portrait" src={portraitUrl(character.id)} alt={`${character.face} · ${character.name}`} />
              </div>

              <div className="scene-vignette" />

              <div className="avatar-name">
                <div className="name-row">
                  {character.face} · {character.name} <span className="ai-badge">AI</span>
                </div>

                <span>
                  {speaking
                    ? '正在回覆你...'
                    : listening
                    ? '正在聽你說話'
                    : status === 'connected'
                    ? '我在這裡，隨時可以聊聊'
                    : 'Your AI conversation partner'}
                </span>
              </div>

              <div className={`orb ${speaking ? 'active' : ''}`}>
                <AudioLines size={19} />
              </div>

              <div className="scene-note">
                角色肖像 · OpenAI 即時語音 · 此模式不使用 LiveAvatar
              </div>
            </div>

            <CharacterPicker selected={character.id} onSelect={selectCharacter}/>
            <p className="memory-note">共享記憶：{messages.length} 則 · 此瀏覽器最多保留 100 則；重連帶入最近 40 則（最多 16,000 字）。不跨裝置同步。
              <button onClick={() => { if (window.confirm('清除所有臉模的共享記憶並結束目前對話？')) { stop(); setMessages([]); } }}>清除共享記憶</button>
              {memoryStorageFailed() && <span role="alert">瀏覽器儲存失敗，目前記憶僅保留到頁面關閉。</span>}
            </p>
            <div className="call-controls">
              <div className="left-status">
                <div
                  className={`audio-indicator ${
                    status === 'connected' ? 'is-on' : ''
                  }`}
                >
                  <AudioLines size={19} />
                </div>

                <div>
                  <strong>
                    {status === 'connected'
                      ? speaking
                        ? 'Luna 正在說話'
                        : listening
                        ? '正在聆聽你的聲音'
                        : '語音對話中'
                      : '準備好開始了嗎？'}
                  </strong>

                  <small>
                    {status === 'connected'
                      ? `已連線 · ${String(
                          Math.floor(seconds / 60)
                        ).padStart(2, '0')}:${String(
                          seconds % 60
                        ).padStart(2, '0')}`
                      : '開啟麥克風，讓對話自然發生'}
                  </small>
                </div>
              </div>

              <div className="control-buttons">
                {status === 'connected' && (
                  <button
                    className={`icon-call ${
                      muted ? 'muted' : ''
                    }`}
                    title={
                      muted
                        ? '開啟麥克風'
                        : '靜音'
                    }
                    onClick={toggleMute}
                  >
                    {muted ? (
                      <MicOff size={20} />
                    ) : (
                      <Mic size={20} />
                    )}
                  </button>
                )}

                <button
                  className={`primary-call ${
                    status === 'connected' ? 'end' : ''
                  }`}
                  disabled={status === 'connecting'}
                  onClick={
                    status === 'connected' ? stop : start
                  }
                >
                  {status === 'connected' ? (
                    <PhoneOff size={18} />
                  ) : (
                    <Phone size={18} />
                  )}

                  {status === 'connected'
                    ? '結束通話'
                    : status === 'connecting'
                    ? '連線中...'
                    : '開始對話'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-bar" role="alert">
                <CircleHelp size={17} />
                <span>{error}</span>
                <button
                  onClick={() => setError('')}
                  aria-label="關閉錯誤"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </section>

          <section className="chat-panel">
            <div className="chat-title">
              <div>
                <div className="chat-dot" />
                <strong>即時對話</strong>
                <span>LIVE TRANSCRIPT</span>
              </div>

              <span className="transcript-chip">
                <Volume2 size={14} />
                語音 + 文字
              </span>
            </div>

            <div className="chat-body">
              <div className="date-divider">
                <span>今天的對話</span>
              </div>

              {messages.map(m => (
                <div
                  className={`message ${m.role}`}
                  key={m.id}
                >
                  {m.role === 'assistant' && (
                    <div className="message-avatar">
                      <Sparkles size={14} />
                    </div>
                  )}

                  <div className="message-main">
                    <div className="message-meta">
                      {m.role === 'assistant' ? 'Luna' : 'You'}
                      <span>{m.time}</span>
                    </div>

                    <div className="bubble">
                      {m.text || '...'}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={bottom} />
            </div>

            <div className="chat-footer">
              <div className="text-input-row">
                <input
                  aria-label="輸入訊息"
                  placeholder="輸入訊息，或直接開口說話..."
                  value={input}
                  maxLength={2000}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey
                    ) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                />

                <button
                  onClick={sendText}
                  aria-label="傳送訊息"
                  title="傳送訊息"
                >
                  <Send size={18} />
                </button>
              </div>

              <div className="chat-hint">
                <Headphones size={15} />
                開始對話後，可直接用聲音或文字互動
              </div>
            </div>
          </section>
        </div>

        <div className="footer-strip">
          <span>
            ✦ Built for meaningful conversations
          </span>
          <span>Powered by OpenAI Realtime API</span>
        </div>
      </main>

      {showSettings && (
        <div
          className="overlay"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowSettings(false)}
            >
              <X size={20} />
            </button>

            <div className="modal-icon">
              <Settings2 />
            </div>

            <h2>關於 Luna Live MVP</h2>

            <p>
              這是使用 OpenAI Realtime API 的實作原型。
              聲音是 AI 生成，畫面使用 AI 生成的擬真人肖像，
              不是真人攝影機。
            </p>

            <p>
              目前具備雙向即時語音、可打斷對話、
              對話逐字稿、文字輸入與三種模式。
              目前為可切換的靜態角色肖像，搭配即時語音；
              尚未整合真正的音素級嘴型同步或
              3D 肢體動畫。
            </p>

            <p>
              對話文字會儲存在此瀏覽器，供所有臉模共用，可隨時清除；連線時會將最近記憶傳給 OpenAI。
              OpenAI API 的資料處理仍依其適用政策。
              此版本僅供測試，仍需完善公開部署的
              帳號、反濫用與費用控制。
            </p>

            <button
              className="modal-done"
              onClick={() => setShowSettings(false)}
            >
              了解
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
