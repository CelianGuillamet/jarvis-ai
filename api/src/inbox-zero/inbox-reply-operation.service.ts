import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { InboxReplyOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REQUEST_LIMITS } from '../http/request-limits';

export type InboxReplyIntent = {
  ownerId: string;
  conversationId: string;
  requestId: string;
  accountId: string;
  accountSubject: string;
  messageId: string;
  replyText: string;
  archiveAfter: boolean;
};
export type InboxReplySteps = {
  send: () => Promise<{ messageId: string; threadId: string | null }>;
  labels: () => Promise<void>;
  local: () => Promise<void>;
};

/** Called inside the shared owner/account/capability policy boundary, never for simulation. */
@Injectable()
export class InboxReplyOperationService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: InboxReplyIntent, steps: InboxReplySteps) {
    // A fixed property order gives equivalent requests the same immutable digest.
    const intent = {
      conversationId: input.conversationId,
      accountId: input.accountId,
      accountSubject: input.accountSubject,
      messageId: input.messageId,
      replyText: input.replyText,
      archiveAfter: input.archiveAfter,
    };
    const { ownerId, requestId } = input;
    for (const value of [
      ownerId,
      requestId,
      intent.conversationId,
      intent.accountId,
      intent.accountSubject,
      intent.messageId,
    ]) {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > REQUEST_LIMITS.objectIdChars
      )
        throw new BadRequestException('Identité de réponse invalide.');
    }
    if (
      typeof intent.replyText !== 'string' ||
      !intent.replyText.trim() ||
      intent.replyText.length > REQUEST_LIMITS.replyChars ||
      typeof intent.archiveAfter !== 'boolean'
    )
      throw new BadRequestException('Contenu de réponse invalide.');
    const digest = createHash('sha256')
      .update(JSON.stringify(intent))
      .digest('hex');
    const owned = await this.prisma.conversation.findFirst({
      where: { id: intent.conversationId, ownerId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Conversation introuvable.');
    const where = { ownerId_requestId: { ownerId, requestId } };
    await this.prisma.inboxReplyOperation.createMany({
      data: [
        {
          ownerId,
          requestId,
          conversationId: intent.conversationId,
          intent,
          digest,
        },
      ],
      skipDuplicates: true,
    });
    let row = await this.prisma.inboxReplyOperation.findUniqueOrThrow({
      where,
    });
    if (row.digest !== digest)
      throw new ConflictException('Cette tentative désigne une autre réponse.');

    const claim = await this.prisma.inboxReplyOperation.updateMany({
      where: { id: row.id, ownerId, sendState: 'pending' },
      data: { sendState: 'sending' },
    });
    if (claim.count === 1) {
      try {
        const receipt = await steps.send();
        if (!receipt?.messageId?.trim())
          throw new Error('Missing send receipt');
        row = await this.prisma.inboxReplyOperation.update({
          where: { id: row.id },
          data: {
            sendState: 'sent',
            providerMessageId: receipt.messageId,
            providerThreadId: receipt.threadId,
          },
        });
      } catch {
        // If storage is unavailable, the pre-send claim remains non-retryable.
        await this.prisma.inboxReplyOperation.updateMany({
          where: { id: row.id, sendState: 'sending' },
          data: { sendState: 'unknown' },
        });
        return this.result(
          await this.prisma.inboxReplyOperation.findUniqueOrThrow({ where }),
        );
      }
    } else {
      row = await this.prisma.inboxReplyOperation.findUniqueOrThrow({ where });
    }
    if (row.sendState !== 'sent') return this.result(row);
    try {
      if (!row.labelsComplete) {
        await steps.labels();
        row = await this.prisma.inboxReplyOperation.update({
          where: { id: row.id },
          data: { labelsComplete: true },
        });
      }
      if (!row.localComplete) {
        await steps.local();
        row = await this.prisma.inboxReplyOperation.update({
          where: { id: row.id },
          data: { localComplete: true },
        });
      }
    } catch {
      // Only absolute label changes and an idempotent local patch may be retried.
      row = await this.prisma.inboxReplyOperation.findUniqueOrThrow({ where });
    }
    return this.result(row);
  }

  private result(row: InboxReplyOperation) {
    return {
      operationId: row.id,
      ok: row.localComplete,
      steps: {
        send:
          row.sendState === 'sent'
            ? ('completed' as const)
            : ('unknown' as const),
        labels: row.labelsComplete
          ? ('completed' as const)
          : ('pending' as const),
        local: row.localComplete
          ? ('completed' as const)
          : ('pending' as const),
      },
      providerReference: row.providerMessageId
        ? { messageId: row.providerMessageId, threadId: row.providerThreadId }
        : null,
    };
  }
}
