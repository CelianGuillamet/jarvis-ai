import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AccountErasureJob } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../google/token-encryption.service';
import { ErasureCredentialCipher } from './erasure-credential-cipher';
import {
  AccountErasureReceiptSchema,
  AccountErasureStatusSchema,
} from '../contracts/v1';
import type {
  AccountErasureRequest,
  AccountErasureStatus,
} from '../contracts/v1';

const DAY_MS = 86400000;
type StatusSource = Pick<
  AccountErasureJob,
  | 'id'
  | 'state'
  | 'revocationStatus'
  | 'requestedAt'
  | 'localDeletedAt'
  | 'completedAt'
  | 'receiptExpiresAt'
>;
const statusFields = {
  id: true,
  state: true,
  revocationStatus: true,
  requestedAt: true,
  localDeletedAt: true,
  completedAt: true,
  receiptExpiresAt: true,
} as const;
export function erasureReceiptDigest(receipt: string) {
  AccountErasureReceiptSchema.parse(receipt);
  return createHash('sha256')
    .update(`jarvis-erasure-receipt-v1:${receipt}`)
    .digest('hex');
}
export function erasureStatus(job: StatusSource): AccountErasureStatus {
  return AccountErasureStatusSchema.parse({
    id: job.id,
    state: job.state,
    revocationStatus: job.revocationStatus,
    requestedAt: job.requestedAt.toISOString(),
    localDeletedAt: job.localDeletedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    receiptExpiresAt: job.receiptExpiresAt.toISOString(),
  });
}

