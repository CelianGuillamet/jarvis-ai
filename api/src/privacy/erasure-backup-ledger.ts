import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hkdfSync } from 'node:crypto';
import { TokenCipher } from '../google/token-cipher';
import {
  ErasureBackupLedgerEngine,
  ErasureTombstoneSchema,
} from './erasure-backup-ledger-engine';
import type {
  ErasureLedgerCipher,
  ErasureTombstone,
} from './erasure-backup-ledger-engine';

export { ErasureTombstoneSchema };
export type { ErasureTombstone };

export function resolveLedgerCipher(
  ledgerKeys: string | undefined,
  ledgerActiveKey: string | undefined,
  authSecret: string | undefined,
): ErasureLedgerCipher {
  if (ledgerKeys) return new TokenCipher(ledgerKeys, ledgerActiveKey || '');
  const secret = authSecret || '';
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

/** Thin Nest adapter over the decorator-free engine; see erasure-backup-ledger-engine.ts. */
@Injectable()
export class ErasureBackupLedger {
  private readonly engine: ErasureBackupLedgerEngine;

  constructor(config: ConfigService) {
    this.engine = new ErasureBackupLedgerEngine({
      directory: config.get<string>('PRIVACY_LEDGER_DIR'),
      cipher: () =>
        resolveLedgerCipher(
          config.get<string>('PRIVACY_LEDGER_KEYS'),
          config.get<string>('PRIVACY_LEDGER_ACTIVE_KEY'),
          config.get<string>('AUTH_SECRET'),
        ),
      isProduction: config.get('NODE_ENV') === 'production',
    });
  }

  record(input: ErasureTombstone): Promise<void> {
    return this.engine.record(input);
  }

  records(): AsyncGenerator<ErasureTombstone> {
    return this.engine.records();
  }

  prune(
    confirmedBackupsRetired: boolean,
    now?: Date,
  ): Promise<{ removed: number; eligible: number }> {
    return this.engine.prune(confirmedBackupsRetired, now);
  }
}
