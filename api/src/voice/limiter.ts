export class VoiceBusyError extends Error {}

/** Bounded concurrency with a bounded queue; excess work is refused, never buffered. */
export class Limiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly queue: number,
  ) {}

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.queue) throw new VoiceBusyError();
      await new Promise<void>((resolve, reject) => {
        const turn = () => {
          signal?.removeEventListener('abort', cancel);
          resolve();
        };
        const cancel = () => {
          const at = this.waiting.indexOf(turn);
          if (at >= 0) this.waiting.splice(at, 1);
          reject(new Error('Annulé.'));
        };
        this.waiting.push(turn);
        signal?.addEventListener('abort', cancel, { once: true });
      });
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
