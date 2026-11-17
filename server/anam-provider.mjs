import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ProviderError } from './avatar-provider.mjs';
export const CHARACTER_IDS = ['luna-office','luna-evening','08-office','08-evening','19-office','19-evening','20-knit','20-evening'];
export function anamAvatars(env = process.env) {
  let parsed = {};
  try { parsed = JSON.parse(env.ANAM_AVATAR_MAP || '{}'); } catch { return {}; }
  const mapping = Object.fromEntries(CHARACTER_IDS.filter(id => typeof parsed?.[id] === 'string' && parsed[id].trim()).map(id => [id, parsed[id].trim()]));
  if (env.ANAM_AVATAR_ID?.trim() && !mapping['luna-office']) mapping['luna-office'] = env.ANAM_AVATAR_ID.trim();
  return mapping;
}
export class AnamProvider {
  constructor({ env = process.env, fetchImpl = fetch, log = entry => console.warn(JSON.stringify(entry)) } = {}) { this.env = env; this.fetch = fetchImpl; this.log = log; }
  async create(character) {
    const avatarId = anamAvatars(this.env)[character];
    if (!this.env.ANAM_API_KEY) throw new ProviderError('anam_api_key_required', 503);
    if (!avatarId) throw new ProviderError('anam_character_not_configured', 400);
    let response;
    try {
      response = await this.fetch('https://api.anam.ai/v1/auth/session-token', {
        method: 'POST', headers: { Authorization: `Bearer ${this.env.ANAM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaConfig: { name: 'Luna', avatarId, avatarModel: this.env.ANAM_AVATAR_MODEL || 'cara-4', enableAudioPassthrough: true, maxSessionLengthSeconds: 600 }, sessionOptions: { videoWidth: 768, videoHeight: 1152, dataRetention: { recording: false, transcripts: false } } }),
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ProviderError('anam_unavailable'); }
    if (!response.ok) {
      const codes = { 400: 'anam_configuration_rejected', 401: 'anam_authentication_failed', 402: 'anam_billing_required', 403: 'anam_access_denied', 404: 'anam_resource_not_found', 422: 'anam_configuration_rejected', 429: 'anam_quota_or_rate_limit' };
      const code = codes[response.status] || (response.status >= 500 ? 'anam_provider_error' : 'anam_session_failed');
      // Never log upstream bodies/headers: they may contain credentials or session tokens.
      this.log({ event: 'anam_session_rejected', upstreamStatus: response.status, code });
      throw new ProviderError(code, response.status === 429 ? 429 : 502);
    }
    let result; try { result = await response.json(); } catch { throw new ProviderError('anam_invalid_response'); }
    if (typeof result?.sessionToken !== 'string' || !result.sessionToken) throw new ProviderError('anam_invalid_response');
    return { id: randomUUID(), client: { sessionToken: result.sessionToken } };
  }
  // Browser stopStreaming closes the session; provider-side duration caps orphan streams.
  async stop() {}
}
export class AnamRelay extends EventEmitter {
  readyState = 1; bufferedAmount = 0; timer; current; milliseconds = 0; startedAt = 0;
  constructor(tell) { super(); this.tell = tell; }
  send(raw) {
    const e = JSON.parse(raw);
    if (e.type === 'agent.speak') {
      if (this.current !== e.event_id) { clearTimeout(this.timer); this.milliseconds = 0; this.startedAt = Date.now(); }
      this.current = e.event_id; this.milliseconds += Buffer.from(e.audio, 'base64').length / 48;
      this.tell({ type: 'anam.audio', audio: e.audio });
    } else if (e.type === 'agent.speak_end') {
      this.tell({ type: 'anam.audio.end' });
      const id = this.current; clearTimeout(this.timer);
      // Conservative estimate for idle cleanup, never reported as measured playback.
      this.timer = setTimeout(() => { this.milliseconds = 0; this.emit('message', JSON.stringify({ type: 'agent.speak_ended', source_event_id: id })); }, Math.max(0, this.startedAt + this.milliseconds - Date.now()) + 1500);
      this.timer.unref?.();
    } else if (e.type === 'agent.interrupt') {
      clearTimeout(this.timer); this.current = undefined; this.milliseconds = 0; this.tell({ type: 'anam.interrupt' });
    }
  }
  close() { clearTimeout(this.timer); this.readyState = 3; }
}
