import { readStatusResource } from './status-resource';

type Resource<T> = Awaited<ReturnType<typeof readStatusResource<T>>>;
export type CachedStatusResource<T> = Resource<T> & {
  fetchedAt: string | null;
  expiresAt: string | null;
};
type Entry<T> = {
  revision: string;
  result?: CachedStatusResource<T>;
  expiresAt: number;
  pending?: Promise<CachedStatusResource<T>>;
};

/** A passive read never initiates transport. Refresh work and retained data are bounded. */
export class StatusResourceCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private inFlight = 0;

  constructor(
    private readonly maxEntries = 100,
    private readonly ttlMs = 60000,
    private readonly maxInFlight = 20,
    private readonly now = () => Date.now(),
  ) {}

  private empty(): CachedStatusResource<T> {
    return {
      data: null,
      availability: 'not_refreshed',
      fetchedAt: null,
      expiresAt: null,
    };
  }

  async read(
    key: string,
    revision: string,
    refresh: boolean,
    load: () => Promise<T>,
  ): Promise<CachedStatusResource<T>> {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (!entry.pending && entry.expiresAt <= now) this.entries.delete(id);
    }
    let entry = this.entries.get(key);
    if (entry && entry.revision !== revision) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!refresh)
      return entry && entry.expiresAt > now
        ? (entry.result ?? this.empty())
        : this.empty();
    if (entry?.pending) return entry.pending;
    if (this.inFlight >= this.maxInFlight) {
      return { ...this.empty(), availability: 'unavailable' };
    }
    if (!entry) {
      entry = { revision, expiresAt: now + this.ttlMs };
      this.entries.set(key, entry);
    } else {
      // Move a refreshed entry to the newest position for bounded eviction.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    const current = entry;
    this.inFlight += 1;
    current.pending = (async () => {
      try {
        const resource = await readStatusResource(load);
        if (this.entries.get(key) !== current) return this.empty();
        const fetchedAt = this.now();
        current.expiresAt = fetchedAt + this.ttlMs;
        current.result = {
          ...resource,
          fetchedAt: new Date(fetchedAt).toISOString(),
          expiresAt: new Date(current.expiresAt).toISOString(),
        };
        return current.result;
      } finally {
        current.pending = undefined;
        this.inFlight -= 1;
      }
    })();
    return current.pending;
  }
}
