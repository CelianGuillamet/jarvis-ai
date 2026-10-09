import { ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { opsMetrics } from './ops-metrics';

export const MUTATIONS_SUSPENDED_MESSAGE =
  'Les actions sont temporairement suspendues. La consultation reste disponible.';

/** Engaged by MUTATIONS_DISABLED=true or by the presence of MUTATION_KILL_SWITCH_FILE; the file works without a restart. */
export class MutationsSuspendedError extends ServiceUnavailableException {
  constructor() {
    super(MUTATIONS_SUSPENDED_MESSAGE);
  }
}

export function mutationsSuspended(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): boolean {
  if (env.MUTATIONS_DISABLED === 'true') return true;
  const file = env.MUTATION_KILL_SWITCH_FILE?.trim();
  return !!file && exists(file);
}

export function assertMutationsAllowed(): void {
  if (!mutationsSuspended()) return;
  opsMetrics.killSwitchRefusals += 1;
  throw new MutationsSuspendedError();
}
