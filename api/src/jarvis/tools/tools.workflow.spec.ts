import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool workflow list', () => {
  function makeCtx(input?: {
    workflows?: Array<{
      triggerSummary: string;
      followUpPrompt: string;
      usageCount: number;
      updatedAt?: Date;
    }>;
  }): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      search() {
        return Promise.resolve([]);
      },
      open(url: string) {
        return Promise.resolve({ url, content: '' });
      },
    };

    const prisma = {
      jarvisWorkflowMemory: {
        findMany: jest.fn().mockResolvedValue(
          (input?.workflows ?? []).map((workflow) => ({
            triggerSummary: workflow.triggerSummary,
            followUpPrompt: workflow.followUpPrompt,
            usageCount: workflow.usageCount,
            updatedAt:
              workflow.updatedAt ?? new Date('2026-04-17T09:00:00+02:00'),
          })),
        ),
      },
    };

    const calendar: CalendarProvider = {
      listEventsInterval: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
    };

    const gmail: GmailProvider = {
      listMessages: jest.fn().mockResolvedValue([]),
      getMessage: jest.fn(),
      modifyLabels: jest.fn(),
      trashMessage: jest.fn(),
      untrashMessage: jest.fn(),
      deleteMessage: jest.fn(),
      sendMessage: jest.fn(),
    };

    return {
      prisma: prisma as unknown as ToolContext['prisma'],
      memory: {} as unknown as ToolContext['memory'],
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: 'workflow-tools-spec',
      calendar,
      web,
      weather: {} as unknown as ToolContext['weather'],
      gmail,
    };
  }

  it('lists learned workflows with their follow-up prompt and usage count', async () => {
    const out = await runTool(
      makeCtx({
        workflows: [
          {
            triggerSummary: 'créer le rendez-vous "Demo Stark"',
            followUpPrompt: 'Prépare un plan de mission pour Demo Stark',
            usageCount: 3,
          },
        ],
      }),
      {
        type: 'tool',
        name: 'workflow.list',
        args: { limit: 5 },
      },
    );

    expect(out).toContain('Workflows appris');
    expect(out).toContain('Après créer le rendez-vous "Demo Stark"');
    expect(out).toContain('Prépare un plan de mission pour Demo Stark');
    expect(out).toContain('(3 fois)');
  });

  it('returns an empty message when no workflow has been learned yet', async () => {
    const out = await runTool(makeCtx(), {
      type: 'tool',
      name: 'workflow.list',
      args: { limit: 5 },
    });

    expect(out).toBe('Aucun workflow appris pour le moment.');
  });
});
