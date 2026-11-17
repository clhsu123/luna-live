export class PcmPlayback {
  constructor(context: AudioContext, onSpeaking: (speaking: boolean) => void);
  append(encoded: string): void;
  mouthLevel(): number;
  end(): void;
  clear(): void;
}
