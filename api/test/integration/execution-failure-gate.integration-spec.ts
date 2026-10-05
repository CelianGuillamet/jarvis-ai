import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import {
  CommandExecutionService,
  type CommandExecution,
} from '../../src/commands/command-execution.service';
import { CommandCompensationService } from '../../src/commands/command-compensation.service';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';
import {
  InboxReplyOperationService,
  type InboxReplyIntent,
} from '../../src/inbox-zero/inbox-reply-operation.service';
import { buildGoogleConnectionStatus } from '../../src/google/google-scopes';
import type { ToolContext } from '../../src/jarvis/tools/tools';

describe('Phase 2 execution failure gate', () => {
  const prisma = new PrismaService();
  const executor = new CommandExecutionService(prisma);
  beforeAll(() => prisma.$connect());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  async function fixture(name: string) {
    const ownerId = `failure-gate-${name}`;
    await prisma.user.create({
      data: { id: ownerId, name, email: `${ownerId}@example.invalid` },
    });
    const conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'main',
    );
    const input: CommandExecution = {
      ownerId,
      conversationId,
      source: 'chat',
      toolName: 'todo.add',
      arguments: { text: 'Fixture' },
      targets: [],
      policy: {
        ownerId,
        simulation: false,
        capabilities: ['todo.add'],
        loadGoogleStatus: () =>
          Promise.resolve(buildGoogleConnectionStatus(undefined)),
      },
    };
    const reply: InboxReplyIntent = {
      ownerId,
      conversationId,
      requestId: 'one-attempt',
      accountId: 'fake-account',
      accountSubject: 'fake-subject',
      messageId: 'original',
      replyText: 'Bonjour',
      reviewedReply: {
        to: 'sender@example.invalid',
        subject: 'Re: Test question',
      },
      archiveAfter: true,
    };
    return { ownerId, conversationId, input, reply };
  }

  async function afterRestart(work: (fresh: PrismaService) => Promise<void>) {
    // A new client/connection pool and service objects cannot reuse in-memory state.
    const fresh = new PrismaService();
    await fresh.$connect();
    try {
      await work(fresh);
    } finally {
      await fresh.$disconnect();
    }
  }

  function replySteps() {
    return {
      send: jest.fn(() =>
        Promise.resolve({ messageId: 'receipt', threadId: 'thread' }),
      ),
      labels: jest.fn(() => Promise.resolve()),
      local: jest.fn(() => Promise.resolve()),
    };
  }

  it('does not start an effect when durable intent storage fails', async () => {
    const f = await fixture('intent-outage');
    jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('Intent storage unavailable'));
    const effect = jest.fn(() => Promise.resolve('Effect'));
    await expect(
      executor.execute(f.input, effect, () => 'Simulation'),
    ).rejects.toThrow('Intent storage');
    expect(effect).not.toHaveBeenCalled();
    expect(await prisma.command.count({ where: { ownerId: f.ownerId } })).toBe(
      0,
    );
  });

  it.each([false, true])(
    'keeps post-effect uncertainty visible after restart (uncertainty write also fails=%s)',
    async (bothWritesFail) => {
      const f = await fixture(`outcome-${bothWritesFail}`);
      const write = jest
        .spyOn(prisma.command, 'updateMany')
        .mockRejectedValueOnce(new Error('Completion storage unavailable'));
      if (bothWritesFail)
        write.mockRejectedValueOnce(
          new Error('Uncertainty storage unavailable'),
        );
      const effect = jest.fn(() => Promise.resolve('Effect accepted'));
      await expect(
        executor.execute(f.input, effect, () => 'Simulation'),
      ).rejects.toThrow('Completion storage');
      write.mockRestore();
      const row = await prisma.command.findFirstOrThrow({
        where: { ownerId: f.ownerId },
      });
      expect(effect).toHaveBeenCalledTimes(1);
      expect(row.approvedDigest).toBe(row.digest);
      await afterRestart(async (fresh) => {
        const pending = new PendingActionsService(fresh, new ConfigService());
        expect(await pending.consume(row.id, f.conversationId)).toBeNull();
        const replay = await pending.replay(row.id, f.conversationId);
        expect(replay?.meta.commandState).toBe(
          bothWritesFail ? 'executing' : 'unknown',
        );
        expect(replay?.text).toContain('doit être vérifié');
        expect(replay?.text).toContain('ne sera pas relancée');
        // A new proposal must not hide the old operation when addressed by ID.
        await pending.create(f.conversationId, {
          type: 'tool',
          name: 'todo.add',
          args: { text: 'Next' },
        });
        expect(await pending.replay(row.id, f.conversationId)).toEqual(replay);
        expect(await pending.consume(row.id, f.conversationId)).toBeNull();
      });
      expect(effect).toHaveBeenCalledTimes(1);
    },
  );

  it('recovers a pre-send claim outage without duplicating an eventual completed send', async () => {
    const f = await fixture('pre-send-outage');
    const steps = replySteps();
    jest
      .spyOn(prisma.inboxReplyOperation, 'updateMany')
      .mockRejectedValueOnce(new Error('Claim storage unavailable'));
    await expect(
      new InboxReplyOperationService(prisma).execute(f.reply, steps),
    ).rejects.toThrow('Claim storage');
    expect(steps.send).not.toHaveBeenCalled();
    await afterRestart(async (fresh) => {
      const service = new InboxReplyOperationService(fresh);
      expect((await service.execute(f.reply, steps)).ok).toBe(true);
      expect((await service.execute(f.reply, steps)).ok).toBe(true);
    });
    expect(steps.send).toHaveBeenCalledTimes(1);
    expect(steps.labels).toHaveBeenCalledTimes(1);
    expect(steps.local).toHaveBeenCalledTimes(1);
  });

  it('never resends after receipt and uncertainty persistence both fail', async () => {
    const f = await fixture('post-send-outage');
    const steps = replySteps();
    const failing = prisma.$extends({
      query: {
        inboxReplyOperation: {
          update: () => {
            throw new Error('Receipt storage unavailable');
          },
          updateMany: ({ args, query }) => {
            if (args.data.sendState === 'unknown')
              throw new Error('Uncertainty storage unavailable');
            return query(args);
          },
        },
      },
    });
    await expect(
      new InboxReplyOperationService(
        failing as unknown as PrismaService,
      ).execute(f.reply, steps),
    ).rejects.toThrow('Uncertainty storage');
    expect(
      (
        await prisma.inboxReplyOperation.findFirstOrThrow({
          where: { ownerId: f.ownerId },
        })
      ).sendState,
    ).toBe('sending');
    await afterRestart(async (fresh) => {
      const result = await new InboxReplyOperationService(fresh).execute(
        f.reply,
        steps,
      );
      expect(result).toMatchObject({
        ok: false,
        steps: { send: 'unknown', labels: 'pending', local: 'pending' },
        providerReference: null,
      });
    });
    expect(steps.send).toHaveBeenCalledTimes(1);
    expect(steps.labels).not.toHaveBeenCalled();
    expect(steps.local).not.toHaveBeenCalled();
  });

  it('rechecks revoked permissions after approval and before provider execution', async () => {
    const f = await fixture('revoked');
    await prisma.integrationAccount.create({
      data: {
        ownerId: f.ownerId,
        provider: 'google',
        providerSubject: 'failure-revoked',
      },
    });
    const pending = new PendingActionsService(prisma, new ConfigService());
    const call = {
      type: 'tool' as const,
      name: 'gmail.send' as const,
      args: {
        to: 'recipient@example.invalid',
        subject: 'Fixture',
        text: 'Fixture',
      },
    };
    let grantedScopes = 'https://www.googleapis.com/auth/gmail.send';
    const loadGoogleStatus = jest.fn(() =>
      Promise.resolve(buildGoogleConnectionStatus(grantedScopes)),
    );
    expect((await loadGoogleStatus()).gmailConnected).toBe(true);
    const id = await pending.create(f.conversationId, call);
    expect(await pending.consume(id, f.conversationId)).not.toBeNull();
    grantedScopes = ''; // Revocation occurs after the durable approval/claim.

    const send = jest.fn(() => Promise.resolve('Sent'));
    await expect(
      executor.execute(
        {
          ...f.input,
          source: 'confirmation',
          commandId: id,
          toolName: call.name,
          arguments: call.args,
          policy: {
            ...f.input.policy,
            capabilities: ['gmail.send'],
            loadGoogleStatus,
          },
        },
        send,
        () => 'Simulation',
      ),
    ).rejects.toThrow('GMAIL_NOT_CONNECTED');
    expect(loadGoogleStatus).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
    // The adapter records uncertainty; neither this claim nor a retry can send.
    await pending.markUnknown(id, f.conversationId);
    await afterRestart(async (fresh) => {
      const restarted = new PendingActionsService(fresh, new ConfigService());
      expect(await restarted.consume(id, f.conversationId)).toBeNull();
      expect(
        (await restarted.replay(id, f.conversationId))?.meta.commandState,
      ).toBe('unknown');
    });
  });

  it('preserves an applied undo across a response-write failure and new connection', async () => {
    const f = await fixture('undo-response-outage');
    const compensation = new CommandCompensationService(prisma);
    const context = {
      prisma: await prisma.forConversation(f.conversationId),
      sessionId: f.conversationId,
      simulation: false,
      tz: 'UTC',
    } as unknown as ToolContext;
    await executor.execute(
      f.input,
      (id) =>
        compensation.record(
          context,
          { type: 'tool', name: 'todo.add', args: { text: 'Undo fixture' } },
          id,
        ),
      () => 'Simulation',
    );
    const preview = await compensation.preview(f.ownerId, f.conversationId);
    const targets = [{ kind: 'compensation', ...preview }];
    const pending = new PendingActionsService(prisma, new ConfigService());
    const id = await pending.create(
      f.conversationId,
      { type: 'tool', name: 'undo.last_action', args: {} },
      targets,
    );
    expect(await pending.consume(id, f.conversationId)).not.toBeNull();
    const text = await executor.execute(
      {
        ...f.input,
        source: 'confirmation',
        commandId: id,
        toolName: 'undo.last_action',
        targets,
        policy: { ...f.input.policy, capabilities: ['undo.last_action'] },
      },
      (executingId) =>
        compensation.apply(f.ownerId, f.conversationId, preview, executingId),
      () => 'Simulation',
    );
    jest
      .spyOn(prisma.command, 'updateMany')
      .mockRejectedValueOnce(new Error('Response storage unavailable'));
    await expect(
      pending.complete(id, f.conversationId, { text, meta: {} }),
    ).rejects.toThrow('Response storage');
    await afterRestart(async (fresh) => {
      const restarted = new PendingActionsService(fresh, new ConfigService());
      expect(await restarted.consume(id, f.conversationId)).toBeNull();
      expect(
        (await restarted.replay(id, f.conversationId))?.meta.commandState,
      ).toBe('executing');
      expect(
        (
          await fresh.commandCompensation.findUniqueOrThrow({
            where: { commandId: preview.commandId },
          })
        ).consumedAt,
      ).not.toBeNull();
      expect(await fresh.todo.count({ where: { ownerId: f.ownerId } })).toBe(0);
      await expect(
        new CommandCompensationService(fresh).preview(
          f.ownerId,
          f.conversationId,
        ),
      ).rejects.toThrow();
    });
  });
});
