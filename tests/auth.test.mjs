import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, validSession } from '../server/auth.mjs';
test('signed login sessions expire and reject tampering and password rotation', () => {
  const now = Date.now(), token = issueSession('secret', now);
  assert.equal(validSession(token, 'secret', now), true);
  assert.equal(validSession(token, 'secret', now + 8 * 3600000), false);
  assert.equal(validSession(token, 'new-secret', now), false);
  assert.equal(validSession(token + 'x', 'secret', now), false);
  assert.equal(validSession(token.replace(/^\d+/, String(now + 100000)), 'secret', now), false);
  for (const invalid of [undefined, '', 'a.b.c', '1', 'x'.repeat(300)]) assert.equal(validSession(invalid,'secret',now),false);
});
