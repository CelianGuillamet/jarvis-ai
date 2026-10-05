import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { InboxReplyDraftSaveRequest } from '../contracts/v1';

/** Private draft storage is independent of Gmail availability and never sends mail. */
@Injectable()
export class InboxReplyDraftService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwner(ownerId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation introuvable.');
  }

  async read(ownerId: string, conversationId: string, messageId: string) {
    await this.assertOwner(ownerId, conversationId);
    const row = await this.prisma.inboxReplyDraft.findUnique({
      where: {
        ownerId_conversationId_messageId: {
          ownerId,
          conversationId,
          messageId,
        },
      },
    });
    return {
      draft: row
        ? {
            messageId: row.messageId,
            text: row.text,
            version: row.version,
            updatedAt: row.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async save(
    ownerId: string,
    conversationId: string,
    input: InboxReplyDraftSaveRequest,
  ) {
    await this.assertOwner(ownerId, conversationId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['draft', ownerId, conversationId, input.messageId])}, 0))::text`;
      const key = { ownerId, conversationId, messageId: input.messageId };
      const previous = await tx.inboxReplyDraft.findUnique({
        where: { ownerId_conversationId_messageId: key },
      });
      if ((previous?.version ?? 0) !== input.version)
        throw new ConflictException(
          'Ce brouillon a changé dans un autre onglet. Rechargez sa version enregistrée avant de poursuivre.',
        );
      const draft = await tx.inboxReplyDraft.upsert({
        where: { ownerId_conversationId_messageId: key },
        create: { ...key, text: input.text, version: 1 },
        update: { text: input.text, version: input.version + 1 },
      });
      return {
        draft: {
          messageId: draft.messageId,
          text: draft.text,
          version: draft.version,
          updatedAt: draft.updatedAt.toISOString(),
        },
      };
    });
  }
}
