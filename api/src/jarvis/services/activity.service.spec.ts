import { ActivityService } from './activity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

function fixture() {
  const prisma = {
    conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
    command: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    prisma,
    service: new ActivityService(prisma as unknown as PrismaService),
  };
}
const date = new Date('2026-10-05T12:00:00Z');
const row = (id: string, state = 'completed') => ({
  id,
  toolName: 'note.add',
  source: 'direct',
  state,
  outcomeCode: null,
  createdAt: date,
  updatedAt: date,
  expiresAt: date,
  compensation: { consumedAt: null },
});

describe('ActivityService', () => {
  it('returns durable states and a bounded owner-scoped page without arguments or model claims', async () => {
    const { prisma, service } = fixture();
    prisma.command.findMany.mockResolvedValue([
      row('b'),
      row('a', 'unknown'),
      row('extra'),
    ]);
    const result = await service.list('owner', 'owned', { limit: 2 });
    expect(prisma.command.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner', conversationId: 'owned' },
        take: 3,
      }),
    );
    expect(result.nextCursor).toBe('a');
    expect(result.commands.map((command) => command.state)).toEqual([
      'completed',
      'unknown',
    ]);
    expect(result.commands.map((command) => command.undoRecorded)).toEqual([
      true,
      false,
    ]);
    expect(result.commands[0]).not.toHaveProperty('arguments');
    expect(result.commands[0]).not.toHaveProperty('response');
  });
  it('rejects a foreign conversation before reading its commands', async () => {
    const { prisma, service } = fixture();
    prisma.conversation.findFirst.mockResolvedValue(null);
    await expect(
      service.list('owner', 'foreign', { limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.command.findMany).not.toHaveBeenCalled();
  });
  it('rejects a foreign cursor rather than starting over', async () => {
    const { prisma, service } = fixture();
    prisma.command.findFirst.mockResolvedValue(null);
    await expect(
      service.list('owner', 'owned', { limit: 20, cursor: 'foreign' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.command.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', ownerId: 'owner', conversationId: 'owned' },
      select: { id: true, createdAt: true },
    });
    expect(prisma.command.findMany).not.toHaveBeenCalled();
  });
  it('reports database or invalid journal failures as unavailable, never an empty successful page', async () => {
    const { prisma, service } = fixture();
    prisma.command.findMany.mockRejectedValue(
      new Error('private database detail'),
    );
    await expect(
      service.list('owner', 'owned', { limit: 20 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    prisma.command.findMany.mockResolvedValue([row('bad', 'invented')]);
    await expect(
      service.list('owner', 'owned', { limit: 20 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
