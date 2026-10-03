import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisAuditService } from '../jarvis/services/jarvis-audit.service';
import { JarvisMemoryService } from '../jarvis/services/jarvis-memory.service';
import { JarvisMissionService } from '../jarvis/services/jarvis-mission.service';
import { JarvisWorkflowService } from '../jarvis/services/jarvis-workflow.service';
import { JarvisContactService } from '../jarvis/services/jarvis-contact.service';
import { JarvisGoalService } from '../jarvis/services/jarvis-goal.service';
import { JarvisSearchService } from '../jarvis/services/jarvis-search.service';
import { JarvisKnowledgeBaseService } from '../jarvis/services/jarvis-knowledge-base.service';
import { JarvisContextualHelpService } from '../jarvis/services/jarvis-contextual-help.service';

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
      contact: { findMany },
      jarvisGoal: { findMany },
      jarvisKnowledgeEntry: { findMany },
      jarvisContextualHelp: { findMany },
      forConversation: jest.fn().mockResolvedValue({ todo: { findMany } }),
    } as unknown as PrismaService;
    const memory = new JarvisMemoryService(prisma, config);
    const reads = {
      audit: () => new JarvisAuditService(prisma, config).listRecent('owned'),
      missions: () => new JarvisMissionService(prisma).list('owned'),
      workflows: () => new JarvisWorkflowService(prisma, config).list('owned'),
      memory: () => memory.listFacts('owned'),
      search: () => memory.searchFacts('owned', 'query'),
      contacts: () => new JarvisContactService(prisma).list('owned'),
      contactSearch: () =>
        new JarvisContactService(prisma).find('owned', 'query'),
      goals: () => new JarvisGoalService(prisma).list('owned'),
      hierarchy: () => new JarvisGoalService(prisma).getHierarchy('owned'),
      knowledge: () => new JarvisKnowledgeBaseService(prisma).list('owned'),
      knowledgeSearch: () =>
        new JarvisKnowledgeBaseService(prisma).find('owned', {
          query: 'query',
        }),
      help: () =>
        new JarvisContextualHelpService(prisma).listByContext('owned'),
      relevantHelp: () =>
        new JarvisContextualHelpService(prisma).findRelevant('owned', 'query'),
      globalSearch: () =>
        new JarvisSearchService(prisma).query('owned', {
          query: 'query',
          types: ['todo'],
        }),
    };
    return { findMany, findUnique, reads, memory };
  }

  it.each(
    Object.keys(fixture().reads) as Array<
      keyof ReturnType<typeof fixture>['reads']
    >,
  )(
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

  it.each(['list', 'getHierarchy'] as const)(
    'sanitizes %s failures while loading children',
    async (method) => {
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'goal', sessionId: 'owned' }])
        .mockRejectedValueOnce(new Error('private child query'));
      const service = new JarvisGoalService({
        jarvisGoal: { findMany },
      } as unknown as PrismaService);
      await expect(service[method]('owned')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('does not silently omit unavailable contextual help from a prompt', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('offline'));
    const service = new JarvisContextualHelpService({
      jarvisContextualHelp: { findMany },
    } as unknown as PrismaService);
    await expect(
      service.buildPromptContext('owned', 'query'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

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
