import 'dotenv/config';
import { hkdfSync } from 'node:crypto';
import { ErasureBackupLedgerEngine } from '../src/privacy/erasure-backup-ledger-engine.ts';
import { TokenCipher } from '../src/google/token-cipher.ts';

function resolveCipher() {
  const ledgerKeys = process.env.PRIVACY_LEDGER_KEYS;
  if (ledgerKeys) return new TokenCipher(ledgerKeys, process.env.PRIVACY_LEDGER_ACTIVE_KEY || '');
  const secret = process.env.AUTH_SECRET || '';
  if (secret.length < 32) throw new Error('Backup deletion ledger unavailable.');
  const key = Buffer.from(hkdfSync('sha256', secret, 'jarvis-privacy-ledger-v1', 'backup-tombstones', 32));
  return new TokenCipher(JSON.stringify({ 'auth-derived-v1': key.toString('base64') }), 'auth-derived-v1');
}

const [operation, flag, ...extra] = process.argv.slice(2);
if (operation !== 'prune' || extra.length) {
  console.error('Usage: npm run privacy:ledger -- prune [--backups-confirmed-retired]');
  process.exitCode = 1;
} else {
  const confirmed = flag === '--backups-confirmed-retired';
  if (flag && !confirmed) {
    console.error('Usage: npm run privacy:ledger -- prune [--backups-confirmed-retired]');
    process.exitCode = 1;
  } else {
    try {
      const ledger = new ErasureBackupLedgerEngine({
        directory: process.env.PRIVACY_LEDGER_DIR,
        cipher: resolveCipher,
        isProduction: process.env.NODE_ENV === 'production',
      });
      const { removed, eligible } = await ledger.prune(confirmed);
      if (!confirmed && eligible) {
        console.log(
          `${eligible} completed record(s) have passed their minimum review date. Re-run with `
            + '--backups-confirmed-retired only after confirming every backup able to reintroduce '
            + 'these accounts has been retired.',
        );
      } else {
        console.log(`Removed ${removed} completed deletion ledger record(s) past their review date.`);
      }
    } catch {
      console.error('Deletion ledger pruning failed. Check PRIVACY_LEDGER_DIR and its keys first.');
      process.exitCode = 1;
    }
  }
}
