class PCM24Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = []; this.position = 0; this.last = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0]; if (!channel) return true;
    // Fractional linear resampling into the provider's 24kHz mono PCM16 format.
    const step = sampleRate / 24000;
    while (this.position < channel.length) {
      const i = Math.floor(this.position), frac = this.position - i;
      const left = i === 0 ? this.last : channel[i - 1];
      const value = left + (channel[i] - left) * frac;
      this.buffer.push(Math.round(Math.max(-1, Math.min(1, value)) * 32767));
      this.position += step;
      if (this.buffer.length === 2400) {
        const data = new ArrayBuffer(4800); const view = new DataView(data);
        this.buffer.forEach((sample, index) => view.setInt16(index * 2, sample, true));
        this.port.postMessage(data, [data]); this.buffer = [];
      }
    }
    this.position -= channel.length; this.last = channel[channel.length - 1];
    return true;
  }
}
registerProcessor('pcm24-capture', PCM24Capture);
