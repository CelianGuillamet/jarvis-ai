import type {
  CalendarEventItem,
  CalendarProvider,
} from '../../calendar/providers/calendar.provider';
import type {
  GmailMessageDetail,
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import type { JarvisActionAuditRecord } from './jarvis-audit.service';
import type { HabitRecord } from './jarvis-habit.service';
import { createHumanProfile } from '../lib/humanize';
import type { JarvisWorldModelSnapshot } from './jarvis-memory.service';
import type { MissionRecord } from './jarvis-mission.service';
import type { ReminderRecord } from './jarvis-reminder.service';
import type { WorkflowMemoryRecord } from './jarvis-workflow.service';
import { JarvisService } from './jarvis.service';

type ServiceOptions = {
  todos?: Array<{ id: string; text: string; done: boolean; createdAt?: Date }>;
  shopping?: Array<{ id: string; text: string; bought: boolean }>;
  notes?: Array<{ title: string | null; text: string; createdAt?: Date }>;
  notesTotal?: number;
  events?: CalendarEventItem[];
  unreadMails?: GmailMessageItem[];
  pendingAction?: {
    id: string;
    call: { name: string; args: Record<string, unknown> };
  };
  googleScope?: string | null;
  logs?: Array<{
    createdAt: Date;
    userText: string;
    result: string | null;
    toolName?: string | null;
  }>;
  worldModelPrompt?: string;
  missionPrompt?: string;
  workflowPrompt?: string;
  worldModel?: JarvisWorldModelSnapshot;
  missions?: MissionRecord[];
  auditEvents?: JarvisActionAuditRecord[];
  workflowMemory?: WorkflowMemoryRecord[];
  workflowSuggestionsByTool?: Record<string, string[]>;
  reminders?: ReminderRecord[];
  habits?: HabitRecord[];
};

function emptyWorldModel(): JarvisWorldModelSnapshot {
  return {
    factsByLayer: {
      identity: [],
      preference: [],
      project: [],
      relationship: [],
      workflow: [],
    },
    sessionSummary: null,
  };
}

function makeService(options: ServiceOptions = {}) {
  const llmChat = jest.fn();
  const missionsState = (options.missions ?? []).map((mission, index) => ({
    id: mission.id,
    objective: mission.objective,
    horizon: mission.horizon,
    status: mission.status,
    summary: mission.summary,
    nextStep: mission.nextStep,
    keySignals: mission.keySignals,
    updatedAt: mission.updatedAt,
    updatedAtDate: new Date(
      mission.updatedAt ?? `2026-04-17T0${Math.min(index + 8, 9)}:00:00+02:00`,
    ),
  }));

  const prisma = {
    jarvisLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(options.logs ?? []),
    },
    todo: {
      findMany: jest.fn().mockResolvedValue(
        (options.todos ?? []).map((todo) => ({
          ...todo,
          createdAt: todo.createdAt ?? new Date('2026-04-17T07:00:00+02:00'),
        })),
      ),
      count: jest
        .fn()
        .mockResolvedValue((options.todos ?? []).filter((t) => !t.done).length),
    },
    shoppingItem: {
      findMany: jest.fn().mockResolvedValue(options.shopping ?? []),
      count: jest
        .fn()
        .mockResolvedValue(
          (options.shopping ?? []).filter((item) => !item.bought).length,
        ),
    },
    note: {
      findMany: jest.fn().mockResolvedValue(
        (options.notes ?? []).map((note) => ({
          ...note,
          createdAt: note.createdAt ?? new Date('2026-04-17T07:00:00+02:00'),
        })),
      ),
      count: jest.fn().mockResolvedValue(options.notesTotal ?? 0),
    },
    googleOAuthToken: {
      findUnique: jest.fn().mockResolvedValue(
        options.googleScope !== undefined
          ? {
              scope: options.googleScope,
              updatedAt: new Date('2026-04-17T08:00:00+02:00'),
            }
          : null,
      ),
    },
    jarvisMission: {
      findMany: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where?: { status?: string } }) =>
            missionsState
              .filter((mission) =>
                where?.status ? mission.status === where.status : true,
              )
              .map((mission) => ({
                id: mission.id,
                objective: mission.objective,
                horizon: mission.horizon ?? null,
                status: mission.status,
                summary: mission.summary,
                nextStep: mission.nextStep ?? null,
                updatedAt: mission.updatedAtDate,
              })),
        ),
      update: jest
        .fn()
        .mockImplementation(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { status?: string };
          }) => {
            const mission = missionsState.find((item) => item.id === where.id);
            if (!mission) throw new Error('MISSION_NOT_FOUND');
            if (data.status) mission.status = data.status;
            mission.updatedAtDate = new Date('2026-04-17T11:00:00+02:00');
            return {
              id: mission.id,
              objective: mission.objective,
              horizon: mission.horizon ?? null,
              status: mission.status,
              summary: mission.summary,
              nextStep: mission.nextStep ?? null,
              updatedAt: mission.updatedAtDate,
            };
          },
        ),
    },
    jarvisActionEvent: {
      findMany: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where?: { status?: string } } = {}) =>
            (options.auditEvents ?? [])
              .filter((event) =>
                where?.status ? event.status === where.status : true,
              )
              .map((event) => ({
                toolName: event.toolName,
                summary: event.summary,
                status: event.status,
                resultPreview: event.resultPreview,
                errorMessage: event.errorMessage,
                createdAt: new Date(event.createdAt),
              })),
        ),
    },
  };

  const pending = {
    peekLatest: jest.fn().mockResolvedValue(
      options.pendingAction
        ? {
            id: options.pendingAction.id,
            call: {
              type: 'tool',
              name: options.pendingAction.call.name,
              args: options.pendingAction.call.args,
            },
          }
        : null,
    ),
    consumeLatest: jest.fn().mockResolvedValue(null),
    cancelLatest: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue('pending-1'),
    consume: jest.fn().mockResolvedValue(null),
  };

  const baseProfile = createHumanProfile('tu', 'normal');
  const humanProfileStore = {
    get: jest.fn().mockResolvedValue(baseProfile),
    updateFromUserText: jest.fn().mockResolvedValue(baseProfile),
  };
  const memoryStore = {
    rememberFromUserText: jest.fn().mockResolvedValue(undefined),
    refreshSessionSummary: jest.fn().mockResolvedValue(undefined),
    buildPromptContext: jest
      .fn()
      .mockResolvedValue(options.worldModelPrompt ?? ''),
    getSnapshot: jest
      .fn()
      .mockResolvedValue(options.worldModel ?? emptyWorldModel()),
  };
  const missionStore = {
    recordPlan: jest.fn().mockResolvedValue({ id: 'mission-1' }),
    buildPromptContext: jest
      .fn()
      .mockResolvedValue(options.missionPrompt ?? ''),
    list: jest.fn().mockResolvedValue(options.missions ?? []),
  };
  const workflowStore = {
    observeSuccessfulTool: jest.fn().mockResolvedValue(undefined),
    buildPromptContext: jest
      .fn()
      .mockResolvedValue(options.workflowPrompt ?? ''),
    list: jest.fn().mockResolvedValue(options.workflowMemory ?? []),
    suggestNextPrompts: jest
      .fn()
      .mockImplementation(
        async (_sessionId: string, triggerToolName: string) =>
          options.workflowSuggestionsByTool?.[triggerToolName] ?? [],
      ),
  };
  const auditStore = {
    markSessionPendingAsSuperseded: jest.fn().mockResolvedValue(undefined),
    markSessionPendingAsCancelled: jest.fn().mockResolvedValue(undefined),
    recordPending: jest.fn().mockResolvedValue(undefined),
    recordCompletion: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    listRecent: jest.fn().mockResolvedValue(options.auditEvents ?? []),
  };
  const reminderStore = {
    create: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue(options.reminders ?? []),
    markDone: jest.fn().mockResolvedValue(null),
    snooze: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(false),
    upcoming: jest.fn().mockResolvedValue(options.reminders ?? []),
  };
  const habitStore = {
    create: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue(options.habits ?? []),
    log: jest.fn().mockResolvedValue(null),
    archive: jest.fn().mockResolvedValue(false),
  };
  const contactStore = {
    save: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(false),
  };
  const financeStore = {
    addExpense: jest.fn().mockResolvedValue(null),
    listExpenses: jest.fn().mockResolvedValue([]),
    summary: jest.fn().mockResolvedValue({
      period: 'month',
      total: 0,
      currency: 'EUR',
      byCategory: [],
      budgetStatus: [],
    }),
    setBudget: jest.fn().mockResolvedValue(null),
    listBudgets: jest.fn().mockResolvedValue([]),
  };

  const calendar: CalendarProvider = {
    listEventsInterval: jest.fn().mockResolvedValue(options.events ?? []),
    createEvent: jest.fn(),
    deleteEvent: jest.fn(),
    updateEvent: jest.fn(),
  };

  const gmailDetail = (item: GmailMessageItem): GmailMessageDetail => ({
    ...item,
    bodyText: item.snippet,
  });

  const gmail: GmailProvider = {
    listMessages: jest.fn().mockResolvedValue(options.unreadMails ?? []),
    getMessage: jest
      .fn()
      .mockImplementation(async (_sessionId: string, id: string) => {
        const found = (options.unreadMails ?? []).find(
          (mail) => mail.id === id,
        );
        if (!found) throw new Error('NOT_FOUND');
        return gmailDetail(found);
      }),
    modifyLabels: jest.fn().mockResolvedValue(undefined),
    trashMessage: jest.fn().mockResolvedValue(undefined),
    untrashMessage: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'SIMULATION':
          return 'false';
        case 'HUMANIZE_RESPONSES':
          return 'true';
        default:
          return undefined;
      }
    }),
  };

  const service = new JarvisService(
    config as any,
    prisma as any,
    pending as any,
    humanProfileStore as any,
    auditStore as any,
    memoryStore as any,
    missionStore as any,
    workflowStore as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    reminderStore as any,
    habitStore as any,
    contactStore as any,
    financeStore as any,
    calendar,
    gmail,
  );
  (service as any).llm = { chat: llmChat, providerName: 'ollama' };

  return {
    service,
    llmChat,
    pending,
    memoryStore,
    missionStore,
    workflowStore,
    auditStore,
  };
}

