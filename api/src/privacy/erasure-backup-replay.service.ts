import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ErasureBackupLedger } from './erasure-backup-ledger';

/** Restore access revocation before listeners open; never guess unresolved provider outcomes. */
@Injectable()
export class ErasureBackupReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ErasureBackupLedger,
  ) {}

  async reconcile(): Promise<void> {
    for await (const record of this.ledger.records()) {
      await this.prisma.$transaction(
        async (tx) => {
          const owners = await tx.$queryRaw<
            Array<{ email: string; disabled: boolean }>
          >`
          SELECT "email", "disabled" FROM "User" WHERE "id" = ${record.ownerId} FOR UPDATE`;
          if (owners.length === 0) return; // No account is recreated by a deletion ledger.
          const owner = owners[0];
          await tx.user.update({
            where: { id: record.ownerId },
            data: { disabled: true },
          });
          await tx.session.deleteMany({ where: { userId: record.ownerId } });
          await tx.googleOAuthState.deleteMany({
            where: { ownerId: record.ownerId },
          });
          await tx.betaInvite.updateMany({
            where: { email: owner.email.trim().toLowerCase() },
            data: { revokedAt: new Date() },
          });
          const existing = await tx.accountErasureJob.findUnique({
            where: { ownerId: record.ownerId },
          });
          if (existing && existing.receiptDigest !== record.receiptDigest)
            throw new Error('Conflicting deletion ledger identity.');
          if (
            existing &&
            owner.disabled &&
            existing.localDeletedAt === null &&
            existing.state === 'queued'
          )
            return;
          // A restored live account requires a fresh purge generation, not a replayed completion.
          const data = {
            id: randomUUID(),
            receiptDigest: record.receiptDigest,
            state: 'queued',
            revocationStatus: 'manual_required',
            encryptedTokens: null,
            requestedAt: new Date(record.requestedAt),
            receiptExpiresAt: new Date(record.receiptExpiresAt),
            retainedUntil: new Date(record.retainedUntil),
            localDeletedAt: null,
            completedAt: null,
            attempts: 0,
            nextAttemptAt: new Date(),
            claimToken: null,
            claimedUntil: null,
            blockerCode: 'BACKUP_REPLAY_REQUIRED',
          };
          await tx.accountErasureJob.upsert({
            where: { ownerId: record.ownerId },
            create: { ...data, ownerId: record.ownerId },
            update: data,
          });
        },
        { timeout: 15000, maxWait: 5000 },
      );
    }
  }
}
