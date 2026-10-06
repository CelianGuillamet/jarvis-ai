import { Logger } from '@nestjs/common';
import { AccountErasureWorker } from './account-erasure.worker';
import { AccountErasureStore } from './account-erasure.store';
import { AccountErasurePurgeService } from './account-erasure-purge.service';
import { ErasureCredentialCipher } from './erasure-credential-cipher';
import { GoogleErasureRevoker } from './google-erasure-revoker';

function fixture() {
  const job = {
    id: 'job',
    claimToken: 'claim',
    attempts: 1,
    revocationStatus: 'pending',
    blockerCode: null,
    encryptedTokens: 'encrypted',
    claimedUntil: new Date('2026-10-06T10:02:00Z'),
    receiptExpiresAt: new Date('2026-10-13T10:00:00Z'),
  };
  const store = {
    claimNext: jest.fn().mockResolvedValue(job),
    retryLater: jest.fn().mockResolvedValue(true),
    saveRevocationProgress: jest.fn().mockResolvedValue(true),
  };
  const purge = { purge: jest.fn().mockResolvedValue(true) };
  const cipher = {
    open: jest.fn().mockReturnValue(['first-token', 'second-token']),
  };
  const revoker = { revoke: jest.fn().mockResolvedValue(true) };
  const worker = new AccountErasureWorker(
    store as unknown as AccountErasureStore,
    purge as unknown as AccountErasurePurgeService,
    cipher as unknown as ErasureCredentialCipher,
    revoker as unknown as GoogleErasureRevoker,
  );
  return { job, store, purge, cipher, revoker, worker };
}

describe('Durable erasure runner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('purges locally before provider calls and saves each acknowledged credential', async () => {
    const f = fixture();
    expect(await f.worker.runOnce()).toBe(true);
    expect(f.purge.purge.mock.invocationCallOrder[0]).toBeLessThan(
      f.revoker.revoke.mock.invocationCallOrder[0],
    );
    expect(f.store.saveRevocationProgress.mock.calls).toEqual([
      ['job', 'claim', ['second-token'], false],
      ['job', 'claim', [], false],
    ]);
    expect(f.store.retryLater).not.toHaveBeenCalled();
  });

  it('keeps local removal independent of a provider outage and schedules retry', async () => {
    const f = fixture();
    f.revoker.revoke.mockResolvedValue(false);
    await f.worker.runOnce();
    expect(f.purge.purge).toHaveBeenCalledTimes(1);
    expect(f.store.saveRevocationProgress).not.toHaveBeenCalled();
    expect(f.store.retryLater).toHaveBeenCalledWith('job', 'claim', 30);
  });

  it('stops immediately when its progress lease is lost', async () => {
    const f = fixture();
    f.store.saveRevocationProgress.mockResolvedValue(false);
    await f.worker.runOnce();
    expect(f.revoker.revoke).toHaveBeenCalledTimes(1);
    expect(f.store.retryLater).not.toHaveBeenCalled();
  });

  it('bounds provider calls per lease and retains the remaining encrypted work', async () => {
    const f = fixture();
    f.cipher.open.mockReturnValue(
      Array.from({ length: 8 }, (_, n) => `token-${n}`),
    );
    await f.worker.runOnce();
    expect(f.revoker.revoke).toHaveBeenCalledTimes(6);
    expect(f.store.saveRevocationProgress).toHaveBeenLastCalledWith(
      'job',
      'claim',
      ['token-6', 'token-7'],
      false,
    );
    expect(f.store.retryLater).toHaveBeenCalledWith('job', 'claim', 30);
  });

  it('discards expired credentials and reports manual revocation without provider calls', async () => {
    const f = fixture();
    f.job.receiptExpiresAt = new Date('2026-10-06T09:00:00Z');
    await f.worker.runOnce();
    expect(f.revoker.revoke).not.toHaveBeenCalled();
    expect(f.cipher.open).not.toHaveBeenCalled();
    expect(f.store.saveRevocationProgress).toHaveBeenCalledWith(
      'job',
      'claim',
      [],
      true,
    );
  });

  it('reports unreadable credentials as manual without exposing errors', async () => {
    const f = fixture();
    f.cipher.open.mockImplementation(() => {
      throw new Error('sensitive credential');
    });
    await f.worker.runOnce();
    expect(f.revoker.revoke).not.toHaveBeenCalled();
    expect(f.store.saveRevocationProgress).toHaveBeenCalledWith(
      'job',
      'claim',
      [],
      true,
    );
  });

  it('sanitizes purge failures and never revokes after a failed local purge', async () => {
    const f = fixture();
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    f.purge.purge.mockRejectedValue(new Error('private owner data'));
    await f.worker.runOnce();
    expect(f.revoker.revoke).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      'private owner data',
    );
    expect(f.store.retryLater).toHaveBeenCalledTimes(1);
  });

  it('coalesces overlapping ticks and permits the next tick after completion', async () => {
    const f = fixture();
    let release!: () => void;
    f.purge.purge.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    const first = f.worker.runOnce();
    await Promise.resolve();
    expect(await f.worker.runOnce()).toBe(false);
    release();
    await first;
    await f.worker.runOnce();
    expect(f.store.claimNext).toHaveBeenCalledTimes(2);
  });
});
