import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { DbCalendarProvider } from '../../src/calendar/providers/db-calendar.provider';
import { JarvisSearchService } from '../../src/jarvis/services/jarvis-search.service';
import { JarvisGoalService } from '../../src/jarvis/services/jarvis-goal.service';
import { JarvisReminderService } from '../../src/jarvis/services/jarvis-reminder.service';
import {
  runTool,
  previewTool,
  type ToolContext,
} from '../../src/jarvis/tools/tools';
import { DEFERRED_CAPABILITY_MESSAGE } from '../../src/jarvis/tools/beta-capabilities';

describe('Two-user ownership against real PostgreSQL', () => {
  const prisma = new PrismaService();
  const conversations = new ConversationService(prisma);
  let a: string;
  let b: string;
  let dbA: Awaited<ReturnType<PrismaService['forConversation']>>;
  let dbB: typeof dbA;

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ['scope-a', 'scope-b']) {
      await prisma.user.create({
        data: {
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
    }
    a = await conversations.resolve('scope-a', 'same-browser-id');
    b = await conversations.resolve('scope-b', 'same-browser-id');
    dbA = await prisma.forConversation(a);
    dbB = await prisma.forConversation(b);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  function context(sessionId: string, db: typeof dbA): ToolContext {
    // These cases exercise domain tools only. Unused external dependencies are
    // absent so accidental provider access fails rather than reaching transport.
    return {
      prisma: db,
      sessionId,
      simulation: false,
      tz: 'UTC',
      calendar: new DbCalendarProvider(prisma),
    } as unknown as ToolContext;
  }

  it('resolves browser aliases per owner and rejects another account’s canonical conversation', async () => {
    expect(a).not.toBe(b);
    expect(a).not.toBe('same-browser-id');
    expect(await conversations.resolve('scope-a', 'same-browser-id')).toBe(a);
    expect(await conversations.resolve('scope-a', a)).toBe(a);
    await expect(conversations.resolve('scope-b', a)).rejects.toThrow(
      'Conversation introuvable',
    );
    await expect(
      conversations.resolve('scope-a', 'x'.repeat(129)),
    ).rejects.toThrow();
    await expect(
      prisma.forConversation('untrusted-legacy-id'),
    ).rejects.toThrow();
  });

  it('scopes unique IDs, OR searches, counts, aggregates, writes and bulk deletion', async () => {
    await dbA.todo.create({
      data: { id: 'owned-a', ownerId: dbA.ownerId, text: 'private A' },
    });
    await dbB.todo.create({
      data: { id: 'owned-b', ownerId: dbB.ownerId, text: 'private B' },
    });
    expect(await dbA.todo.findUnique({ where: { id: 'owned-b' } })).toBeNull();
    expect(await dbA.todo.count()).toBe(1);
    expect((await dbA.todo.aggregate({ _count: true }))._count).toBe(1);
    expect(
      (
        await dbA.todo.findMany({
          where: { OR: [{ id: 'owned-a' }, { id: 'owned-b' }] },
        })
      ).map((row) => row.id),
    ).toEqual(['owned-a']);
    await expect(
      dbA.todo.update({ where: { id: 'owned-b' }, data: { text: 'stolen' } }),
    ).rejects.toThrow();
    await expect(
      dbA.todo.delete({ where: { id: 'owned-b' } }),
    ).rejects.toThrow();
    await expect(
      dbA.todo.create({ data: { text: 'forged', ownerId: dbB.ownerId } }),
    ).rejects.toThrow('Ownership reassignment');
    await expect(
      dbA.todo.create({
        data: { text: 'nested', owner: { connect: { id: dbB.ownerId } } },
      }),
    ).rejects.toThrow('Ownership reassignment');
    await expect(
      dbA.todo.upsert({
        where: { id: 'owned-b' },
        create: { id: 'owned-b', ownerId: dbA.ownerId, text: 'stolen' },
        update: { text: 'stolen' },
      }),
    ).rejects.toThrow();
    expect((await dbA.todo.updateMany({ data: { done: true } })).count).toBe(1);
    expect((await dbA.todo.deleteMany({})).count).toBe(1);
    expect(
      (await dbB.todo.findUniqueOrThrow({ where: { id: 'owned-b' } })).text,
    ).toBe('private B');
  });

  it('scopes search and local calendar even with known foreign object IDs', async () => {
    await dbA.note.create({
      data: { ownerId: dbA.ownerId, text: 'needle own note' },
    });
    await dbB.note.create({
      data: {
        id: 'foreign-note',
        ownerId: dbB.ownerId,
        text: 'needle private B',
      },
    });
    await dbB.shoppingItem.create({
      data: { ownerId: dbB.ownerId, text: 'needle private shopping' },
    });
    const search = new JarvisSearchService(prisma);
    const results = await search.query(a, { query: 'needle' });
    expect(results.map((row) => row.snippet).join(' ')).not.toContain(
      'private',
    );
    expect(results).toHaveLength(1);
    const calendar = new DbCalendarProvider(prisma);
    await calendar.createEvent(a, 'A event', '2026-09-28T12:00:00Z', 'UTC');
    await calendar.createEvent(b, 'B event', '2026-09-28T12:00:00Z', 'UTC');
    const foreign = await dbB.calendarEvent.findFirstOrThrow();
    expect(
      (
        await calendar.listEventsInterval(
          a,
          '2026-09-28T00:00:00Z',
          '2026-09-29T00:00:00Z',
          'UTC',
          20,
        )
      ).map((row) => row.title),
    ).toEqual(['A event']);
    await expect(calendar.deleteEvent(a, 'db', foreign.id)).rejects.toThrow();
    await expect(
      calendar.updateEvent(
        a,
        'db',
        foreign.id,
        undefined,
        'stolen',
        '2026-09-29T12:00:00Z',
        'UTC',
      ),
    ).rejects.toThrow();
  });

  it('keeps cached references isolated and rejects undo without the command executor', async () => {
    const ctxA = context(a, dbA);
    const ctxB = context(b, dbB);
    await runTool(ctxA, {
      type: 'tool',
      name: 'todo.add',
      args: { text: 'cache-only-A' },
    });
    await runTool(ctxA, { type: 'tool', name: 'todo.list', args: {} });
    const preview = await previewTool(ctxB, {
      type: 'tool',
      name: 'todo.delete',
      args: { query: '#1' },
    });
    expect(preview).not.toContain('cache-only-A');
    await runTool(ctxB, { type: 'tool', name: 'undo.last_action', args: {} });
    expect(await dbA.todo.count({ where: { text: 'cache-only-A' } })).toBe(1);
    await runTool(ctxA, { type: 'tool', name: 'undo.last_action', args: {} });
    expect(await dbA.todo.count({ where: { text: 'cache-only-A' } })).toBe(1);
    expect(await dbB.todo.count({ where: { id: 'owned-b' } })).toBe(1);
  });

  it('guards reminder snooze, goal status and parent references by conversation', async () => {
    const reminders = new JarvisReminderService(prisma);
    const goals = new JarvisGoalService(prisma);
    const date = new Date('2026-10-01T00:00:00Z');
    const reminder = await reminders.create(b, {
      text: 'B reminder',
      triggerAt: date,
    });
    expect(reminder).not.toBeNull();
    expect(
      await reminders.snooze(a, reminder!.id, new Date('2026-10-03')),
    ).toBeNull();
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: reminder!.id } }))
        .triggerAt,
    ).toEqual(date);
    const goal = await goals.create(b, { title: 'B goal' });
    expect(goal).not.toBeNull();
    expect(await goals.updateStatus(a, goal!.id, 'done')).toBeNull();
    expect(
      await goals.create(a, { title: 'forged child', parentGoalId: goal!.id }),
    ).toBeNull();
    expect(
      (await prisma.jarvisGoal.findUniqueOrThrow({ where: { id: goal!.id } }))
        .status,
    ).toBe('active');
  });

  it('rejects deferred domains at execution and preview before touching providers', async () => {
    const ctx = context(a, dbA);
    const call = {
      type: 'tool',
      name: 'expense.add',
      args: { amount: 42, description: 'forbidden', category: 'test' },
    } as const;
    expect(await runTool(ctx, call)).toBe(DEFERRED_CAPABILITY_MESSAGE);
    expect(await previewTool(ctx, call)).toBe(DEFERRED_CAPABILITY_MESSAGE);
    expect(await prisma.expense.count({ where: { sessionId: a } })).toBe(0);
  });
});
