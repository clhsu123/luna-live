import { ProviderError } from './avatar-provider.mjs';

// xAI's timestamped TTS endpoint returns 24 kHz mono PCM suitable for the
// existing avatar audio relay. The API key never leaves this server.
export async function synthesizeWithXai(text, {
  env = process.env,
  fetchImpl = fetch,
  signal,
} = {}) {
  if (!env.XAI_API_KEY || env.XAI_API_KEY.includes('REPLACE_ME')) {
    throw new ProviderError('xai_tts_not_configured', 503);
  }
  let response;
  try {
    response = await fetchImpl('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, 4000),
        voice_id: env.XAI_TTS_VOICE || 'eve',
        language: 'auto',
        codec: 'pcm',
        sample_rate: 24000,
        with_timestamps: true,
      }),
      signal: signal || AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError('xai_tts_unavailable');
  }
  if (!response.ok) {
    throw new ProviderError(response.status === 429 ? 'xai_tts_quota_or_rate_limit' : 'xai_tts_request_failed', response.status === 429 ? 429 : 502);
  }
  let result;
  try { result = await response.json(); } catch { throw new ProviderError('xai_tts_invalid_response'); }
  if (typeof result?.audio !== 'string' || !result.audio) throw new ProviderError('xai_tts_invalid_response');
  return {
    audio: result.audio,
    duration: Number.isFinite(result.duration) ? result.duration : undefined,
    timestamps: result.audio_timestamps,
  };
}
