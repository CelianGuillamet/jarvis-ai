import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RETAINED_DATA_INVENTORY } from './data-inventory';
import { EXPORT_PROJECTIONS } from './export-projections';

type ExportModel = keyof typeof EXPORT_PROJECTIONS;
type WriteRecord = (value: unknown) => Promise<void>;

// Stored tool payloads and migration archives can contain credential-shaped keys.
const secretKeys = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'password',
  'authorization',
  'cookie',
  'apikey',
  'clientsecret',
  'verifier',
  'nonce',
  'authsecret',
]);

export function redactExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExportValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !secretKeys.has(key.replace(/[-_]/g, '').toLowerCase()),
        )
        .map(([key, child]) => [key, redactExportValue(child)]),
    );
  }
  // Legacy payloads are JSON strings; parse those before applying the same policy.
  if (
    typeof value === 'string' &&
    (value.trimStart().startsWith('{') || value.trimStart().startsWith('['))
  ) {
    try {
      return JSON.stringify(redactExportValue(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  return value;
}

function ownership(model: ExportModel, ownerId: string): Prisma.Sql {
  const scope = RETAINED_DATA_INVENTORY[model].scope;
  switch (scope) {
    case 'account':
      return Prisma.sql`r."id" = ${ownerId}`;
    case 'owner':
      return Prisma.sql`r."ownerId" = ${ownerId}`;
    case 'auth-user':
      return Prisma.sql`r."userId" = ${ownerId}`;
    case 'conversation':
      return Prisma.sql`EXISTS (SELECT 1 FROM "Conversation" c WHERE c."id" = r."sessionId" AND c."ownerId" = ${ownerId})`;
    case 'habit':
      return Prisma.sql`EXISTS (SELECT 1 FROM "Habit" h JOIN "Conversation" c ON c."id" = h."sessionId" WHERE h."id" = r."habitId" AND c."ownerId" = ${ownerId})`;
    case 'command':
      return Prisma.sql`EXISTS (SELECT 1 FROM "Command" c WHERE c."id" = r."commandId" AND c."ownerId" = ${ownerId})`;
    case 'migration-owner':
      return Prisma.sql`r."assignedOwnerId" = ${ownerId}`;
    case 'account-email':
      return Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE u."id" = ${ownerId} AND u."email" = r."email")`;
    default:
      throw new Error('Excluded credential tables cannot be exported');
  }
}

@Injectable()
export class AccountSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async stream(ownerId: string, write: WriteRecord, signal: AbortSignal) {
    const assertConnected = () => {
      if (signal.aborted) throw new Error('Export interrupted');
    };
    let records = 0;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // The first database read establishes the shared MVCC snapshot.
        const account = await tx.user.findUniqueOrThrow({
          where: { id: ownerId },
          select: { id: true },
        });
        assertConnected();
        await write({
          type: 'header',
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          accountId: account.id,
        });
        for (const model of Object.keys(EXPORT_PROJECTIONS) as ExportModel[]) {
          const fields = EXPORT_PROJECTIONS[model];
          if (fields === null) continue;
          // Identifiers come exclusively from the static reviewed allowlists.
          const projection = fields.map((field) => {
            const column =
              model === 'LegacyOwnershipRecord' && field === 'original'
                ? Prisma.sql`CASE WHEN r."tableName" IN ('GoogleOAuthToken', 'GoogleOAuthState', 'Verification', 'Account', 'Session') THEN NULL ELSE r."original" END`
                : Prisma.raw(`r."${field}"`);
            return Prisma.sql`${field}::text, ${column}`;
          });
          await tx.$executeRaw(
            Prisma.sql`DECLARE account_export NO SCROLL CURSOR FOR SELECT jsonb_build_object(${Prisma.join(projection)}) AS record FROM ${Prisma.raw(`"${model}"`)} r WHERE ${ownership(model, ownerId)}`,
          );
          while (true) {
            assertConnected();
            const rows = await tx.$queryRaw<
              Array<{ record: unknown }>
            >`FETCH FORWARD 50 FROM account_export`;
            if (!rows.length) break;
            for (const row of rows) {
              assertConnected();
              await write({
                type: 'record',
                collection: model,
                data: redactExportValue(row.record),
              });
              records++;
            }
          }
          await tx.$executeRaw`CLOSE account_export`;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 60000,
      },
    );
    // A complete marker is emitted only after the transaction itself succeeds.
    assertConnected();
    await write({ type: 'complete', records });
  }
}
