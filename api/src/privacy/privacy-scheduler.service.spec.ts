import { ConfigService } from '@nestjs/config';
import { PrivacySchedulerService } from './privacy-scheduler.service';
import { AccountErasureWorker } from './account-erasure.worker';
import { PrivacyRetentionService } from './privacy-retention.service';
import { Logger } from '@nestjs/common';

function fixture(env: Record<string, string | undefined> = {}) {
  const worker = { runOnce: jest.fn().mockResolvedValue(false) };
  const retention = { runBatch: jest.fn().mockResolvedValue(undefined) };
  const scheduler = new PrivacySchedulerService(
    new ConfigService({ NODE_ENV: 'development', ...env }),
    worker as unknown as AccountErasureWorker,
    retention as unknown as PrivacyRetentionService,
  );
  return { scheduler, worker, retention };
}

describe('Privacy scheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([{ NODE_ENV: 'test' }, { PRIVACY_WORKER_ENABLED: 'false' }])(
    'does not initiate work when disabled: %o',
    async (env) => {
      const f = fixture(env);
      f.scheduler.onModuleInit();
      await jest.advanceTimersByTimeAsync(60000);
      expect(f.retention.runBatch).not.toHaveBeenCalled();
      expect(f.worker.runOnce).not.toHaveBeenCalled();
      await f.scheduler.onModuleDestroy();
    },
  );

  it('coalesces overlapping ticks and waits for in-flight work during shutdown', async () => {
    const f = fixture();
    let finish!: () => void;
    f.retention.runBatch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    f.scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(45000);
    expect(f.retention.runBatch).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = f.scheduler.onModuleDestroy().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await shutdown;
    expect(f.worker.runOnce).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(45000);
    expect(f.retention.runBatch).toHaveBeenCalledTimes(1);
  });

  it('continues erasure after a retention failure and sanitizes both failures', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const f = fixture();
    f.retention.runBatch.mockRejectedValue(new Error('private SQL'));
    f.worker.runOnce.mockRejectedValue(new Error('private owner'));
    f.scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(1);
    await f.scheduler.onModuleDestroy();
    expect(f.worker.runOnce).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private');
  });
});
