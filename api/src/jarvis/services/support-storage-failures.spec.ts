import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisDependencyTrackingService } from './jarvis-dependency-tracking.service';
import { JarvisSmartSchedulingService } from './jarvis-smart-scheduling.service';
import { JarvisKnowledgeBaseService } from './jarvis-knowledge-base.service';
import { JarvisContextualHelpService } from './jarvis-contextual-help.service';

describe('Supporting services preserve storage failures', () => {
  function fixture() {
    const fail = jest
      .fn()
      .mockRejectedValue(new Error('private connection details'));
    const model = {
      create: fail,
      update: fail,
      findMany: fail,
      findFirst: fail,
    };
    const prisma = {
      jarvisTaskDependency: model,
      jarvisSchedulingSuggestion: model,
      jarvisKnowledgeEntry: model,
      jarvisContextualHelp: model,
      forConversation: jest
        .fn()
        .mockResolvedValue({ todo: { count: jest.fn().mockResolvedValue(2) } }),
    } as unknown as PrismaService;
    const dependency = new JarvisDependencyTrackingService(prisma);
    const scheduling = new JarvisSmartSchedulingService(prisma);
    const knowledge = new JarvisKnowledgeBaseService(prisma);
    const help = new JarvisContextualHelpService(prisma);
    return {
      addDependency: () => dependency.addDependency('owner', 'a', 'b'),
      dependencyGraph: () => dependency.getDependencies('owner', 'a'),
      dependencyOrder: () => dependency.orderTasks('owner', ['a', 'b']),
      dependencyCycles: () => dependency.detectCycles('owner'),
      suggest: () =>
        scheduling.suggestSchedule('owner', {
          suggestedTime: new Date(),
          rationale: 'Test',
        }),
      suggestions: () => scheduling.listSuggestions('owner'),
      apply: () => scheduling.applySuggestion('owner', 'id'),
      availableSlot: () => scheduling.findNextAvailableSlot('owner'),
      schedulingContext: () => scheduling.buildPromptContext('owner'),
      saveKnowledge: () =>
        knowledge.save('owner', { title: 'Test', content: 'Content' }),
      createHelp: () =>
        help.createHelp('owner', {
          context: 'Test',
          contentType: 'text',
          content: 'Content',
        }),
      viewed: () => help.markViewed('owner', 'id'),
      helpful: () => help.markHelpful('owner', 'id', true),
    };
  }
  it.each(Object.keys(fixture()) as Array<keyof ReturnType<typeof fixture>>)(
    '%s rejects rather than returning an empty success',
    async (operation) => {
      await expect(fixture()[operation]()).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );
});
