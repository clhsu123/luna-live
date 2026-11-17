import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Exercise the real browser microphone/AudioWorklet path. Only the app's
// provider-facing REST and WebSocket boundary is mocked; no paid calls occur.
const origin = 'http://localhost:18788';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(20);
  }
  throw Error(message);
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['microphone'], { origin });
  await context.addInitScript(() => {
    // Observe actual tracks without replacing capture, AudioContext or worklet.
    window.__handsfreeTracks = [];
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await capture(constraints);
      window.__handsfreeTracks.push(...stream.getAudioTracks());
      return stream;
    };
    // Worklet fetches need not emit page response events. Observe successful
    // native loading without substituting the processor or its PCM output.
    window.__handsfreeWorklets = [];
    const addModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = async function (url, options) {
      const result = await addModule.call(this, url, options);
      window.__handsfreeWorklets.push(new URL(url, location.href).pathname);
      return result;
    };
  });
  const page = await context.newPage();
  const errors = [], sessions = [], stopped = [], connections = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      externalRequests.push(url.origin);
      await route.abort();
      return;
    }
    if (url.pathname === '/api/portrait/status') {
      await route.fulfill({ json: { configured: true, sandbox: false, roles: ['Startup CTO'] } });
    } else if (url.pathname === '/api/portrait/sessions' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const id = `browser-session-${sessions.length + 1}`;
      sessions.push({ id, ...body });
      await route.fulfill({ json: { id, ticket: id, sandbox: false } });
    } else if (/^\/api\/portrait\/sessions\/browser-session-\d+\/stop$/.test(url.pathname)) {
      stopped.push(url.pathname.split('/')[4]);
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
  await page.routeWebSocket(/\/api\/portrait\/bridge\?ticket=browser-session-\d+$/, socket => {
    const state = { socket, frames: [], controls: [], closed: false };
    connections.push(state);
    socket.onMessage(message => {
      if (Buffer.isBuffer(message)) state.frames.push(message);
      else state.controls.push(JSON.parse(message));
    });
    socket.onClose(async () => {
      state.closed = true;
      await socket.close({ code: 1000 });
    });
    // Do not connectToServer: provider traffic is fully intercepted.
  });

  await page.goto(`${origin}/login`);
  await page.getByLabel('帳號').fill('luna');
  await page.getByLabel('密碼').fill('local-ui-test');
  await Promise.all([
    page.waitForURL(`${origin}/`),
    page.getByRole('button', { name: '登入', exact: true }).click(),
  ]);
  await page.goto(`${origin}/portraits`);
  const turnMode = page.getByLabel('說話方式', { exact: true });
  const input = page.getByLabel('文字訊息', { exact: true });
  const send = page.getByRole('button', { name: '傳送', exact: true });
  const begin = page.getByRole('button', { name: '開始對話', exact: true });
  const end = page.getByRole('button', { name: '結束對話', exact: true });
  const emit = (connection, event) => connection.socket.send(JSON.stringify(event));
  const allTracksEnded = () => page.evaluate(() => window.__handsfreeTracks.length > 0 && window.__handsfreeTracks.every(track => track.readyState === 'ended'));

  await turnMode.selectOption('automatic');
  await begin.click();
  await until(() => connections.length === 1, 'automatic bridge did not open');
  const automatic = connections[0];
  assert.equal(sessions[0].turnMode, 'automatic');
  await wait(250);
  assert.equal(automatic.frames.length, 0, 'must wait for bridge.ready before sending microphone audio');
  emit(automatic, { type: 'bridge.ready' });
  await until(() => automatic.frames.length >= 3, 'automatic mode did not send actual worklet PCM');
  assert.equal(await page.evaluate(() => window.__handsfreeWorklets.includes('/pcm-worklet.js')), true, 'actual /pcm-worklet.js must load');
  assert(automatic.frames.every(frame => frame.length === 4800), 'worklet must emit 100 ms of PCM16 at 24 kHz');
  await until(() => automatic.frames.some(frame => frame.some(byte => byte !== 0)), 'fake microphone did not produce non-silent samples', 15000);
  assert(!automatic.controls.some(event => ['turn.start', 'turn.end'].includes(event.type)));

  await page.getByRole('button', { name: '靜音', exact: true }).click();
  await until(() => automatic.controls.some(event => event.type === 'input.mute' && event.muted), 'mute control missing');
  const mutedFrames = automatic.frames.length;
  await wait(350);
  assert.equal(automatic.frames.length, mutedFrames, 'muted microphone still sent PCM');
  await page.getByRole('button', { name: '開啟麥克風', exact: true }).click();
  await until(() => automatic.frames.length > mutedFrames, 'unmute did not resume PCM');
  assert(automatic.controls.some(event => event.type === 'input.mute' && event.muted === false));

  // Draft and local history must depend on the matching bridge acknowledgment.
  await input.fill('保留這段測試文字');
  emit(automatic, { type: 'input_audio_buffer.speech_started', item_id: 'test-user-turn' });
  await until(() => send.isDisabled(), 'active speech did not block typed submission');
  emit(automatic, { type: 'input_audio_buffer.speech_stopped', item_id: 'test-user-turn' });
  await until(() => send.isEnabled(), 'speech stop did not release the UI speech state');
  await send.click();
  await until(() => automatic.controls.some(event => event.type === 'text'), 'typed request missing');
  const firstText = automatic.controls.find(event => event.type === 'text');
  assert.equal(await input.inputValue(), firstText.text);
  emit(automatic, { type: 'turn.text_blocked', client_id: firstText.client_id });
  await until(() => send.isEnabled(), 'blocked text remained pending');
  assert.equal(await input.inputValue(), firstText.text, 'blocked draft was lost');
  assert.equal(await page.locator('.dh-messages article.user').count(), 0, 'rejected text entered history');
  await send.click();
  await until(() => automatic.controls.filter(event => event.type === 'text').length === 2, 'draft retry missing');
  const acceptedText = automatic.controls.filter(event => event.type === 'text')[1];
  emit(automatic, { type: 'text.accepted', client_id: acceptedText.client_id });
  await until(async () => await input.inputValue() === '', 'accepted draft did not clear');
  assert.equal(await page.locator('.dh-error').count(), 0, 'accepted retry left the previous blocked-turn warning visible');
  assert.equal(await page.locator('.dh-messages article.user').count(), 1);
  emit(automatic, { type: 'text.accepted', client_id: acceptedText.client_id });
  await wait(50);
  assert.equal(await page.locator('.dh-messages article.user').count(), 1, 'duplicate acknowledgment duplicated history');

  await end.click();
  await until(() => automatic.closed, 'stop did not close the automatic WebSocket');
  await until(allTracksEnded, 'stop did not end microphone tracks');
  await until(() => stopped.includes(sessions[0].id), 'stop did not release server session');
  const stoppedFrames = automatic.frames.length;
  await wait(250);
  assert.equal(automatic.frames.length, stoppedFrames, 'PCM continued after stop');

  await turnMode.selectOption('manual');
  await begin.click();
  await until(() => connections.length === 2, 'manual bridge did not open');
  const manual = connections[1];
  assert.equal(sessions[1].turnMode, 'manual');
  emit(manual, { type: 'bridge.ready' });
  await page.getByRole('button', { name: '開始說話', exact: true }).waitFor();
  await wait(350);
  assert.equal(manual.frames.length, 0, 'manual mode sent PCM before pressing start');
  await page.getByRole('button', { name: '開始說話', exact: true }).click();
  await until(() => manual.frames.length >= 4, 'manual turn did not send PCM');
  assert.equal(manual.controls.filter(event => event.type === 'turn.start').length, 1);
  await page.getByRole('button', { name: '我說完了', exact: true }).click();
  await until(() => manual.controls.some(event => event.type === 'turn.end'), 'manual turn did not commit');
  const manualFrames = manual.frames.length;
  await wait(350);
  assert.equal(manual.frames.length, manualFrames, 'manual PCM continued after finishing turn');
  await end.click();
  await until(() => manual.closed, 'stop did not close the manual WebSocket');
  await until(allTracksEnded, 'manual stop did not end microphone tracks');
  await until(() => stopped.includes(sessions[1].id), 'manual stop did not release session');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], 'unexpected external HTTP request');
  console.log('PASS: connected browser with real AudioWorklet/fake mic, automatic PCM, readiness, mute/resume, stop cleanup, text acknowledgment/draft retention and manual turn controls (provider boundary mocked)');
} finally {
  await browser.close();
}
