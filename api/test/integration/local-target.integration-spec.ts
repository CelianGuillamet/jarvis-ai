import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';
import {
  freezeLocalTargets,
  readLocalTargets,
} from '../../src/commands/local-target';
import {
  prepareLocalTargets,
  runTool,
  type ToolContext,
  type ToolOnly,
} from '../../src/jarvis/tools/tools';

describe('Frozen local command targets', () => {
  const prisma = new PrismaService();
  const ownerId = 'local-target-owner';
  const foreignId = 'local-target-foreign';
  const pending = new PendingActionsService(prisma, new ConfigService());
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [ownerId, foreignId])
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function context(key: string): Promise<ToolContext> {
    const sessionId = await new ConversationService(prisma).resolve(
      ownerId,
      key,
    );
    return {
      sessionId,
      prisma: await prisma.forConversation(sessionId),
      simulation: false,
      tz: 'Europe/Paris',
      memory: {} as ToolContext['memory'],
      calendar: {} as ToolContext['calendar'],
      gmail: {} as ToolContext['gmail'],
      web: {} as ToolContext['web'],
      weather: {} as ToolContext['weather'],
    };
  }

  it.each(['todo', 'shopping'] as const)(
    'restricts %s clear-all to the approved IDs after new rows arrive',
    async (kind) => {
      const ctx = await context(`clear-${kind}`);
      const create = (id: string, owner: string) =>
        kind === 'todo'
          ? prisma.todo.create({ data: { id, ownerId: owner, text: id } })
          : prisma.shoppingItem.create({
              data: { id, ownerId: owner, text: id },
            });
      const approved = `${kind}-approved`;
      const late = `${kind}-late`;
      const foreign = `${kind}-foreign`;
      await create(approved, ownerId);
      await create(foreign, foreignId);
      const call: ToolOnly = {
        type: 'tool',
        name: kind === 'todo' ? 'todo.clear_all' : 'shopping.clear_all',
        args: {},
      };
      const targets = await prepareLocalTargets(ctx, call);
      if (!targets) throw new Error('Missing prepared targets');
      const id = await pending.create(
        ctx.sessionId,
        call,
        freezeLocalTargets(targets),
      );
      await create(late, ownerId);
      const restarted = new PendingActionsService(prisma, new ConfigService());
      const claim = await restarted.consume(id, ctx.sessionId);
      if (!claim) throw new Error('Missing claim');
      await runTool(
        {
          ...ctx,
          frozenLocalTargets: readLocalTargets(claim.call, claim.targets),
        },
        claim.call,
      );
      const rows =
        kind === 'todo'
          ? await prisma.todo.findMany({
              where: { id: { in: [approved, late, foreign] } },
            })
          : await prisma.shoppingItem.findMany({
              where: { id: { in: [approved, late, foreign] } },
            });
      expect(rows.map((row: { id: string }) => row.id).sort()).toEqual(
        [late, foreign].sort(),
      );
    },
  );

  it('deletes the approved note after its displayed reference changes', async () => {
    const ctx = await context('note-ref');
    const approved = await prisma.note.create({
      data: {
        ownerId,
        title: 'Approved note',
        text: 'Original',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await runTool(ctx, { type: 'tool', name: 'note.list', args: {} });
    const call: ToolOnly = {
      type: 'tool',
      name: 'note.delete',
      args: { query: '#1' },
    };
    const targets = await prepareLocalTargets(ctx, call);
    if (!targets) throw new Error('Missing targets');
    const id = await pending.create(
      ctx.sessionId,
      call,
      freezeLocalTargets(targets),
    );
    const late = await prisma.note.create({
      data: {
        ownerId,
        title: 'New note',
        text: 'Preserve',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    });
    await runTool(ctx, { type: 'tool', name: 'note.list', args: {} });
    const claim = await pending.consume(id, ctx.sessionId);
    if (!claim) throw new Error('Missing claim');
    await runTool(
      {
        ...ctx,
        frozenLocalTargets: readLocalTargets(claim.call, claim.targets),
      },
      claim.call,
    );
    expect(
      await prisma.note.findUnique({ where: { id: approved.id } }),
    ).toBeNull();
    expect(
      await prisma.note.findUnique({ where: { id: late.id } }),
    ).not.toBeNull();
  });

  it('rejects mismatched domains and legacy local proposals without snapshots', async () => {
    const ctx = await context('legacy');
    const call: ToolOnly = {
      type: 'tool',
      name: 'todo.delete',
      args: { query: '#1' },
    };
    expect(() =>
      readLocalTargets(call, [
        { kind: 'shopping', id: 'x', text: 'Wrong domain', bought: false },
      ]),
    ).toThrow('Propose à nouveau');
    const id = await pending.create(ctx.sessionId, call);
    expect(await pending.consume(id, ctx.sessionId)).toBeNull();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).state,
    ).toBe('cancelled');
  });
});
