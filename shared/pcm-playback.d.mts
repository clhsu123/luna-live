export class PcmPlayback {
  constructor(context: AudioContext, onSpeaking: (speaking: boolean) => void);
  append(encoded: string): void;
  end(): void;
  clear(): void;
}
