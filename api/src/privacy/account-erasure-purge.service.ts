import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RETAINED_DATA_INVENTORY } from './data-inventory';

type Model = keyof typeof RETAINED_DATA_INVENTORY;
// Children precede their referenced parents; the job remains as a backup tombstone.
export const ERASURE_DELETE_ORDER = [
  'HabitLog',
  'ConversationTurn',
  'CommandCompensation',
  'CommandTransition',
  'InboxReplyDraft',
  'InboxReplyOperation',
  'PendingAction',
  'JarvisLog',
  'JarvisHumanProfile',
  'JarvisMemoryFact',
  'JarvisSessionSummary',
  'JarvisMission',
  'JarvisActionEvent',
  'JarvisWorkflowMemory',
  'JarvisGoal',
  'JarvisTaskDependency',
  'JarvisResourceAllocation',
  'JarvisPredictiveMetric',
  'JarvisSchedulingSuggestion',
  'JarvisContextualHelp',
  'JarvisKnowledgeEntry',
  'JarvisTimeInsight',
  'JarvisDelegation',
  'Reminder',
  'Habit',
  'Contact',
  'Expense',
  'Budget',
  'InboxZeroAction',
  'InboxZeroItem',
  'InboxZeroSession',
  'Todo',
  'CalendarEvent',
  'Note',
  'ShoppingItem',
  'PersonalFact',
  'RoutineRun',
  'RoutineSetting',
  'Command',
  'GoogleOAuthToken',
  'GoogleOAuthState',
  'IntegrationAccount',
  'Session',
  'Account',
  'BetaInvite',
  'LegacyOwnershipRecord',
  'Conversation',
  'User',
] as const satisfies readonly Model[];

function predicate(model: Model, ownerId: string): Prisma.Sql {
  switch (RETAINED_DATA_INVENTORY[model].scope) {
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
    case 'integration':
      return Prisma.sql`EXISTS (SELECT 1 FROM "IntegrationAccount" i WHERE i."id" = r."integrationAccountId" AND i."ownerId" = ${ownerId})`;
    case 'account-email':
      return Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE u."id" = ${ownerId} AND lower(btrim(u."email")) = r."email")`;
    case 'migration-owner':
      return Prisma.sql`r."assignedOwnerId" = ${ownerId}`;
    default:
      throw new Error('Unsupported erasure table');
  }
}

@Injectable()
export class AccountErasurePurgeService {
  constructor(private readonly prisma: PrismaService) {}

  async purge(jobId: string, claimToken: string): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
        const jobs = await tx.$queryRaw<
          Array<{ ownerId: string; localDeletedAt: Date | null }>
        >`
        SELECT "ownerId", "localDeletedAt" FROM "AccountErasureJob"
        WHERE "id" = ${jobId} AND "claimToken" = ${claimToken}
          AND "claimedUntil" > clock_timestamp() AND "state" IN ('queued', 'local_deleted') FOR UPDATE`;
        if (jobs.length !== 1) return false;
        if (jobs[0].localDeletedAt) return true;
        const ownerId = jobs[0].ownerId;
        // Recheck unresolved outcomes and lock the owner before touching private data.
        await tx.$executeRaw`SELECT prepare_account_erasure(${ownerId})`;
        await tx.$executeRaw`SELECT set_config('jarvis.erasure_claim', ${claimToken}, true)`;
        // Remove only this owner's mappings; preserve unrelated migration snapshots.
        await tx.$executeRaw`UPDATE "LegacyOwnershipBatch" b SET "manifest" = jsonb_set(
        b."manifest", '{mappings}', COALESCE((SELECT jsonb_agg(mapping)
          FROM jsonb_array_elements(b."manifest"->'mappings') mapping
          WHERE mapping->>'ownerId' IS DISTINCT FROM ${ownerId}), '[]'::jsonb))
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(b."manifest"->'mappings') mapping
          WHERE mapping->>'ownerId' = ${ownerId})`;
        for (const model of ERASURE_DELETE_ORDER) {
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM ${Prisma.raw(`"${model}"`)} r WHERE ${predicate(model, ownerId)}`,
          );
        }
        const changed =
          await tx.$executeRaw`UPDATE "AccountErasureJob" SET "state" = 'local_deleted',
        "localDeletedAt" = clock_timestamp() WHERE "id" = ${jobId} AND "claimToken" = ${claimToken}
          AND "claimedUntil" > clock_timestamp()`;
        if (changed !== 1)
          throw new Error('Erasure lease expired before commit');
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 45000,
        maxWait: 5000,
      },
    );
  }
}
