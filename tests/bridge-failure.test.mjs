import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeFailure } from '../server/bridge-failure.mjs';
test('provider diagnostics classify failures without echoing secrets or conversation', () => {
  assert.equal(bridgeFailure('chat_connect', Error('Unexpected server response: 401')).code, 'chat_connect:authentication');
  assert.equal(bridgeFailure('chat_event', {code:'model_not_found'}).code, 'chat_event:model');
  assert.equal(bridgeFailure('chat_event', {type:'invalid_request_error'}).code, 'chat_event:configuration');
  assert.equal(bridgeFailure('xai_tts', {code:'xai_tts_quota_or_rate_limit'}).code, 'xai_tts:quota_or_rate_limit');
  const secret = 'private-key-and-dialogue';
  assert.equal(JSON.stringify(bridgeFailure(secret, {code:secret, message:secret, body:secret})).includes(secret), false);
  assert.equal(JSON.stringify(bridgeFailure('chat_event', {code:'invalid_value', message:secret})).includes(secret), false);
});
