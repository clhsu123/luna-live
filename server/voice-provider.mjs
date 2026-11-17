// Server-only configuration. Never expose apiKey in status responses.
export function voiceProvider(env = process.env) {
  // CHAT_PROVIDER selects the language model independently from the voice. The
  // legacy AI_PROVIDER switch remains supported for existing deployments.
  const name = env.CHAT_PROVIDER || env.AI_PROVIDER || (env.OPENAI_API_KEY ? 'openai' : 'xai');
  if (!['openai', 'xai'].includes(name)) throw new Error('invalid_ai_provider');
  const xai = name === 'xai';
  const apiKey = xai ? env.XAI_API_KEY : env.OPENAI_API_KEY;
  const model = xai ? env.XAI_REALTIME_MODEL || 'grok-voice-latest' : env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
  return {
    name, apiKey, model, configured: Boolean(apiKey && !apiKey.includes('REPLACE_ME')),
    url: `wss://${xai ? 'api.x.ai' : 'api.openai.com'}/v1/realtime?model=${encodeURIComponent(model)}`,
    session(instructions, turnMode = 'manual') {
      if (!['manual', 'automatic'].includes(turnMode)) throw Error('invalid_turn_mode');
      const automatic = turnMode === 'automatic';
      const format = { type: 'audio/pcm', rate: 24000 };
      return xai ? {
        instructions, voice: env.XAI_VOICE || 'eve', turn_detection: { type: automatic ? 'server_vad' : null },
        audio: { input: { format }, output: { format } },
      } : {
        type: 'realtime', instructions,
        output_modalities: env.CHAT_OUTPUT === 'xai-tts' ? ['text'] : ['audio'],
        audio: { input: { format, transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: automatic ? { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 800, create_response: true, interrupt_response: true } : null }, output: { format, voice: 'marin' } },
      };
    },
    xaiTts: name === 'openai' && env.CHAT_OUTPUT === 'xai-tts',
    xaiTtsConfigured: Boolean(env.XAI_API_KEY && !env.XAI_API_KEY.includes('REPLACE_ME')),
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
