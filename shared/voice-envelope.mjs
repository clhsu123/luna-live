// Audio-clock timeline for a future rig's mouth-open parameter, NOT phoneme
// alignment. Feed the same PCM and start time used for audible playback.
export class MouthEnvelope {
  constructor() { this.blocks = []; this.value = 0; this.lastTime = null; }
  append(samples, sampleRate, startsAt) {
    if (!(samples instanceof Float32Array) || !samples.length ||
        !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(startsAt) ||
        samples.some(v => !Number.isFinite(v))) throw Error('invalid_pcm');
    const width = Math.max(1, Math.round(sampleRate * 0.01));
    const levels = [];
    for (let i = 0; i < samples.length; i += width) {
      let energy = 0; const end = Math.min(i + width, samples.length);
      for (let j = i; j < end; j++) energy += samples[j] ** 2;
      levels.push(Math.min(1, Math.max(0, (Math.sqrt(energy / (end - i)) - 0.012) * 5)));
    }
    if (this.blocks.length && startsAt < this.blocks.at(-1).endsAt - 1e-6) throw Error('overlapping_pcm');
    this.blocks.push({ startsAt, endsAt: startsAt + samples.length / sampleRate, step: width / sampleRate, levels });
  }
  at(audioTime) {
    this.blocks = this.blocks.filter(b => b.endsAt > audioTime);
    const b = this.blocks.find(b => audioTime >= b.startsAt && audioTime < b.endsAt);
    const target = b ? b.levels[Math.min(b.levels.length - 1, Math.floor((audioTime - b.startsAt) / b.step))] : 0;
    const dt = this.lastTime === null ? 1 / 60 : Math.max(0, audioTime - this.lastTime);
    this.lastTime = audioTime;
    // Fast opening and slower closing avoid frame-to-frame chatter.
    const tau = target > this.value ? 0.025 : 0.06;
    this.value += (target - this.value) * (1 - Math.exp(-dt / tau));
    if (!b && this.value < 0.001) this.value = 0;
    return this.value;
  }
  clear() { this.blocks = []; this.value = 0; this.lastTime = null; }
}