@Injectable()
export class AccountErasureStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ErasureCredentialCipher,
    private readonly googleCipher: TokenEncryptionService,
  ) {}

  async request(
    ownerId: string,
    input: AccountErasureRequest,
  ): Promise<AccountErasureStatus> {
    const receiptDigest = erasureReceiptDigest(input.receipt);
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize identity confirmation, duplicate requests and execution starts.
        const owners = await tx.$queryRaw<
          Array<{ email: string }>
        >`SELECT "email" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
        if (owners.length !== 1)
          throw new NotFoundException('Compte indisponible.');
        const ownerEmail = owners[0].email.trim().toLowerCase();
        if (ownerEmail !== input.confirmEmail.trim().toLowerCase()) {
          throw new BadRequestException('Confirme l’adresse de ton compte.');
        }
        const existing = await tx.accountErasureJob.findUnique({
          where: { ownerId },
          select: { ...statusFields, receiptDigest: true },
        });
        if (existing) {
          if (existing.receiptDigest !== receiptDigest)
            throw new ConflictException(
              'Une demande de suppression existe déjà.',
            );
          return erasureStatus(existing);
        }
        try {
          await tx.$executeRaw`SELECT prepare_account_erasure(${ownerId})`;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2010' &&
            error.meta?.code === '23514'
          ) {
            throw new ConflictException(
              'Une opération doit être réconciliée avant la suppression.',
            );
          }
          throw new ServiceUnavailableException(
            'La suppression est temporairement indisponible.',
          );
        }
        const id = randomUUID();
        const tokens: string[] = [];
        let manualRevocation = false;
        const google = await tx.googleOAuthToken.findMany({
          where: { integrationAccount: { ownerId } },
          select: { id: true, refreshToken: true },
        });
        for (const row of google) {
          try {
            tokens.push(
              this.googleCipher.decrypt(
                row.refreshToken,
                `google:${row.id}:refresh`,
              ),
            );
          } catch {
            manualRevocation = true;
          }
        }
        const accounts = await tx.account.findMany({
          where: { userId: ownerId, providerId: 'google' },
          select: { refreshToken: true, accessToken: true },
        });
        for (const row of accounts) {
          const token = row.refreshToken ?? row.accessToken;
          if (token) tokens.push(token);
        }
        const uniqueTokens = [...new Set(tokens)];
        const now = new Date();
        const job = await tx.accountErasureJob.create({
          data: {
            id,
            ownerId,
            receiptDigest,
            revocationStatus: uniqueTokens.length
              ? 'pending'
              : manualRevocation
                ? 'manual_required'
                : 'complete',
            encryptedTokens: uniqueTokens.length
              ? this.cipher.seal(id, uniqueTokens)
              : null,
            requestedAt: now,
            receiptExpiresAt: new Date(now.getTime() + 7 * DAY_MS),
            retainedUntil: new Date(now.getTime() + 30 * DAY_MS),
            blockerCode: manualRevocation ? 'GOOGLE_KEY_UNAVAILABLE' : null,
          },
          select: statusFields,
        });
        await tx.session.deleteMany({ where: { userId: ownerId } });
        await tx.googleOAuthState.deleteMany({ where: { ownerId } });
        // Admission is revoked too; restoring a backup must not silently re-admit.
        await tx.betaInvite.updateMany({
          where: { email: ownerEmail },
          data: { revokedAt: now },
        });
        return erasureStatus(job);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    );
  }

  async status(receipt: string): Promise<AccountErasureStatus> {
    const digest = erasureReceiptDigest(receipt);
    const jobs = await this.prisma.$queryRaw<
      StatusSource[]
    >`SELECT "id", "state", "revocationStatus", "requestedAt", "localDeletedAt", "completedAt", "receiptExpiresAt" FROM "AccountErasureJob"
      WHERE "receiptDigest" = ${digest} AND "receiptExpiresAt" > clock_timestamp()`;
    if (jobs.length !== 1) throw new NotFoundException('Demande indisponible.');
    return erasureStatus(jobs[0]);
  }

  async claimNext(): Promise<AccountErasureJob | null> {
    const token = randomUUID();
    const jobs = await this.prisma.$queryRaw<
      AccountErasureJob[]
    >`WITH candidate AS (
      SELECT "id" FROM "AccountErasureJob" WHERE "state" IN ('queued', 'local_deleted')
        AND "nextAttemptAt" <= clock_timestamp() AND ("claimedUntil" IS NULL OR "claimedUntil" <= clock_timestamp())
      ORDER BY "requestedAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "AccountErasureJob" j SET "claimToken" = ${token},
      "claimedUntil" = clock_timestamp() + interval '2 minutes', "attempts" = j."attempts" + 1
      FROM candidate c WHERE j."id" = c."id" RETURNING j.*`;
    return jobs[0] ?? null;
  }
  /** A stale worker cannot reschedule a job claimed by its successor. */
  async retryLater(
    jobId: string,
    claimToken: string,
    delaySeconds: number,
  ): Promise<boolean> {
    if (
      !Number.isInteger(delaySeconds) ||
      delaySeconds < 1 ||
      delaySeconds > 3600
    ) {
      throw new RangeError('Invalid erasure retry delay.');
    }
    const changed = await this.prisma.$executeRaw`
      UPDATE "AccountErasureJob" SET "claimToken" = NULL, "claimedUntil" = NULL,
        "nextAttemptAt" = clock_timestamp() + ${delaySeconds} * interval '1 second'
      WHERE "id" = ${jobId} AND "claimToken" = ${claimToken}
        AND "claimedUntil" > clock_timestamp() AND "state" IN ('queued', 'local_deleted')`;
    return changed === 1;
  }
  /** Persist every acknowledged token so retries never re-revoke a completed token. */
  async saveRevocationProgress(
    jobId: string,
    claimToken: string,
    remainingTokens: string[],
    manualRequired = false,
  ): Promise<boolean> {
    if (remainingTokens.some((token) => !token))
      throw new Error('Invalid revocation credential');
    const remaining = [...new Set(remainingTokens)];
    const encrypted = remaining.length
      ? this.cipher.seal(jobId, remaining)
      : null;
    const status = remaining.length
      ? 'pending'
      : manualRequired
        ? 'manual_required'
        : 'complete';
    const changed = await this.prisma.$executeRaw`
      UPDATE "AccountErasureJob" SET "encryptedTokens" = ${encrypted}, "revocationStatus" = CASE WHEN ${remaining.length} = 0 AND "blockerCode" = 'GOOGLE_KEY_UNAVAILABLE'
          THEN 'manual_required' ELSE ${status} END,
        "state" = CASE WHEN ${remaining.length} = 0 THEN 'completed' ELSE 'local_deleted' END,
        "completedAt" = CASE WHEN ${remaining.length} = 0 THEN clock_timestamp() ELSE NULL END,
        "claimToken" = CASE WHEN ${remaining.length} = 0 THEN NULL ELSE "claimToken" END,
        "claimedUntil" = CASE WHEN ${remaining.length} = 0 THEN NULL ELSE "claimedUntil" END
      WHERE "id" = ${jobId} AND "claimToken" = ${claimToken}
        AND "claimedUntil" > clock_timestamp() AND "state" = 'local_deleted'
        AND "localDeletedAt" IS NOT NULL`;
    return changed === 1;
  }
}
