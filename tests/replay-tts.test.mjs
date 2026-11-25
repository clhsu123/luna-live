import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installReplayTts } from '../server/replay-tts.mjs';

test('replay uses server TTS with same-origin guard and bounded text', async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'http://127.0.0.1:18889';
  const calls = [];
  const app = express();
  installReplayTts(app, { synthesize: async text => { calls.push(text); return { audio: 'AAAAAA==', duration: 0.00008 }; } });
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/replay-tts`;
    const send = (text, origin = process.env.APP_ORIGIN) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ text }) });
    assert.equal((await send('안녕하세요.', 'https://other.example')).status, 403);
    assert.equal((await send('x'.repeat(2001))).status, 400);
    const good = await send(' 안녕하세요. ');
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { audio: 'AAAAAA==', duration: 0.00008 });
    assert.deepEqual(calls, ['안녕하세요.']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous;
  }
});
