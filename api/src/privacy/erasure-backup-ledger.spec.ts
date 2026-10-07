import { ConfigService } from '@nestjs/config';
import {
  mkdtemp,
  rm,
  readdir,
  readFile,
  writeFile,
  stat,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hkdfSync, randomUUID } from 'node:crypto';
import { ErasureBackupLedger } from './erasure-backup-ledger';
import type { ErasureTombstone } from './erasure-backup-ledger';

const secret = 'ledger-test-secret'.repeat(3);
function tombstone(): ErasureTombstone {
  return {
    version: 1,
    kind: 'admitted',
    jobId: randomUUID(),
    ownerId: 'opaque-owner',
    receiptDigest: 'a'.repeat(64),
    requestedAt: '2026-10-06T10:00:00.000Z',
    receiptExpiresAt: '2026-10-13T10:00:00.000Z',
    retainedUntil: '2026-11-05T10:00:00.000Z',
    localDeletedAt: null,
  };
}

async function collect(ledger: ErasureBackupLedger) {
  const values: ErasureTombstone[] = [];
  for await (const value of ledger.records()) values.push(value);
  return values;
}

describe('Independent backup deletion ledger', () => {
  let directory: string;
  let ledger: ErasureBackupLedger;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'jarvis-ledger-'));
    ledger = new ErasureBackupLedger(
      new ConfigService({ PRIVACY_LEDGER_DIR: directory, AUTH_SECRET: secret }),
    );
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('publishes an encrypted immutable file and safely replays concurrent identical writes', async () => {
    const record = tombstone();
    await Promise.all([ledger.record(record), ledger.record(record)]);
    const files = await readdir(directory);
    expect(files).toEqual([`${record.jobId}.admitted.ledger`]);
    const path = join(directory, files[0]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const envelope = await readFile(path, 'utf8');
    expect(envelope).not.toContain(record.ownerId);
    expect(envelope).not.toContain(record.receiptDigest);
    expect(await collect(ledger)).toEqual([record]);
  });

  it('never overwrites a different owner record under the same job and phase', async () => {
    const record = tombstone();
    await ledger.record(record);
    await expect(
      ledger.record({ ...record, ownerId: 'another-owner' }),
    ).rejects.toThrow();
    expect(await collect(ledger)).toEqual([record]);
  });

  it('rejects tampering and does not downgrade a damaged ledger to an empty one', async () => {
    const record = tombstone();
    await ledger.record(record);
    const path = join(directory, `${record.jobId}.admitted.ledger`);
    await writeFile(path, 'invalid-envelope');
    await expect(collect(ledger)).rejects.toThrow();
  });

  it('refuses unsafe directory permissions', async () => {
    await chmod(directory, 0o755);
    await expect(ledger.record(tombstone())).rejects.toThrow();
    await expect(collect(ledger)).rejects.toThrow();
  });

  it('ignores unpublished temporary files but refuses unknown published entries', async () => {
    await writeFile(join(directory, 'unfinished.tmp'), 'partial ciphertext', {
      mode: 0o600,
    });
    expect(await collect(ledger)).toEqual([]);
    await writeFile(join(directory, 'unrecognized.ledger'), 'unexpected', {
      mode: 0o600,
    });
    await expect(collect(ledger)).rejects.toThrow();
  });

  it('supports explicit key rotation while preserving the previous decryption key', async () => {
    const first = tombstone();
    await ledger.record(first);
    const previous = Buffer.from(
      hkdfSync(
        'sha256',
        secret,
        'jarvis-privacy-ledger-v1',
        'backup-tombstones',
        32,
      ),
    ).toString('base64');
    const rotated = new ErasureBackupLedger(
      new ConfigService({
        PRIVACY_LEDGER_DIR: directory,
        PRIVACY_LEDGER_KEYS: JSON.stringify({
          'auth-derived-v1': previous,
          next: Buffer.alloc(32, 9).toString('base64'),
        }),
        PRIVACY_LEDGER_ACTIVE_KEY: 'next',
        AUTH_SECRET: 'changed-secret'.repeat(3),
      }),
    );
    expect(await collect(rotated)).toEqual([first]);
    const second = tombstone();
    await rotated.record(second);
    expect((await collect(rotated)).map((value) => value.jobId).sort()).toEqual(
      [first.jobId, second.jobId].sort(),
    );
    await expect(collect(ledger)).rejects.toThrow();
  });
  it('does not silently create an empty replacement ledger in production', async () => {
    const missing = new ErasureBackupLedger(
      new ConfigService({
        NODE_ENV: 'production',
        AUTH_SECRET: secret,
        PRIVACY_LEDGER_DIR: join(directory, 'missing'),
      }),
    );
    await expect(collect(missing)).rejects.toThrow();
    await expect(missing.record(tombstone())).rejects.toThrow();
  });

  it('never prunes an admitted record, confirmed or not', async () => {
    const record = tombstone();
    await ledger.record(record);
    const past = new Date(Date.parse(record.retainedUntil) + 1000);
    expect(await ledger.prune(true, past)).toEqual({ removed: 0, eligible: 0 });
    expect(await collect(ledger)).toEqual([record]);
  });

  it('reports a completed record past its review date but keeps it until confirmed', async () => {
    const record = {
      ...tombstone(),
      kind: 'deleted' as const,
      localDeletedAt: '2026-10-07T00:00:00.000Z',
    };
    await ledger.record(record);
    const past = new Date(Date.parse(record.retainedUntil) + 1000);
    expect(await ledger.prune(false, past)).toEqual({
      removed: 0,
      eligible: 1,
    });
    expect(await collect(ledger)).toEqual([record]);
  });

  it('removes a completed record past its review date only once backups are confirmed retired', async () => {
    const record = {
      ...tombstone(),
      kind: 'deleted' as const,
      localDeletedAt: '2026-10-07T00:00:00.000Z',
    };
    await ledger.record(record);
    const before = new Date(Date.parse(record.retainedUntil) - 1000);
    expect(await ledger.prune(true, before)).toEqual({
      removed: 0,
      eligible: 0,
    });
    expect(await collect(ledger)).toEqual([record]);
    const after = new Date(Date.parse(record.retainedUntil) + 1000);
    expect(await ledger.prune(true, after)).toEqual({
      removed: 1,
      eligible: 1,
    });
    expect(await collect(ledger)).toEqual([]);
  });

  it('also removes the superseded admitted record for the same job once its deleted counterpart is pruned', async () => {
    const admitted = tombstone();
    const deleted = {
      ...admitted,
      kind: 'deleted' as const,
      localDeletedAt: '2026-10-07T00:00:00.000Z',
    };
    await ledger.record(admitted);
    await ledger.record(deleted);
    const after = new Date(Date.parse(deleted.retainedUntil) + 1000);
    expect(await ledger.prune(true, after)).toEqual({
      removed: 1,
      eligible: 1,
    });
    expect(await collect(ledger)).toEqual([]);
  });
});
