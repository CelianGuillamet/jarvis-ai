import { CommandJournalService } from '../../src/commands/command-journal.service';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ErasureBackupLedger,
  type ErasureTombstone,
} from '../../src/privacy/erasure-backup-ledger';
import { ErasureBackupReplayService } from '../../src/privacy/erasure-backup-replay.service';
import { AccountErasureStore } from '../../src/privacy/account-erasure.store';
import { AccountErasurePurgeService } from '../../src/privacy/account-erasure-purge.service';
import { AccountErasureWorker } from '../../src/privacy/account-erasure.worker';
import { AccountPrivateCacheService } from '../../src/privacy/account-private-cache.service';
import { ErasureCredentialCipher } from '../../src/privacy/erasure-credential-cipher';
import { TokenEncryptionService } from '../../src/google/token-encryption.service';
import { GoogleErasureRevoker } from '../../src/privacy/google-erasure-revoker';

const secret = 'backup-integration-secret'.repeat(3);
describe('Independent deletion replay after restoring old rows', () => {
  const prisma = new PrismaService();
  const cipher = new ErasureCredentialCipher(
    new ConfigService({ AUTH_SECRET: secret }),
  );
  let directory: string;
  let ledger: ErasureBackupLedger;
  let store: AccountErasureStore;
  beforeAll(async () => {
    await prisma.$connect();
    directory = await mkdtemp(join(tmpdir(), 'jarvis-backup-replay-'));
    ledger = new ErasureBackupLedger(
      new ConfigService({ AUTH_SECRET: secret, PRIVACY_LEDGER_DIR: directory }),
    );
    store = new AccountErasureStore(
      prisma,
      cipher,
      {} as TokenEncryptionService,
      ledger,
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  });

  async function owner() {
    const id = randomUUID();
    const email = `${id}@example.invalid`;
    await prisma.user.create({ data: { id, email, name: 'Backup fixture' } });
    await prisma.betaInvite.create({ data: { email } });
    return { id, email };
  }
  async function claimOnly(id: string) {
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const job = await store.claimNext();
    if (!job?.claimToken || job.id !== id)
      throw new Error('Expected isolated replay claim');
    return job;
  }

  it('replays a durable admission even when SQL rolls back and the API reports failure', async () => {
    const target = await owner();
    const other = await owner();
    const receipt = randomBytes(32).toString('hex');
    const publisher = new ErasureBackupLedger(
      new ConfigService({ AUTH_SECRET: secret, PRIVACY_LEDGER_DIR: directory }),
    );
    const failAfterPublication = jest
      .spyOn(ledger, 'record')
      .mockImplementationOnce(async (record: ErasureTombstone) => {
        await publisher.record(record);
        throw new Error('SQL transaction interrupted after durable admission');
      });
    try {
      await expect(
        store.request(target.id, { receipt, confirmEmail: target.email }),
      ).rejects.toThrow();
    } finally {
      failAfterPublication.mockRestore();
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(false);
    expect(
      await prisma.accountErasureJob.findUnique({
        where: { ownerId: target.id },
      }),
    ).toBeNull();
    await new ErasureBackupReplayService(prisma, ledger).reconcile();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(true);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
        .disabled,
    ).toBe(false);
    expect(
      await prisma.accountErasureJob.findUnique({
        where: { ownerId: target.id },
      }),
    ).toMatchObject({ state: 'queued', revocationStatus: 'manual_required' });
  });

  it('reapplies deletion without recreating access and preserves another owner', async () => {
    const target = await owner();
    const other = await owner();
    const note = await prisma.note.create({
      data: { ownerId: target.id, text: 'Private restored note' },
    });
    const foreign = await prisma.note.create({
      data: { ownerId: other.id, text: 'Other owner note' },
    });
    const receipt = randomBytes(32).toString('hex');
    const requested = await store.request(target.id, {
      receipt,
      confirmEmail: target.email,
    });
    const first = await claimOnly(requested.id);
    await new AccountErasurePurgeService(prisma).purge(
      first.id,
      first.claimToken!,
    );
    expect(await store.recordLocalDeletion(first.id, first.claimToken!)).toBe(
      true,
    );
    await store.saveRevocationProgress(first.id, first.claimToken!, []);
    // Simulate an older dump: user/data/session/invitation return, DB tombstone is lost.
    await prisma.accountErasureJob.deleteMany({
      where: { ownerId: target.id },
    });
    await prisma.user.create({
      data: { id: target.id, email: target.email, name: 'Restored old user' },
    });
    await prisma.note.create({
      data: { id: note.id, ownerId: target.id, text: note.text },
    });
    await prisma.betaInvite.create({ data: { email: target.email } });
    await prisma.session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        userId: target.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const replay = new ErasureBackupReplayService(prisma, ledger);
    await replay.reconcile();
    const queued = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { ownerId: target.id },
    });
    expect(queued.id).not.toBe(requested.id);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(true);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(
      0,
    );
    expect(
      (
        await prisma.betaInvite.findUniqueOrThrow({
          where: { email: target.email },
        })
      ).revokedAt,
    ).not.toBeNull();
    await replay.reconcile();
    expect(
      (
        await prisma.accountErasureJob.findUniqueOrThrow({
          where: { ownerId: target.id },
        })
      ).id,
    ).toBe(queued.id);
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: queued.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const revoke = jest.fn().mockResolvedValue(true);
    const worker = new AccountErasureWorker(
      store,
      new AccountErasurePurgeService(prisma),
      cipher,
      { revoke } as unknown as GoogleErasureRevoker,
      {
        forgetOwner: jest.fn().mockResolvedValue(undefined),
      } as unknown as AccountPrivateCacheService,
    );
    await worker.runOnce();
    expect(await prisma.user.count({ where: { id: target.id } })).toBe(0);
    expect(await prisma.note.count({ where: { id: note.id } })).toBe(0);
    expect(await prisma.note.count({ where: { id: foreign.id } })).toBe(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
        .disabled,
    ).toBe(false);
    expect((await store.status(receipt)).state).toBe('completed');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('rolls back admission if the independent ledger cannot be persisted', async () => {
    const target = await owner();
    const badDirectory = await mkdtemp(join(directory, 'unsafe-'));
    await chmod(badDirectory, 0o755);
    const unavailable = new AccountErasureStore(
      prisma,
      cipher,
      {} as TokenEncryptionService,
      new ErasureBackupLedger(
        new ConfigService({
          AUTH_SECRET: secret,
          PRIVACY_LEDGER_DIR: badDirectory,
        }),
      ),
    );
    await expect(
      unavailable.request(target.id, {
        receipt: randomBytes(32).toString('hex'),
        confirmEmail: target.email,
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(false);
    expect(
      await prisma.accountErasureJob.count({ where: { ownerId: target.id } }),
    ).toBe(0);
    expect(
      (
        await prisma.betaInvite.findUniqueOrThrow({
          where: { email: target.email },
        })
      ).revokedAt,
    ).toBeNull();
    await rm(badDirectory, { recursive: true, force: true });
  });
  it('keeps restored unresolved operations intact while revoking their owner admission', async () => {
    const target = await owner();
    const requested = await store.request(target.id, {
      receipt: randomBytes(32).toString('hex'),
      confirmEmail: target.email,
    });
    // Older snapshot had an active owner and an execution whose later outcome is not in that snapshot.
    await prisma.user.update({
      where: { id: target.id },
      data: { disabled: false },
    });
    const conversation = await prisma.conversation.create({
      data: { ownerId: target.id, clientKey: 'restored-execution' },
    });
    const journal = new CommandJournalService(prisma);
    const command = await journal.propose({
      ownerId: target.id,
      conversationId: conversation.id,
      requestId: 'stale-execution',
      toolName: 'todo.delete',
      toolVersion: '1',
      arguments: { id: 'target' },
      targets: [{ id: 'target' }],
      expiresAt: new Date(Date.now() + 600000),
    });
    await journal.advance(target.id, command.id, 0, 'waiting');
    await journal.approve(target.id, command.id, 1, command.digest);
    await journal.advance(target.id, command.id, 2, 'executing');
    await new ErasureBackupReplayService(prisma, ledger).reconcile();
    const queued = await prisma.accountErasureJob.findUniqueOrThrow({
      where: { ownerId: target.id },
    });
    expect(queued.id).not.toBe(requested.id);
    const claim = await claimOnly(queued.id);
    await expect(
      new AccountErasurePurgeService(prisma).purge(claim.id, claim.claimToken!),
    ).rejects.toThrow();
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id: command.id } }))
        .state,
    ).toBe('executing');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .disabled,
    ).toBe(true);
  });
});
