import { PrismaService } from '../../src/prisma/prisma.service';
import { ActivityService } from '../../src/jarvis/services/activity.service';
import { NotFoundException } from '@nestjs/common';

describe('Durable activity pagination', () => {
  const prisma = new PrismaService();
  const ownerId = 'activity-owner';
  let conversationId: string;
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
    const date = new Date('2026-10-05T12:00:00Z');
    for (const [id, state] of [
      ['activity-a', 'completed'],
      ['activity-b', 'unknown'],
      ['activity-c', 'failed'],
    ]) {
      await prisma.command.create({
        data: {
          id,
          ownerId,
          conversationId,
          requestId: id,
          toolName: 'note.add',
          toolVersion: '1',
          source: 'direct',
          arguments: { text: 'Private arguments' },
          targets: [],
          digest: id,
          state,
          expiresAt: date,
          createdAt: date,
          updatedAt: date,
        },
      });
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('restores exact journal states after restart and paginates equal timestamps without duplicates', async () => {
    const first = await new ActivityService(prisma).list(
      ownerId,
      conversationId,
      { limit: 2 },
    );
    expect(first.commands.map((command) => command.id)).toEqual([
      'activity-c',
      'activity-b',
    ]);
    expect(first.commands.map((command) => command.state)).toEqual([
      'failed',
      'unknown',
    ]);
    expect(first.nextCursor).toBe('activity-b');
    expect(first.commands[0]).not.toHaveProperty('arguments');
    const second = await new ActivityService(prisma).list(
      ownerId,
      conversationId,
      { limit: 2, cursor: first.nextCursor! },
    );
    expect(second.commands.map((command) => command.id)).toEqual([
      'activity-a',
    ]);
    expect(second.nextCursor).toBeNull();
    await expect(
      new ActivityService(prisma).list('foreign', conversationId, { limit: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
