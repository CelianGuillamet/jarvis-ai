import { PrivateCacheFence } from './private-cache-fence';

describe('Private asynchronous cache fence', () => {
  it('prevents an in-flight operation and its nested calls from publishing after erasure', async () => {
    const fence = new PrivateCacheFence(2);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clear = jest.fn();
    const operation = fence.run(
      'erased',
      async () => {
        expect(fence.canPublish('erased')).toBe(true);
        expect(fence.canPublish('another')).toBe(false);
        await wait;
        expect(fence.canPublish('erased')).toBe(false);
        await fence.run(
          'erased',
          async () => {
            await Promise.resolve();
            expect(fence.canPublish('erased')).toBe(false);
          },
          clear,
        );
      },
      clear,
    );
    fence.forget('erased');
    release();
    await operation;
    expect(clear).toHaveBeenCalledTimes(1);
    expect(fence.canPublish('erased')).toBe(false);
  });

  it('keeps another conversation valid and bounds retained generations', async () => {
    const fence = new PrivateCacheFence(1);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clear = jest.fn();
    const old = fence.run(
      'first',
      async () => {
        await wait;
        expect(fence.canPublish('first')).toBe(false);
      },
      clear,
    );
    await fence.run(
      'second',
      async () => {
        await Promise.resolve();
        fence.forget('first');
        expect(fence.canPublish('second')).toBe(true);
      },
      clear,
    );
    release();
    await old;
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('cleans invalidated work on failure and permits a new valid generation', async () => {
    const fence = new PrivateCacheFence(2);
    const clear = jest.fn();
    await expect(
      fence.run(
        'session',
        async () => {
          await Promise.resolve();
          fence.forget('session');
          throw new Error('failure');
        },
        clear,
      ),
    ).rejects.toThrow('failure');
    expect(clear).toHaveBeenCalledTimes(1);
    await fence.run(
      'session',
      async () => {
        await Promise.resolve();
        expect(fence.canPublish('session')).toBe(true);
      },
      clear,
    );
  });
});
