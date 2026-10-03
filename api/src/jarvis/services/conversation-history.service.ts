import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dataUnavailable } from '../../http/data-unavailable';
import { JarvisChatResponseSchema } from '../../contracts/v1';
import type {
  ConversationHistoryQuery,
  JarvisChatResponse,
} from '../../contracts/v1';

@Injectable()
export class ConversationHistoryService {
  private readonly logger = new Logger(ConversationHistoryService.name);
  constructor(private readonly prisma: PrismaService) {}

  private async requireOwner(ownerId: string, conversationId: string) {
    let conversation: { id: string } | null;
    try {
      conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, ownerId },
        select: { id: true },
      });
    } catch {
      throw dataUnavailable();
    }
    if (!conversation) throw new NotFoundException('Conversation introuvable.');
  }

  async capture(
    ownerId: string,
    conversationId: string,
    kind: 'chat' | 'confirm',
    inputText: string,
    operation: () => Promise<unknown>,
  ): Promise<JarvisChatResponse> {
    await this.requireOwner(ownerId, conversationId);
    let turnId: string;
    try {
      const turn = await this.prisma.conversationTurn.create({
        data: { ownerId, conversationId, kind, inputText },
        select: { id: true },
      });
      turnId = turn.id;
    } catch {
      // No model/tool operation starts without a durable input record.
      throw dataUnavailable();
    }
    let response: JarvisChatResponse;
    try {
      response = JarvisChatResponseSchema.parse(await operation());
    } catch (error) {
      try {
        await this.prisma.conversationTurn.updateMany({
          where: { id: turnId, ownerId, conversationId, state: 'started' },
          data: { state: 'failed' },
        });
      } catch {
        this.logger.warn(
          'Conversation response failure could not be recorded.',
        );
      }
      // A request failure is not proof that a domain command had no effect.
      throw error;
    }
    const completed = {
      ...response,
      meta: { ...response.meta, historyTurnId: turnId, historySaved: true },
    };
    try {
      const saved = await this.prisma.conversationTurn.updateMany({
        where: { id: turnId, ownerId, conversationId, state: 'started' },
        data: {
          state: 'completed',
          response: JSON.parse(
            JSON.stringify(completed),
          ) as Prisma.InputJsonValue,
          commandId:
            response.meta?.commandId ?? response.pending_action?.id ?? null,
        },
      });
      if (saved.count !== 1) throw new Error('History completion conflict');
      return completed;
    } catch {
      // Preserve a known execution result; never encourage retrying an effect
      // merely because saving the conversation response failed afterwards.
      this.logger.warn(
        'Conversation result returned without persisted history.',
      );
      return { ...completed, meta: { ...completed.meta, historySaved: false } };
    }
  }

  async list(
    ownerId: string,
    conversationId: string,
    query: ConversationHistoryQuery,
  ) {
    await this.requireOwner(ownerId, conversationId);
    let cursor: { id: string; createdAt: Date } | null;
    try {
      cursor = query.cursor
        ? await this.prisma.conversationTurn.findFirst({
            where: { id: query.cursor, ownerId, conversationId },
            select: { id: true, createdAt: true },
          })
        : null;
    } catch {
      throw dataUnavailable();
    }
    if (query.cursor && !cursor)
      throw new NotFoundException('Page introuvable.');
    try {
      const [rows, pending] = await Promise.all([
        this.prisma.conversationTurn.findMany({
          where: {
            ownerId,
            conversationId,
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
          select: {
            id: true,
            kind: true,
            inputText: true,
            state: true,
            response: true,
            createdAt: true,
            updatedAt: true,
            command: { select: { id: true, state: true } },
          },
        }),
        this.prisma.command.findFirst({
          where: {
            ownerId,
            conversationId,
            source: 'confirmation',
            state: 'waiting',
            expiresAt: { gt: new Date() },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, state: true, expiresAt: true },
        }),
      ]);
      const page = rows.slice(0, query.limit);
      return {
        conversationId,
        fetchedAt: new Date().toISOString(),
        nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
        turns: page.reverse().map((row) => ({
          ...row,
          response:
            row.response === null
              ? null
              : JarvisChatResponseSchema.parse(row.response),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        pendingCommand: pending
          ? { ...pending, expiresAt: pending.expiresAt.toISOString() }
          : null,
      };
    } catch {
      throw dataUnavailable();
    }
  }
}
