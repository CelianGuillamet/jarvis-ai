import type { ModelUsageSnapshot } from '../jarvis/providers/model-budget';
import type { OpsSnapshot } from './ops-metrics';

export type AlertThresholds = {
  minCommands: number;
  commandFailureRate: number;
  commandUnknownRate: number;
  modelFailureRate: number;
  minModelCalls: number;
  http5xx: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  minCommands: 10,
  commandFailureRate: 0.2,
  commandUnknownRate: 0.05,
  modelFailureRate: 0.3,
  minModelCalls: 10,
  http5xx: 20,
};

export type Alert = {
  code:
    | 'COMMAND_FAILURES'
    | 'COMMAND_UNKNOWN_OUTCOMES'
    | 'MODEL_FAILURES'
    | 'MODEL_BUDGET_REJECTIONS'
    | 'HTTP_5XX'
    | 'MUTATIONS_SUSPENDED';
  severity: 'warning' | 'critical';
};

export function evaluateAlerts(
  ops: OpsSnapshot,
  model: ModelUsageSnapshot | null,
  suspended: boolean,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): Alert[] {
  const alerts: Alert[] = [];
  const commands =
    ops.commandsCompleted + ops.commandsFailed + ops.commandsUnknown;
  if (commands >= thresholds.minCommands) {
    if (ops.commandsFailed / commands >= thresholds.commandFailureRate)
      alerts.push({ code: 'COMMAND_FAILURES', severity: 'critical' });
    if (ops.commandsUnknown / commands >= thresholds.commandUnknownRate)
      alerts.push({ code: 'COMMAND_UNKNOWN_OUTCOMES', severity: 'critical' });
  }
  if (
    model &&
    model.calls >= thresholds.minModelCalls &&
    model.failures / model.calls >= thresholds.modelFailureRate
  )
    alerts.push({ code: 'MODEL_FAILURES', severity: 'warning' });
  if (model && (model.rejectedGlobal > 0 || model.rejectedUser > 0))
    alerts.push({ code: 'MODEL_BUDGET_REJECTIONS', severity: 'warning' });
  if (ops.http5xx >= thresholds.http5xx)
    alerts.push({ code: 'HTTP_5XX', severity: 'critical' });
  if (suspended)
    alerts.push({ code: 'MUTATIONS_SUSPENDED', severity: 'warning' });
  return alerts;
}
