import { AccountPrivateCacheService } from './account-private-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisService } from '../jarvis/services/jarvis.service';

describe('Owner private cache invalidation', () => {
  it('reads bounded owner-only pages and forgets every conversation exactly once', async () => {
    const first = Array.from({ length: 100 }, (_, n) => ({
      id: `conversation-${String(n).padStart(3, '0')}`,
    }));
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ id: 'conversation-100' }]);
    const forgetConversation = jest.fn();
    const service = new AccountPrivateCacheService(
      { conversation: { findMany } } as unknown as PrismaService,
      { forgetConversation } as unknown as JarvisService,
    );
    await service.forgetOwner('erased-owner');
    expect(findMany.mock.calls).toEqual([
      [
        {
          where: { ownerId: 'erased-owner' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
        },
      ],
      [
        {
          where: { ownerId: 'erased-owner', id: { gt: 'conversation-099' } },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
        },
      ],
    ]);
    expect(forgetConversation).toHaveBeenCalledTimes(101);
    expect(
      new Set(forgetConversation.mock.calls.map(([id]: [string]) => id)).size,
    ).toBe(101);
  });

  it('propagates an unavailable database so a worker cannot purge without invalidation', async () => {
    const service = new AccountPrivateCacheService(
      {
        conversation: {
          findMany: jest.fn().mockRejectedValue(new Error('unavailable')),
        },
      } as unknown as PrismaService,
      { forgetConversation: jest.fn() } as unknown as JarvisService,
    );
    await expect(service.forgetOwner('owner')).rejects.toThrow('unavailable');
  });
});
