import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisAuditService } from '../jarvis/services/jarvis-audit.service';
import { JarvisMemoryService } from '../jarvis/services/jarvis-memory.service';
import { JarvisMissionService } from '../jarvis/services/jarvis-mission.service';
import { JarvisWorkflowService } from '../jarvis/services/jarvis-workflow.service';

describe('Unavailable reads are not empty success results', () => {
  const config = new ConfigService();
  function fixture() {
    const findMany = jest
      .fn<Promise<never[]>, [unknown]>()
      .mockResolvedValue([]);
    const findUnique = jest
      .fn<Promise<null>, [unknown]>()
      .mockResolvedValue(null);
    const prisma = {
      pendingAction: { findMany: jest.fn().mockResolvedValue([]) },
      jarvisActionEvent: { findMany },
      jarvisMemoryFact: { findMany },
      jarvisSessionSummary: { findUnique },
      jarvisMission: { findMany },
      jarvisWorkflowMemory: { findMany },
    } as unknown as PrismaService;
    const memory = new JarvisMemoryService(prisma, config);
    const reads = {
      audit: () => new JarvisAuditService(prisma, config).listRecent('owned'),
      missions: () => new JarvisMissionService(prisma).list('owned'),
      workflows: () => new JarvisWorkflowService(prisma, config).list('owned'),
      memory: () => memory.listFacts('owned'),
      search: () => memory.searchFacts('owned', 'query'),
    };
    return { findMany, findUnique, reads, memory };
  }

  it.each(['audit', 'missions', 'workflows', 'memory', 'search'] as const)(
    '%s distinguishes an empty collection from a failed query',
    async (name) => {
      const { findMany, reads } = fixture();
      expect(await reads[name]()).toEqual([]);
      findMany.mockRejectedValueOnce(new Error('private connection details'));
      try {
        await reads[name]();
        throw new Error('Expected query failure');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        const response = error as ServiceUnavailableException;
        expect(response.getStatus()).toBe(503);
        expect(response.getResponse()).toMatchObject({ code: 'UNAVAILABLE' });
        expect(JSON.stringify(response.getResponse())).not.toContain(
          'private connection',
        );
      }
    },
  );

  it('does not replace a failed summary read with an empty world model', async () => {
    const { memory, findUnique } = fixture();
    expect(await memory.getSnapshot('owned')).toMatchObject({
      sessionSummary: null,
    });
    findUnique.mockRejectedValueOnce(new Error('database offline'));
    await expect(memory.getSnapshot('owned')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
