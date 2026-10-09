import { MAX_RECORDING_SECONDS } from "./wav.ts";

export type DictationPhase = "idle" | "requesting" | "listening" | "transcribing";

export type Capture = {
  /** Resolves with the audio recorded so far and releases the microphone. */
  stop(): Promise<{ chunks: Float32Array[]; rate: number }>;
  /** Releases the microphone and discards everything. */
  cancel(): void;
};

export type DictationDeps = {
  capture: () => Promise<Capture>;
  encode: (chunks: Float32Array[], rate: number) => ArrayBuffer;
  transcribe: (audio: ArrayBuffer, signal: AbortSignal) => Promise<string>;
  onPhase: (phase: DictationPhase) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  setTimer?: (work: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
};

export function dictationErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Le micro est refusé. Autorisez-le dans le navigateur, puis réessayez.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Aucun micro n’a été trouvé.";
  if (name === "TimeoutError") return "La transcription a pris trop de temps. Réessayez avec une phrase plus courte.";
  const status = (error as { status?: number } | null)?.status;
  if (status === 409) return "La transcription vocale est désactivée sur ce serveur.";
  if (status === 429) return "Le moteur vocal est occupé. Réessayez dans un instant.";
  if (status === 503) return "Le moteur vocal local est indisponible ou trop lent.";
  if (status === 400) return "Cet enregistrement n’a pas pu être lu. Réessayez.";
  return "La transcription a échoué. Vous pouvez écrire votre message à la place.";
}

/**
 * Explicit push-to-talk. Nothing is captured until start(), nothing is sent anywhere but the local
 * transcription endpoint, and the text only reaches the caller to be edited: it is never submitted.
 */
export class Dictation {
  private phase: DictationPhase = "idle";
  private generation = 0;
  private capture: Capture | null = null;
  private controller: AbortController | null = null;
  private timer: number | null = null;

  private readonly deps: DictationDeps;

  constructor(deps: DictationDeps) {
    this.deps = deps;
  }

  get current(): DictationPhase {
    return this.phase;
  }

  async start(): Promise<void> {
    if (this.phase !== "idle") return;
    const generation = ++this.generation;
    this.set("requesting");
    try {
      const capture = await this.deps.capture();
      if (generation !== this.generation) {
        capture.cancel();
        return;
      }
      this.capture = capture;
      this.set("listening");
      this.timer = (this.deps.setTimer ?? ((work, ms) => window.setTimeout(work, ms)))(
        () => void this.stop(),
        MAX_RECORDING_SECONDS * 1000,
      );
    } catch (error) {
      if (generation !== this.generation) return;
      this.reset();
      this.deps.onError(dictationErrorMessage(error));
    }
  }

  async stop(): Promise<void> {
    if (this.phase !== "listening" || !this.capture) return;
    const generation = this.generation;
    const capture = this.capture;
    this.capture = null;
    this.clearTimer();
    this.set("transcribing");
    this.controller = new AbortController();
    const controller = this.controller;
    try {
      const recorded = await capture.stop();
      if (generation !== this.generation) return;
      const audio = this.deps.encode(recorded.chunks, recorded.rate);
      const text = (await this.deps.transcribe(audio, controller.signal)).trim();
      if (generation !== this.generation) return;
      this.reset();
      if (text) this.deps.onTranscript(text);
      else this.deps.onError("Je n’ai rien entendu. Réessayez en parlant plus près du micro.");
    } catch (error) {
      if (generation !== this.generation) return;
      this.reset();
      this.deps.onError(dictationErrorMessage(error));
    }
  }

  /** Drop everything: used by the user, by account or conversation changes, and on unmount. */
  cancel(): void {
    this.generation++;
    this.capture?.cancel();
    this.capture = null;
    this.controller?.abort();
    this.controller = null;
    this.clearTimer();
    if (this.phase !== "idle") this.set("idle");
  }

  private reset() {
    this.capture = null;
    this.controller = null;
    this.clearTimer();
    this.set("idle");
  }

  private clearTimer() {
    if (this.timer !== null) (this.deps.clearTimer ?? ((id: number) => window.clearTimeout(id)))(this.timer);
    this.timer = null;
  }

  private set(phase: DictationPhase) {
    this.phase = phase;
    this.deps.onPhase(phase);
  }
}
