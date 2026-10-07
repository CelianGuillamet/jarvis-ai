import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLEANUP = [
  {
    table: 'JarvisLog',
    key: 'id',
    order: 'createdAt',
    condition: Prisma.sql`"createdAt" < CURRENT_TIMESTAMP - interval '14 days' OR "userText" <> '' OR "modelRaw" <> '' OR "toolArgs" IS NOT NULL OR "result" IS NOT NULL`,
  },
  {
    table: 'ConversationTurn',
    key: 'id',
    order: 'updatedAt',
    condition: Prisma.sql`"state" IN ('completed', 'failed') AND "updatedAt" < CURRENT_TIMESTAMP - interval '90 days'`,
  },
  ...['Session', 'Verification', 'PendingAction'].map((table) => ({
    table,
    key: 'id',
    order: 'expiresAt',
    condition: Prisma.sql`"expiresAt" < CURRENT_TIMESTAMP`,
  })),
  {
    table: 'GoogleOAuthState',
    key: 'digest',
    order: 'expiresAt',
    condition: Prisma.sql`"expiresAt" < CURRENT_TIMESTAMP`,
  },
] as const;

@Injectable()
export class PrivacyRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async runBatch(): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        // A turn abandoned by a crash, an abort or a rejected update never reaches
        // 'completed'/'failed' on its own and would otherwise keep raw input forever.
        // Redact it once it is clearly no longer in flight, then let the ordinary
        // completed/failed expiry remove the row after its own retention window.
        // Rows owned by a disabled account are excluded: guard_active_owner_write
        // rejects any INSERT/UPDATE on ConversationTurn for a disabled owner, and
        // such accounts are already queued for full erasure, which removes the row.
        await tx.$executeRaw`WITH stale AS (
          SELECT t."id" FROM "ConversationTurn" t
            JOIN "User" u ON u."id" = t."ownerId"
          WHERE t."state" = 'started' AND NOT u."disabled"
            AND t."updatedAt" < CURRENT_TIMESTAMP - interval '1 day'
          ORDER BY t."updatedAt", t."id" FOR UPDATE OF t SKIP LOCKED LIMIT 500
        ) UPDATE "ConversationTurn" t SET "state" = 'failed', "inputText" = '',
          "updatedAt" = CURRENT_TIMESTAMP
          FROM stale s WHERE t."id" = s."id"`;
        for (const rule of CLEANUP) {
          const table = Prisma.raw(`"${rule.table}"`);
          const key = Prisma.raw(`"${rule.key}"`);
          const order = Prisma.raw(`"${rule.order}"`);
          await tx.$executeRaw(Prisma.sql`WITH expired AS (
          SELECT ${key} FROM ${table} WHERE ${rule.condition}
          ORDER BY ${order}, ${key} FOR UPDATE SKIP LOCKED LIMIT 500
        ) DELETE FROM ${table} target USING expired WHERE target.${key} = expired.${key}`);
        }
        // Never race a live revocation lease or retain remote credentials indefinitely.
        await tx.$executeRaw`WITH expired AS (
        SELECT "id" FROM "AccountErasureJob" WHERE "encryptedTokens" IS NOT NULL
          AND "receiptExpiresAt" <= CURRENT_TIMESTAMP
          AND ("claimedUntil" IS NULL OR "claimedUntil" <= clock_timestamp())
        ORDER BY "receiptExpiresAt", "id" FOR UPDATE SKIP LOCKED LIMIT 500
      ) UPDATE "AccountErasureJob" j SET "encryptedTokens" = NULL, "revocationStatus" = 'manual_required',
        "blockerCode" = 'REVOCATION_WINDOW_EXPIRED', "claimToken" = NULL, "claimedUntil" = NULL
        FROM expired e WHERE j."id" = e."id"`;
      },
      { timeout: 10000, maxWait: 5000 },
    );
  }
}
