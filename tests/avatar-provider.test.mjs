import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveAvatarProvider, AvatarSessions, SANDBOX_AVATAR } from '../server/avatar-provider.mjs';
const reply = data => ({ ok: true, json: async () => ({ code: 100, data }) });
const session = { session_id: 'session-1', livekit_url: 'wss://room.example', livekit_client_token: 'scoped-client', ws_url: 'wss://control.example', livekit_agent_token: 'must-stay-server' };
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);
test('LITE sandbox allocation, safe client credentials, and explicit stop contract', async () => {
  const calls = [];
  const provider = new LiveAvatarProvider({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/token')) return reply({ session_id: 'session-1', session_token: 'private-jwt' });
    return reply(url.endsWith('/start') ? session : null);
  } });
  const registry = new AvatarSessions(provider);
  const created = await registry.create('owner');
  assert.deepEqual(created, { id: 'session-1', url: 'wss://room.example', token: 'scoped-client' });
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.mode, 'LITE'); assert.equal(body.is_sandbox, true);
  assert.equal(body.avatar_id, SANDBOX_AVATAR); assert.equal(body.max_session_duration, 60);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private-jwt');
  await registry.stop('owner', created.id);
  assert.deepEqual(JSON.parse(calls[2].options.body), { session_id: 'session-1', reason: 'USER_CLOSED' });
  assert.equal(registry.sessions.size, 0);
});
test('missing credentials and paid sessions fail before any network call', async () => {
  let calls = 0; const fetchImpl = async () => { calls++; };
  await rejects(new LiveAvatarProvider({ fetchImpl }).create(), 'avatar_not_configured');
  await rejects(new LiveAvatarProvider({ apiKey: 'test', sandbox: false, fetchImpl }).create(), 'paid_avatar_disabled');
  assert.equal(calls, 0);
});
test('partial start failure releases allocation and does not leak provider errors', async () => {
  const paths = [];
  const provider = new LiveAvatarProvider({ apiKey: 'test', fetchImpl: async url => {
    paths.push(url.split('/').pop());
    if (url.endsWith('/token')) return reply({ session_id: 'id', session_token: 'private' });
    if (url.endsWith('/start')) return { ok: false, status: 401, text: async () => 'secret-bearing upstream detail' };
    return reply(null);
  } });
  await rejects(provider.create(), 'avatar_request_failed');
  assert.deepEqual(paths, ['token', 'start', 'stop']);
});
test('rejects insecure provider control URLs and stops allocated session', async () => {
  const paths = [];
  const provider = new LiveAvatarProvider({ apiKey: 'test', fetchImpl: async url => {
    paths.push(url.split('/').pop());
    return reply(url.endsWith('/token') ? { session_id: 'session-1', session_token: 'private' } : url.endsWith('/start') ? { ...session, ws_url: 'http://localhost' } : null);
  } });
  await rejects(provider.create(), 'avatar_invalid_response'); assert.equal(paths.at(-1), 'stop');
});
test('concurrent creation is reserved before provider responds; foreign owner cannot stop', async () => {
  let complete; let stopped = 0;
  const registry = new AvatarSessions({ create: () => new Promise(r => { complete = r; }), stop: async () => { stopped++; } });
  const pending = registry.create('alice');
  await rejects(registry.create('bob'), 'session_already_active');
  complete({ id: 'id', client: { url: 'wss://test', token: 'token' } }); await pending;
  await rejects(registry.stop('bob', 'id'), 'session_not_found'); assert.equal(stopped, 0);
  await Promise.all([registry.stop('alice', 'id'), registry.stop('alice', 'id')]); assert.equal(stopped, 1);
});
test('failed stop retains capacity and is retryable', async () => {
  let fail = true;
  const registry = new AvatarSessions({ create: async () => ({ id: 'id', client: {} }), stop: async () => { if (fail) throw Error('unavailable'); } });
  await registry.create('owner'); await assert.rejects(registry.stop('owner', 'id'));
  await rejects(registry.create('owner'), 'session_already_active');
  fail = false; await registry.stop('owner', 'id'); assert.equal(registry.sessions.size, 0);
});
test('TTL closes abandoned sessions', async () => {
  let stopped = 0;
  const registry = new AvatarSessions({ create: async () => ({ id: 'id', client: {} }), stop: async () => { stopped++; } }, { ttlMs: 10 });
  await registry.create('owner'); await new Promise(r => setTimeout(r, 30)); assert.equal(stopped, 1);
});
test('shutdown racing allocation stops newly allocated session', async () => {
  let complete; let stopped = 0;
  const registry = new AvatarSessions({ create: () => new Promise(r => { complete = r; }), stop: async () => { stopped++; } });
  const pending = registry.create('owner'); await registry.close();
  complete({ id: 'id', client: {} }); await rejects(pending, 'shutting_down'); assert.equal(stopped, 1);
});
