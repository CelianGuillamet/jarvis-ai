import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CommandJournalService } from '../../src/commands/command-journal.service';
import { TokenCipher } from '../../src/google/token-cipher';

describe('Account deactivation execution fence', () => {
  const prisma = new PrismaService();
  const journal = new CommandJournalService(prisma);
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  const prepareErasure = (ownerId: string) =>
    prisma.$executeRaw`SELECT prepare_account_erasure(${ownerId})`;

  async function owner() {
    const id = `fence-${randomUUID()}`;
    await prisma.user.create({
      data: { id, name: 'Fence', email: `${id}@example.invalid` },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId: id, clientKey: 'main' },
    });
    return { ownerId: id, conversationId: conversation.id };
  }

  async function approved() {
    const scope = await owner();
    const command = await journal.propose({
      ...scope,
      requestId: 'request',
      toolName: 'todo.delete',
      toolVersion: '1',
      arguments: { id: 'target' },
      targets: [{ id: 'target' }],
      expiresAt: new Date(Date.now() + 600000),
    });
    await journal.advance(scope.ownerId, command.id, 0, 'waiting');
    await journal.approve(scope.ownerId, command.id, 1, command.digest);
    return { ...scope, command };
  }

  async function waitForBlockedCommand() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND wait_event_type = 'Lock' AND query LIKE '%Command%' AND pid <> pg_backend_pid()) AS blocked`;
      if (rows[0]?.blocked) return;
      await delay(10);
    }
    throw new Error('Execution claim did not reach the expected account lock');
  }

  it('rejects new proposals and execution claims after account deactivation', async () => {
    const { ownerId, conversationId, command } = await approved();
    await prepareErasure(ownerId);
    await expect(
      journal.advance(ownerId, command.id, 2, 'executing'),
    ).rejects.toThrow();
    await expect(
      journal.propose({
        ownerId,
        conversationId,
        requestId: 'another',
        toolName: 'todo.delete',
        toolVersion: '1',
        arguments: { id: 'target' },
        targets: [{ id: 'target' }],
        expiresAt: new Date(Date.now() + 600000),
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: command.id } }))
        .state,
    ).toBe('waiting');
    expect(await prisma.command.count({ where: { ownerId } })).toBe(1);
  });

  it('preserves executing or unknown commands until reconciliation', async () => {
    const { ownerId, command } = await approved();
    await journal.advance(ownerId, command.id, 2, 'executing');
    await expect(prepareErasure(ownerId)).rejects.toThrow();
    await journal.advance(
      ownerId,
      command.id,
      3,
      'unknown',
      'PROVIDER_TIMEOUT',
    );
    await expect(prepareErasure(ownerId)).rejects.toThrow();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .disabled,
    ).toBe(false);
    await journal.advance(
      ownerId,
      command.id,
      4,
      'completed',
      'RECONCILED_PROVIDER_RECEIPT',
    );
    await prepareErasure(ownerId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .disabled,
    ).toBe(true);
  });

  it('serializes a concurrently starting execution behind deactivation', async () => {
    const { ownerId, command } = await approved();
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const deactivation = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT prepare_account_erasure(${ownerId})`;
        locked();
        await gate;
      },
      { timeout: 15000 },
    );
    await ready;
    // Attach the rejection handler immediately, before releasing the SQL lock.
    const claim = journal.advance(ownerId, command.id, 2, 'executing').then(
      () => true,
      () => false,
    );
    try {
      await waitForBlockedCommand();
    } finally {
      release();
    }
    await deactivation;
    expect(await claim).toBe(false);
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: command.id } }))
        .state,
    ).toBe('waiting');
  });

  it('invalidates an old repeatable-read deactivation snapshot after execution starts', async () => {
    const { ownerId, command } = await approved();
    let resume!: () => void;
    let read!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      read = resolve;
    });
    const oldTransaction = prisma
      .$transaction(
        async (tx) => {
          await tx.user.findUniqueOrThrow({ where: { id: ownerId } });
          read();
          await gate;
          await tx.$executeRaw`SELECT prepare_account_erasure(${ownerId})`;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 15000,
        },
      )
      .then(
        () => true,
        () => false,
      );
    await ready;
    try {
      await journal.advance(ownerId, command.id, 2, 'executing');
    } finally {
      resume();
    }
    expect(await oldTransaction).toBe(false);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .disabled,
    ).toBe(false);
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: command.id } }))
        .state,
    ).toBe('executing');
  });

  it('protects Inbox sends and unfinished receipts, then permits deactivation after safe completion', async () => {
    const scope = await owner();
    const row = await prisma.inboxReplyOperation.create({
      data: { ...scope, requestId: 'reply', digest: 'digest', intent: {} },
    });
    await prisma.inboxReplyOperation.update({
      where: { id: row.id },
      data: { sendState: 'sending' },
    });
    await expect(prepareErasure(scope.ownerId)).rejects.toThrow();
    await prisma.inboxReplyOperation.update({
      where: { id: row.id },
      data: { sendState: 'sent', providerMessageId: 'receipt' },
    });
    await expect(prepareErasure(scope.ownerId)).rejects.toThrow();
    await prisma.inboxReplyOperation.update({
      where: { id: row.id },
      data: { labelsComplete: true, localComplete: true },
    });
    await prepareErasure(scope.ownerId);
    await expect(
      prisma.inboxReplyOperation.create({
        data: { ...scope, requestId: 'second', digest: 'digest', intent: {} },
      }),
    ).rejects.toThrow();
  });

  it('refuses a pending Inbox send claim on a disabled account', async () => {
    const scope = await owner();
    const row = await prisma.inboxReplyOperation.create({
      data: { ...scope, requestId: 'reply', digest: 'digest', intent: {} },
    });
    await prepareErasure(scope.ownerId);
    await expect(
      prisma.inboxReplyOperation.update({
        where: { id: row.id },
        data: { sendState: 'sending' },
      }),
    ).rejects.toThrow();
    expect(
      (
        await prisma.inboxReplyOperation.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).sendState,
    ).toBe('pending');
  });

  it('preserves unknown Inbox sends without blocking a different owner', async () => {
    const scope = await owner();
    const other = await owner();
    const row = await prisma.inboxReplyOperation.create({
      data: {
        ...scope,
        requestId: 'uncertain',
        digest: 'digest',
        intent: {},
      },
    });
    await prisma.inboxReplyOperation.update({
      where: { id: row.id },
      data: { sendState: 'sending' },
    });
    await prisma.inboxReplyOperation.update({
      where: { id: row.id },
      data: { sendState: 'unknown' },
    });
    await expect(prepareErasure(scope.ownerId)).rejects.toThrow();
    await prepareErasure(other.ownerId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: scope.ownerId } }))
        .disabled,
    ).toBe(false);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: other.ownerId } }))
        .disabled,
    ).toBe(true);
    expect(
      (
        await prisma.inboxReplyOperation.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).sendState,
    ).toBe('unknown');
  });
  it('keeps administrative revocation available while preserving an unresolved execution', async () => {
    const { ownerId, command } = await approved();
    await journal.advance(ownerId, command.id, 2, 'executing');
    await prisma.user.update({
      where: { id: ownerId },
      data: { disabled: true },
    });
    await expect(prepareErasure(ownerId)).rejects.toThrow();
    // Recording the outcome remains possible; disabling must not lose receipts.
    await journal.advance(
      ownerId,
      command.id,
      3,
      'completed',
      'RECORDED_AFTER_REVOCATION',
    );
    await prepareErasure(ownerId);
  });

  it('rejects delayed account-level writes without changing another owner', async () => {
    const scope = await owner();
    const other = await owner();
    const note = await prisma.note.create({
      data: { ownerId: scope.ownerId, text: 'Existing private note' },
    });
    await prepareErasure(scope.ownerId);
    await expect(
      prisma.note.update({
        where: { id: note.id },
        data: { text: 'Late update' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.todo.create({
        data: { ownerId: scope.ownerId, text: 'Late task' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.calendarEvent.create({
        data: { ownerId: scope.ownerId, title: 'Late event', when: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.shoppingItem.create({
        data: { ownerId: scope.ownerId, text: 'Late item' },
      }),
    ).rejects.toThrow();
    await prisma.note.create({
      data: { ownerId: other.ownerId, text: 'Other account remains writable' },
    });
    expect(
      (await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).text,
    ).toBe('Existing private note');
  });

  it('blocks a delayed human-profile flush and memory write after preflight', async () => {
    const scope = await owner();
    await prisma.jarvisHumanProfile.create({
      data: {
        sessionId: scope.conversationId,
        speechMode: 'tu',
        verbosity: 'normal',
      },
    });
    await prepareErasure(scope.ownerId);
    await expect(
      prisma.jarvisHumanProfile.upsert({
        where: { sessionId: scope.conversationId },
        create: {
          sessionId: scope.conversationId,
          speechMode: 'tu',
          verbosity: 'normal',
          preferredName: 'Late private name',
        },
        update: { preferredName: 'Late private name' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.jarvisMemoryFact.create({
        data: {
          sessionId: scope.conversationId,
          layer: 'preference',
          key: 'late',
          label: 'Late',
          value: 'Late memory',
        },
      }),
    ).rejects.toThrow();
    expect(
      (
        await prisma.jarvisHumanProfile.findUniqueOrThrow({
          where: { sessionId: scope.conversationId },
        })
      ).preferredName,
    ).toBeNull();
  });

  it('does not recreate legacy records after their conversation is gone', async () => {
    const scope = await owner();
    await prisma.conversation.delete({ where: { id: scope.conversationId } });
    await expect(
      prisma.jarvisHumanProfile.create({
        data: {
          sessionId: scope.conversationId,
          speechMode: 'tu',
          verbosity: 'normal',
        },
      }),
    ).rejects.toThrow();
    expect(
      await prisma.jarvisHumanProfile.count({
        where: { sessionId: scope.conversationId },
      }),
    ).toBe(0);
  });

  it('derives habit-log and credential write ownership through their parent records', async () => {
    const scope = await owner();
    const habit = await prisma.habit.create({
      data: { sessionId: scope.conversationId, name: 'Private habit' },
    });
    const integration = await prisma.integrationAccount.create({
      data: {
        ownerId: scope.ownerId,
        provider: 'google',
        providerSubject: randomUUID(),
      },
    });
    const id = randomUUID();
    const cipher = new TokenCipher(
      JSON.stringify({ fixture: Buffer.alloc(32, 41).toString('base64') }),
      'fixture',
    );
    const token = await prisma.googleOAuthToken.create({
      data: {
        id,
        integrationAccountId: integration.id,
        sessionId: scope.conversationId,
        refreshToken: cipher.encrypt('fixture-secret', `google:${id}:refresh`),
      },
    });
    await prepareErasure(scope.ownerId);
    await expect(
      prisma.habitLog.create({
        data: { habitId: habit.id, date: '2026-10-05' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.googleOAuthToken.update({
        where: { id: token.id },
        data: { generation: randomUUID() },
      }),
    ).rejects.toThrow();
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(
      0,
    );
  });
});
