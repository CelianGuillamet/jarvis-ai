import { AsyncLocalStorage } from 'node:async_hooks';

/** Bounded generation identities: invalidated asynchronous work cannot publish data. */
export class PrivateCacheFence {
  private readonly generations = new Map<string, object>();
  private readonly context = new AsyncLocalStorage<{
    sessionId: string;
    token: object;
  }>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid cache fence capacity');
  }

  forget(sessionId: string): void {
    this.generations.delete(sessionId);
  }

  canPublish(sessionId: string): boolean {
    const current = this.context.getStore();
    return Boolean(
      current &&
      current.sessionId === sessionId &&
      this.generations.get(sessionId) === current.token,
    );
  }

  async run<T>(
    sessionId: string,
    operation: () => Promise<T>,
    clearInvalidated: () => void,
  ): Promise<T> {
    if (this.context.getStore()?.sessionId === sessionId) return operation();
    let token = this.generations.get(sessionId);
    if (!token) {
      if (this.generations.size >= this.capacity) {
        const oldest = this.generations.keys().next().value as string;
        this.generations.delete(oldest);
      }
      token = {};
      this.generations.set(sessionId, token);
    }
    const generation = token;
    return this.context.run({ sessionId, token: generation }, async () => {
      try {
        return await operation();
      } finally {
        if (this.generations.get(sessionId) !== generation) clearInvalidated();
      }
    });
  }
}
