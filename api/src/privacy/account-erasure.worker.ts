import { AccountPrivateCacheService } from './account-private-cache.service';
import { Injectable, Logger } from '@nestjs/common';
import { AccountErasureStore } from './account-erasure.store';
import { AccountErasurePurgeService } from './account-erasure-purge.service';
import { ErasureCredentialCipher } from './erasure-credential-cipher';
import { GoogleErasureRevoker } from './google-erasure-revoker';

/** Explicit single-job runner. Scheduling is mounted only with cache invalidation. */
@Injectable()
export class AccountErasureWorker {
  private readonly logger = new Logger(AccountErasureWorker.name);
  private running = false;

  constructor(
    private readonly store: AccountErasureStore,
    private readonly purge: AccountErasurePurgeService,
    private readonly cipher: ErasureCredentialCipher,
    private readonly revoker: GoogleErasureRevoker,
    private readonly privateCache: AccountPrivateCacheService,
  ) {}

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const job = await this.store.claimNext();
      if (!job?.claimToken) return false;
      const claim = job.claimToken;
      const retry = () =>
        this.store.retryLater(
          job.id,
          claim,
          Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)),
        );
      try {
        await this.privateCache.forgetOwner(job.ownerId);
        // Remote availability must never prevent local removal of private data.
        if (!(await this.purge.purge(job.id, claim))) return true;
        const manual =
          job.revocationStatus === 'manual_required' ||
          job.blockerCode === 'GOOGLE_KEY_UNAVAILABLE';
        // claimedUntil is computed by PostgreSQL: avoid trusting the app wall clock.
        const claimedAt = job.claimedUntil!.getTime() - 120000;
        if (claimedAt >= job.receiptExpiresAt.getTime()) {
          await this.store.saveRevocationProgress(
            job.id,
            claim,
            [],
            Boolean(job.encryptedTokens) || manual,
          );
          return true;
        }
        let remaining: string[];
        try {
          remaining = job.encryptedTokens
            ? this.cipher.open(job.id, job.encryptedTokens)
            : [];
        } catch {
          await this.store.saveRevocationProgress(job.id, claim, [], true);
          return true;
        }
        if (!remaining.length) {
          await this.store.saveRevocationProgress(job.id, claim, [], manual);
          return true;
        }
        // At most six five-second remote calls per lease; save every acknowledgement.
        for (
          let attempted = 0;
          remaining.length && attempted < 6;
          attempted++
        ) {
          if (!(await this.revoker.revoke(remaining[0]))) {
            await retry();
            return true;
          }
          remaining = remaining.slice(1);
          if (
            !(await this.store.saveRevocationProgress(
              job.id,
              claim,
              remaining,
              manual,
            ))
          )
            return true;
        }
        if (remaining.length) await retry();
      } catch {
        this.logger.warn(
          'Account erasure attempt could not complete; retry required.',
        );
        await retry();
      }
      return true;
    } finally {
      this.running = false;
    }
  }
}
