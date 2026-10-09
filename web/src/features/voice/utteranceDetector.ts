export type DetectorEvent =
  | { type: "start" }
  | { type: "end"; chunks: Float32Array[]; speechMs: number }
  | { type: "misfire" };

export type DetectorOptions = {
  /** Silence that closes an utterance. Shorter feels snappier but cuts people mid-thought. */
  endSilenceMs?: number;
  minSpeechMs?: number;
  maxUtteranceMs?: number;
  prerollMs?: number;
  /** Multiplies the speech threshold, e.g. 2.5 while the assistant is talking to avoid echo. */
  sensitivity?: number;
};

const FRAME_MS = 20;
const START_FRAMES = 5;
const ABSOLUTE_MIN_RMS = 0.012;

/**
 * Adaptive energy-based speech detector with a pre-roll buffer. It adapts to the room's noise floor,
 * needs sustained energy to start, and closes only after a stretch of silence, so a short pause or a
 * keyboard click does not trigger anything.
 */
export class UtteranceDetector {
  private readonly frameSize: number;
  private readonly options: Required<DetectorOptions>;
  private floor = 0;
  private floorFrames = 0;
  private speaking = false;
  private loud = 0;
  private quietMs = 0;
  private speechMs = 0;
  private totalMs = 0;
  private pending: number[] = [];
  private preroll: Float32Array[] = [];
  private segment: Float32Array[] = [];

  constructor(rate: number, options: DetectorOptions = {}) {
    this.frameSize = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
    this.options = {
      endSilenceMs: options.endSilenceMs ?? 900,
      minSpeechMs: options.minSpeechMs ?? 350,
      maxUtteranceMs: options.maxUtteranceMs ?? 28_000,
      prerollMs: options.prerollMs ?? 400,
      sensitivity: options.sensitivity ?? 1,
    };
  }

  set sensitivity(value: number) {
    this.options.sensitivity = value;
  }

  get active(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.loud = 0;
    this.quietMs = 0;
    this.speechMs = 0;
    this.totalMs = 0;
    this.pending = [];
    this.segment = [];
    this.preroll = [];
  }

  /** Feed any number of samples; returns the events they produced, in order. */
  push(samples: Float32Array): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    for (const value of samples) {
      this.pending.push(value);
      if (this.pending.length < this.frameSize) continue;
      const frame = Float32Array.from(this.pending);
      this.pending = [];
      this.frame(frame, events);
    }
    return events;
  }

  private frame(frame: Float32Array, events: DetectorEvent[]): void {
    let sum = 0;
    for (const sample of frame) sum += sample * sample;
    const rms = Math.sqrt(sum / frame.length);
    if (this.floorFrames < 15) {
      this.floor = (this.floor * this.floorFrames + rms) / (this.floorFrames + 1);
      this.floorFrames++;
    }
    const start = Math.max(this.floor * 3.5, ABSOLUTE_MIN_RMS) * this.options.sensitivity;
    const stay = Math.max(this.floor * 2, ABSOLUTE_MIN_RMS * 0.7) * this.options.sensitivity;

    if (!this.speaking) {
      this.preroll.push(frame);
      const keep = Math.ceil(this.options.prerollMs / FRAME_MS) + START_FRAMES;
      if (this.preroll.length > keep) this.preroll.shift();
      if (rms < start) {
        this.loud = 0;
        if (rms < this.floor * 2) this.floor = this.floor * 0.97 + rms * 0.03;
        return;
      }
      this.loud++;
      if (this.loud < START_FRAMES) return;
      this.speaking = true;
      this.quietMs = 0;
      this.speechMs = this.loud * FRAME_MS;
      this.totalMs = this.preroll.length * FRAME_MS;
      this.segment = [...this.preroll];
      this.preroll = [];
      events.push({ type: "start" });
      return;
    }

    this.segment.push(frame);
    this.totalMs += FRAME_MS;
    if (rms >= stay) {
      this.quietMs = 0;
      this.speechMs += FRAME_MS;
    } else this.quietMs += FRAME_MS;

    if (this.quietMs >= this.options.endSilenceMs || this.totalMs >= this.options.maxUtteranceMs) {
      const chunks = this.segment;
      const speechMs = this.speechMs;
      this.speaking = false;
      this.loud = 0;
      this.segment = [];
      this.speechMs = 0;
      this.quietMs = 0;
      this.totalMs = 0;
      events.push(speechMs >= this.options.minSpeechMs ? { type: "end", chunks, speechMs } : { type: "misfire" });
    }
  }
}
