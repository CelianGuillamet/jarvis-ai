import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { ConfigService } from '@nestjs/config';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';
import {
  CommandExecutionService,
  type CommandExecution,
} from '../../src/commands/command-execution.service';
import {
  CommandCompensationService,
  type UndoPreview,
} from '../../src/commands/command-compensation.service';
import {
  prepareLocalTargets,
  type ToolContext,
} from '../../src/jarvis/tools/tools';
import type { ToolOnly } from '../../src/jarvis/tools/tool-registry';
import { freezeLocalTargets } from '../../src/commands/local-target';

describe('Durable, owned and atomic local compensation', () => {
  const prisma = new PrismaService();
  const executor = new CommandExecutionService(prisma);
  const compensation = new CommandCompensationService(prisma);
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  async function fixture(name: string) {
    const ownerId = `compensation-${name}`;
    await prisma.user.create({
      data: { id: ownerId, name, email: `${ownerId}@example.invalid` },
    });
    const conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'main',
    );
    const context = {
      prisma: await prisma.forConversation(conversationId),
      sessionId: conversationId,
      simulation: false,
      tz: 'UTC',
    } as unknown as ToolContext;
    const input = (
      toolName: ToolOnly['name'],
      targets: CommandExecution['targets'] = [],
    ): CommandExecution => ({
      ownerId,
      conversationId,
      source: 'chat',
      toolName,
      arguments: {},
      targets,
      policy: {
        ownerId,
        simulation: false,
        capabilities: [toolName],
        loadGoogleStatus: () =>
          Promise.resolve({
            connected: true,
            gmailConnected: true,
            calendarConnected: true,
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
          }),
      },
    });
    const execute = async (call: ToolOnly) => {
      const local = await prepareLocalTargets(context, call);
      return executor.execute(
        input(call.name, local ? freezeLocalTargets(local) : []),
        (id) =>
          compensation.record(
            { ...context, frozenLocalTargets: local },
            call,
            id,
          ),
        () => 'Simulation',
      );
    };
    const undo = (preview: UndoPreview, service = compensation) =>
      executor.execute(
        input('undo.last_action', [{ kind: 'compensation', ...preview }]),
        (id) => service.apply(ownerId, conversationId, preview, id),
        () => 'Simulation',
      );
    return {
      ownerId,
      conversationId,
      context,
      input,
      execute,
      undo,
      preview: () => compensation.preview(ownerId, conversationId),
    };
  }

  it.each(['todo', 'shopping', 'note'] as const)(
    'restores %s additions after a service restart exactly once',
    async (model) => {
      const f = await fixture(`add-${model}`);
      await f.execute({
        type: 'tool',
        name: `${model}.add`,
        args: { text: 'Created' },
      });
      const preview = await f.preview();
      const fresh = new CommandCompensationService(prisma);
      expect(await f.undo(preview, fresh)).toContain('Retour arrière effectué');
      const where = { ownerId: f.ownerId };
      const count =
        model === 'todo'
          ? await prisma.todo.count({ where })
          : model === 'shopping'
            ? await prisma.shoppingItem.count({ where })
            : await prisma.note.count({ where });
      expect(count).toBe(0);
      await expect(f.undo(preview)).rejects.toThrow();
      expect(
        (
          await prisma.commandCompensation.findUnique({
            where: { commandId: preview.commandId },
          })
        )?.consumedAt,
      ).toBeInstanceOf(Date);
    },
  );

  it('restores updates and deletions with original values and dates', async () => {
    const f = await fixture('restore');
    const original = await prisma.todo.create({
      data: { ownerId: f.ownerId, text: 'Original' },
    });
    await f.execute({
      type: 'tool',
      name: 'todo.done',
      args: { query: 'Original' },
    });
    await f.undo(await f.preview());
    expect(
      await prisma.todo.findUnique({ where: { id: original.id } }),
    ).toEqual(original);
    await f.execute({
      type: 'tool',
      name: 'todo.delete',
      args: { query: 'Original' },
    });
    await f.undo(await f.preview());
    expect(
      await prisma.todo.findUnique({ where: { id: original.id } }),
    ).toEqual(original);
  });

  it('rejects changed post-state and rolls back the entire bulk inverse', async () => {
    const f = await fixture('stale-bulk');
    await prisma.todo.createMany({
      data: [
        { id: 'undo-bulk-a', ownerId: f.ownerId, text: 'A' },
        { id: 'undo-bulk-b', ownerId: f.ownerId, text: 'B' },
      ],
    });
    await f.execute({ type: 'tool', name: 'todo.done_all', args: {} });
    const preview = await f.preview();
    await prisma.todo.update({
      where: { id: 'undo-bulk-b' },
      data: { text: 'User edit' },
    });
    await expect(f.undo(preview)).rejects.toThrow('ont changé');
    expect(
      await prisma.todo.count({ where: { ownerId: f.ownerId, done: true } }),
    ).toBe(2);
    expect(
      await prisma.commandCompensation.findUnique({
        where: { commandId: preview.commandId },
      }),
    ).toMatchObject({ consumedAt: null });
  });

  it.each(['note', 'shopping'] as const)(
    'restores %s updates and deleted records',
    async (model) => {
      const f = await fixture(`restore-${model}`);
      const data = { ownerId: f.ownerId, text: 'Original' };
      const original =
        model === 'note'
          ? await prisma.note.create({ data })
          : await prisma.shoppingItem.create({ data });
      const read = () =>
        model === 'note'
          ? prisma.note.findUnique({ where: { id: original.id } })
          : prisma.shoppingItem.findUnique({ where: { id: original.id } });
      await f.execute({
        type: 'tool',
        name: `${model}.update`,
        args: { query: 'Original', text: 'Updated' },
      });
      await f.undo(await f.preview());
      expect(await read()).toEqual(original);
      await f.execute({
        type: 'tool',
        name: `${model}.delete`,
        args: { query: 'Original' },
      });
      await f.undo(await f.preview());
      expect(await read()).toEqual(original);
    },
  );

  it('rechecks preview identity after a newer local command and rejects foreign owners', async () => {
    const a = await fixture('owner-a');
    const b = await fixture('owner-b');
    await a.execute({ type: 'tool', name: 'todo.add', args: { text: 'A' } });
    const old = await a.preview();
    await expect(b.undo(old)).rejects.toThrow();
    await a.execute({
      type: 'tool',
      name: 'note.add',
      args: { text: 'Newer' },
    });
    await expect(a.undo(old)).rejects.toThrow('ont changé');
    expect(await prisma.todo.count({ where: { ownerId: a.ownerId } })).toBe(1);
  });

  it.each([false, true])(
    'never undoes an older local action after an email send (unknown=%s)',
    async (unknown) => {
      const f = await fixture(`send-${unknown}`);
      await f.execute({
        type: 'tool',
        name: 'todo.add',
        args: { text: 'Keep' },
      });
      const old = await f.preview();
      const send = executor.execute(
        f.input('gmail.send'),
        () => {
          if (unknown) throw new Error('Provider timeout after acceptance');
          return Promise.resolve('Sent');
        },
        () => 'Simulation',
      );
      if (unknown) await expect(send).rejects.toThrow('timeout');
      else await send;
      await expect(f.preview()).rejects.toThrow('ne peut pas être rappelé');
      await expect(f.undo(old)).rejects.toThrow();
      expect(await prisma.todo.count({ where: { ownerId: f.ownerId } })).toBe(
        1,
      );
    },
  );

  it('allows only one concurrent inverse and cannot reset or replace its durable record', async () => {
    const f = await fixture('concurrent');
    await f.execute({
      type: 'tool',
      name: 'shopping.add',
      args: { text: 'Milk' },
    });
    const preview = await f.preview();
    const results = await Promise.allSettled([
      f.undo(preview),
      f.undo(preview),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.shoppingItem.count({ where: { ownerId: f.ownerId } }),
    ).toBe(0);
    await expect(
      prisma.commandCompensation.update({
        where: { commandId: preview.commandId },
        data: { consumedAt: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.commandCompensation.update({
        where: { commandId: preview.commandId },
        data: { changes: [] },
      }),
    ).rejects.toThrow();
  });

  it('rejects a stale forward preview before creating any effect or compensation', async () => {
    const f = await fixture('stale-forward');
    const row = await prisma.todo.create({
      data: { ownerId: f.ownerId, text: 'Before' },
    });
    const call: ToolOnly = {
      type: 'tool',
      name: 'todo.delete',
      args: { query: 'Before' },
    };
    const frozenLocalTargets = await prepareLocalTargets(f.context, call);
    await prisma.todo.update({
      where: { id: row.id },
      data: { text: 'Edited' },
    });
    await expect(
      executor.execute(
        f.input(call.name),
        (id) =>
          compensation.record({ ...f.context, frozenLocalTargets }, call, id),
        () => 'Simulation',
      ),
    ).rejects.toThrow('ont changé');
    expect(
      await prisma.todo.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ text: 'Edited' });
    expect(
      await prisma.commandCompensation.count({
        where: { command: { ownerId: f.ownerId } },
      }),
    ).toBe(0);
  });

  it('does not overwrite another owner who occupies a deleted record ID', async () => {
    const a = await fixture('occupied-a');
    const b = await fixture('occupied-b');
    const row = await prisma.note.create({
      data: { ownerId: a.ownerId, text: 'Original' },
    });
    await a.execute({
      type: 'tool',
      name: 'note.delete',
      args: { query: 'Original' },
    });
    const preview = await a.preview();
    await prisma.note.create({
      data: { id: row.id, ownerId: b.ownerId, text: 'Foreign' },
    });
    await expect(a.undo(preview)).rejects.toThrow();
    expect(
      await prisma.note.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ ownerId: b.ownerId, text: 'Foreign' });
  });

  it('rolls back local effects when compensation persistence fails', async () => {
    const f = await fixture('record-failure');
    const failing = prisma.$extends({
      query: {
        commandCompensation: {
          create: () => {
            throw new Error('Injected compensation write failure');
          },
        },
      },
    });
    const service = new CommandCompensationService(
      failing as unknown as PrismaService,
    );
    await expect(
      executor.execute(
        f.input('todo.add'),
        (id) =>
          service.record(
            f.context,
            {
              type: 'tool',
              name: 'todo.add',
              args: { text: 'Must roll back' },
            },
            id,
          ),
        () => 'Simulation',
      ),
    ).rejects.toThrow('Injected');
    expect(await prisma.todo.count({ where: { ownerId: f.ownerId } })).toBe(0);
    expect(
      await prisma.commandCompensation.count({
        where: { command: { ownerId: f.ownerId } },
      }),
    ).toBe(0);
  });

  it('does not let an older delayed completion hide a newer email send', async () => {
    const f = await fixture('delayed-completion');
    let signalRecorded!: () => void;
    let release!: () => void;
    const recorded = new Promise<void>((resolve) => {
      signalRecorded = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = executor.execute(
      f.input('todo.add'),
      async (id) => {
        const result = await compensation.record(
          f.context,
          { type: 'tool', name: 'todo.add', args: { text: 'Keep' } },
          id,
        );
        signalRecorded();
        await delayed;
        return result;
      },
      () => 'Simulation',
    );
    await recorded;
    await executor.execute(
      f.input('gmail.send'),
      () => Promise.resolve('Sent'),
      () => 'Simulation',
    );
    release();
    await first;
    await expect(f.preview()).rejects.toThrow('ne peut pas être rappelé');
    expect(await prisma.todo.count({ where: { ownerId: f.ownerId } })).toBe(1);
  });

  it('rolls back earlier restorations when a later restore hits an occupied ID', async () => {
    const f = await fixture('restore-rollback');
    const other = await fixture('restore-occupant');
    await prisma.todo.createMany({
      data: ['One', 'Two'].map((text) => ({ ownerId: f.ownerId, text })),
    });
    await f.execute({ type: 'tool', name: 'todo.clear_all', args: {} });
    const preview = await f.preview();
    const record = await prisma.commandCompensation.findUniqueOrThrow({
      where: { commandId: preview.commandId },
    });
    const changes = record.changes as Array<{
      inverse: { row: { id: string } };
    }>;
    const occupiedId = changes[changes.length - 1].inverse.row.id;
    await prisma.todo.create({
      data: { id: occupiedId, ownerId: other.ownerId, text: 'Occupied' },
    });
    await expect(f.undo(preview)).rejects.toThrow();
    expect(await prisma.todo.count({ where: { ownerId: f.ownerId } })).toBe(0);
    expect(
      await prisma.commandCompensation.findUnique({
        where: { commandId: preview.commandId },
      }),
    ).toMatchObject({ consumedAt: null });
  });

  it('binds undo to the confirmed command and replays its stored response', async () => {
    const f = await fixture('confirmation');
    const pending = new PendingActionsService(prisma, new ConfigService());
    await f.execute({
      type: 'tool',
      name: 'note.add',
      args: { text: 'Confirm undo' },
    });
    const preview = await f.preview();
    const targets = [{ kind: 'compensation', ...preview }];
    const id = await pending.create(
      f.conversationId,
      { type: 'tool', name: 'undo.last_action', args: {} },
      targets,
    );
    expect(await prisma.note.count({ where: { ownerId: f.ownerId } })).toBe(1);
    const claimed = await pending.consume(id, f.conversationId);
    expect(claimed).toBeTruthy();
    const result = await executor.execute(
      {
        ...f.input('undo.last_action', targets),
        source: 'confirmation',
        commandId: id,
      },
      (executingId) =>
        compensation.apply(f.ownerId, f.conversationId, preview, executingId),
      () => 'Simulation',
    );
    await pending.complete(id, f.conversationId, { text: result, meta: {} });
    expect(await pending.consume(id, f.conversationId)).toBeNull();
    expect(await pending.replayLatest(f.conversationId)).toMatchObject({
      text: result,
    });
    expect(await prisma.note.count({ where: { ownerId: f.ownerId } })).toBe(0);
  });
});
