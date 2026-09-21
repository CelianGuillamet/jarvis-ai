import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool memory tools', () => {
  const tz = 'Europe/Paris';
  const sessionId = 'memory-tools-spec';

  function makeCtx(input?: {
    snapshotFacts?: Array<{
      layer:
        | 'identity'
        | 'preference'
        | 'project'
        | 'relationship'
        | 'workflow';
      key: string;
      label: string;
      value: string;
      confidence?: number;
    }>;
    searchResults?: Array<{
      layer:
        | 'identity'
        | 'preference'
        | 'project'
        | 'relationship'
        | 'workflow';
      key: string;
      label: string;
      value: string;
      confidence?: number;
    }>;
  }) {
    const web: WebProvider = {
      name: 'mock',
      search() {
        return Promise.resolve([]);
      },
      open(url: string) {
        return Promise.resolve({ url, content: '' });
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

    const facts = input?.snapshotFacts ?? [];
    const snapshot = {
      factsByLayer: {
        identity: facts
          .filter((f) => f.layer === 'identity')
          .map((f) => ({
            ...f,
            confidence: f.confidence ?? 0.9,
            source: 'user.explicit',
            updatedAt: '2026-04-18T09:00:00.000Z',
          })),
        preference: facts
          .filter((f) => f.layer === 'preference')
          .map((f) => ({
            ...f,
            confidence: f.confidence ?? 0.9,
            source: 'user.explicit',
            updatedAt: '2026-04-18T09:00:00.000Z',
          })),
        project: facts
          .filter((f) => f.layer === 'project')
          .map((f) => ({
            ...f,
            confidence: f.confidence ?? 0.9,
            source: 'user.explicit',
            updatedAt: '2026-04-18T09:00:00.000Z',
          })),
        relationship: facts
          .filter((f) => f.layer === 'relationship')
          .map((f) => ({
            ...f,
            confidence: f.confidence ?? 0.9,
            source: 'user.explicit',
            updatedAt: '2026-04-18T09:00:00.000Z',
          })),
        workflow: facts
          .filter((f) => f.layer === 'workflow')
          .map((f) => ({
            ...f,
            confidence: f.confidence ?? 0.9,
            source: 'user.explicit',
            updatedAt: '2026-04-18T09:00:00.000Z',
          })),
      },
      sessionSummary: null,
    };

    const memory = {
      getSnapshot: jest.fn().mockResolvedValue(snapshot),
      upsertFact: jest.fn().mockResolvedValue({
        layer: 'project',
        key: 'primary_project',
        label: 'Projet principal',
        value: 'Mark 42',
        confidence: 0.9,
        source: 'user.explicit',
        updatedAt: '2026-04-18T09:00:00.000Z',
      }),
      forgetFact: jest.fn().mockResolvedValue(true),
      searchFacts: jest.fn().mockResolvedValue(
        (input?.searchResults ?? []).map((f) => ({
          layer: f.layer,
          key: f.key,
          label: f.label,
          value: f.value,
          confidence: f.confidence ?? 0.8,
          source: 'user.explicit',
          updatedAt: '2026-04-18T09:00:00.000Z',
        })),
      ),
    };

    return {
      prisma: {} as unknown as ToolContext['prisma'],
      memory: memory as unknown as ToolContext['memory'],
      memoryMock: memory,
      simulation: false,
      tz,
      sessionId,
      calendar,
      web,
      weather: {} as unknown as ToolContext['weather'],
      gmail,
    };
  }

  it('lists facts and allows forgetting by ref', async () => {
    const ctx = makeCtx({
      snapshotFacts: [
        {
          layer: 'project',
          key: 'primary_project',
          label: 'Projet principal',
          value: 'Mark 42',
          confidence: 0.92,
        },
      ],
    });

    const listed = await runTool(ctx, {
      type: 'tool',
      name: 'memory.list',
      args: { layer: 'all', limit: 20 },
    });
    expect(listed).toContain('Mémoire Jarvis');
    expect(listed).toContain('[project:primary_project]');

    const forgotten = await runTool(ctx, {
      type: 'tool',
      name: 'memory.forget',
      args: { ref: 1 },
    });
    expect(forgotten).toContain('OK. Mémoire oubliée');
    expect(ctx.memoryMock.forgetFact).toHaveBeenCalledWith(sessionId, {
      layer: 'project',
      key: 'primary_project',
    });
  });

  it('sets a fact via memory.set', async () => {
    const ctx = makeCtx();

    const out = await runTool(ctx, {
      type: 'tool',
      name: 'memory.set',
      args: {
        layer: 'project',
        key: 'primary_project',
        label: 'Projet principal',
        value: 'Mark 42',
        confidence: 0.9,
        source: 'user.explicit',
      },
    });

    expect(out).toContain('OK. Mémoire mise à jour');
    expect(ctx.memoryMock.upsertFact).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        layer: 'project',
        key: 'primary_project',
      }),
    );
  });

  it('returns a disambiguation message when memory.forget query matches multiple facts', async () => {
    const ctx = makeCtx({
      searchResults: [
        {
          layer: 'identity',
          key: 'company',
          label: 'Entreprise',
          value: 'Stark Industries',
        },
        {
          layer: 'project',
          key: 'primary_project',
          label: 'Projet principal',
          value: 'Mark 42',
        },
      ],
    });

    const out = await runTool(ctx, {
      type: 'tool',
      name: 'memory.forget',
      args: { query: 'stark' },
    });

    expect(out).toContain('Plusieurs entrées correspondent');
    expect(ctx.memoryMock.forgetFact).not.toHaveBeenCalled();
  });
});
