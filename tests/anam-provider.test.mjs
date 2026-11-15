import test from 'node:test';
import assert from 'node:assert/strict';
import { AnamProvider, AnamRelay, anamAvatars } from '../server/anam-provider.mjs';
import { AvatarSessions } from '../server/avatar-provider.mjs';
test('Anam rejects missing credentials and unmapped faces without allocating', async () => {
  const fetchImpl = () => { throw Error('must not fetch'); };
  await assert.rejects(new AnamProvider({ env:{}, fetchImpl }).create('luna-office'), /anam_api_key_required/);
  await assert.rejects(new AnamProvider({ env:{ANAM_API_KEY:'test',ANAM_AVATAR_ID:'one'}, fetchImpl }).create('19-evening'), /anam_character_not_configured/);
  assert.deepEqual(anamAvatars({ANAM_AVATAR_ID:'default',ANAM_AVATAR_MAP:'{"luna-office":"mapped","invalid":"ignored"}'}), {'luna-office':'mapped'});
});
test('Anam token uses external audio, scoped credentials, explicit retention and duration', async () => {
  const provider = new AnamProvider({env:{ANAM_API_KEY:'server-secret', ANAM_AVATAR_ID:'custom-face'}, fetchImpl: async (url, options) => {
    assert.equal(url,'https://api.anam.ai/v1/auth/session-token');
    assert.equal(options.headers.Authorization,'Bearer server-secret');
    const body = JSON.parse(options.body);
    assert.equal(body.personaConfig.avatarId,'custom-face');
    assert.equal(body.personaConfig.enableAudioPassthrough,true);
    assert.equal(body.personaConfig.maxSessionLengthSeconds,180);
    assert.deepEqual(body.sessionOptions.dataRetention,{recording:false,transcripts:false});
    return {ok:true,json:async()=>({sessionToken:'scoped-token'})};
  }});
  const sessions = new AvatarSessions(provider);
  const result = await sessions.create('owner','luna-office');
  assert.equal(result.sessionToken,'scoped-token'); assert.ok(!JSON.stringify(result).includes('server-secret'));
  assert.throws(()=>sessions.get('other',result.id),/session_not_found/);
  await sessions.close();
});
test('Anam error bodies never expose upstream secrets', async () => {
  const provider = new AnamProvider({env:{ANAM_API_KEY:'secret',ANAM_AVATAR_ID:'face'},fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:'secret'})})});
  await assert.rejects(provider.create('luna-office'),/anam_quota_or_rate_limit/);
});
test('Anam audio forwarding preserves PCM, closes each sequence, and resets on interrupt', () => {
  const events=[]; const relay = new AnamRelay(e=>events.push(e));
  const audio=Buffer.alloc(4800,12).toString('base64');
  relay.send(JSON.stringify({type:'agent.speak',event_id:'one',audio}));
  relay.send(JSON.stringify({type:'agent.speak_end',event_id:'one'}));
  assert.deepEqual(events,[{type:'anam.audio',audio},{type:'anam.audio.end'}]);
  relay.send(JSON.stringify({type:'agent.interrupt'})); assert.equal(relay.milliseconds,0);
  assert.equal(events.at(-1).type,'anam.interrupt'); relay.close();
});
