import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Command } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CommandJournalService } from '../../commands/command-journal.service';
import type { ToolOnly } from '../tools/tool-registry';
import { normalizeToolOnlyCall } from '../tools/tool-call';

export type ConfirmationReplay = {
  text: string;
  meta: {
    simulation?: boolean;
    sessionId?: string;
    commandId?: string;
    commandState?: string;
  };
  choices?: string[];
};

@Injectable()
export class PendingActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private item(row: Command) {
    const call = normalizeToolOnlyCall({
      name: row.toolName,
      args: row.arguments,
    });
    return call ? { id: row.id, sessionId: row.conversationId, call } : null;
  }

  private async owner(sessionId?: string) {
    if (!sessionId?.trim()) return null;
    return this.prisma.conversation.findUnique({
      where: { id: sessionId },
      select: { ownerId: true },
    });
  }

  private async lock(tx: Prisma.TransactionClient, sessionId: string) {
    const rows = await tx.$queryRaw<
      Array<{ ownerId: string }>
    >`SELECT "ownerId" FROM "Conversation" WHERE id = ${sessionId} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException('Conversation introuvable.');
    return rows[0].ownerId;
  }

  async create(sessionId: string, call: ToolOnly) {
    const args = JSON.parse(
      JSON.stringify(call.args),
    ) as Prisma.InputJsonObject;
    const name = call.name;
    const expiresAt = new Date(
      Date.now() + Number(this.config.get('PENDING_TTL_MINUTES') ?? 10) * 60000,
    );
    return this.prisma.$transaction(async (tx) => {
      const ownerId = await this.lock(tx, sessionId);
      // Replacing the pending proposal cancels it; executing intents remain intact.
      await tx.command.updateMany({
        where: { ownerId, conversationId: sessionId, state: 'waiting' },
        data: { state: 'cancelled', revision: { increment: 1 } },
      });
      const journal = new CommandJournalService(tx);
      const row = await journal.propose({
        ownerId,
        conversationId: sessionId,
        requestId: randomUUID(),
        toolName: name,
        toolVersion: '1',
        arguments: args,
        targets: [],
        expiresAt,
      });
      await journal.advance(ownerId, row.id, row.revision, 'waiting');
      return row.id;
    });
  }

  async peekLatest(sessionId: string) {
    const owner = await this.owner(sessionId);
    if (!owner) return null;
    const row = await this.prisma.command.findFirst({
      where: {
        ownerId: owner.ownerId,
        conversationId: sessionId,
        state: 'waiting',
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? this.item(row) : null;
  }

  async peek(id: string, expectedSessionId?: string) {
    const owner = await this.owner(expectedSessionId);
    if (!owner) return null;
    const row = await this.prisma.command.findFirst({
      where: {
        id,
        ownerId: owner.ownerId,
        conversationId: expectedSessionId,
        state: 'waiting',
        expiresAt: { gt: new Date() },
      },
    });
    return row ? this.item(row) : null;
  }

  async consume(id: string, expectedSessionId?: string) {
    if (!expectedSessionId?.trim()) return null;
    return this.prisma
      .$transaction(async (tx) => {
        const ownerId = await this.lock(tx, expectedSessionId);
        const row = await tx.command.findFirst({
          where: { id, ownerId, conversationId: expectedSessionId },
        });
        if (!row || row.state !== 'waiting') return null;
        const journal = new CommandJournalService(tx);
        if (row.expiresAt.getTime() <= Date.now()) {
          await journal.advance(ownerId, id, row.revision, 'expired');
          return null;
        }
        const item = this.item(row);
        if (!item) {
          await journal.advance(ownerId, id, row.revision, 'cancelled');
          return null;
        }
        await journal.approve(ownerId, id, row.revision, row.digest);
        await journal.advance(ownerId, id, row.revision + 1, 'executing');
        return item;
      })
      .catch(async (error: unknown) => {
        // The deadline may pass between the locked read and the SQL approval.
        // That transaction rolls back; record expiry without ever running a tool.
        const expired = await this.prisma.command.updateMany({
          where: {
            id,
            conversationId: expectedSessionId,
            state: 'waiting',
            expiresAt: { lte: new Date() },
          },
          data: { state: 'expired', revision: { increment: 1 } },
        });
        if (expired.count === 1) return null;
        throw error;
      });
  }

  async consumeLatest(sessionId: string) {
    const item = await this.peekLatest(sessionId);
    return item ? this.consume(item.id, sessionId) : null;
  }

  async cancelLatest(sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const ownerId = await this.lock(tx, sessionId);
      await tx.command.updateMany({
        where: { ownerId, conversationId: sessionId, state: 'waiting' },
        data: { state: 'cancelled', revision: { increment: 1 } },
      });
    });
  }

  async complete(id: string, sessionId: string, response: ConfirmationReplay) {
    const owner = await this.owner(sessionId);
    if (!owner) throw new NotFoundException('Conversation introuvable.');
    const persisted = JSON.parse(
      JSON.stringify(response),
    ) as Prisma.InputJsonObject;
    const result = await this.prisma.command.updateMany({
      where: {
        id,
        conversationId: sessionId,
        ownerId: owner.ownerId,
        state: 'executing',
      },
      data: {
        state: 'completed',
        outcomeCode: 'TOOL_RETURNED',
        response: persisted,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new Error('COMMAND_COMPLETION_CONFLICT');
  }

  async markUnknown(id: string, sessionId: string) {
    const owner = await this.owner(sessionId);
    if (!owner) return;
    await this.prisma.command.updateMany({
      where: {
        id,
        conversationId: sessionId,
        ownerId: owner.ownerId,
        state: 'executing',
      },
      data: {
        state: 'unknown',
        outcomeCode: 'EXECUTION_UNCERTAIN',
        revision: { increment: 1 },
      },
    });
  }

  private replayRow(row: Command | null): ConfirmationReplay | null {
    if (
      !row ||
      (row.state === 'waiting' && row.expiresAt.getTime() > Date.now())
    )
      return null;
    if (
      row.state === 'completed' &&
      row.response &&
      typeof row.response === 'object' &&
      !Array.isArray(row.response) &&
      typeof row.response.text === 'string'
    )
      return row.response as ConfirmationReplay;
    const text =
      row.state === 'executing' || row.state === 'unknown'
        ? 'Cette action a déjà été prise en charge. Son résultat doit être vérifié ; elle ne sera pas relancée.'
        : row.state === 'cancelled'
          ? 'Cette action a été annulée.'
          : 'Cette action est expirée ou indisponible.';
    return { text, meta: { commandId: row.id, commandState: row.state } };
  }

  async replay(id: string, sessionId?: string) {
    const owner = await this.owner(sessionId);
    if (!owner) return null;
    const expired = await this.prisma.command.findFirst({
      where: {
        id,
        ownerId: owner.ownerId,
        conversationId: sessionId,
        state: 'waiting',
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
    });
    if (expired) await this.consume(id, sessionId);
    return this.replayRow(
      await this.prisma.command.findFirst({
        where: { id, ownerId: owner.ownerId, conversationId: sessionId },
      }),
    );
  }

  async replayLatest(sessionId: string) {
    const owner = await this.owner(sessionId);
    if (!owner) return null;
    return this.replayRow(
      await this.prisma.command.findFirst({
        where: { ownerId: owner.ownerId, conversationId: sessionId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  }
}
