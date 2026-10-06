import { AccountErasureWorker } from '../../src/privacy/account-erasure.worker';
import { GoogleErasureRevoker } from '../../src/privacy/google-erasure-revoker';
import { AccountErasurePurgeService } from '../../src/privacy/account-erasure-purge.service';
import { CommandJournalService } from '../../src/commands/command-journal.service';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AccountErasureStore,
  erasureReceiptDigest,
} from '../../src/privacy/account-erasure.store';
import { ErasureCredentialCipher } from '../../src/privacy/erasure-credential-cipher';
import { TokenEncryptionService } from '../../src/google/token-encryption.service';

describe('Durable account erasure requests', () => {
  const prisma = new PrismaService();
  const cipher = new ErasureCredentialCipher(
    new ConfigService({ AUTH_SECRET: 'integration-erasure-secret'.repeat(3) }),
  );
  const store = new AccountErasureStore(
    prisma,
    cipher,
    {} as TokenEncryptionService,
  );
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  async function owner() {
    const id = `erasure-${randomUUID()}`;
    const email = `${id}@example.invalid`;
    await prisma.user.create({ data: { id, email, name: 'Erasure' } });
    return { id, email, receipt: randomBytes(32).toString('hex') };
  }

  it('commits deactivation and a replayable job together, isolated from another owner', async () => {
    const target = await owner();
    const other = await owner();
    const result = await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    expect(
      await store.request(target.id, {
        receipt: target.receipt,
        confirmEmail: target.email,
      }),
    ).toEqual(result);
    expect(await store.status(target.receipt)).toEqual(result);
    expect(
      await prisma.accountErasureJob.count({ where: { ownerId: target.id } }),
    ).toBe(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(true);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
        .disabled,
    ).toBe(false);
    const persisted = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { ownerId: target.id },
    });
    expect(persisted.receiptDigest).toBe(erasureReceiptDigest(target.receipt));
    expect(JSON.stringify(persisted)).not.toContain(target.receipt);
    await expect(store.status(other.receipt)).rejects.toThrow();
  });

  it('leaves the account active and creates no job after a wrong email confirmation', async () => {
    const target = await owner();
    await expect(
      store.request(target.id, {
        receipt: target.receipt,
        confirmEmail: 'wrong@example.invalid',
      }),
    ).rejects.toThrow();
    expect(
      await prisma.accountErasureJob.count({ where: { ownerId: target.id } }),
    ).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(false);
  });

  it('expires public receipts independently of the retained backup tombstone', async () => {
    const target = await owner();
    await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    await prisma.accountErasureJob.update({
      where: { ownerId: target.id },
      data: {
        requestedAt: new Date(Date.now() - 8 * 86400000),
        receiptExpiresAt: new Date(Date.now() - 86400000),
      },
    });
    await expect(store.status(target.receipt)).rejects.toThrow();
    expect(
      await prisma.accountErasureJob.count({ where: { ownerId: target.id } }),
    ).toBe(1);
  });

  it('gives concurrent workers distinct durable leases', async () => {
    for (let n = 0; n < 2; n++) {
      const target = await owner();
      await store.request(target.id, {
        receipt: target.receipt,
        confirmEmail: target.email,
      });
    }
    const [first, second] = await Promise.all([
      store.claimNext(),
      store.claimNext(),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
    expect(first?.claimToken).not.toBe(second?.claimToken);
    expect(first?.attempts).toBe(1);
    expect(second?.attempts).toBe(1);
  });
  it('refuses retry updates from an expired worker after another worker acquires the job', async () => {
    const target = await owner();
    const requested = await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    // Keep this test independent of other queued fixtures.
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: requested.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const first = await store.claimNext();
    expect(first?.id).toBe(requested.id);
    if (!first?.claimToken) throw new Error('Expected first lease');
    await prisma.accountErasureJob.update({
      where: { id: requested.id },
      data: {
        claimedUntil: new Date(Date.now() - 1000),
      },
    });
    expect(await store.retryLater(first.id, first.claimToken, 60)).toBe(false);
    const successor = await store.claimNext();
    expect(successor?.id).toBe(requested.id);
    if (!successor?.claimToken) throw new Error('Expected successor lease');
    expect(await store.retryLater(first.id, first.claimToken, 60)).toBe(false);
    expect(await store.retryLater(successor.id, successor.claimToken, 60)).toBe(
      true,
    );
    const stored = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(stored.claimToken).toBeNull();
    expect(stored.claimedUntil).toBeNull();
    expect(stored.attempts).toBe(2);
    expect(await store.claimNext()).toBeNull();
  });
  it('permits journal removal only for a live matching erasure lease and rolls it back with the transaction', async () => {
    const target = await owner();
    const other = await owner();
    const journal = new CommandJournalService(prisma);
    async function commandFor(account: typeof target) {
      const conversation = await prisma.conversation.create({
        data: { ownerId: account.id, clientKey: 'journal' },
      });
      return journal.propose({
        ownerId: account.id,
        conversationId: conversation.id,
        requestId: 'erase-test',
        toolName: 'todo.delete',
        toolVersion: '1',
        arguments: { id: 'target' },
        targets: [{ id: 'target' }],
        expiresAt: new Date(Date.now() + 600000),
      });
    }
    const ownCommand = await commandFor(target);
    const foreignCommand = await commandFor(other);
    await expect(
      prisma.commandTransition.deleteMany({
        where: { commandId: ownCommand.id },
      }),
    ).rejects.toThrow();
    const requested = await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: requested.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const lease = await store.claimNext();
    if (!lease?.claimToken || lease.id !== requested.id)
      throw new Error('Expected owner lease');
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('jarvis.erasure_claim', ${randomUUID()}, true)`;
        await tx.commandTransition.deleteMany({
          where: { commandId: ownCommand.id },
        });
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('jarvis.erasure_claim', ${lease.claimToken}, true)`;
        await tx.commandTransition.deleteMany({
          where: { commandId: foreignCommand.id },
        });
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('jarvis.erasure_claim', ${lease.claimToken}, true)`;
        expect(
          (
            await tx.commandTransition.deleteMany({
              where: { commandId: ownCommand.id },
            })
          ).count,
        ).toBe(1);
        throw new Error('Simulated crash');
      }),
    ).rejects.toThrow('Simulated crash');
    expect(
      await prisma.commandTransition.count({
        where: { commandId: ownCommand.id },
      }),
    ).toBe(1);
    expect(
      await prisma.commandTransition.count({
        where: { commandId: foreignCommand.id },
      }),
    ).toBe(1);
    await expect(
      prisma.commandTransition.deleteMany({
        where: { commandId: ownCommand.id },
      }),
    ).rejects.toThrow();
  });
  it('purges the owner and migration copies atomically while retaining another account and the receipt', async () => {
    const target = await owner();
    const other = await owner();
    async function seed(account: typeof target) {
      const conversation = await prisma.conversation.create({
        data: { ownerId: account.id, clientKey: 'purge' },
      });
      const note = await prisma.note.create({
        data: { ownerId: account.id, text: 'Private note' },
      });
      await prisma.jarvisMemoryFact.create({
        data: {
          sessionId: conversation.id,
          layer: 'semantic',
          key: 'fact',
          label: 'Fact',
          value: 'Private memory',
        },
      });
      const habit = await prisma.habit.create({
        data: { sessionId: conversation.id, name: 'Private habit' },
      });
      await prisma.habitLog.create({
        data: { habitId: habit.id, date: '2026-10-06' },
      });
      const command = await new CommandJournalService(prisma).propose({
        ownerId: account.id,
        conversationId: conversation.id,
        requestId: 'purge-command',
        toolName: 'todo.delete',
        toolVersion: '1',
        arguments: { id: 'target' },
        targets: [{ id: 'target' }],
        expiresAt: new Date(Date.now() + 600000),
      });
      return { conversation, note, habit, command };
    }
    const own = await seed(target);
    const foreign = await seed(other);
    const batchId = randomUUID();
    await prisma.legacyOwnershipBatch.create({
      data: {
        id: batchId,
        digest: 'reviewed-digest',
        manifest: {
          version: 1,
          mappings: [
            { ownerId: target.id, id: own.note.id },
            { ownerId: other.id, id: foreign.note.id },
          ],
        },
      },
    });
    for (const [account, note] of [
      [target, own.note],
      [other, foreign.note],
    ] as const) {
      await prisma.legacyOwnershipRecord.create({
        data: {
          batchId,
          tableName: 'Note',
          recordId: note.id,
          original: { text: note.text },
          assignedOwnerId: account.id,
        },
      });
    }
    const requested = await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: requested.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const lease = await store.claimNext();
    if (!lease?.claimToken || lease.id !== requested.id)
      throw new Error('Expected purge lease');
    const purge = new AccountErasurePurgeService(prisma);
    expect(await purge.purge(requested.id, randomUUID())).toBe(false);
    expect(await prisma.note.count({ where: { id: own.note.id } })).toBe(1);
    expect(await purge.purge(requested.id, lease.claimToken)).toBe(true);
    expect(await purge.purge(requested.id, lease.claimToken)).toBe(true);
    expect(await prisma.user.count({ where: { id: target.id } })).toBe(0);
    expect(await prisma.note.count({ where: { ownerId: target.id } })).toBe(0);
    expect(
      await prisma.jarvisMemoryFact.count({
        where: { sessionId: own.conversation.id },
      }),
    ).toBe(0);
    expect(
      await prisma.habitLog.count({ where: { habitId: own.habit.id } }),
    ).toBe(0);
    expect(
      await prisma.commandTransition.count({
        where: { commandId: own.command.id },
      }),
    ).toBe(0);
    expect(
      await prisma.legacyOwnershipRecord.count({
        where: { assignedOwnerId: target.id },
      }),
    ).toBe(0);
    expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);
    expect(await prisma.note.count({ where: { id: foreign.note.id } })).toBe(1);
    expect(
      await prisma.jarvisMemoryFact.count({
        where: { sessionId: foreign.conversation.id },
      }),
    ).toBe(1);
    expect(
      await prisma.commandTransition.count({
        where: { commandId: foreign.command.id },
      }),
    ).toBe(1);
    expect(
      await prisma.legacyOwnershipRecord.count({
        where: { assignedOwnerId: other.id },
      }),
    ).toBe(1);
    const batch = await prisma.legacyOwnershipBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    expect(JSON.stringify(batch.manifest)).not.toContain(target.id);
    expect(JSON.stringify(batch.manifest)).toContain(other.id);
    expect((await store.status(target.receipt)).state).toBe('local_deleted');
    expect(
      await store.saveRevocationProgress(requested.id, randomUUID(), []),
    ).toBe(false);
    expect(
      await store.saveRevocationProgress(requested.id, lease.claimToken, [
        'remaining-token',
      ]),
    ).toBe(true);
    const progress = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(progress.state).toBe('local_deleted');
    expect(progress.revocationStatus).toBe('pending');
    expect(progress.encryptedTokens).not.toContain('remaining-token');
    expect(cipher.open(requested.id, progress.encryptedTokens!)).toEqual([
      'remaining-token',
    ]);
    expect(
      await store.saveRevocationProgress(requested.id, lease.claimToken, []),
    ).toBe(true);
    expect((await store.status(target.receipt)).state).toBe('completed');
    expect(
      await store.saveRevocationProgress(requested.id, lease.claimToken, []),
    ).toBe(false);
  });
  it('resumes the real durable job after a mocked provider outage without restoring local data', async () => {
    const target = await owner();
    await prisma.note.create({
      data: { ownerId: target.id, text: 'Erase despite outage' },
    });
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: randomUUID(),
        providerId: 'google',
        userId: target.id,
        refreshToken: 'integration-fake-refresh-token',
      },
    });
    const requested = await store.request(target.id, {
      receipt: target.receipt,
      confirmEmail: target.email,
    });
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: requested.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const revoke = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const runner = new AccountErasureWorker(
      store,
      new AccountErasurePurgeService(prisma),
      cipher,
      { revoke } as unknown as GoogleErasureRevoker,
    );
    expect(await runner.runOnce()).toBe(true);
    expect(await prisma.note.count({ where: { ownerId: target.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: target.id } })).toBe(0);
    const pending = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(pending.state).toBe('local_deleted');
    expect(pending.revocationStatus).toBe('pending');
    expect(pending.claimToken).toBeNull();
    expect(pending.encryptedTokens).not.toContain(
      'integration-fake-refresh-token',
    );
    await prisma.accountErasureJob.update({
      where: { id: requested.id },
      data: { nextAttemptAt: new Date(0) },
    });
    expect(await runner.runOnce()).toBe(true);
    const completed = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(completed.state).toBe('completed');
    expect(completed.revocationStatus).toBe('complete');
    expect(completed.encryptedTokens).toBeNull();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect((await store.status(target.receipt)).state).toBe('completed');
  });
});
