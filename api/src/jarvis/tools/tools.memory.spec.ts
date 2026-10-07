import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { normalizeToolOnlyCall } from './tool-call';
import { TOOL_META } from './tool-registry';
import {
  dropFactFromMemoryLists,
  previewTool,
  resolveMemoryForget,
  runTool,
  type ToolContext,
} from './tools';

type Row = {
  id: string;
  ownerId: string;
  text: string;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
};

function fakeFacts(initial: Array<Partial<Row> & { text: string }> = []) {
  const rows: Row[] = initial.map((row, index) => ({
    id: `fact-${index + 1}`,
    ownerId: 'owner',
    origin: 'chat',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date(`2026-10-0${index + 1}T10:00:00Z`),
    ...row,
  }));
  const matches = (row: Row, where: Partial<Row> = {}) =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof Row] === value,
    );
  const delegate = {
    findMany: jest.fn(
      ({ where, take }: { where?: Partial<Row>; take?: number } = {}) =>
        Promise.resolve(
          rows
            .filter((row) => matches(row, where))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, take ?? rows.length),
        ),
    ),
    findFirst: jest.fn(({ where }: { where: Partial<Row> }) =>
      Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
    ),
    count: jest.fn(() => Promise.resolve(rows.length)),
    create: jest.fn(
      ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const row = {
          ...data,
          id: `fact-${rows.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.push(row);
        return Promise.resolve({ id: row.id });
      },
    ),
    deleteMany: jest.fn(({ where }: { where: Partial<Row> }) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1)
        if (matches(rows[i], where)) rows.splice(i, 1);
      return Promise.resolve({ count: before - rows.length });
    }),
  };
  return { rows, delegate };
}

describe('runTool personal memory tools', () => {
  let counter = 0;
  function makeCtx(initial: Array<Partial<Row> & { text: string }> = []) {
    const facts = fakeFacts(initial);
    const web: WebProvider = {
      name: 'mock',
      search: () => Promise.resolve([]),
      open: (url: string) => Promise.resolve({ url, content: '' }),
    };
    const calendar = {} as CalendarProvider;
    const gmail = {} as GmailProvider;
    counter += 1;
    const ctx = {
      prisma: {
        ownerId: 'owner',
        personalFact: facts.delegate,
      } as unknown as ToolContext['prisma'],
      memory: {} as ToolContext['memory'],
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: `memory-spec-${counter}`,
      calendar,
      web,
      weather: {} as ToolContext['weather'],
      gmail,
    } satisfies ToolContext;
    return { ctx, facts };
  }

  it('requires confirmation to remember or forget, but not to list', () => {
    expect(TOOL_META['memory.remember'].requiresConfirmation).toBe(true);
    expect(TOOL_META['memory.forget'].requiresConfirmation).toBe(true);
    expect(TOOL_META['memory.list'].requiresConfirmation).toBe(false);
  });

  it('stores an approved fact with chat provenance', async () => {
    const { ctx, facts } = makeCtx();
    const out = await runTool(ctx, {
      type: 'tool',
      name: 'memory.remember',
      args: { text: '  Je   préfère les réunions le matin ' },
    });
    expect(out).toContain('C’est noté');
    expect(facts.rows).toHaveLength(1);
    expect(facts.rows[0]).toMatchObject({
      ownerId: 'owner',
      text: 'Je préfère les réunions le matin',
      origin: 'chat',
    });
  });

  it('rejects control characters and oversized facts', async () => {
    const { ctx } = makeCtx();
    for (const text of ['a\u0000b', 'x'.repeat(281), '   ']) {
      await expect(
        runTool(ctx, { type: 'tool', name: 'memory.remember', args: { text } }),
      ).rejects.toThrow('Fait invalide');
    }
    expect(
      normalizeToolOnlyCall({
        name: 'memory.remember',
        args: { text: 'a\u0007' },
      }),
    ).toBeNull();
  });

  it('previews similar facts so contradictions are reviewed before approval', async () => {
    const { ctx } = makeCtx([{ text: 'Mon manager s’appelle Alice Martin' }]);
    const preview = await previewTool(ctx, {
      type: 'tool',
      name: 'memory.remember',
      args: { text: 'Mon manager s’appelle Bruno Martin' },
    });
    expect(preview).toContain('Fait à retenir');
    expect(preview).toContain('Alice Martin');
  });

  it('lists facts with provenance and resolves #N to a frozen id and text', async () => {
    const { ctx } = makeCtx([
      { text: 'Ancien fait' },
      { text: 'Projet principal : Mark 42', origin: 'settings' },
    ]);
    const list = await runTool(ctx, {
      type: 'tool',
      name: 'memory.list',
      args: {},
    });
    expect(list).toContain('#1 « Projet principal : Mark 42 » (Réglages');
    expect(list).toContain('#2 « Ancien fait » (chat');
    await expect(resolveMemoryForget(ctx, { ref: 1 })).resolves.toEqual({
      id: 'fact-2',
      text: 'Projet principal : Mark 42',
    });
    await expect(resolveMemoryForget(ctx, { ref: 9 })).resolves.toEqual({
      error: expect.stringContaining('Numéro invalide') as unknown as string,
    });
  });

  it('refuses ambiguous queries and resolves a unique one', async () => {
    const { ctx } = makeCtx([
      { text: 'Mon chat s’appelle Tom' },
      { text: 'Mon chat préfère le saumon' },
    ]);
    await expect(resolveMemoryForget(ctx, { query: 'chat' })).resolves.toEqual({
      error: expect.stringContaining('Plusieurs') as unknown as string,
    });
    await expect(
      resolveMemoryForget(ctx, { query: 'saumon' }),
    ).resolves.toEqual({
      id: 'fact-2',
      text: 'Mon chat préfère le saumon',
    });
  });

  it('forgets only the exact approved fact and reports changed facts', async () => {
    const { ctx, facts } = makeCtx([{ text: 'Fait à oublier' }]);
    await expect(
      runTool(ctx, {
        type: 'tool',
        name: 'memory.forget',
        args: { id: 'fact-1', text: 'Texte modifié entre-temps' },
      }),
    ).rejects.toThrow('a changé ou n’existe plus');
    expect(facts.rows).toHaveLength(1);
    await expect(
      runTool(ctx, { type: 'tool', name: 'memory.forget', args: { ref: 1 } }),
    ).rejects.toThrow('Propose à nouveau');
    const out = await runTool(ctx, {
      type: 'tool',
      name: 'memory.forget',
      args: { id: 'fact-1', text: 'Fait à oublier' },
    });
    expect(out).toContain('C’est oublié');
    expect(facts.rows).toHaveLength(0);
  });

  it('drops cached #N lists that reference a fact forgotten elsewhere', async () => {
    const { ctx } = makeCtx([{ text: 'Fait listé' }]);
    await runTool(ctx, { type: 'tool', name: 'memory.list', args: {} });
    dropFactFromMemoryLists('fact-1');
    await expect(resolveMemoryForget(ctx, { ref: 1 })).resolves.toEqual({
      error: expect.stringContaining(
        'pas de liste récente',
      ) as unknown as string,
    });
  });
});
