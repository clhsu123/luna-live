import express from 'express';
import { synthesizeWithXai } from './xai-tts.mjs';

export function installReplayTts(app, { synthesize = synthesizeWithXai } = {}) {
  const requests = new Map();
  app.post('/api/replay-tts', express.json({ limit: '8kb' }), async (req, res) => {
    const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
    if (!origin || req.get('origin') !== new URL(origin).origin) return res.status(403).json({ error: 'origin_not_allowed' });
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) return res.status(400).json({ error: 'invalid_replay_text' });
    const now = Date.now(), ip = req.ip || 'local';
    for (const [address, hits] of requests) if (hits.every(t => now - t > 60_000)) requests.delete(address);
    const hits = (requests.get(ip) || []).filter(t => now - t < 60_000);
    if (hits.length >= 8) return res.status(429).json({ error: 'replay_rate_limited' });
    hits.push(now); requests.set(ip, hits);
    try {
      const result = await synthesize(text.trim(), { signal: AbortSignal.timeout(45_000) });
      res.json({ audio: result.audio, duration: result.duration });
    } catch {
      res.status(502).json({ error: 'replay_unavailable' });
    }
  });
}
