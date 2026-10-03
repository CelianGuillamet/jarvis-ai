import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { JarvisMemoryService } from './jarvis-memory.service';
import { JarvisTimeInsightsService } from './jarvis-time-insights.service';

describe('Insight availability', () => {
  function fixture() {
    const findMany = jest.fn().mockResolvedValue([]);
    const create = jest
      .fn()
      .mockRejectedValue(new Error('private storage details'));
    const getSnapshot = jest.fn().mockResolvedValue({ factsByLayer: {} });
    const prisma = {
      jarvisTimeInsight: { findMany, create },
      forConversation: jest
        .fn()
        .mockResolvedValue({ todo: { findMany }, calendarEvent: { findMany } }),
    } as unknown as PrismaService;
    const conflicts = new ConflictDetectionService(prisma, {
      getSnapshot,
    } as unknown as JarvisMemoryService);
    return {
      findMany,
      getSnapshot,
      conflicts,
      insights: new JarvisTimeInsightsService(prisma),
    };
  }
  it('does not invent zero productivity after a failed read', async () => {
    const { findMany, insights } = fixture();
    expect((await insights.summary('owner')).metrics).toEqual({});
    findMany.mockRejectedValueOnce(new Error('unavailable'));
    await expect(insights.summary('owner')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
  it('propagates failed metric writes', async () => {
    const { insights } = fixture();
    await expect(
      insights.record('owner', { metricName: 'focus', value: 30 }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
  it.each(['detectSchedulingConflicts', 'detectDuplicates'] as const)(
    '%s separates no conflicts from failed reads',
    async (operation) => {
      const { findMany, conflicts } = fixture();
      expect(await conflicts[operation]('owner')).toBeNull();
      findMany.mockRejectedValueOnce(new Error('unavailable'));
      await expect(conflicts[operation]('owner')).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );
  it('does not report a clean aggregate when memory cannot be checked', async () => {
    const { getSnapshot, conflicts } = fixture();
    expect(await conflicts.detectAllConflicts('owner')).toEqual([]);
    getSnapshot.mockRejectedValueOnce(new Error('unavailable'));
    await expect(conflicts.detectAllConflicts('owner')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
