import { ErasureBackupLedger } from './erasure-backup-ledger';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AccountErasureStore,
  erasureReceiptDigest,
  erasureStatus,
} from './account-erasure.store';
import { PrismaService } from '../prisma/prisma.service';
import { ErasureCredentialCipher } from './erasure-credential-cipher';
import { TokenEncryptionService } from '../google/token-encryption.service';

const receipt = 'a'.repeat(64);
const job = {
  id: 'f08d4668-565c-432f-b7e4-c010df24ae23',
  state: 'queued',
  revocationStatus: 'pending',
  requestedAt: new Date('2026-10-05T10:00:00Z'),
  localDeletedAt: null,
  completedAt: null,
  receiptExpiresAt: new Date('2026-10-12T10:00:00Z'),
};

function fixture() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ email: 'owner@example.test' }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    accountErasureJob: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(job),
    },
    googleOAuthToken: { findMany: jest.fn().mockResolvedValue([]) },
    account: { findMany: jest.fn().mockResolvedValue([]) },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    googleOAuthState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    betaInvite: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(async (run: (db: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const seal = jest.fn().mockReturnValue('encrypted-envelope');
  const decrypt = jest.fn().mockReturnValue('refresh-secret');
  const store = new AccountErasureStore(
    prisma as unknown as PrismaService,
    { seal } as unknown as ErasureCredentialCipher,
    { decrypt } as unknown as TokenEncryptionService,
    {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ErasureBackupLedger,
  );
  return { tx, store, seal, decrypt, prisma };
}

describe('AccountErasureStore', () => {
  it('replays the same receipt without creating a second job or repeating revocation', async () => {
    const { tx, store } = fixture();
    tx.accountErasureJob.findUnique.mockResolvedValue({
      ...job,
      receiptDigest: erasureReceiptDigest(receipt),
    });
    expect(
      await store.request('owner-id', {
        receipt,
        confirmEmail: 'OWNER@example.test',
      }),
    ).toEqual(erasureStatus(job));
    expect(tx.accountErasureJob.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects another receipt for an existing request', async () => {
    const { tx, store } = fixture();
    tx.accountErasureJob.findUnique.mockResolvedValue({
      ...job,
      receiptDigest: erasureReceiptDigest('b'.repeat(64)),
    });
    await expect(
      store.request('owner-id', {
        receipt,
        confirmEmail: 'owner@example.test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.accountErasureJob.create).not.toHaveBeenCalled();
  });

  it('distinguishes an unsafe operation from a database failure without leaking SQL', async () => {
    const { tx, store } = fixture();
    tx.$executeRaw.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('sensitive SQL', {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code: '23514' },
      }),
    );
    await expect(
      store.request('owner-id', {
        receipt,
        confirmEmail: 'owner@example.test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.$executeRaw.mockRejectedValueOnce(new Error('database password secret'));
    await expect(
      store.request('owner-id', {
        receipt,
        confirmEmail: 'owner@example.test',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.accountErasureJob.create).not.toHaveBeenCalled();
  });

  it('stores only a receipt digest and encrypted revocation credentials, then invalidates sessions', async () => {
    const { tx, store, seal } = fixture();
    tx.googleOAuthToken.findMany.mockResolvedValue([
      { id: 'google-token', refreshToken: 'protected' },
    ]);
    tx.account.findMany.mockResolvedValue([
      { refreshToken: 'refresh-secret', accessToken: null },
    ]);
    await store.request('owner-id', {
      receipt,
      confirmEmail: 'owner@example.test',
    });
    expect(seal).toHaveBeenCalledWith(expect.any(String), ['refresh-secret']);
    const created = tx.accountErasureJob.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(created[0].data.ownerId).toBe('owner-id');
    expect(created[0].data.receiptDigest).toBe(erasureReceiptDigest(receipt));
    expect(created[0].data.encryptedTokens).toBe('encrypted-envelope');
    expect(created[0].data.revocationStatus).toBe('pending');
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner-id' },
    });
    expect(tx.googleOAuthState.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-id' },
    });
  });
  it('bounds retry delays and reports a lost lease without changing another claim', async () => {
    const { store, prisma } = fixture();
    for (const delay of [0, -1, 1.5, 3601, Infinity]) {
      await expect(store.retryLater(job.id, 'claim', delay)).rejects.toThrow(
        RangeError,
      );
    }
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(await store.retryLater(job.id, 'claim', 60)).toBe(true);
    prisma.$executeRaw.mockResolvedValueOnce(0);
    expect(await store.retryLater(job.id, 'obsolete-claim', 60)).toBe(false);
  });
});
