import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisSearchService } from './jarvis-search.service';

describe('Bounded literal search', () => {
  function fixture(text = 'Task') {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'owned-task',
        text,
        done: false,
        createdAt: new Date('2026-01-01'),
      },
    ]);
    const forConversation = jest.fn().mockResolvedValue({ todo: { findMany } });
    const service = new JarvisSearchService({
      forConversation,
    } as unknown as PrismaService);
    return { service, findMany, forConversation };
  }

  it.each(['.', '(', '[', '\\', 'a*', 'C++', '(a+)+$'])(
    'counts %s literally without interpreting regex syntax',
    async (term) => {
      const { service } = fixture(`prefix ${term} ${term} ${term}`);
      const result = await service.query('owned-conversation', {
        query: term,
        types: ['todo'],
      });
      expect(result[0].score).toBeCloseTo(1.4);
    },
  );

  it('caps repeat scoring at four and database rows at fifty', async () => {
    const { service, findMany, forConversation } = fixture('x '.repeat(100));
    const result = await service.query('owned-conversation', {
      query: 'x',
      limit: 5000,
      types: ['todo'],
    });
    expect(result[0].score).toBeCloseTo(2.1);
    expect(findMany).toHaveBeenCalledWith({
      where: { text: { contains: 'x', mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(forConversation).toHaveBeenCalledWith('owned-conversation');
  });

  it.each([0, -1, NaN, Infinity, 1.5])(
    'rejects invalid limit %s before accessing storage',
    async (limit) => {
      const { service, forConversation } = fixture();
      await expect(
        service.query('owned', { query: 'task', limit }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(forConversation).not.toHaveBeenCalled();
    },
  );

  it('rejects oversized queries and leaves empty queries legitimately empty', async () => {
    const { service, forConversation } = fixture();
    await expect(
      service.query('owned', { query: 'x'.repeat(501) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.query('owned', { query: '  ' })).toEqual([]);
    expect(forConversation).not.toHaveBeenCalled();
  });
});
