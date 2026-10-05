import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActivityResponseSchema,
  type ConversationHistoryQuery,
} from '../../contracts/v1';

/** Read only the verified owner's durable journal, never assistant prose. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    ownerId: string,
    conversationId: string,
    query: ConversationHistoryQuery,
  ) {
    const unavailable = () =>
      new ServiceUnavailableException(
        'Activité indisponible. Réessayez la lecture.',
      );
    let cursor: { id: string; createdAt: Date } | null;
    try {
      const owned = await this.prisma.conversation.findFirst({
        where: { id: conversationId, ownerId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Conversation introuvable.');
      cursor = query.cursor
        ? await this.prisma.command.findFirst({
            where: { id: query.cursor, ownerId, conversationId },
            select: { id: true, createdAt: true },
          })
        : null;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw unavailable();
    }
    if (query.cursor && !cursor)
      throw new NotFoundException('Page introuvable.');
    try {
      const rows = await this.prisma.command.findMany({
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
          toolName: true,
          source: true,
          state: true,
          outcomeCode: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          compensation: { select: { consumedAt: true } },
        },
      });
      const page = rows.slice(0, query.limit);
      return ActivityResponseSchema.parse({
        conversationId,
        fetchedAt: new Date().toISOString(),
        nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
        commands: page.map(({ toolName, compensation, ...row }) => ({
          ...row,
          operation: toolName,
          undoRecorded:
            row.state === 'completed' &&
            !!compensation &&
            !compensation.consumedAt,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        })),
      });
    } catch {
      throw unavailable();
    }
  }
}
