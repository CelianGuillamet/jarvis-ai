import { ConfigService } from '@nestjs/config';
import { ErasureCredentialCipher } from '../../src/privacy/erasure-credential-cipher';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrivacyRetentionService } from '../../src/privacy/privacy-retention.service';

describe('Bounded privacy retention', () => {
  const prisma = new PrismaService();
  const retention = new PrivacyRetentionService(prisma);
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('removes old diagnostics in batches while preserving current minimized diagnostics', async () => {
    const ownerId = randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.invalid`,
        name: 'Retention',
      },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId, clientKey: 'retention' },
    });
    await prisma.jarvisLog.createMany({
      data: Array.from({ length: 501 }, () => ({
        sessionId: conversation.id,
        userText: '',
        modelRaw: '',
        simulation: true,
        createdAt: new Date(Date.now() - 15 * 86400000),
      })),
    });
    const current = await prisma.jarvisLog.create({
      data: {
        sessionId: conversation.id,
        userText: '',
        modelRaw: '',
        simulation: true,
      },
    });
    // Other integration fixtures may retain raw diagnostics; bound and drain them first.
    for (let n = 0; n < 10; n++) {
      await retention.runBatch();
      if (n === 0)
        expect(
          await prisma.jarvisLog.count({
            where: { sessionId: conversation.id },
          }),
        ).toBeGreaterThanOrEqual(2);
      if (
        (await prisma.jarvisLog.count({
          where: { sessionId: conversation.id },
        })) === 1
      )
        break;
    }
    expect(
      await prisma.jarvisLog.count({ where: { sessionId: conversation.id } }),
    ).toBe(1);
    expect(
      await prisma.jarvisLog.findUnique({ where: { id: current.id } }),
    ).not.toBeNull();
  });

  it('expires completed history and anonymous verifications without deleting unfinished work', async () => {
    const ownerId = randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.invalid`,
        name: 'Retention',
      },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId, clientKey: 'history-retention' },
    });
    const old = new Date(Date.now() - 91 * 86400000);
    const finished = await prisma.conversationTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        kind: 'chat',
        inputText: 'Old private text',
        state: 'completed',
        response: { text: 'Old private reply' },
        createdAt: old,
        updatedAt: old,
      },
    });
    const pending = await prisma.conversationTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        kind: 'chat',
        inputText: 'Unfinished private text',
        state: 'started',
        createdAt: old,
        updatedAt: old,
      },
    });
    const verification = await prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: randomUUID(),
        value: 'expired secret',
        expiresAt: new Date(0),
      },
    });
    const current = await prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: randomUUID(),
        value: 'active secret',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await retention.runBatch();
    expect(
      await prisma.conversationTurn.count({ where: { id: finished.id } }),
    ).toBe(0);
    const stalePending = await prisma.conversationTurn.findUnique({
      where: { id: pending.id },
    });
    // An abandoned 'started' turn is never deleted by this batch (it may still need
    // reconciliation), but its raw input is redacted once it is clearly no longer in
    // flight, so it does not keep private text with no expiry.
    expect(stalePending).not.toBeNull();
    expect(stalePending?.state).toBe('failed');
    expect(stalePending?.inputText).toBe('');
    expect(
      await prisma.verification.count({ where: { id: verification.id } }),
    ).toBe(0);
    expect(await prisma.verification.count({ where: { id: current.id } })).toBe(
      1,
    );
  });

  it('redacts a started turn only once it is clearly no longer in flight', async () => {
    const ownerId = randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.invalid`,
        name: 'Retention',
      },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId, clientKey: 'started-turn-retention' },
    });
    const recent = await prisma.conversationTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        kind: 'chat',
        inputText: 'Request in flight right now',
        state: 'started',
      },
    });
    const abandoned = await prisma.conversationTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        kind: 'chat',
        inputText: 'Request the process never finished handling',
        state: 'started',
        createdAt: new Date(Date.now() - 2 * 86400000),
        updatedAt: new Date(Date.now() - 2 * 86400000),
      },
    });
    await retention.runBatch();
    const stillLive = await prisma.conversationTurn.findUnique({
      where: { id: recent.id },
    });
    expect(stillLive?.state).toBe('started');
    expect(stillLive?.inputText).toBe('Request in flight right now');
    const redacted = await prisma.conversationTurn.findUnique({
      where: { id: abandoned.id },
    });
    expect(redacted?.state).toBe('failed');
    expect(redacted?.inputText).toBe('');
  });

  it('never attempts to redact a stale started turn for a disabled account', async () => {
    const ownerId = randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.invalid`,
        name: 'Retention',
      },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId, clientKey: 'disabled-owner-retention' },
    });
    const stale = await prisma.conversationTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        kind: 'chat',
        inputText: 'Abandoned turn for a disabled account',
        state: 'started',
        createdAt: new Date(Date.now() - 2 * 86400000),
        updatedAt: new Date(Date.now() - 2 * 86400000),
      },
    });
    // The account is disabled only after its turn exists, matching an erasure in
    // progress. guard_active_owner_write then rejects writes to ConversationTurn for
    // this owner: the batch must skip this row rather than abort the whole transaction.
    await prisma.user.update({
      where: { id: ownerId },
      data: { disabled: true },
    });
    await expect(retention.runBatch()).resolves.toBeUndefined();
    const untouched = await prisma.conversationTurn.findUnique({
      where: { id: stale.id },
    });
    expect(untouched?.state).toBe('started');
    expect(untouched?.inputText).toBe('Abandoned turn for a disabled account');
  });

  it('discards expired revocation credentials without racing a live lease', async () => {
    const protection = new ErasureCredentialCipher(
      new ConfigService({ AUTH_SECRET: 'retention-secret'.repeat(4) }),
    );
    async function job(liveLease: boolean) {
      const id = randomUUID();
      return prisma.accountErasureJob.create({
        data: {
          id,
          ownerId: randomUUID(),
          receiptDigest: randomBytes(32).toString('hex'),
          state: 'local_deleted',
          localDeletedAt: new Date(),
          encryptedTokens: protection.seal(id, ['private-token']),
          requestedAt: new Date(Date.now() - 8 * 86400000),
          receiptExpiresAt: new Date(Date.now() - 86400000),
          retainedUntil: new Date(Date.now() + 86400000),
          claimToken: liveLease ? randomUUID() : null,
          claimedUntil: liveLease ? new Date(Date.now() + 60000) : null,
        },
      });
    }
    const idle = await job(false);
    const live = await job(true);
    await retention.runBatch();
    const expired = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { id: idle.id },
    });
    expect(expired.encryptedTokens).toBeNull();
    expect(expired.revocationStatus).toBe('manual_required');
    expect(expired.blockerCode).toBe('REVOCATION_WINDOW_EXPIRED');
    expect(
      (
        await prisma.accountErasureJob.findUniqueOrThrow({
          where: { id: live.id },
        })
      ).encryptedTokens,
    ).toBe(live.encryptedTokens);
  });
});
