import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ModelBudget } from '../jarvis/providers/model-budget';
import { evaluateAlerts, type Alert } from './alerts';
import { mutationsSuspended } from './mutation-kill-switch';
import { opsMetrics } from './ops-metrics';

export function currentAlerts(): Alert[] {
  return evaluateAlerts(
    opsMetrics.snapshot(),
    ModelBudget.shared?.snapshot() ?? null,
    mutationsSuspended(),
  );
}

@Injectable()
export class OpsMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OpsMonitor');
  private timer?: NodeJS.Timeout;
  private lastKey = '';

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.check(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  check(): Alert[] {
    const alerts = currentAlerts();
    const key = alerts.map((a) => a.code).join(',');
    if (key && key !== this.lastKey)
      for (const alert of alerts)
        this.logger.error(`ALERT ${alert.severity} ${alert.code}`);
    this.lastKey = key;
    return alerts;
  }
}
