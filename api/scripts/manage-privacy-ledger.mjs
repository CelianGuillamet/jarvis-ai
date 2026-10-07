import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { ErasureBackupLedger } from '../src/privacy/erasure-backup-ledger.ts';

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
      const ledger = new ErasureBackupLedger(new ConfigService());
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
