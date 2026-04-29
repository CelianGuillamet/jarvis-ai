import type { ConfigService } from '@nestjs/config';
import { JarvisWorkflowService } from './jarvis-workflow.service';

describe('JarvisWorkflowService', () => {
  function makeService() {
    const prisma = {
      jarvisActionEvent: {
        findFirst: jest.fn(),
      },
      jarvisWorkflowMemory: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const config: Pick<ConfigService, 'get'> = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const prismaService = prisma as unknown as ConstructorParameters<
      typeof JarvisWorkflowService
    >[0];
    const configService = config as unknown as ConstructorParameters<
      typeof JarvisWorkflowService
    >[1];

    return {
      service: new JarvisWorkflowService(prismaService, configService),
      prisma,
      config,
    };
  }

  it('learns a workflow transition from the previous completed action', async () => {
    const { service, prisma } = makeService();
    prisma.jarvisActionEvent.findFirst.mockResolvedValue({
      toolName: 'calendar.create',
      summary: 'créer le rendez-vous "Demo Stark"',
    });
    prisma.jarvisWorkflowMemory.findFirst.mockResolvedValue(null);
    prisma.jarvisWorkflowMemory.create.mockResolvedValue({ id: 'wf-1' });

    await service.observeSuccessfulTool({
      sessionId: 'session-1',
      userText: 'Prépare un plan de mission pour la démo investisseur',
      call: {
        type: 'tool',
        name: 'mission.plan',
        args: { objective: 'la démo investisseur' },
      },
    });

    expect(prisma.jarvisWorkflowMemory.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        triggerToolName: 'calendar.create',
        triggerSummary: 'créer le rendez-vous "Demo Stark"',
        followUpToolName: 'mission.plan',
        followUpPrompt: 'Prépare un plan de mission pour la démo investisseur',
        followUpPromptKey:
          'prepare un plan de mission pour la demo investisseur',
      },
      select: { id: true },
    });
  });

  it('deduplicates suggested prompts for a given trigger tool', async () => {
    const { service, prisma } = makeService();
    prisma.jarvisWorkflowMemory.findMany.mockResolvedValue([
      {
        id: 'wf-1',
        triggerToolName: 'calendar.create',
        triggerSummary: 'créer le rendez-vous "Demo Stark"',
        followUpToolName: 'mission.plan',
        followUpPrompt: 'Prépare un plan de mission pour Demo Stark',
        usageCount: 4,
        lastUsedAt: new Date('2026-04-17T09:00:00.000Z'),
      },
      {
        id: 'wf-2',
        triggerToolName: 'calendar.create',
        triggerSummary: 'créer le rendez-vous "Demo Stark"',
        followUpToolName: 'mission.plan',
        followUpPrompt: 'Prépare un plan de mission pour Demo Stark',
        usageCount: 2,
        lastUsedAt: new Date('2026-04-17T09:05:00.000Z'),
      },
      {
        id: 'wf-3',
        triggerToolName: 'calendar.create',
        triggerSummary: 'créer le rendez-vous "Demo Stark"',
        followUpToolName: 'todo.add',
        followUpPrompt: 'Ajoute un todo pour préparer la salle',
        usageCount: 1,
        lastUsedAt: new Date('2026-04-17T09:07:00.000Z'),
      },
    ]);

    const suggestions = await service.suggestNextPrompts(
      'session-1',
      'calendar.create',
      { limit: 5 },
    );

    expect(suggestions).toEqual([
      'Prépare un plan de mission pour Demo Stark',
      'Ajoute un todo pour préparer la salle',
    ]);
  });

  it('builds a compact workflow prompt context for the LLM', async () => {
    const { service, prisma } = makeService();
    prisma.jarvisWorkflowMemory.findMany.mockResolvedValue([
      {
        id: 'wf-1',
        triggerToolName: 'todo.list',
        triggerSummary: 'afficher les todos',
        followUpToolName: 'todo.done',
        followUpPrompt: 'Marque le premier todo comme fait',
        usageCount: 3,
        lastUsedAt: new Date('2026-04-17T10:00:00.000Z'),
      },
    ]);

    const context = await service.buildPromptContext('session-1');

    expect(context).toContain('Workflows utilisateur observes:');
    expect(context).toContain(
      "Après afficher les todos, l'utilisateur enchaine souvent avec: Marque le premier todo comme fait (3 fois)",
    );
  });
});
