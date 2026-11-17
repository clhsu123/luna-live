import { MouthEnvelope } from './voice-envelope.mjs';
// Browser PCM16 mono playback. A sequence ends only after both the end marker
// and its final scheduled sample; temporary network gaps do not end speaking.
export class PcmPlayback {
  constructor(context, onSpeaking) {
    this.context = context; this.onSpeaking = onSpeaking;
    this.mouth = new MouthEnvelope();
    this.sources = new Set(); this.nextTime = 0; this.receiving = false;
  }
  append(encoded) {
    const raw = atob(encoded);
    if (!raw.length || raw.length % 2) throw Error('invalid_pcm');
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const buffer = this.context.createBuffer(1, bytes.length / 2, 24000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.context.destination);
    const start = Math.max(this.context.currentTime + 0.02, this.nextTime);
    this.nextTime = start + buffer.duration;
    this.receiving = true; this.sources.add(source);
    source.onended = () => {
      if (!this.sources.delete(source)) return;
      source.disconnect();
      if (!this.receiving && !this.sources.size) this.onSpeaking(false);
    };
    source.start(start); this.mouth.at(this.context.currentTime); this.mouth.append(samples, 24000, start); this.onSpeaking(true);
  }
  mouthLevel() {
    if (this.context.state && this.context.state !== 'running') return 0;
    return this.mouth.at(this.context.currentTime);
  }
  end() {
    this.receiving = false;
    if (!this.sources.size) this.onSpeaking(false);
  }
  clear() {
    this.mouth.clear();
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.sources.clear(); this.nextTime = 0; this.receiving = false;
    this.onSpeaking(false);
  }
}
