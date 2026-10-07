import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PersonalMemoryService } from '../../src/memory/personal-memory.service';
import { AccountSnapshotService } from '../../src/privacy/account-snapshot.service';
import { AccountErasureStore } from '../../src/privacy/account-erasure.store';
import { AccountErasurePurgeService } from '../../src/privacy/account-erasure-purge.service';
import { ErasureBackupLedger } from '../../src/privacy/erasure-backup-ledger';
import { ErasureCredentialCipher } from '../../src/privacy/erasure-credential-cipher';
import type { TokenEncryptionService } from '../../src/google/token-encryption.service';

describe('Personal memory on PostgreSQL', () => {
  const prisma = new PrismaService();
  const secret = 'integration-memory-secret'.repeat(3);
  let directory: string;
  let store: AccountErasureStore;
  beforeAll(async () => {
    await prisma.$connect();
    directory = await mkdtemp(join(tmpdir(), 'jarvis-memory-ledger-'));
    store = new AccountErasureStore(
      prisma,
      new ErasureCredentialCipher(new ConfigService({ AUTH_SECRET: secret })),
      {} as TokenEncryptionService,
      new ErasureBackupLedger(
        new ConfigService({
          PRIVACY_LEDGER_DIR: directory,
          AUTH_SECRET: secret,
        }),
      ),
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  });
  async function owner() {
    const id = `memory-${randomUUID()}`;
    const email = `${id}@example.invalid`;
    await prisma.user.create({ data: { id, email, name: 'Memory' } });
    return { id, email };
  }

  it('persists across restarts and removes a forgotten fact from prompt context', async () => {
    const account = await owner();
    const created = await new PersonalMemoryService(prisma).create(
      account.id,
      'Mon dentiste est le docteur Durand',
      'chat',
    );
    const restarted = new PersonalMemoryService(prisma);
    expect((await restarted.list(account.id)).map((f) => f.text)).toEqual([
      'Mon dentiste est le docteur Durand',
    ]);
    expect(
      await restarted.buildPromptContext(account.id, 'appelle le dentiste'),
    ).toContain('Durand');
    await restarted.forget(account.id, created.id);
    expect(await restarted.list(account.id)).toEqual([]);
    expect(
      await new PersonalMemoryService(prisma).buildPromptContext(
        account.id,
        'appelle le dentiste',
      ),
    ).not.toContain('Durand');
  });

  it('isolates facts between owners for read, correction and forgetting', async () => {
    const a = await owner();
    const b = await owner();
    const memory = new PersonalMemoryService(prisma);
    const fact = await memory.create(a.id, 'Secret de A', 'settings');
    expect(await memory.list(b.id)).toEqual([]);
    expect(await memory.buildPromptContext(b.id, 'secret')).toBe('');
    await expect(memory.update(b.id, fact.id, 'Volé')).rejects.toThrow(
      'Fait introuvable',
    );
    await expect(memory.forget(b.id, fact.id)).rejects.toThrow(
      'Fait introuvable',
    );
    expect((await memory.list(a.id))[0]).toMatchObject({
      text: 'Secret de A',
      origin: 'settings',
    });
    const corrected = await memory.update(a.id, fact.id, 'Secret corrigé');
    expect(corrected.text).toBe('Secret corrigé');
  });

  it('enforces text constraints in the database', async () => {
    const account = await owner();
    await expect(
      prisma.personalFact.create({
        data: { ownerId: account.id, text: '', origin: 'chat' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.personalFact.create({
        data: { ownerId: account.id, text: 'ok', origin: 'inferred' },
      }),
    ).rejects.toThrow();
  });

  it('exports facts, blocks writes after a deletion request and purges them', async () => {
    const account = await owner();
    const memory = new PersonalMemoryService(prisma);
    await memory.create(account.id, 'Fait exporté', 'chat');
    const records: Array<{ collection?: string; data?: unknown }> = [];
    await new AccountSnapshotService(prisma).stream(
      account.id,
      (record) => {
        records.push(record as { collection?: string; data?: unknown });
        return Promise.resolve();
      },
      new AbortController().signal,
    );
    expect(
      records.find((record) => record.collection === 'PersonalFact'),
    ).toMatchObject({ data: { text: 'Fait exporté', origin: 'chat' } });

    const requested = await store.request(account.id, {
      confirmEmail: account.email,
      receipt: randomBytes(32).toString('hex'),
    });
    await expect(
      memory.create(account.id, 'Après la demande', 'chat'),
    ).rejects.toThrow();
    await prisma.accountErasureJob.updateMany({
      where: { id: { not: requested.id } },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
    const lease = await store.claimNext();
    if (!lease?.claimToken || lease.id !== requested.id)
      throw new Error('Expected owner lease');
    await new AccountErasurePurgeService(prisma).purge(
      requested.id,
      lease.claimToken,
    );
    expect(
      await prisma.personalFact.count({ where: { ownerId: account.id } }),
    ).toBe(0);
  });
});
