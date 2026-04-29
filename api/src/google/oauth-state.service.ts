import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

type StateRow = { sessionId: string; createdAt: number };

@Injectable()
export class OAuthStateService {
  private readonly store = new Map<string, StateRow>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(private readonly config: ConfigService) {
    const ttlMinutes = Number(this.config.get('OAUTH_STATE_TTL_MINUTES') ?? 10);
    this.ttlMs =
      (Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10) *
      60_000;

    const maxEntries = Number(
      this.config.get('OAUTH_STATE_MAX_ENTRIES') ?? 1_000,
    );
    this.maxEntries =
      Number.isFinite(maxEntries) && maxEntries > 0
        ? Math.floor(maxEntries)
        : 1_000;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, row] of this.store.entries()) {
      if (now - row.createdAt > this.ttlMs) this.store.delete(key);
    }

    if (this.store.size <= this.maxEntries) return;
    const oldest = [...this.store.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    for (let i = 0; i < oldest.length - this.maxEntries; i++) {
      this.store.delete(oldest[i][0]);
    }
  }

  create(sessionId: string) {
    this.cleanup();
    const state = randomUUID();
    this.store.set(state, { sessionId, createdAt: Date.now() });
    return state;
  }

  consume(state: string) {
    this.cleanup();
    const row = this.store.get(state);
    if (!row) return null;
    this.store.delete(state);

    if (Date.now() - row.createdAt > this.ttlMs) return null;
    return row.sessionId;
  }
}
