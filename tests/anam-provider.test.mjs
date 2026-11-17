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
    assert.equal(body.personaConfig.maxSessionLengthSeconds,600);
    assert.equal(body.sessionOptions.videoWidth,768);
    assert.equal(body.sessionOptions.videoHeight,1152);
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

test('relay completion accounts for streamed time and cancels previous sequence timers', t => {
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const events=[],relay=new AnamRelay(()=>{});relay.on('message',raw=>events.push(JSON.parse(raw)));
 const send=(type,event_id='one')=>relay.send(JSON.stringify({type,event_id,audio:Buffer.alloc(48000).toString('base64')}));
 send('agent.speak');t.mock.timers.tick(1000);send('agent.speak_end');
 t.mock.timers.tick(1499);assert.equal(events.length,0);t.mock.timers.tick(1);assert.equal(events.length,1);
 send('agent.speak','two');send('agent.speak_end','two');send('agent.interrupt');
 t.mock.timers.tick(5000);assert.equal(events.length,1);relay.close();
});
