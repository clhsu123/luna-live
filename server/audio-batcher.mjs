// Preserve PCM byte order while reducing tiny avatar WebSocket frames.
// A short bounded delay keeps the bridge interactive; interrupt discards unsent audio.
export class AudioBatcher {
  constructor(send, { delayMs = 120, maxBytes = 5760, onError = () => {} } = {}) {
    this.send = send; this.delayMs = delayMs; this.maxBytes = maxBytes; this.onError = onError;
    this.parts = []; this.size = 0; this.timer = undefined;
  }
  append(base64) {
    const bytes = Buffer.from(base64, 'base64');
    this.parts.push(bytes); this.size += bytes.length;
    if (this.size >= this.maxBytes) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => { try { this.flush(); } catch { this.onError(); } }, this.delayMs);
  }
  flush() {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.size) return;
    const bytes = Buffer.concat(this.parts); this.parts = []; this.size = 0;
    this.send(bytes.toString('base64'));
  }
  clear() { clearTimeout(this.timer); this.timer = undefined; this.parts = []; this.size = 0; }
}
