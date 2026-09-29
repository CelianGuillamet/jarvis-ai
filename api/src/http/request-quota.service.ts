import { Injectable } from '@nestjs/common';
import { REQUEST_QUOTAS } from './request-limits';

type Window = { used: number; expiresAt: number };

/** Bounded single-process fixed windows. Identity keys never include conversation IDs. */
@Injectable()
export class RequestQuotaService {
  private readonly windows = new Map<string, Window>();
  private nextCleanup = 0;

  consume(key: string, maximum: number, now = Date.now()): number | null {
    if (now >= this.nextCleanup) {
      for (const [entryKey, entry] of this.windows) {
        if (entry.expiresAt <= now) this.windows.delete(entryKey);
      }
      this.nextCleanup = now + REQUEST_QUOTAS.windowMs;
    }
    let window = this.windows.get(key);
    if (!window || window.expiresAt <= now) {
      if (!window && this.windows.size >= REQUEST_QUOTAS.maxEntries) return 60;
      window = { used: 0, expiresAt: now + REQUEST_QUOTAS.windowMs };
      this.windows.set(key, window);
    }
    if (window.used >= maximum)
      return Math.max(1, Math.ceil((window.expiresAt - now) / 1000));
    window.used++;
    return null;
  }
}
