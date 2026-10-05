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
});
