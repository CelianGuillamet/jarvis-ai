import { ErasureBackupReplayService } from './erasure-backup-replay.service';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountErasureWorker } from './account-erasure.worker';
import { PrivacyRetentionService } from './privacy-retention.service';

@Injectable()
export class PrivacySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrivacySchedulerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly worker: AccountErasureWorker,
    private readonly retention: PrivacyRetentionService,
    private readonly replay: ErasureBackupReplayService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Integration suites explicitly drive isolated ledger/replay and must not touch host data.
    if (this.config.get('NODE_ENV') === 'test') return;
    await this.replay.reconcile();
    if (this.config.get('PRIVACY_WORKER_ENABLED') === 'false') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 15000);
    this.timer.unref();
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.pending) return;
    this.pending = this.execute();
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  private async execute(): Promise<void> {
    try {
      await this.retention.runBatch();
    } catch {
      this.logger.warn('Privacy retention retry required.');
    }
    try {
      await this.worker.runOnce();
    } catch {
      this.logger.warn('Account erasure retry required.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
