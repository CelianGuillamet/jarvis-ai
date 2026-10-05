import { createHash } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import {
  InboxReplyOperationService,
  type InboxReplyIntent,
} from '../../src/inbox-zero/inbox-reply-operation.service';

describe('Durable Inbox reply steps', () => {
  const prisma = new PrismaService();
  const service = new InboxReplyOperationService(prisma);
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  async function fixture(name: string): Promise<InboxReplyIntent> {
    const ownerId = `reply-${name}`;
    await prisma.user.create({
      data: { id: ownerId, name, email: `${ownerId}@example.invalid` },
    });
    const conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'main',
    );
    return {
      ownerId,
      conversationId,
      requestId: 'attempt-1',
      accountId: 'account',
      accountSubject: 'subject',
      messageId: 'message',
      replyText: 'Bonjour',
      reviewedReply: { to: 'sender@example.test', subject: 'Re: Subject' },
      archiveAfter: true,
    };
  }
  function callbacks() {
    return {
      send: jest.fn(() =>
        Promise.resolve({ messageId: 'sent-1', threadId: 'thread-1' }),
      ),
      labels: jest.fn(() => Promise.resolve()),
      local: jest.fn(() => Promise.resolve()),
    };
  }

  it.each(['labels', 'local'] as const)(
    'resumes only unfinished safe steps after a %s failure and service restart',
    async (step) => {
      const input = await fixture(step);
      const steps = callbacks();
      steps[step].mockRejectedValueOnce(new Error('injected failure'));
      const first = await service.execute(input, steps);
      expect(first.ok).toBe(false);
      expect(first.outcome).toBe('partial');
      expect(first.steps.send).toBe('completed');
      expect(first.providerReference?.messageId).toBe('sent-1');
      const second = await new InboxReplyOperationService(prisma).execute(
        input,
        steps,
      );
      expect(second.ok).toBe(true);
      expect(second.outcome).toBe('completed');
      expect(steps.send).toHaveBeenCalledTimes(1);
      expect(steps.labels).toHaveBeenCalledTimes(step === 'labels' ? 2 : 1);
      expect(steps.local).toHaveBeenCalledTimes(step === 'local' ? 2 : 1);
      await service.execute(input, steps);
      expect(steps.send).toHaveBeenCalledTimes(1);
      expect(steps.local).toHaveBeenCalledTimes(step === 'local' ? 2 : 1);
    },
  );

  it('never resends an uncertain send and never runs its follow-up steps', async () => {
    const input = await fixture('timeout');
    const steps = callbacks();
    steps.send.mockRejectedValueOnce(new Error('timeout'));
    expect(await service.execute(input, steps)).toMatchObject({
      outcome: 'unknown',
      steps: { send: 'unknown' },
    });
    expect(
      (await new InboxReplyOperationService(prisma).execute(input, steps)).steps
        .send,
    ).toBe('unknown');
    expect(steps.send).toHaveBeenCalledTimes(1);
    expect(steps.labels).not.toHaveBeenCalled();
    expect(steps.local).not.toHaveBeenCalled();
  });

  it('claims a concurrent send once and exposes the active claim conservatively', async () => {
    const input = await fixture('concurrent');
    const steps = callbacks();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    steps.send.mockImplementationOnce(async () => {
      entered();
      await hold;
      return { messageId: 'sent-1', threadId: 'thread-1' };
    });
    const first = service.execute(input, steps);
    await started;
    try {
      expect(await service.execute(input, steps)).toMatchObject({
        outcome: 'unknown',
        steps: { send: 'unknown' },
      });
      expect(steps.send).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    expect((await first).ok).toBe(true);
  });

  it('never resends when receipt persistence fails after provider success', async () => {
    const input = await fixture('receipt-write');
    const steps = callbacks();
    const write = jest
      .spyOn(prisma.inboxReplyOperation, 'update')
      .mockRejectedValueOnce(new Error('Storage unavailable'));
    try {
      expect(await service.execute(input, steps)).toMatchObject({
        outcome: 'unknown',
        steps: { send: 'unknown' },
      });
    } finally {
      write.mockRestore();
    }
    expect(
      (await new InboxReplyOperationService(prisma).execute(input, steps)).steps
        .send,
    ).toBe('unknown');
    expect(steps.send).toHaveBeenCalledTimes(1);
    expect(steps.labels).not.toHaveBeenCalled();
  });

  it('resumes a historical sent receipt but never authorizes a historical pending send', async () => {
    for (const sendState of ['sent', 'pending']) {
      const input = await fixture(`historical-${sendState}`);
      const intent = {
        conversationId: input.conversationId,
        accountId: input.accountId,
        accountSubject: input.accountSubject,
        messageId: input.messageId,
        replyText: input.replyText,
        archiveAfter: input.archiveAfter,
      };
      await prisma.inboxReplyOperation.create({
        data: {
          ownerId: input.ownerId,
          conversationId: input.conversationId,
          requestId: input.requestId,
          intent,
          digest: createHash('sha256')
            .update(JSON.stringify(intent))
            .digest('hex'),
          sendState,
          ...(sendState === 'sent'
            ? { providerMessageId: 'historical-receipt' }
            : {}),
        },
      });
      const steps = callbacks();
      if (sendState === 'sent') {
        expect((await service.execute(input, steps)).outcome).toBe('completed');
        expect(steps.labels).toHaveBeenCalledTimes(1);
      } else
        await expect(service.execute(input, steps)).rejects.toThrow(
          'autre réponse',
        );
      expect(steps.send).not.toHaveBeenCalled();
    }
  });

  it('rejects changed intent and cross-owner conversation access before effects', async () => {
    const input = await fixture('identity');
    const steps = callbacks();
    await service.execute(input, steps);
    for (const change of [
      { replyText: 'Changed' },
      {
        reviewedReply: { ...input.reviewedReply, to: 'other@example.invalid' },
      },
      { reviewedReply: { ...input.reviewedReply, subject: 'Re: Changed' } },
      { accountId: 'other-account' },
      { archiveAfter: false },
    ]) {
      await expect(
        service.execute({ ...input, ...change }, steps),
      ).rejects.toThrow('autre réponse');
    }
    await expect(
      service.execute({ ...input, ownerId: 'foreign' }, steps),
    ).rejects.toThrow('Conversation introuvable');
    expect(steps.send).toHaveBeenCalledTimes(1);
    const row = await prisma.inboxReplyOperation.findFirstOrThrow({
      where: { ownerId: input.ownerId },
    });
    await expect(
      prisma.inboxReplyOperation.update({
        where: { id: row.id },
        data: { sendState: 'pending', providerMessageId: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inboxReplyOperation.update({
        where: { id: row.id },
        data: { labelsComplete: false },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inboxReplyOperation.update({
        where: { id: row.id },
        data: { digest: 'replacement' },
      }),
    ).rejects.toThrow();
  });
});
