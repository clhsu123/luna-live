import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceProvider, normalizeVoiceEvent } from '../server/voice-provider.mjs';
test('provider selection supports xAI-only setup, explicit rollback and no silent fallback', () => {
  assert.equal(voiceProvider({XAI_API_KEY:'test'}).name, 'xai');
  assert.equal(voiceProvider({XAI_API_KEY:'test'}).configured, true);
  assert.equal(voiceProvider({AI_PROVIDER:'openai',XAI_API_KEY:'test'}).configured, false);
  assert.equal(voiceProvider({AI_PROVIDER:'xai',OPENAI_API_KEY:'test'}).configured, false);
  assert.throws(()=>voiceProvider({AI_PROVIDER:'typo'}));
});
test('legacy xAI transcript events normalize without losing IDs or text', () => {
  for(const suffix of ['delta','done']) {
    const e={type:`response.audio_transcript.${suffix}`,response_id:'r',item_id:'i',delta:'你好',transcript:'你好'};
    assert.deepEqual(normalizeVoiceEvent(e),{...e,type:`response.output_audio_transcript.${suffix}`});
  }
});
