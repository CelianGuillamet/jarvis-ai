import { StatusResourceCache } from './status-resource-cache';

describe('Bounded passive status cache', () => {
  let now = 1000;
  beforeEach(() => {
    now = 1000;
  });

  it('never starts transport for passive reads, including expired entries', async () => {
    const cache = new StatusResourceCache<string[]>(2, 100, 2, () => now);
    const load = jest.fn().mockResolvedValue(['private']);
    expect((await cache.read('a', 'v1', false, load)).availability).toBe(
      'not_refreshed',
    );
    expect(load).not.toHaveBeenCalled();
    const refreshed = await cache.read('a', 'v1', true, load);
    expect(refreshed.fetchedAt).toBe(new Date(1000).toISOString());
    expect((await cache.read('a', 'v1', false, load)).data).toEqual([
      'private',
    ]);
    now = 1100;
    expect((await cache.read('a', 'v1', false, load)).data).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('isolates keys, invalidates revisions and evicts retained data at capacity', async () => {
    const cache = new StatusResourceCache<string[]>(2, 100, 2, () => now);
    const load = () => Promise.resolve(['A']);
    await cache.read('a', 'v1', true, load);
    expect((await cache.read('b', 'v1', false, load)).data).toBeNull();
    expect((await cache.read('a', 'v2', false, load)).data).toBeNull();
    await cache.read('a', 'v2', true, load);
    await cache.read('b', 'v1', true, load);
    await cache.read('c', 'v1', true, load);
    expect((await cache.read('a', 'v2', false, load)).data).toBeNull();
    expect((await cache.read('c', 'v1', false, load)).data).toEqual(['A']);
  });

  it('deduplicates refreshes and bounds concurrent work', async () => {
    const cache = new StatusResourceCache<string[]>(2, 100, 1, () => now);
    let finish!: (data: string[]) => void;
    const load = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    );
    const first = cache.read('a', 'v1', true, load);
    const duplicate = cache.read('a', 'v1', true, load);
    expect((await cache.read('b', 'v1', true, load)).availability).toBe(
      'unavailable',
    );
    finish(['A']);
    expect((await first).data).toEqual(['A']);
    expect(await duplicate).toEqual(await first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not republish a refresh invalidated while transport was running', async () => {
    const cache = new StatusResourceCache<string[]>(2, 100, 2, () => now);
    let finish!: (data: string[]) => void;
    const old = cache.read(
      'a',
      'old-account',
      true,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await cache.read('a', 'new-account', false, () => Promise.resolve([]));
    finish(['old private data']);
    expect((await old).data).toBeNull();
    expect(
      (await cache.read('a', 'new-account', false, () => Promise.resolve([])))
        .data,
    ).toBeNull();
  });

  it('purges one account key and discards its pending refresh without affecting another', async () => {
    const cache = new StatusResourceCache<string[]>(4, 100, 2, () => now);
    await cache.read('other-owner', 'v1', true, () =>
      Promise.resolve(['Other data']),
    );
    let finish!: (data: string[]) => void;
    const pending = cache.read(
      'deleted-owner',
      'v1',
      true,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cache.invalidate('deleted-owner');
    finish(['Deleted private data']);
    expect((await pending).data).toBeNull();
    expect(
      (
        await cache.read('deleted-owner', 'v1', false, () =>
          Promise.resolve([]),
        )
      ).data,
    ).toBeNull();
    expect(
      (await cache.read('other-owner', 'v1', false, () => Promise.resolve([])))
        .data,
    ).toEqual(['Other data']);
    // The old pending refresh releases its capacity when it settles.
    expect(
      (
        await cache.read('new-owner', 'v1', true, () =>
          Promise.resolve(['New data']),
        )
      ).data,
    ).toEqual(['New data']);
  });

  it('preserves provider failures as unavailable rather than a valid empty collection', async () => {
    const cache = new StatusResourceCache<string[]>(2, 100, 2, () => now);
    const result = await cache.read('a', 'v1', true, () =>
      Promise.reject(new Error('offline')),
    );
    expect(result).toMatchObject({ data: null, availability: 'unavailable' });
    expect(result.fetchedAt).not.toBeNull();
  });
  it('refuses late publication after a conversation generation expires', async () => {
    const cache = new StatusResourceCache<string[]>();
    let valid = true;
    let finish!: (value: string[]) => void;
    const result = cache.read(
      'owner',
      'revision',
      true,
      () =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
      () => valid,
    );
    valid = false;
    finish(['Private late response']);
    expect((await result).data).toBeNull();
    expect(
      (await cache.read('owner', 'revision', false, () => Promise.resolve([])))
        .data,
    ).toBeNull();
  });
});
