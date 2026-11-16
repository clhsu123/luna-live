// Server-only configuration. Never expose apiKey in status responses.
export function voiceProvider(env = process.env) {
  const name = env.AI_PROVIDER || (env.XAI_API_KEY ? 'xai' : 'openai');
  if (!['openai', 'xai'].includes(name)) throw new Error('invalid_ai_provider');
  const xai = name === 'xai';
  const apiKey = xai ? env.XAI_API_KEY : env.OPENAI_API_KEY;
  const model = xai ? env.XAI_REALTIME_MODEL || 'grok-voice-latest' : env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
  return {
    name, apiKey, model, configured: Boolean(apiKey && !apiKey.includes('REPLACE_ME')),
    url: `wss://${xai ? 'api.x.ai' : 'api.openai.com'}/v1/realtime?model=${encodeURIComponent(model)}`,
    session(instructions) {
      const format = { type: 'audio/pcm', rate: 24000 };
      return xai ? {
        instructions, voice: env.XAI_VOICE || 'eve', turn_detection: { type: null },
        audio: { input: { format }, output: { format } },
      } : {
        type: 'realtime', instructions, output_modalities: ['audio'],
        audio: { input: { format, transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: null }, output: { format, voice: 'marin' } },
      };
    },
  };
}
export function normalizeVoiceEvent(event) {
  const aliases = {
    'response.audio.delta': 'response.output_audio.delta',
    'response.audio.done': 'response.output_audio.done',
    'response.audio_transcript.delta': 'response.output_audio_transcript.delta',
    'response.audio_transcript.done': 'response.output_audio_transcript.done',
  };
  return aliases[event.type] ? { ...event, type: aliases[event.type] } : event;
}
