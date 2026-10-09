import { chunkForSpeech } from "./speechChunker.ts";

export type SpeakerDeps = {
  synthesize: (text: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  /** Plays a WAV and resolves when it ends. Must resolve promptly once `signal` aborts. */
  play: (audio: ArrayBuffer, signal: AbortSignal) => Promise<void>;
  onSpeaking: (speaking: boolean) => void;
  onError: (message: string) => void;
};

/**
 * Plays a reply chunk by chunk with at most one chunk synthesized ahead. stop() is immediate and
 * irreversible for the reply it interrupts: audio finishing late is dropped, never played.
 */
export class Speaker {
  private generation = 0;
  private controller: AbortController | null = null;

  private readonly deps: SpeakerDeps;

  constructor(deps: SpeakerDeps) {
    this.deps = deps;
  }

  async speak(markdown: string): Promise<void> {
    this.stop();
    const chunks = chunkForSpeech(markdown);
    if (!chunks.length) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const alive = () => generation === this.generation && !controller.signal.aborted;
    this.deps.onSpeaking(true);
    try {
      let next = this.deps.synthesize(chunks[0] ?? "", controller.signal);
      for (let i = 0; i < chunks.length; i++) {
        const audio = await next;
        if (!alive()) return;
        const following = chunks[i + 1];
        if (following !== undefined) {
          next = this.deps.synthesize(following, controller.signal);
          next.catch(() => undefined);
        }
        await this.deps.play(audio, controller.signal);
        if (!alive()) return;
      }
    } catch {
      if (alive()) this.deps.onError("La lecture vocale a échoué. Le texte reste affiché.");
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        this.deps.onSpeaking(false);
      }
    }
  }

  stop(): void {
    const wasSpeaking = this.controller !== null;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (wasSpeaking) this.deps.onSpeaking(false);
  }
}
