import { Controller, Get, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './session.guard';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import {
  AccountDataExportQuerySchema,
  AccountDataExportPageSchema,
} from '../contracts/v1';
import type { AccountDataExportQuery } from '../contracts/v1';
import { dataUnavailable } from '../http/data-unavailable';

@Controller('account/export')
export class AccountExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('data')
  @ResponseContract(AccountDataExportPageSchema)
  async page(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(AccountDataExportQuerySchema))
    query: AccountDataExportQuery,
  ) {
    const where = {
      ownerId: request.identity.userId,
      ...(query.after ? { id: { gt: query.after } } : {}),
    };
    const options = { where, orderBy: { id: 'asc' as const }, take: 51 };
    try {
      switch (query.collection) {
        case 'tasks': {
          const rows = await this.prisma.todo.findMany({
            ...options,
            select: {
              id: true,
              text: true,
              done: true,
              doneAt: true,
              createdAt: true,
            },
          });
          return this.result(
            query.collection,
            rows.map((row) => ({
              ...row,
              doneAt: row.doneAt?.toISOString() ?? null,
              createdAt: row.createdAt.toISOString(),
            })),
          );
        }
        case 'notes': {
          const rows = await this.prisma.note.findMany({
            ...options,
            select: { id: true, title: true, text: true, createdAt: true },
          });
          return this.result(
            query.collection,
            rows.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
            })),
          );
        }
        case 'shopping': {
          const rows = await this.prisma.shoppingItem.findMany({
            ...options,
            select: {
              id: true,
              text: true,
              bought: true,
              boughtAt: true,
              createdAt: true,
            },
          });
          return this.result(
            query.collection,
            rows.map((row) => ({
              ...row,
              boughtAt: row.boughtAt?.toISOString() ?? null,
              createdAt: row.createdAt.toISOString(),
            })),
          );
        }
        case 'calendar': {
          const rows = await this.prisma.calendarEvent.findMany({
            ...options,
            select: { id: true, title: true, when: true, createdAt: true },
          });
          return this.result(
            query.collection,
            rows.map((row) => ({
              ...row,
              when: row.when.toISOString(),
              createdAt: row.createdAt.toISOString(),
            })),
          );
        }
        case 'memory': {
          // Legacy-named sessionId is the conversation ID, not an auth session.
          // Join ownership in SQL instead of collecting an unbounded ID list.
          const rows = await this.prisma.$queryRaw<
            Array<{
              id: string;
              conversationId: string;
              layer: string;
              key: string;
              label: string;
              value: string;
              confidence: number;
              source: string;
              lastSeenAt: Date;
              createdAt: Date;
              updatedAt: Date;
            }>
          >(Prisma.sql`
            SELECT m."id", m."sessionId" AS "conversationId", m."layer", m."key", m."label", m."value",
              m."confidence", m."source", m."lastSeenAt", m."createdAt", m."updatedAt"
            FROM "JarvisMemoryFact" m
            INNER JOIN "Conversation" c ON c."id" = m."sessionId"
            WHERE c."ownerId" = ${request.identity.userId} AND m."id" > ${query.after ?? ''}
            ORDER BY m."id" ASC LIMIT 51
          `);
          return this.result(
            query.collection,
            rows.map((row) => ({
              ...row,
              lastSeenAt: row.lastSeenAt.toISOString(),
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
            })),
          );
        }
      }
    } catch {
      throw dataUnavailable();
    }
  }

  private result<T extends { id: string }>(
    collection: AccountDataExportQuery['collection'],
    rows: T[],
  ) {
    const items = rows.slice(0, 50);
    return {
      formatVersion: 1 as const,
      collection,
      exportedAt: new Date().toISOString(),
      items,
      nextCursor: rows.length > 50 ? items[items.length - 1].id : null,
    };
  }
}
