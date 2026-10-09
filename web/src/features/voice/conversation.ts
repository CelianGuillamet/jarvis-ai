import { UtteranceDetector } from "./utteranceDetector.ts";
import { isNoiseTranscript } from "./transcriptFilter.ts";

export type ConversationState =
  | "off"
  | "starting"
  | "listening"
  | "hearing"
  | "transcribing"
  | "thinking"
  | "speaking";

export type Microphone = {
  rate: number;
  /** Subscribes to mono Float32 frames. */
  onFrame(callback: (samples: Float32Array) => void): void;
  close(): void;
};

export type ConversationDeps = {
  openMicrophone: () => Promise<Microphone>;
  encode: (chunks: Float32Array[], rate: number) => ArrayBuffer;
  transcribe: (audio: ArrayBuffer, signal: AbortSignal) => Promise<string>;
  /** Submits the text to the assistant and resolves with the reply to read aloud (or null). */
  submit: (text: string) => Promise<string | null>;
  speak: (reply: string) => Promise<void>;
  stopSpeaking: () => void;
  onState: (state: ConversationState) => void;
  onHeard: (text: string) => void;
  onError: (message: string) => void;
  bargeIn?: () => boolean;
};

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Hands-free dialogue: listen, detect the end of the sentence by itself, transcribe locally, send, read the
 * answer, listen again. The microphone is only open between start() and stop(), and every await is
 * guarded by a generation number so an account change or stop() drops late results.
 */
export class Conversation {
  private readonly deps: ConversationDeps;
  private state: ConversationState = "off";
  private generation = 0;
  private mic: Microphone | null = null;
  private detector: UtteranceDetector | null = null;
  private busy = false;
  private failures = 0;
  private controller: AbortController | null = null;

  constructor(deps: ConversationDeps) {
    this.deps = deps;
  }

  get current(): ConversationState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state !== "off") return;
    const generation = ++this.generation;
    this.failures = 0;
    this.set("starting");
    try {
      const mic = await this.deps.openMicrophone();
      if (generation !== this.generation) {
        mic.close();
        return;
      }
      this.mic = mic;
      this.detector = new UtteranceDetector(mic.rate);
      mic.onFrame(samples => this.onFrame(generation, samples));
      this.set("listening");
    } catch (error) {
      if (generation !== this.generation) return;
      this.teardown();
      this.deps.onError(microphoneMessage(error));
    }
  }

  stop(): void {
    this.generation++;
    this.deps.stopSpeaking();
    this.teardown();
  }

  private teardown() {
    this.controller?.abort();
    this.controller = null;
    this.mic?.close();
    this.mic = null;
    this.detector = null;
    this.busy = false;
    if (this.state !== "off") this.set("off");
  }

  private onFrame(generation: number, samples: Float32Array) {
    const detector = this.detector;
    if (generation !== this.generation || !detector) return;
    const speaking = this.state === "speaking";
    if (this.busy && !(speaking && this.deps.bargeIn?.())) return;
    detector.sensitivity = speaking ? 2.5 : 1;
    for (const event of detector.push(samples)) {
      if (event.type === "start") {
        if (speaking) {
          this.deps.stopSpeaking();
          this.busy = false;
        }
        this.set("hearing");
      } else if (event.type === "misfire") {
        if (this.state === "hearing") this.set("listening");
      } else if (event.type === "end") {
        void this.handle(generation, event.chunks);
        return;
      }
    }
  }

  private async handle(generation: number, chunks: Float32Array[]) {
    const mic = this.mic;
    if (!mic) return;
    this.busy = true;
    this.set("transcribing");
    const controller = new AbortController();
    this.controller = controller;
    try {
      const text = (await this.deps.transcribe(this.deps.encode(chunks, mic.rate), controller.signal)).trim();
      if (generation !== this.generation) return;
      this.failures = 0;
      if (isNoiseTranscript(text)) return this.resume(generation);
      this.deps.onHeard(text);
      this.set("thinking");
      const reply = await this.deps.submit(text);
      if (generation !== this.generation) return;
      if (reply) {
        this.set("speaking");
        await this.deps.speak(reply);
        if (generation !== this.generation) return;
      }
      this.resume(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.failures++;
      this.deps.onError(failureMessage(error));
      if (this.failures >= MAX_CONSECUTIVE_FAILURES) {
        this.deps.onError("Trop d’échecs de suite : le mode conversation est arrêté.");
        this.stop();
      } else this.resume(generation);
    }
  }

  private resume(generation: number) {
    if (generation !== this.generation) return;
    this.busy = false;
    this.detector?.reset();
    this.controller = null;
    this.set("listening");
  }

  private set(state: ConversationState) {
    this.state = state;
    this.deps.onState(state);
  }
}

function microphoneMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Le micro est refusé. Autorisez-le dans le navigateur, puis réessayez.";
  if (name === "NotFoundError") return "Aucun micro n’a été trouvé.";
  return "Le micro n’a pas pu être ouvert.";
}

function failureMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 503) return "Le moteur vocal local est indisponible ou trop lent.";
  if (status === 429) return "Le moteur vocal est occupé.";
  return "Je n’ai pas pu traiter cette phrase. Je continue à écouter.";
}
