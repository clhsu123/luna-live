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
        output_format: { codec: 'pcm', sample_rate: 24000 },
        with_timestamps: true,
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError('xai_tts_unavailable');
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new ProviderError('xai_tts_auth_failed', 502);
    throw new ProviderError(response.status === 429 ? 'xai_tts_quota_or_rate_limit' : 'xai_tts_request_failed', response.status === 429 ? 429 : 502);
  }
  let result;
  try { result = await response.json(); } catch { throw new ProviderError('xai_tts_invalid_response'); }
  if (typeof result?.audio !== 'string' || !result.audio) throw new ProviderError('xai_tts_invalid_response');
  if (result.content_type && result.content_type.split(';')[0] !== 'audio/pcm') throw new ProviderError('xai_tts_invalid_response');
  const bytes = Buffer.from(result.audio, 'base64');
  if (!bytes.length || bytes.length % 2 || bytes.toString('base64') !== result.audio) throw new ProviderError('xai_tts_invalid_response');
  // Metadata is not a playback clock: derive duration from actual PCM samples.
  return {
    audio: result.audio,
    duration: bytes.length / 48000,
    timestamps: result.audio_timestamps,
  };
}
