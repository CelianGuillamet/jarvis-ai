export type OpsSnapshot = {
  commandsCompleted: number;
  commandsFailed: number;
  commandsUnknown: number;
  killSwitchRefusals: number;
  http5xx: number;
};

/** Process-local counters only; no identifiers or content are ever recorded. */
class OpsMetrics implements OpsSnapshot {
  commandsCompleted = 0;
  commandsFailed = 0;
  commandsUnknown = 0;
  killSwitchRefusals = 0;
  http5xx = 0;

  snapshot(): OpsSnapshot {
    return {
      commandsCompleted: this.commandsCompleted,
      commandsFailed: this.commandsFailed,
      commandsUnknown: this.commandsUnknown,
      killSwitchRefusals: this.killSwitchRefusals,
      http5xx: this.http5xx,
    };
  }

  reset(): void {
    this.commandsCompleted = 0;
    this.commandsFailed = 0;
    this.commandsUnknown = 0;
    this.killSwitchRefusals = 0;
    this.http5xx = 0;
  }
}

export const opsMetrics = new OpsMetrics();