describe('JarvisService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('injects recent final turns into the LLM context', async () => {
    const { service, llmChat } = makeService();
    llmChat
      .mockResolvedValueOnce('{"type":"final","text":"Compris."}')
      .mockResolvedValueOnce('{"type":"final","text":"Je m\'en souviens."}');

    await service.chat("Mon projet s'appelle Mark 42", 'memory-final');
    await service.chat('Et le nom déjà ?', 'memory-final');

    const secondMessages = llmChat.mock.calls[1][0];
    const systemPrompt = secondMessages[0].content;

    expect(systemPrompt).toContain('Historique recent de la session');
    expect(systemPrompt).toContain("Mon projet s'appelle Mark 42");
    expect(systemPrompt).toContain('Compris.');
  });

  it('injects previous tool outputs into the LLM context', async () => {
    const { service, llmChat } = makeService({
      todos: [{ id: 't1', text: 'Appeler Pepper', done: false }],
    });
    llmChat.mockResolvedValueOnce('{"type":"final","text":"Suite ok."}');

    await service.chat('liste mes todos', 'memory-tool');
    await service.chat('et ensuite ?', 'memory-tool');

    const messages = llmChat.mock.calls[0][0];
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('Action todo.list.');
    expect(systemPrompt).toContain('Appeler Pepper');
  });

  it('injects persistent world model and active missions into the LLM context', async () => {
    const { service, llmChat } = makeService({
      worldModelPrompt:
        'Monde personnel persistant:\n- Projets: Projet principal = Mark 42',
      missionPrompt:
        'Missions actives:\n- Préparer la démo investisseur | prochaine étape: relire les slides',
    });
    llmChat.mockResolvedValueOnce('{"type":"final","text":"Je reprends."}');

    await service.chat('Que dois-je reprendre ?', 'world-model-context');

    const messages = llmChat.mock.calls[0][0];
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('Monde personnel persistant');
    expect(systemPrompt).toContain('Projet principal = Mark 42');
    expect(systemPrompt).toContain('Missions actives');
    expect(systemPrompt).toContain('Préparer la démo investisseur');
  });

  it('injects learned workflow memory into the LLM context', async () => {
    const { service, llmChat } = makeService({
      workflowPrompt:
        "Workflows utilisateur observes:\n- Après afficher les todos, l'utilisateur enchaine souvent avec: marque le premier todo comme fait (3 fois)",
    });
    llmChat.mockResolvedValueOnce('{"type":"final","text":"Je reprends."}');

    await service.chat('Que proposes-tu ensuite ?', 'workflow-context');

    const messages = llmChat.mock.calls[0][0];
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('Workflows utilisateur observes');
    expect(systemPrompt).toContain('marque le premier todo comme fait');
  });

  it('routes priority briefing requests to daily.briefing with an executive output', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T08:15:00+02:00'));

    const { service, llmChat } = makeService({
      todos: [
        { id: 't1', text: 'Valider le devis Stark Expo', done: false },
        { id: 't2', text: 'Appeler Pepper', done: false },
      ],
      shopping: [{ id: 's1', text: 'Cables HDMI', bought: false }],
      events: [
        {
          provider: 'db',
          eventId: 'e1',
          title: 'Standup produit',
          when: new Date('2026-04-17T09:00:00+02:00'),
          end: new Date('2026-04-17T09:30:00+02:00'),
        },
      ],
      unreadMails: [
        {
          id: 'm1',
          threadId: 'th1',
          subject: 'Alerte sécurité compte',
          from: 'security@example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T07:50:00+02:00'),
          snippet: 'Action requise immédiatement.',
          labels: ['INBOX', 'UNREAD'],
          unread: true,
        },
      ],
    });

    const response = (await service.chat(
      'donne-moi mes priorités du jour',
      'briefing-priority',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('daily.briefing');
    expect(response.text).toContain("Niveau d'attention");
    expect(response.text).toContain('Resume executif');
    expect(response.text).toContain('Radar immediat');
    expect(response.text).toContain('Alerte sécurité compte');
  });

  it('routes weather requests to weather.forecast instead of calendar.update', async () => {
    const { service, llmChat } = makeService();
    (service as any).weather = {
      name: 'mock',
      getDailyForecast: jest.fn().mockResolvedValue({
        resolvedLocation: 'Paris, France',
        timezone: 'Europe/Paris',
        day: {
          date: '2026-04-18',
          tempMinC: 8,
          tempMaxC: 16,
          precipitationProbMax: 20,
          windMaxKmh: 12,
          description: 'ciel dégagé',
        },
        source: 'open-meteo',
      }),
    };

    const response = (await service.chat(
      'Afficher météo de demain',
      'weather-direct',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('weather.forecast');
    expect(response.text).toContain('Demain');
    expect(response.text).not.toContain('rendez-vous veux-tu modifier');
  });

  it('routes mission planning requests to mission.plan without using the LLM', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T08:30:00+02:00'));

    const { service, llmChat, missionStore } = makeService({
      todos: [{ id: 't1', text: 'Préparer la démo investisseur', done: false }],
      notes: [
        {
          title: 'Demo investisseur',
          text: 'Slides, chiffres, répétition.',
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
          threadId: 'th1',
          subject: 'Demo investisseur',
          from: 'pepper@example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T08:00:00+02:00'),
          snippet: 'Validation finale à faire.',
          labels: ['INBOX', 'UNREAD'],
          unread: true,
        },
      ],
    });

    const response = (await service.chat(
      'Prépare un plan de mission pour la démo investisseur',
      'mission-plan',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('mission.plan');
    expect(response.text).toContain('Mission plan');
    expect(response.text).toContain('Plan recommande');
    expect(response.text).toContain('Commandes suggerees');
    expect(missionStore.recordPlan).toHaveBeenCalledWith(
      'mission-plan',
      {
        objective: 'la démo investisseur',
        horizon: undefined,
      },
      expect.stringContaining('Mission plan - la démo investisseur'),
    );
  });

  it('routes mission closure requests to mission.close with confirmation', async () => {
    const { service, llmChat, auditStore } = makeService();

    const response = (await service.chat(
      'Clôture la mission démo investisseur',
      'mission-close',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.pending_action?.name).toBe('mission.close');
    expect(response.pending_action?.risk).toBe('medium');
    expect(response.text).toContain('Tu confirmes');
    expect(auditStore.recordPending).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'mission-close',
        pendingActionId: 'pending-1',
      }),
    );
  });

  it('routes audit history requests to action.history without using the LLM', async () => {
    const { service, llmChat } = makeService();

    const response = (await service.chat(
      "Qu'as-tu fait récemment ?",
      'action-history',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('action.history');
    expect(response.text).toContain('Aucune action récente enregistrée');
  });

  it('returns workflow-based follow-up choices after a successful tool execution', async () => {
    const { service, llmChat, workflowStore } = makeService({
      todos: [{ id: 't1', text: 'Appeler Pepper', done: false }],
      workflowSuggestionsByTool: {
        'todo.list': ['Marque le premier todo comme fait'],
      },
    });

    const response = (await service.chat(
      'Liste mes todos',
      'workflow-choices',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('todo.list');
    expect(response.choices).toContain('Marque le premier todo comme fait');
    expect(workflowStore.observeSuccessfulTool).toHaveBeenCalledWith({
      sessionId: 'workflow-choices',
      userText: 'Liste mes todos',
      call: {
        type: 'tool',
        name: 'todo.list',
        args: { show: 'open' },
      },
    });
  });

  it('keeps structured calendar confidence when a direct deletion phrase stays ambiguous', async () => {
    const { service, llmChat } = makeService({
      googleScope: 'https://www.googleapis.com/auth/calendar.events',
    });

    const response = (await service.chat(
      'Supprime mon rendez-vous demain',
      'calendar-ambiguity',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.pending_action?.name).toBe('calendar.delete');
    expect(response.pending_action?.planner).toBe('intent');
    expect(response.pending_action?.confidence).toBe('medium');
    expect(response.pending_action?.confirmationReason).toBe(
      'intent_medium_confidence',
    );
    expect(response.meta.decision?.planner).toBe('intent');
    expect(response.meta.decision?.confidence).toBe('medium');
    expect(response.text).toContain('validation');
  });

  it('returns a console status snapshot with metrics and quick actions', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T08:30:00+02:00'));

    const { service } = makeService({
      todos: [{ id: 't1', text: 'Appeler Happy', done: false }],
      shopping: [{ id: 's1', text: 'Arc reactor parts', bought: false }],
      notesTotal: 3,
      worldModel: {
        factsByLayer: {
          identity: [
            {
              layer: 'identity',
              key: 'preferred_name',
              label: 'Prénom',
              value: 'Celian',
              confidence: 0.96,
              source: 'user.explicit',
              updatedAt: '2026-04-17T08:00:00.000Z',
            },
          ],
          preference: [],
          project: [
            {
              layer: 'project',
              key: 'primary_project',
              label: 'Projet principal',
              value: 'Jarvis Premium',
              confidence: 0.9,
              source: 'user.explicit',
              updatedAt: '2026-04-17T08:05:00.000Z',
            },
          ],
          relationship: [],
          workflow: [],
        },
        sessionSummary: {
          summary: '- Dernière demande notable: préparer la démo',
          highlights: ['Dernière demande notable: préparer la démo'],
          updatedAt: '2026-04-17T08:06:00.000Z',
        },
      },
      missions: [
        {
          id: 'mission-1',
          objective: 'Préparer la démo investisseur',
          horizon: "aujourd'hui",
          status: 'active',
          summary: "J'ai trouvé plusieurs signaux liés à cette mission.",
          nextStep: 'Relire les slides et verrouiller le fil rouge.',
          keySignals: ['Demo Stark'],
          updatedAt: '2026-04-17T08:15:00.000Z',
        },
      ],
      googleScope:
        'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly',
      pendingAction: {
        id: 'pending-42',
        call: {
          name: 'calendar.create',
          args: { title: 'Demo Stark', when: '2026-04-17T18:00:00+02:00' },
        },
      },
      events: [
        {
          provider: 'db',
          eventId: 'e1',
          title: 'Demo Stark',
          when: new Date('2026-04-17T18:00:00+02:00'),
          end: new Date('2026-04-17T19:00:00+02:00'),
        },
      ],
      unreadMails: [
        {
          id: 'm1',
          threadId: 'th1',
          subject: 'Urgent board update',
          from: 'pepper@example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T09:00:00+02:00'),
          snippet: 'Need your approval.',
          labels: ['INBOX', 'UNREAD'],
          unread: true,
        },
      ],
      logs: [
        {
          createdAt: new Date('2026-04-17T09:10:00+02:00'),
          userText: 'Liste mes todos',
          result: 'Todos (open):\n- #1 - Appeler Happy',
          toolName: 'todo.list',
        },
      ],
      auditEvents: [
        {
          id: 'audit-0',
          pendingActionId: null,
          source: 'chat',
          toolName: 'calendar.create',
          summary: 'créer le rendez-vous "Demo Stark"',
          planner: 'direct',
          confidence: 'high',
          risk: 'medium',
          status: 'completed',
          resultPreview: 'OK. Rendez-vous créé.',
          errorMessage: null,
          createdAt: '2026-04-17T09:05:00.000Z',
          completedAt: '2026-04-17T09:05:04.000Z',
        },
        {
          id: 'audit-1',
          pendingActionId: 'pending-42',
          source: 'chat',
          toolName: 'calendar.create',
          summary: 'créer le rendez-vous "Demo Stark"',
          planner: 'llm',
          confidence: 'unknown',
          risk: 'medium',
          status: 'pending',
          resultPreview: null,
          errorMessage: null,
          createdAt: '2026-04-17T09:20:00.000Z',
          completedAt: null,
        },
      ],
      workflowMemory: [
        {
          id: 'wf-1',
          triggerToolName: 'calendar.create',
          triggerSummary: 'créer le rendez-vous "Demo Stark"',
          followUpToolName: 'mission.plan',
          followUpPrompt: 'Prépare un plan de mission pour Demo Stark',
          usageCount: 3,
          lastUsedAt: '2026-04-17T09:06:00.000Z',
        },
      ],
      workflowSuggestionsByTool: {
        'calendar.create': ['Prépare un plan de mission pour Demo Stark'],
      },
    });

    const snapshot = (await service.status('console-session')) as any;

    expect(snapshot.sessionId).toBe('console-session');
    expect(snapshot.providers.llm).toBe('ollama');
    expect(snapshot.metrics.openTodos).toBe(1);
    expect(snapshot.metrics.openShopping).toBe(1);
    expect(snapshot.metrics.notesTotal).toBe(3);
    expect(snapshot.pendingAction?.name).toBe('calendar.create');
    expect(snapshot.pendingAction?.summary).toContain('Demo Stark');
    expect(snapshot.pendingAction?.risk).toBe('medium');
    expect(snapshot.pendingAction?.confidence).toBe('unknown');
    expect(snapshot.integrations.googleConnected).toBe(true);
    expect(snapshot.integrations.gmailConnected).toBe(true);
    expect(snapshot.worldModel.factsByLayer.identity[0].value).toBe('Celian');
    expect(snapshot.missions[0].objective).toBe(
      'Préparer la démo investisseur',
    );
    expect(snapshot.focus.activeMission?.nextStep).toContain('slides');
    expect(snapshot.focus.nextEvent?.title).toBe('Demo Stark');
    expect(snapshot.focus.topUnreadEmail?.subject).toBe('Urgent board update');
    expect(snapshot.actionAudit[0].toolName).toBe('calendar.create');
    expect(snapshot.workflowMemory[0].followUpPrompt).toBe(
      'Prépare un plan de mission pour Demo Stark',
    );
    expect(snapshot.workflowSuggestions).toContain(
      'Prépare un plan de mission pour Demo Stark',
    );
    expect(snapshot.proactiveSuggestions[0].title).toBe(
      'Validation en attente',
    );
    expect(
      snapshot.proactiveSuggestions.some(
        (item: any) => item.title === 'Mission active',
      ),
    ).toBe(true);
    expect(
      snapshot.proactiveSuggestions.some(
        (item: any) => item.title === 'Routine détectée',
      ),
    ).toBe(true);
    expect(
      snapshot.quickActions.some(
        (item: any) =>
          item.kind === 'confirm' ||
          item.label === 'Voir les missions actives' ||
          item.label === 'Relancer une routine',
      ),
    ).toBe(true);
    expect(snapshot.recentActivity[0].toolName).toBe('todo.list');
  });

  it('prioritizes primary emails over promotions in the status focus', async () => {
    const { service } = makeService({
      unreadMails: [
        {
          id: 'm-promo',
          threadId: 'th-promo',
          subject: 'Mega promo',
          from: 'news@shop.example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T09:05:00+02:00'),
          snippet: 'Jusqu a -40% aujourd hui.',
          labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
          category: 'promotions',
          unread: true,
        },
        {
          id: 'm-primary',
          threadId: 'th-primary',
          subject: 'Client important',
          from: 'client@example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T08:55:00+02:00'),
          snippet: 'Peux-tu me rappeler ce matin ?',
          labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
          category: 'primary',
          unread: true,
        },
      ],
    });

    const snapshot = (await service.status('gmail-priority')) as any;

    expect(snapshot.focus.topUnreadEmail?.subject).toBe('Client important');
  });

  it('routes inbox summary requests to gmail.summary with category filters', async () => {
    const { service, llmChat } = makeService({
      googleScope: 'https://www.googleapis.com/auth/gmail.readonly',
    });

    const response = (await service.chat(
      'résume mes mails non lus de la boîte principale',
      'gmail-summary-primary',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.toolName).toBe('gmail.summary');
    expect(response.meta.toolArgs).toMatchObject({
      unreadOnly: true,
      category: 'primary',
      limit: 10,
    });
    expect(response.meta.toolArgs.query).toBeUndefined();
  });

  it('routes "mets ces mails en lu" to gmail.bulk_mark_read after a list', async () => {
    const { service, llmChat } = makeService({
      googleScope: 'https://www.googleapis.com/auth/gmail.modify',
      unreadMails: [
        {
          id: 'm1',
          threadId: 't1',
          subject: 'Message client',
          from: 'client@example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T08:55:00+02:00'),
          snippet: 'Peux-tu me rappeler ?',
          labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
          category: 'primary',
          unread: true,
        },
        {
          id: 'm2',
          threadId: 't2',
          subject: 'Promo printemps',
          from: 'news@shop.example.com',
          to: 'me@example.com',
          date: new Date('2026-04-17T09:05:00+02:00'),
          snippet: 'Jusqu a -40% aujourd hui.',
          labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
          category: 'promotions',
          unread: true,
        },
      ],
    });

    await service.chat('Liste mes emails', 'gmail-bulk-read');
    const response = (await service.chat(
      'mets ces mails en lu',
      'gmail-bulk-read',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.meta.requiresConfirmation).toBe(true);
    expect(response.meta.toolName).toBe('gmail.bulk_mark_read');
    expect(response.meta.toolArgs).toMatchObject({ unreadOnly: true });
  });

  it('hard-gates gmail tools when Gmail is not connected', async () => {
    const { service, llmChat, workflowStore } = makeService({
      googleScope: null,
    });

    const response = (await service.chat(
      'Liste mes emails',
      'gated-gmail',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.text).toContain('Gmail n’est pas connecté');
    expect(response.text).toContain('/auth/google?sessionId=gated-gmail');
    expect(response.meta.awaiting).toBe('connect_google');
    expect(response.meta.gatedTool).toBe('gmail.list');
    expect(workflowStore.observeSuccessfulTool).not.toHaveBeenCalled();
  });

  it('hard-gates calendar write tools when calendar.events scope is missing', async () => {
    const { service, llmChat, auditStore } = makeService({
      googleScope: 'https://www.googleapis.com/auth/calendar.readonly',
    });

    const response = (await service.chat(
      'Ajoute un rendez-vous demain à 18h',
      'gated-calendar-scope',
    )) as any;

    expect(llmChat).not.toHaveBeenCalled();
    expect(response.text).toContain('permissions Calendar');
    expect(response.text).toContain(
      '/auth/google?sessionId=gated-calendar-scope',
    );
    expect(response.pending_action).toBeUndefined();
    expect(response.meta.gatedTool).toBe('calendar.create');
    expect(auditStore.recordPending).not.toHaveBeenCalled();
  });

  it('does not consume pending actions when gated on confirmation', async () => {
    const { service, pending } = makeService({
      googleScope: null,
      pendingAction: {
        id: 'pending-1',
        call: {
          name: 'gmail.send',
          args: {
            to: 'pepper@example.com',
            subject: 'Test',
            text: 'Hello',
          },
        },
      },
    });

    const response = (await service.chat('oui', 'gated-pending')) as any;

    expect(response.text).toContain('/auth/google?sessionId=gated-pending');
    expect(response.text).toContain('Action en attente');
    expect(pending.consume).not.toHaveBeenCalled();
  });
});

describe('JarvisService disabled web capability', () => {
  it.each(['Cherche sur internet les actualités', 'Ouvre https://example.com'])(
    'returns a clear disabled response for %s without network access',
    async (message) => {
      const { service } = makeService();
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected fetch'));
      try {
        const response = await service.chat(message, 'disabled-web');
        expect(response.text).toContain('désactivées');
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    },
  );

  it('reports the disabled provider in capability metadata', async () => {
    const { service } = makeService();
    const snapshot = await service.status('disabled-web-status');
    expect(snapshot.providers.web).toBe('disabled');
  });
});
