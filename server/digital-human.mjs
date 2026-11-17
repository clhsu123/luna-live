import { voiceProvider, normalizeVoiceEvent } from './voice-provider.mjs';
import { companionPrompt, koreanPrompt, businessPrompt } from '../shared/companion-prompt.mjs';
import { AnamProvider, AnamRelay, anamAvatars } from './anam-provider.mjs';
import { normalizeHistory, replayEvents } from '../shared/memory.mjs';
import { AudioBatcher } from './audio-batcher.mjs';
import { synthesizeWithXai } from './xai-tts.mjs';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import { AvatarSessions, LiveAvatarProvider, ProviderError } from './avatar-provider.mjs';
const instructions = { companion: companionPrompt, korean: koreanPrompt, business: businessPrompt };
const roles = ['Startup CTO', 'SoC architect', 'ASIC design manager', 'CPU IP purchasing manager', 'Edge AI accelerator company', 'Touch IC manufacturer', 'Automotive semiconductor customer'];
export function installDigitalHuman(app, server, { anam = false, portrait = false, providerOverride, synthesize = synthesizeWithXai, aiSocketFactory = (url, options) => new WebSocket(url, options) } = {}) {
  const voice = voiceProvider();
  const relay = anam || portrait;
  const prefix = portrait ? '/api/portrait' : anam ? '/api/anam' : '/api/avatar';
  const sandbox = !relay && process.env.LIVEAVATAR_SANDBOX !== 'false';
  const provider = providerOverride || (portrait ? { create: async () => ({ id: randomUUID(), client: {} }), stop: async () => {} } : anam ? new AnamProvider() : new LiveAvatarProvider({ apiKey: process.env.LIVEAVATAR_API_KEY, avatarId: process.env.LIVEAVATAR_AVATAR_ID, sandbox, allowPaid: process.env.ALLOW_PAID_AVATAR === 'true' }));
  const sessions = new AvatarSessions(provider, { ttlMs: relay ? 180_000 : sandbox ? 60_000 : 300_000 });
  const tickets = new Map(); const bridges = new Map();
  const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  const json = express.json({ limit: '128kb' });
  function owner(req, res) {
    const found = /(?:^|;\s*)luna_owner=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (found) return found;
    const value = randomUUID();
    res.cookie('luna_owner', value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 8 * 3600_000 });
    return value;
  }
  function csrf(req, res, next) {
    if (!origin || req.get('origin') !== origin || !req.is('application/json')) return res.status(403).json({ error: 'origin_not_allowed' });
    next();
  }
  const safeError = (res, error) => res.status(error instanceof ProviderError ? error.status : 502).json({ error: error instanceof ProviderError ? error.code : 'digital_human_unavailable' });
  app.get(`${prefix}/status`, (req, res) => {
    owner(req, res);
    const speechConfigured = !voice.xaiTts || voice.xaiTtsConfigured;
    res.json({ characters: anam ? Object.keys(anamAvatars()) : [], aiProvider: voice.name, speechProvider: voice.xaiTts ? 'xai-tts' : voice.name, configured: Boolean(origin && voice.configured && speechConfigured && (portrait || (anam ? process.env.ANAM_API_KEY && Object.keys(anamAvatars()).length : process.env.LIVEAVATAR_API_KEY && (sandbox || process.env.LIVEAVATAR_AVATAR_ID)))), sandbox, paidEnabled: process.env.ALLOW_PAID_AVATAR === 'true', gestures: [], roles });
  });
  app.post(`${prefix}/sessions`, csrf, json, async (req, res) => {
    const { mode, role, character, history = [] } = req.body || {};
    if (!Array.isArray(history) || history.length > 100 || history.some(e => !e || !['user', 'assistant'].includes(e.role) || typeof e.text !== 'string' || e.text.length > 4000)) return res.status(400).json({ error: 'invalid_history' });
    if (!Object.hasOwn(instructions, mode) || (role !== undefined && !roles.includes(role))) return res.status(400).json({ error: 'invalid_mode_or_role' });
    if (!voice.configured) return res.status(503).json({ error: `${voice.name}_not_configured` });
    if (voice.xaiTts && !voice.xaiTtsConfigured) return res.status(503).json({ error: 'xai_tts_not_configured' });
    const user = owner(req, res);
    try {
      const session = await sessions.create(user, character);
      const ticket = randomUUID();
      const timer = setTimeout(() => { tickets.delete(ticket); void sessions.stop(user, session.id).catch(() => {}); }, 30_000);
      timer.unref();
      tickets.set(ticket, { user, id: session.id, mode, role, timer, history: normalizeHistory(history, 40, 16000) });
      res.json({ ...session, ticket, sandbox });
    } catch (error) { safeError(res, error); }
  });
  app.post(`${prefix}/sessions/:id/stop`, csrf, json, async (req, res) => {
    try {
      const user = owner(req, res); sessions.get(user, req.params.id);
      bridges.get(req.params.id)?.();
      await sessions.stop(user, req.params.id); res.json({ ok: true });
    } catch (error) { safeError(res, error); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
    if (url.pathname !== `${prefix}/bridge`) return;
    const ticket = tickets.get(url.searchParams.get('ticket'));
    const cookieOwner = /(?:^|;\s*)luna_owner=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!origin || req.headers.origin !== origin || !ticket || ticket.user !== cookieOwner) return socket.destroy();
    tickets.delete(url.searchParams.get('ticket')); clearTimeout(ticket.timer);
    wss.handleUpgrade(req, socket, head, client => connect(client, ticket));
  });
  function connect(client, ticket) {
    let record;
    try { record = sessions.get(ticket.user, ticket.id); } catch { client.close(1008); return; }
    let ai; let avatar; let done = false; let ready = false; let responseId; let itemId; let utterance; let speakingAt; let speechStoppedAt; let generatedMs = 0; let active = false; let listening = false; let lastActivity = Date.now(); let inputBytes = 0; let responseText = ''; let speechGeneration = 0; let speechController;
    const tell = data => { if (portrait && data.type.startsWith('anam.')) data = { ...data, type: data.type.replace('anam.', 'portrait.') }; if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
    const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(data)); else throw Error('transport_backpressure'); };
    const cleanup = () => {
      if (done) return; done = true; speechGeneration++; speechController?.abort(); batch.clear(); clearInterval(heartbeat); clearTimeout(startup); bridges.delete(ticket.id);
      ai?.close(); avatar?.close(); client.close(); void sessions.stop(ticket.user, ticket.id).catch(() => {});
    };
    const fail = () => { tell({ type: 'bridge.error', message: '連線中斷或供應商錯誤。請結束後重新連線。' }); cleanup(); };
    const batch = relay ? { append: audio => send(avatar, { type: 'agent.speak', event_id: utterance, audio }), clear() {}, flush() {} } : new AudioBatcher(audio => send(avatar, { type: 'agent.speak', event_id: utterance, audio }), { onError: fail });
    const interrupt = (cancelResponse = true) => {
      speechGeneration++; speechController?.abort(); speechController = undefined; responseText = '';
      batch.clear();
      if (active && cancelResponse) send(ai, { type: 'response.cancel', response_id: responseId });
      // Clear browser/provider queues even if the relay's estimate already ended.
      if (relay || utterance) send(avatar, { type: 'agent.interrupt', event_id: randomUUID() });
      if (utterance) {
        // Conservative elapsed playback estimate; provider has no sample-accurate playhead.
        if (itemId) send(ai, { type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.min(generatedMs, speakingAt ? Math.max(0, Date.now() - speakingAt) : 0) });
      }
      responseId = undefined; utterance = undefined; speakingAt = undefined; active = false;
    };
    const speakWithXai = async text => {
      const generation = ++speechGeneration;
      const controller = new AbortController();
      speechController = controller;
      let result;
      try { result = await synthesize(text, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) }); }
      catch (error) { if (done || generation !== speechGeneration) return; throw error; }
      if (done || generation !== speechGeneration) return;
      const bytes = Buffer.from(result.audio, 'base64');
      if (!bytes.length || bytes.length % 2) throw Error('invalid_xai_pcm');
      utterance = randomUUID(); itemId = undefined; generatedMs = bytes.length / 48; speakingAt = Date.now();
      tell({ type: 'avatar.speaking', value: true, responseLatencyMs: speechStoppedAt ? Date.now() - speechStoppedAt : null });
      // Keep individual frames bounded for WebSocket and Anam's audio input.
      const frameBytes = 12_000;
      for (let offset = 0; offset < bytes.length; offset += frameBytes) {
        if (done || generation !== speechGeneration) return;
        const frame = bytes.subarray(offset, Math.min(offset + frameBytes, bytes.length));
        if (relay) send(avatar, { type: 'agent.speak', event_id: utterance, audio: frame.toString('base64') });
        else batch.append(frame.toString('base64'));
        // Pace buffered REST audio at its 24 kHz playback rate so avatar lip
        // sync sees a real-time stream instead of one instantaneous burst.
        await new Promise(resolve => setTimeout(resolve, frame.length / 48));
      }
      if (done || generation !== speechGeneration) return;
      batch.flush(); send(avatar, { type: 'agent.speak_end', event_id: utterance }); speechController = undefined;
    };
    const startup = setTimeout(fail, 25_000);
    const heartbeat = setInterval(() => {
      try {
        if (ready && !active && !utterance && !speechController && !listening && Date.now() - lastActivity >= 45_000) {
          tell({ type: 'bridge.error', message: '已閒置 45 秒，影像連線已自動結束以節省用量。可以隨時重新開始。' }); cleanup(); return;
        }
        if (ready) send(avatar, { type: 'session.keep_alive' });
        if (!sessions.sessions.has(ticket.id)) cleanup();
      } catch { fail(); }
    }, 5_000);
    bridges.set(ticket.id, cleanup);
    try { avatar = relay ? new AnamRelay(tell) : new WebSocket(record.controlUrl); } catch { fail(); return; }
    avatar.on('error', fail); avatar.on('close', cleanup);
    avatar.on('message', raw => {
      try {
        const e = JSON.parse(raw.toString());
        if (e.type === 'session.state_updated' && e.state === 'connected' && !ai) {
          ai = aiSocketFactory(voice.url, { headers: { Authorization: `Bearer ${voice.apiKey}` } });
          ai.on('error', fail); ai.on('close', cleanup);
          ai.on('open', () => send(ai, { type: 'session.update', session: voice.session(`${instructions[ticket.mode]} ${ticket.mode === 'business' ? `Customer role: ${ticket.role || roles[0]}.` : ''}`) }));
          ai.on('message', raw => {
            try {
              const e = normalizeVoiceEvent(JSON.parse(raw.toString()));
              if (e.type === 'session.updated' && !ready) { for (const event of replayEvents(ticket.history)) send(ai, event); ready = true; clearTimeout(startup); tell({ type: 'bridge.ready' }); }
              if (e.type === 'input_audio_buffer.speech_started') { listening = true; lastActivity = Date.now(); interrupt(); }
              if (e.type === 'input_audio_buffer.speech_stopped') { listening = false; speechStoppedAt = Date.now(); lastActivity = Date.now(); }
              if (e.type === 'response.created') { if (e.response.id === responseId) return; interrupt(false); responseId = e.response.id; responseText = ''; active = true; generatedMs = 0; itemId = undefined; utterance = undefined; speakingAt = undefined; }
              if (voice.xaiTts && ['response.text.delta', 'response.output_text.delta'].includes(e.type) && e.response_id === responseId) {
                responseText += e.delta || '';
                tell({ ...e, type: 'response.output_audio_transcript.delta' });
              }
              if (!voice.xaiTts && e.type === 'response.output_audio.delta' && e.response_id === responseId) {
                itemId = e.item_id; utterance ||= randomUUID();
                generatedMs += Buffer.from(e.delta, 'base64').length / 48;
                batch.append(e.delta);
              }
              if (!voice.xaiTts && e.type === 'response.output_audio.done' && e.response_id === responseId && utterance) { batch.flush(); send(avatar, { type: 'agent.speak_end', event_id: utterance }); }
              if (e.type === 'response.done' && (!voice.xaiTts || (active && e.response?.id === responseId))) {
                active = false;
                if (e.response?.status === 'failed') { fail(); return; }
                if (voice.xaiTts && e.response?.status === 'completed' && responseText.trim()) {
                  tell({ type: 'response.output_audio_transcript.done', response_id: responseId, transcript: responseText });
                  void speakWithXai(responseText.trim()).catch(fail);
                }
              }
              if (['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'conversation.item.input_audio_transcription.completed', 'response.output_audio_transcript.delta', 'response.output_audio_transcript.done', 'response.created'].includes(e.type) && (!voice.xaiTts || !e.type.startsWith('response.output_audio_transcript.'))) tell(e);
              if (e.type === 'error') fail();
            } catch { fail(); }
          });
        }
        if (e.type === 'agent.speak_started' && e.source_event_id === utterance) {
          speakingAt = Date.now(); tell({ type: 'avatar.speaking', value: true, responseLatencyMs: speechStoppedAt ? Date.now() - speechStoppedAt : null });
        }
        if (['agent.speak_ended', 'agent.speak_interrupted'].includes(e.type) && e.source_event_id === utterance) tell({ type: 'avatar.speaking', value: false });
        if (e.type === 'agent.speak_ended' && e.source_event_id === utterance) { utterance = undefined; speakingAt = undefined; lastActivity = Date.now(); }
        if (e.type === 'error') fail();
      } catch { fail(); }
    });
    if (relay) avatar.emit('message', JSON.stringify({ type: 'session.state_updated', state: 'connected' }));
    client.on('message', (raw, binary) => {
      try {
        if (!ready) return;
        if (binary) { if (!listening) return; inputBytes += raw.length; if (raw.length > 12000 || raw.length % 2) throw Error(); send(ai, { type: 'input_audio_buffer.append', audio: raw.toString('base64') }); return; }
        const e = JSON.parse(raw.toString());
        if (e.type === 'turn.start') {
          interrupt(); send(ai, { type: 'input_audio_buffer.clear' }); inputBytes = 0; listening = true; lastActivity = Date.now();
        } else if (e.type === 'turn.end') {
          if (!listening) return;
          listening = false; lastActivity = Date.now(); speechStoppedAt = Date.now();
          if (inputBytes < 4800) { send(ai, { type: 'input_audio_buffer.clear' }); tell({ type: 'turn.empty' }); return; }
          send(ai, { type: 'input_audio_buffer.commit' }); send(ai, { type: 'response.create' }); inputBytes = 0;
        } else if (e.type === 'interrupt') interrupt();
        else if (e.type === 'text' && typeof e.text === 'string' && e.text.trim() && e.text.length <= 4000) {
          lastActivity = Date.now(); interrupt(); send(ai, { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: e.text }] } }); send(ai, { type: 'response.create' });
        } else throw Error();
      } catch { fail(); }
    });
    client.on('error', cleanup); client.on('close', cleanup);
  }
  return async () => { for (const t of tickets.values()) clearTimeout(t.timer); tickets.clear(); for (const close of bridges.values()) close(); wss.close(); await sessions.close(); };
}
