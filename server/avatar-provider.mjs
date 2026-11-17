// Provider boundary: OpenAI remains responsible for all conversational intelligence.
// No API keys, session JWTs, agent tokens, or control URLs are returned to the browser.
export class ProviderError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
export const SANDBOX_AVATAR = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';
export class LiveAvatarProvider {
  constructor({ apiKey, avatarId, sandbox = true, allowPaid = false, fetchImpl = fetch }) {
    this.apiKey = apiKey; this.avatarId = avatarId; this.sandbox = sandbox;
    this.allowPaid = allowPaid; this.fetch = fetchImpl;
  }
  async request(path, body, token) {
    let response;
    try {
      response = await this.fetch(`https://api.liveavatar.com/v1/sessions/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : { 'X-API-KEY': this.apiKey }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch { throw new ProviderError('avatar_unavailable'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'avatar_quota_or_rate_limit' : 'avatar_request_failed', response.status === 429 ? 429 : 502);
    let result;
    try { result = await response.json(); } catch { throw new ProviderError('avatar_invalid_response'); }
    // Official SDK uses 1000; API reference examples also use 100.
    if (!result || ![100, 1000].includes(result.code)) throw new ProviderError('avatar_invalid_response');
    return result.data;
  }
  async create() {
    if (!this.apiKey) throw new ProviderError('avatar_not_configured', 503);
    if (!this.sandbox && !this.allowPaid) throw new ProviderError('paid_avatar_disabled', 403);
    const avatarId = this.sandbox ? SANDBOX_AVATAR : this.avatarId;
    if (!avatarId) throw new ProviderError('avatar_identity_required', 503);
    const token = await this.request('token', {
      mode: 'LITE', avatar_id: avatarId, is_sandbox: this.sandbox,
      max_session_duration: this.sandbox ? 60 : 300,
      video_settings: { quality: 'high', encoding: 'H264' },
    });
    if (!token?.session_id || !token?.session_token) throw new ProviderError('avatar_invalid_response');
    try {
      const session = await this.request('start', undefined, token.session_token);
      if (session?.session_id !== token.session_id ||
          !isSecureUrl(session.livekit_url) || !isSecureUrl(session.ws_url) ||
          typeof session.livekit_client_token !== 'string' || !session.livekit_client_token) {
        throw new ProviderError('avatar_invalid_response');
      }
      return {
        id: session.session_id,
        controlUrl: session.ws_url,
        // Scoped browser transport credentials only. Do not persist these.
        client: { url: session.livekit_url, token: session.livekit_client_token },
      };
    } catch (error) {
      // Starting can fail after allocation; attempt cleanup without replacing the original error.
      try { await this.stop(token.session_id); } catch { /* TTL remains the final cleanup guard. */ }
      throw error;
    }
  }
  async stop(id) { await this.request('stop', { session_id: id, reason: 'USER_CLOSED' }); }
}
function isSecureUrl(value) {
  try { const url = new URL(value); return url.protocol === 'wss:' && !url.username && !url.password; }
  catch { return false; }
}

// Single-instance ownership and concurrency guard. A shared store is required before scaling.
export class AvatarSessions {
  constructor(provider, { ttlMs = 300_000, maxSessions = 1 } = {}) {
    this.provider = provider; this.ttlMs = ttlMs; this.maxSessions = maxSessions;
    this.sessions = new Map(); this.pending = 0; this.closed = false;
  }
  async create(owner, options) {
    if (this.closed) throw new ProviderError('shutting_down', 503);
    if (this.sessions.size + this.pending >= this.maxSessions) throw new ProviderError('session_already_active', 409);
    this.pending++;
    try {
      const session = await this.provider.create(options);
      if (this.closed) { await this.provider.stop(session.id); throw new ProviderError('shutting_down', 503); }
      const record = { ...session, owner, timer: null, stopping: null };
      this.sessions.set(session.id, record);
      if (this.ttlMs !== null) {
        record.timer = setTimeout(() => { void this.stop(owner, session.id).catch(() => {}); }, this.ttlMs);
        record.timer.unref?.();
      }
      return { id: session.id, ...session.client };
    } finally { this.pending--; }
  }
  get(owner, id) {
    const record = this.sessions.get(id);
    if (!record || record.owner !== owner) throw new ProviderError('session_not_found', 404);
    return record;
  }
  async stop(owner, id) {
    const record = this.get(owner, id);
    if (record.stopping) return record.stopping;
    record.stopping = this.provider.stop(id).then(() => {
      clearTimeout(record.timer); this.sessions.delete(id);
    }).catch(error => {
      // Retain the allocation and concurrency slot so a failed stop cannot leak unlimited sessions.
      record.stopping = null;
      clearTimeout(record.timer);
      record.timer = setTimeout(() => { void this.stop(owner, id).catch(() => {}); }, 10_000);
      record.timer.unref?.();
      throw error;
    });
    return record.stopping;
  }
  async close() {
    this.closed = true;
    return Promise.allSettled([...this.sessions.values()].map(r => this.stop(r.owner, r.id)));
  }
}
