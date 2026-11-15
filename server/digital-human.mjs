import { normalizeHistory, replayEvents } from '../shared/memory.mjs';
import { AudioBatcher } from './audio-batcher.mjs';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import { AvatarSessions, LiveAvatarProvider, ProviderError } from './avatar-provider.mjs';
const instructions = {
  companion: 'You are Luna, an adult AI companion, not a human. Be warm, grounded and concise. Speak Traditional Chinese by default; switch to Korean or English on request.',
  korean: 'You are Luna, a Korean tutor for a Traditional Chinese speaker. Prefer natural polite 해요체. Give brief grammar, vocabulary and pronunciation feedback without claiming you can diagnose pronunciation precisely. Adapt difficulty. Ask one question at a time.',
  business: 'This is fictional semiconductor customer roleplay, never actual customer intelligence. Act as the selected Korean customer. Challenge a CPU IP salesperson on RISC-V vs Arm, PPA, licensing fees, maintenance, royalties, integration, evaluation, tape-out, competitors and technical objections. Do not invent Andes specifications. Give actionable feedback on request. English by default; switch language when asked.',
};
const roles = ['Startup CTO', 'SoC architect', 'ASIC design manager', 'CPU IP purchasing manager', 'Edge AI accelerator company', 'Touch IC manufacturer', 'Automotive semiconductor customer'];
export function installDigitalHuman(app, server) {
  const sandbox = process.env.LIVEAVATAR_SANDBOX !== 'false';
  const provider = new LiveAvatarProvider({ apiKey: process.env.LIVEAVATAR_API_KEY, avatarId: process.env.LIVEAVATAR_AVATAR_ID, sandbox, allowPaid: process.env.ALLOW_PAID_AVATAR === 'true' });
  const sessions = new AvatarSessions(provider, { ttlMs: sandbox ? 60_000 : 300_000 });
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
  app.get('/api/avatar/status', (req, res) => {
    owner(req, res);
    res.json({ configured: Boolean(origin && process.env.OPENAI_API_KEY && process.env.LIVEAVATAR_API_KEY && (sandbox || process.env.LIVEAVATAR_AVATAR_ID)), sandbox, paidEnabled: process.env.ALLOW_PAID_AVATAR === 'true', gestures: [], roles });
  });
  app.post('/api/avatar/sessions', csrf, json, async (req, res) => {
    const { mode, role, history = [] } = req.body || {};
    if (!Array.isArray(history) || history.length > 100 || history.some(e => !e || !['user', 'assistant'].includes(e.role) || typeof e.text !== 'string' || e.text.length > 4000)) return res.status(400).json({ error: 'invalid_history' });
    if (!Object.hasOwn(instructions, mode) || (role !== undefined && !roles.includes(role))) return res.status(400).json({ error: 'invalid_mode_or_role' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'openai_not_configured' });
    const user = owner(req, res);
    try {
      const session = await sessions.create(user);
      const ticket = randomUUID();
      const timer = setTimeout(() => { tickets.delete(ticket); void sessions.stop(user, session.id).catch(() => {}); }, 30_000);
      timer.unref();
      tickets.set(ticket, { user, id: session.id, mode, role, timer, history: normalizeHistory(history, 40, 16000) });
      res.json({ ...session, ticket, sandbox });
    } catch (error) { safeError(res, error); }
  });
  app.post('/api/avatar/sessions/:id/stop', csrf, json, async (req, res) => {
    try {
      const user = owner(req, res); sessions.get(user, req.params.id);
      bridges.get(req.params.id)?.();
      await sessions.stop(user, req.params.id); res.json({ ok: true });
    } catch (error) { safeError(res, error); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
    const ticket = tickets.get(url.searchParams.get('ticket'));
    const cookieOwner = /(?:^|;\s*)luna_owner=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (url.pathname !== '/api/avatar/bridge' || !origin || req.headers.origin !== origin || !ticket || ticket.user !== cookieOwner) return socket.destroy();
    tickets.delete(url.searchParams.get('ticket')); clearTimeout(ticket.timer);
    wss.handleUpgrade(req, socket, head, client => connect(client, ticket));
  });
  function connect(client, ticket) {
    let record;
    try { record = sessions.get(ticket.user, ticket.id); } catch { client.close(1008); return; }
    let ai; let avatar; let done = false; let ready = false; let responseId; let itemId; let utterance; let speakingAt; let speechStoppedAt; let generatedMs = 0; let active = false; let listening = false; let lastActivity = Date.now();
    const tell = data => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
    const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(data)); else throw Error('transport_backpressure'); };
    const cleanup = () => {
      if (done) return; done = true; batch.clear(); clearInterval(heartbeat); clearTimeout(startup); bridges.delete(ticket.id);
      ai?.close(); avatar?.close(); client.close(); void sessions.stop(ticket.user, ticket.id).catch(() => {});
    };
    const fail = () => { tell({ type: 'bridge.error', message: '連線中斷或供應商錯誤。請結束後重新連線。' }); cleanup(); };
    const batch = new AudioBatcher(audio => send(avatar, { type: 'agent.speak', event_id: utterance, audio }), { onError: fail });
    const interrupt = () => {
      batch.clear();
      if (active) send(ai, { type: 'response.cancel' });
      if (utterance) {
        send(avatar, { type: 'agent.interrupt', event_id: randomUUID() });
        // Conservative elapsed playback estimate; provider has no sample-accurate playhead.
        if (itemId) send(ai, { type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.min(generatedMs, speakingAt ? Math.max(0, Date.now() - speakingAt) : 0) });
      }
      responseId = undefined; utterance = undefined; speakingAt = undefined; active = false;
    };
    const startup = setTimeout(fail, 25_000);
    const heartbeat = setInterval(() => {
      try {
        if (ready && !active && !utterance && !listening && Date.now() - lastActivity >= 45_000) {
          tell({ type: 'bridge.error', message: '已閒置 45 秒，影像連線已自動結束以節省用量。可以隨時重新開始。' }); cleanup(); return;
        }
        if (ready) send(avatar, { type: 'session.keep_alive' });
        if (!sessions.sessions.has(ticket.id)) cleanup();
      } catch { fail(); }
    }, 5_000);
    bridges.set(ticket.id, cleanup);
    try { avatar = new WebSocket(record.controlUrl); } catch { fail(); return; }
    avatar.on('error', fail); avatar.on('close', cleanup);
    avatar.on('message', raw => {
      try {
        const e = JSON.parse(raw.toString());
        if (e.type === 'session.state_updated' && e.state === 'connected' && !ai) {
          ai = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime')}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
          ai.on('error', fail); ai.on('close', cleanup);
          ai.on('open', () => send(ai, { type: 'session.update', session: { type: 'realtime', instructions: `${instructions[ticket.mode]} ${ticket.mode === 'business' ? `Customer role: ${ticket.role || roles[0]}.` : ''}`, output_modalities: ['audio'], audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'semantic_vad', eagerness: 'low', interrupt_response: false, create_response: true } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } } } }));
          ai.on('message', raw => {
            try {
              const e = JSON.parse(raw.toString());
              if (e.type === 'session.updated' && !ready) { for (const event of replayEvents(ticket.history)) send(ai, event); ready = true; clearTimeout(startup); tell({ type: 'bridge.ready' }); }
              if (e.type === 'input_audio_buffer.speech_started') { listening = true; lastActivity = Date.now(); interrupt(); }
              if (e.type === 'input_audio_buffer.speech_stopped') { listening = false; speechStoppedAt = Date.now(); lastActivity = Date.now(); }
              if (e.type === 'response.created') { responseId = e.response.id; active = true; generatedMs = 0; itemId = undefined; utterance = undefined; speakingAt = undefined; }
              if (e.type === 'response.output_audio.delta' && e.response_id === responseId) {
                itemId = e.item_id; utterance ||= randomUUID();
                generatedMs += Buffer.from(e.delta, 'base64').length / 48;
                batch.append(e.delta);
              }
              if (e.type === 'response.output_audio.done' && e.response_id === responseId && utterance) { batch.flush(); send(avatar, { type: 'agent.speak_end', event_id: utterance }); }
              if (e.type === 'response.done') { active = false; if (e.response?.status === 'failed') fail(); }
              if (['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'conversation.item.input_audio_transcription.completed', 'response.output_audio_transcript.delta', 'response.output_audio_transcript.done', 'response.created'].includes(e.type)) tell(e);
              if (e.type === 'error') fail();
            } catch { fail(); }
          });
        }
        if (e.type === 'agent.speak_started' && e.source_event_id === utterance) {
          speakingAt = Date.now(); tell({ type: 'avatar.speaking', value: true, responseLatencyMs: speechStoppedAt ? Date.now() - speechStoppedAt : null });
        }
        if (['agent.speak_ended', 'agent.speak_interrupted'].includes(e.type)) tell({ type: 'avatar.speaking', value: false });
        if (e.type === 'agent.speak_ended' && e.source_event_id === utterance) { utterance = undefined; speakingAt = undefined; lastActivity = Date.now(); }
        if (e.type === 'error') fail();
      } catch { fail(); }
    });
    client.on('message', (raw, binary) => {
      try {
        if (!ready) return;
        if (binary) { if (raw.length > 12000 || raw.length % 2) throw Error(); send(ai, { type: 'input_audio_buffer.append', audio: raw.toString('base64') }); return; }
        const e = JSON.parse(raw.toString());
        if (e.type === 'interrupt') interrupt();
        else if (e.type === 'text' && typeof e.text === 'string' && e.text.trim() && e.text.length <= 4000) {
          lastActivity = Date.now(); interrupt(); send(ai, { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: e.text }] } }); send(ai, { type: 'response.create' });
        } else throw Error();
      } catch { fail(); }
    });
    client.on('error', cleanup); client.on('close', cleanup);
  }
  return async () => { for (const t of tickets.values()) clearTimeout(t.timer); tickets.clear(); for (const close of bridges.values()) close(); wss.close(); await sessions.close(); };
}
