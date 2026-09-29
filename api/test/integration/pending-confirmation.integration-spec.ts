import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';
import type { ToolOnly } from '../../src/jarvis/tools/tool-registry';

describe('Durable pending confirmations', () => {
  const prisma = new PrismaService();
  const pending = new PendingActionsService(prisma, new ConfigService());
  const call: ToolOnly = {
    type: 'tool',
    name: 'todo.delete',
    args: { query: 'fixture-target' },
  };
  let session: string;
  let foreign: string;
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ['pending-a', 'pending-b'])
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
    const conversations = new ConversationService(prisma);
    session = await conversations.resolve('pending-a', 'main');
    foreign = await conversations.resolve('pending-b', 'main');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('claims once concurrently and replays the persisted response after restart', async () => {
    const id = await pending.create(session, call);
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => pending.consume(id, session)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const restarted = new PendingActionsService(prisma, new ConfigService());
    expect(await restarted.consume(id, session)).toBeNull();
    expect((await restarted.replay(id, session))?.meta.commandState).toBe(
      'executing',
    );
    const response = {
      text: 'Fixture completed',
      choices: ['next'],
      meta: { sessionId: session, simulation: true },
    };
    await restarted.complete(id, session, response);
    expect(await pending.replay(id, session)).toEqual(response);
    expect(await pending.replay(id, foreign)).toBeNull();
    expect(await pending.consume(id, foreign)).toBeNull();
    expect(await pending.peek(id)).toBeNull();
    const row = await prisma.command.findUniqueOrThrow({
      where: { id },
      include: { transitions: true },
    });
    expect(row.state).toBe('completed');
    expect(row.transitions).toHaveLength(5);
    await expect(
      pending.complete(id, session, { text: 'replacement', meta: {} }),
    ).rejects.toThrow();
  });

  it('keeps resolved targets immutable across caller mutation, restart and claim', async () => {
    const target = {
      kind: 'calendar',
      provider: 'db',
      eventId: 'approved-event',
      calendarId: null,
      title: 'Approved',
      when: '2026-10-01T10:00:00.000Z',
      end: null,
    };
    const expected = { ...target };
    const creation = pending.create(
      session,
      { type: 'tool', name: 'calendar.delete', args: { ref: 1 } },
      [target],
    );
    target.eventId = 'changed-after-proposal';
    const id = await creation;
    const restarted = new PendingActionsService(prisma, new ConfigService());
    expect((await restarted.peek(id, session))?.targets).toEqual([expected]);
    expect((await restarted.consume(id, session))?.targets).toEqual([expected]);
    await expect(
      prisma.command.update({
        where: { id },
        data: { targets: [target], revision: { increment: 1 } },
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).targets,
    ).toEqual([expected]);
  });

  it('requires durable Gmail target snapshots and preserves bulk selection after restart', async () => {
    const gmailCall: ToolOnly = {
      type: 'tool',
      name: 'gmail.bulk_mark_read',
      args: { refs: [1, 2] },
    };
    const targets = ['mail-a', 'mail-b'].map((id) => ({
      kind: 'gmail',
      id,
      threadId: id,
      subject: id,
      from: 'sender@example.invalid',
      to: 'recipient@example.invalid',
      date: '2026-10-01T10:00:00Z',
      snippet: '',
      labels: ['UNREAD'],
      unread: true,
    }));
    const id = await pending.create(session, gmailCall, targets);
    const restarted = new PendingActionsService(prisma, new ConfigService());
    expect((await restarted.peek(id, session))?.targets).toEqual(targets);
    expect((await restarted.consume(id, session))?.targets).toEqual(targets);
    const legacy = await pending.create(session, gmailCall);
    expect(await restarted.peek(legacy, session)).toBeNull();
    expect(await restarted.consume(legacy, session)).toBeNull();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: legacy } })).state,
    ).toBe('cancelled');
  });

  it('preserves a claimed intent across crashes and subsequent proposals', async () => {
    const id = await pending.create(session, call);
    expect(await pending.consume(id, session)).not.toBeNull();
    await pending.create(session, call);
    expect(await pending.consume(id, session)).toBeNull();
    expect((await pending.replay(id, session))?.meta.commandState).toBe(
      'executing',
    );
    await pending.markUnknown(id, session);
    expect((await pending.replay(id, session))?.meta.commandState).toBe(
      'unknown',
    );
    expect(await pending.consume(id, session)).toBeNull();
    await pending.markUnknown(id, foreign);
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).state,
    ).toBe('unknown');
  });

  it('serializes cancellation versus claims and retains superseded proposals', async () => {
    const old = await pending.create(session, call);
    const id = await pending.create(session, call);
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: old } })).state,
    ).toBe('cancelled');
    const [claim] = await Promise.all([
      pending.consume(id, session),
      pending.cancelLatest(session),
    ]);
    const row = await prisma.command.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe(claim ? 'executing' : 'cancelled');
    expect(await pending.consume(id, session)).toBeNull();
  });

  it('expires a proposal atomically without deleting its intent', async () => {
    const fast = new PendingActionsService(
      prisma,
      new ConfigService({ PENDING_TTL_MINUTES: 0.01 }),
    );
    const id = await fast.create(session, call);
    await prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.8)`;
    expect(await fast.consume(id, session)).toBeNull();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).state,
    ).toBe('expired');
    expect(await fast.consume(id, session)).toBeNull();
    expect((await fast.replay(id, session))?.text).toContain('expirée');
  });

  it('uses the actual deadline after waiting for a conversation lock', async () => {
    const fast = new PendingActionsService(
      prisma,
      new ConfigService({ PENDING_TTL_MINUTES: 0.02 }),
    );
    const id = await fast.create(session, call);
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${session} FOR UPDATE`;
      acquired();
      await tx.$queryRaw`SELECT 1 FROM pg_sleep(1.4)`;
    });
    await locked;
    const claim = fast.consume(id, session);
    await holder;
    expect(await claim).toBeNull();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).state,
    ).toBe('expired');
  });
});
