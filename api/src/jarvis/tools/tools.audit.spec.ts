import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool action history', () => {
  function makeCtx(input?: {
    events?: Array<{
      toolName: string;
      summary: string;
      status: string;
      resultPreview?: string | null;
      errorMessage?: string | null;
      createdAt?: Date;
    }>;
  }): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      async search() {
        return [];
      },
      async open(url: string) {
        return { url, content: '' };
      },
    };

    const prisma = {
      jarvisActionEvent: {
        findMany: jest
          .fn()
          .mockImplementation(
            async ({ where }: { where?: { status?: string } } = {}) =>
              (input?.events ?? [])
                .filter((event) =>
                  where?.status ? event.status === where.status : true,
                )
                .map((event) => ({
                  toolName: event.toolName,
                  summary: event.summary,
                  status: event.status,
                  resultPreview: event.resultPreview ?? null,
                  errorMessage: event.errorMessage ?? null,
                  createdAt:
                    event.createdAt ?? new Date('2026-04-17T09:00:00+02:00'),
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
      prisma: prisma as any,
      memory: {} as any,
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: 'audit-tools-spec',
      calendar,
      web,
      weather: {} as any,
      gmail,
    };
  }

  it('lists recent action events with their status and outcome', async () => {
    const out = await runTool(
      makeCtx({
        events: [
          {
            toolName: 'mission.close',
            summary: 'clôturer la mission "Demo investisseur"',
            status: 'completed',
            resultPreview: 'OK. Mission clôturée: "Demo investisseur"',
          },
          {
            toolName: 'calendar.create',
            summary: 'créer le rendez-vous "Standup"',
            status: 'pending',
          },
        ],
      }),
      {
        type: 'tool',
        name: 'action.history',
        args: { status: 'all', limit: 8 },
      },
    );

    expect(out).toContain('Historique des actions (all)');
    expect(out).toContain('clôturer la mission "Demo investisseur"');
    expect(out).toContain('completed');
    expect(out).toContain('créer le rendez-vous "Standup"');
    expect(out).toContain('pending');
  });

  it('filters only pending actions when requested', async () => {
    const out = await runTool(
      makeCtx({
        events: [
          {
            toolName: 'calendar.create',
            summary: 'créer le rendez-vous "Standup"',
            status: 'pending',
          },
          {
            toolName: 'mission.close',
            summary: 'clôturer la mission "Demo investisseur"',
            status: 'completed',
          },
        ],
      }),
      {
        type: 'tool',
        name: 'action.history',
        args: { status: 'pending', limit: 5 },
      },
    );

    expect(out).toContain('Historique des actions (pending)');
    expect(out).toContain('créer le rendez-vous "Standup"');
    expect(out).not.toContain('Demo investisseur');
  });
});
