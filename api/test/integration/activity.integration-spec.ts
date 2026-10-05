import { PrismaService } from '../../src/prisma/prisma.service';
import {
  CommandJournalService,
  type CommandState,
} from '../../src/commands/command-journal.service';
import { ActivityService } from '../../src/jarvis/services/activity.service';
import { NotFoundException } from '@nestjs/common';

describe('Durable activity pagination', () => {
  const prisma = new PrismaService();
  const ownerId = 'activity-owner';
  let conversationId: string;
  const expected = new Map<string, string>();
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: ownerId, name: ownerId, email: 'activity@example.invalid' },
    });
    conversationId = (
      await prisma.conversation.create({
        data: { ownerId, clientKey: 'activity' },
      })
    ).id;
    const journal = new CommandJournalService(prisma);
    for (const state of ['completed', 'unknown', 'failed'] as const) {
      const command = await journal.propose({
        ownerId,
        conversationId,
        requestId: `activity-${state}`,
        toolName: 'note.add',
        toolVersion: '1',
        source: 'direct',
        arguments: { text: 'Private arguments' },
        targets: [],
        expiresAt: new Date(Date.now() + 60000),
      });
      await journal.advance(ownerId, command.id, 0, 'waiting');
      await journal.approve(ownerId, command.id, 1, command.digest);
      await journal.advance(ownerId, command.id, 2, 'executing');
      await journal.advance(
        ownerId,
        command.id,
        3,
        state as CommandState,
        'TEST_RESULT',
      );
      expected.set(command.id, state);
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('restores exact journal states after restart and paginates without duplicates', async () => {
    const first = await new ActivityService(prisma).list(
      ownerId,
      conversationId,
      { limit: 2 },
    );
    expect(first.commands).toHaveLength(2);
    expect(first.nextCursor).toBe(first.commands.at(-1)!.id);
    expect(first.commands[0]).not.toHaveProperty('arguments');
    const second = await new ActivityService(prisma).list(
      ownerId,
      conversationId,
      { limit: 2, cursor: first.nextCursor! },
    );
    expect(second.commands).toHaveLength(1);
    const all = [...first.commands, ...second.commands];
    expect(new Set(all.map((command) => command.id)).size).toBe(3);
    for (const command of all)
      expect(command.state).toBe(expected.get(command.id));
    expect(second.nextCursor).toBeNull();
    await expect(
      new ActivityService(prisma).list('foreign', conversationId, { limit: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
