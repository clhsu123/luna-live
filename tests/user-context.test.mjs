import test from 'node:test';
import assert from 'node:assert/strict';
import { userContextEvents } from '../server/user-context.mjs';
test('private context is optional, bounded, user-role background and never triggers a response', () => {
  for (const value of [undefined,null,{},'', '  ']) assert.deepEqual(userContextEvents(value),[]);
  const events=userContextEvents('  personal preference  ');
  assert.equal(events.length,1);
  assert.equal(events[0].type,'conversation.item.create');
  assert.equal(events[0].item.role,'user');
  assert.ok(events[0].item.content[0].text.includes('personal preference'));
  const bounded=userContextEvents('x'.repeat(9000))[0].item.content[0].text;
  assert.ok(bounded.includes('x'.repeat(8000)));
  assert.ok(!bounded.includes('x'.repeat(8001)));
});
