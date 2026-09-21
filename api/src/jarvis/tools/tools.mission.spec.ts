import type {
  CalendarEventItem,
  CalendarProvider,
} from '../../calendar/providers/calendar.provider';
import type {
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool mission planner', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function makeCtx(input: {
    todos?: Array<{ text: string; createdAt?: Date }>;
    notes?: Array<{ title: string | null; text: string; createdAt?: Date }>;
    shopping?: Array<{ text: string }>;
    events?: CalendarEventItem[];
    unreadMails?: GmailMessageItem[];
    missions?: Array<{
      id?: string;
      objective: string;
      horizon?: string | null;
      status?: string;
      summary: string;
      nextStep?: string | null;
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

    const missionsState = (input.missions ?? []).map((mission, index) => ({
      id: mission.id ?? `mission-${index + 1}`,
      objective: mission.objective,
      horizon: mission.horizon ?? null,
      status: mission.status ?? 'active',
      summary: mission.summary,
      nextStep: mission.nextStep ?? null,
      updatedAt: new Date(`2026-04-17T0${Math.min(index + 8, 9)}:00:00+02:00`),
    }));

    const prisma = {
      todo: {
        findMany: jest.fn().mockResolvedValue(
          (input.todos ?? []).map((todo) => ({
            ...todo,
            createdAt: todo.createdAt ?? new Date('2026-04-17T07:00:00+02:00'),
          })),
        ),
      },
      note: {
        findMany: jest.fn().mockResolvedValue(
          (input.notes ?? []).map((note) => ({
            ...note,
            createdAt: note.createdAt ?? new Date('2026-04-17T07:10:00+02:00'),
          })),
        ),
      },
      shoppingItem: {
        findMany: jest.fn().mockResolvedValue(input.shopping ?? []),
      },
      jarvisMission: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where?: { status?: string } }) =>
            Promise.resolve(
              missionsState
                .filter((mission) =>
                  where?.status ? mission.status === where.status : true,
                )
                .map((mission) => ({ ...mission })),
            ),
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string };
              data: { status?: string };
            }) => {
              const mission = missionsState.find(
                (item) => item.id === where.id,
              );
              if (!mission)
                return Promise.reject(new Error('MISSION_NOT_FOUND'));
              if (data.status) mission.status = data.status;
              mission.updatedAt = new Date('2026-04-17T10:30:00+02:00');
              return Promise.resolve({ ...mission });
            },
          ),
      },
    };

    const calendar: CalendarProvider = {
      listEventsInterval: jest.fn().mockResolvedValue(input.events ?? []),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
    };

    const gmail: GmailProvider = {
      listMessages: jest.fn().mockResolvedValue(input.unreadMails ?? []),
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
      sessionId: 'mission-tools-spec',
      calendar,
      web,
      weather: {} as unknown as ToolContext['weather'],
      gmail,
    };
  }

  it('builds a contextual mission plan with signals and suggested commands', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T08:00:00+02:00'));

    const out = await runTool(
      makeCtx({
        todos: [{ text: 'Préparer la démo investisseur' }],
        notes: [
          {
            title: 'Demo investisseur',
            text: 'Slides, chiffres, répétition et Q&A.',
          },
        ],
        events: [
          {
            provider: 'db',
            eventId: 'e1',
            title: 'Demo investisseur',
            when: new Date('2026-04-17T17:00:00+02:00'),
            end: new Date('2026-04-17T18:00:00+02:00'),
          },
        ],
        unreadMails: [
          {
            id: 'm1',
            threadId: 't1',
            subject: 'Demo investisseur',
            from: 'pepper@example.com',
            to: 'me@example.com',
            date: new Date('2026-04-17T07:45:00+02:00'),
            snippet: 'Validation finale avant la réunion.',
            labels: ['INBOX', 'UNREAD'],
            unread: true,
          },
        ],
      }),
      {
        type: 'tool',
        name: 'mission.plan',
        args: {
          objective: 'Préparer la démo investisseur',
          horizon: "aujourd'hui",
        },
      },
    );

    expect(out).toContain('Mission plan - Préparer la démo investisseur');
    expect(out).toContain('Evaluation tactique');
    expect(out).toContain('Signaux pertinents');
    expect(out).toContain('Demo investisseur');
    expect(out).toContain('Plan recommande');
    expect(out).toContain('Commandes suggerees');
  });

  it('lists active persisted missions with their next step', async () => {
    const out = await runTool(
      makeCtx({
        missions: [
          {
            objective: 'Préparer la démo investisseur',
            horizon: "aujourd'hui",
            summary: 'Plusieurs signaux sont déjà alignés.',
            nextStep: 'Relire les slides.',
          },
        ],
      }),
      {
        type: 'tool',
        name: 'mission.list',
        args: { status: 'active', limit: 5 },
      },
    );

    expect(out).toContain('Missions (active)');
    expect(out).toContain('Préparer la démo investisseur');
    expect(out).toContain('Relire les slides.');
  });

  it('closes a mission from the latest mission list by reference', async () => {
    const ctx = makeCtx({
      missions: [
        {
          id: 'mission-demo',
          objective: 'Préparer la démo investisseur',
          horizon: "aujourd'hui",
          summary: 'Plusieurs signaux sont déjà alignés.',
          nextStep: 'Relire les slides.',
        },
      ],
    });

    await runTool(ctx, {
      type: 'tool',
      name: 'mission.list',
      args: { status: 'active', limit: 5 },
    });

    const out = await runTool(ctx, {
      type: 'tool',
      name: 'mission.close',
      args: { ref: 1 },
    });

    expect(out).toContain('Mission clôturée');
    expect(out).toContain('Préparer la démo investisseur');
  });

  it('includes the active mission in the daily briefing radar', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T08:10:00+02:00'));

    const out = await runTool(
      makeCtx({
        missions: [
          {
            objective: 'Préparer la démo investisseur',
            horizon: "aujourd'hui",
            summary: 'Plusieurs signaux sont déjà alignés.',
            nextStep: 'Relire les slides.',
          },
        ],
      }),
      {
        type: 'tool',
        name: 'daily.briefing',
        args: {},
      },
    );

    expect(out).toContain('Mission active clé');
    expect(out).toContain('Préparer la démo investisseur');
    expect(out).toContain('Boucles ouvertes');
  });
});
