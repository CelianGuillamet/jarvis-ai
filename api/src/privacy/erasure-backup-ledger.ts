import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { mkdir, lstat, open, link, unlink, opendir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hkdfSync, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TokenCipher } from '../google/token-cipher';

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

/** Independent of database dumps. Immutable encrypted records are published atomically. */
@Injectable()
export class ErasureBackupLedger {
  constructor(private readonly config: ConfigService) {}

  private directory() {
    return resolve(
      this.config.get<string>('PRIVACY_LEDGER_DIR') || '.privacy-ledger',
    );
  }

  private cipher() {
    const configured = this.config.get<string>('PRIVACY_LEDGER_KEYS');
    if (configured)
      return new TokenCipher(
        configured,
        this.config.get<string>('PRIVACY_LEDGER_ACTIVE_KEY') || '',
      );
    const secret = this.config.get<string>('AUTH_SECRET') || '';
    if (secret.length < 32)
      throw new Error('Backup deletion ledger unavailable.');
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        secret,
        'jarvis-privacy-ledger-v1',
        'backup-tombstones',
        32,
      ),
    );
    return new TokenCipher(
      JSON.stringify({ 'auth-derived-v1': key.toString('base64') }),
      'auth-derived-v1',
    );
  }

  private async ensureDirectory() {
    const directory = this.directory();
    if (this.config.get('NODE_ENV') !== 'production') {
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
}
