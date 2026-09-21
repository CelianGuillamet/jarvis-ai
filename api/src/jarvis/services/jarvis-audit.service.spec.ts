import { JarvisAuditService } from './jarvis-audit.service';

describe('JarvisAuditService', () => {
  it('records a pending action event with execution metadata', async () => {
    const prisma = {
      jarvisActionEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const service = new JarvisAuditService(
      prisma as unknown as ConstructorParameters<typeof JarvisAuditService>[0],
      config as unknown as ConstructorParameters<typeof JarvisAuditService>[1],
    );

    await service.recordPending({
      sessionId: 'audit-session',
      pendingActionId: 'pending-1',
      call: {
        type: 'tool',
        name: 'mission.close',
        args: { query: 'demo investisseur' },
      },
      plan: {
        planner: 'intent',
        confidence: 'medium',
        risk: 'medium',
        sideEffect: true,
        requiresConfirmation: true,
        confirmationReason: null,
        summary: 'clôturer la mission "demo investisseur"',
      },
      source: 'chat',
    });

    expect(prisma.jarvisActionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'audit-session',
        pendingActionId: 'pending-1',
        toolName: 'mission.close',
        status: 'pending',
        planner: 'intent',
        confidence: 'medium',
      }) as unknown,
    });
  });

  it('expires stale pending events that no longer have a live pending action', async () => {
    const prisma = {
      jarvisActionEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'audit-1', pendingActionId: 'pending-1' },
          ])
          .mockResolvedValueOnce([
            {
              id: 'audit-1',
              pendingActionId: 'pending-1',
              source: 'chat',
              toolName: 'calendar.create',
              summary: 'créer le rendez-vous "Standup"',
              planner: 'llm',
              confidence: 'unknown',
              risk: 'medium',
              status: 'expired',
              resultPreview: null,
              errorMessage: 'Action expirée sans confirmation.',
              createdAt: new Date('2026-04-17T09:00:00+02:00'),
              completedAt: new Date('2026-04-17T09:20:00+02:00'),
            },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pendingAction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'PENDING_TTL_MINUTES') return '10';
        return undefined;
      }),
    };
    const service = new JarvisAuditService(
      prisma as unknown as ConstructorParameters<typeof JarvisAuditService>[0],
      config as unknown as ConstructorParameters<typeof JarvisAuditService>[1],
    );

    const events = await service.listRecent('audit-session', { limit: 5 });

    expect(prisma.jarvisActionEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['audit-1'] } },
      data: expect.objectContaining({
        status: 'expired',
        errorMessage: 'Action expirée sans confirmation.',
      }) as unknown,
    });
    expect(events[0].status).toBe('expired');
  });
});
