import { constants } from 'node:fs';
import { mkdir, lstat, open, link, unlink, opendir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const base = z.object({
  version: z.literal(1),
  jobId: z.uuid().regex(/^[0-9a-f-]{36}$/),
  ownerId: z.string().min(1).max(500),
  receiptDigest: z.string().regex(/^[a-f0-9]{64}$/),
  requestedAt: z.iso.datetime(),
  receiptExpiresAt: z.iso.datetime(),
  retainedUntil: z.iso.datetime(),
});
export const ErasureTombstoneSchema = z
  .discriminatedUnion('kind', [
    base
      .extend({ kind: z.literal('admitted'), localDeletedAt: z.null() })
      .strict(),
    base
      .extend({ kind: z.literal('deleted'), localDeletedAt: z.iso.datetime() })
      .strict(),
  ])
  .refine(
    (record) =>
      Date.parse(record.receiptExpiresAt) > Date.parse(record.requestedAt) &&
      Date.parse(record.retainedUntil) >= Date.parse(record.receiptExpiresAt),
  );
export type ErasureTombstone = z.infer<typeof ErasureTombstoneSchema>;
const filename =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(admitted|deleted)\.ledger$/;

export interface ErasureLedgerCipher {
  encrypt(plaintext: string, context: string): string;
  decrypt(envelope: string, context: string): string;
}

export interface ErasureBackupLedgerConfig {
  directory?: string;
  /** Resolves the key ring on each use; callers own how it is derived (see erasure-backup-ledger.ts). */
  cipher: () => ErasureLedgerCipher;
  isProduction?: boolean;
}

/**
 * Independent of database dumps. Immutable encrypted records are published atomically.
 * Plain class (no Nest decorator, no TS parameter-property shorthand) so it can run
 * both inside the application (wrapped by the @Injectable ErasureBackupLedger) and in
 * a standalone operator script under Node's built-in TypeScript type-stripping, which
 * does not support decorators or parameter properties.
 */
export class ErasureBackupLedgerEngine {
  private readonly config: ErasureBackupLedgerConfig;
  constructor(config: ErasureBackupLedgerConfig) {
    this.config = config;
  }

  private directory() {
    return resolve(this.config.directory || '.privacy-ledger');
  }

  private cipher(): ErasureLedgerCipher {
    return this.config.cipher();
  }

  private async ensureDirectory() {
    const directory = this.directory();
    if (!this.config.isProduction) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
    }
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0
    ) {
      throw new Error('Backup deletion ledger unavailable.');
    }
    return directory;
  }

  private async read(
    path: string,
    jobId: string,
    kind: string,
  ): Promise<ErasureTombstone> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 16384 || (info.mode & 0o077) !== 0)
        throw new Error('Invalid deletion ledger record.');
      const envelope = await file.readFile('utf8');
      const decoded: unknown = JSON.parse(
        this.cipher().decrypt(envelope, `backup-ledger:${jobId}:${kind}:v1`),
      );
      const record = ErasureTombstoneSchema.parse(decoded);
      if (record.jobId !== jobId || record.kind !== kind)
        throw new Error('Invalid deletion ledger record.');
      return record;
    } finally {
      await file.close();
    }
  }

  async record(input: ErasureTombstone): Promise<void> {
    const record = ErasureTombstoneSchema.parse(input);
    const directory = await this.ensureDirectory();
    const target = join(directory, `${record.jobId}.${record.kind}.ledger`);
    const temporary = join(directory, `${record.jobId}.${randomUUID()}.tmp`);
    const envelope = this.cipher().encrypt(
      JSON.stringify(record),
      `backup-ledger:${record.jobId}:${record.kind}:v1`,
    );
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(envelope, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(temporary, target);
      } catch (error: unknown) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        )
          throw error;
        if (
          JSON.stringify(await this.read(target, record.jobId, record.kind)) !==
          JSON.stringify(record)
        ) {
          throw new Error('Conflicting deletion ledger record.');
        }
      }
      const folder = await open(directory, constants.O_RDONLY);
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async *records(): AsyncGenerator<ErasureTombstone> {
    const directory = await this.ensureDirectory();
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (entry.name.endsWith('.tmp')) continue; // Unpublished crash remnants cannot grant replay authority.
      const match = filename.exec(entry.name);
      if (!match || !entry.isFile())
        throw new Error('Invalid deletion ledger entry.');
      yield await this.read(join(directory, entry.name), match[1], match[2]);
    }
  }

  /**
   * Removes completed ("deleted") tombstones whose retainedUntil has passed, together with
   * their now-superseded "admitted" counterpart for the same job. Requires explicit operator
   * confirmation: retainedUntil is a minimum review date, never a standing deletion permission
   * (see docs/privacy/backup-restoration.md). An "admitted" record with no matching "deleted"
   * record is never pruned here — its local purge is still unconfirmed, so it keeps protecting
   * against a restored backup regardless of its own retainedUntil. Bounds the ledger directory
   * so replay cost does not grow without limit.
   */
  async prune(
    confirmedBackupsRetired: boolean,
    now: Date = new Date(),
  ): Promise<{ removed: number; eligible: number }> {
    const directory = await this.ensureDirectory();
    const entries = await opendir(directory);
    let removed = 0;
    let eligible = 0;
    for await (const entry of entries) {
      if (entry.name.endsWith('.tmp')) continue;
      const match = filename.exec(entry.name);
      if (!match || !entry.isFile())
        throw new Error('Invalid deletion ledger entry.');
      const [, jobId, kind] = match;
      if (kind !== 'deleted') continue;
      const path = join(directory, entry.name);
      const record = await this.read(path, jobId, kind);
      if (Date.parse(record.retainedUntil) > now.getTime()) continue;
      eligible += 1;
      if (!confirmedBackupsRetired) continue;
      await unlink(path);
      removed += 1;
      await unlink(join(directory, `${jobId}.admitted.ledger`)).catch(
        (error: unknown) => {
          if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          )
            throw error;
        },
      );
    }
    return { removed, eligible };
  }
}
