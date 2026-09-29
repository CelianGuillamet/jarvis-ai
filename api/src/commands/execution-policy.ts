import { ForbiddenException } from '@nestjs/common';
import {
  DEFERRED_CAPABILITY_MESSAGE,
  isDeferredCapability,
} from '../jarvis/tools/beta-capabilities';
import {
  gateToolCall,
  type GoogleConnectionStatus,
} from '../jarvis/tools/tool-engine';
import type { ToolName } from '../jarvis/tools/tool-registry';

export type MutationPolicyContext = {
  ownerId: string;
  simulation: boolean;
  capabilities: readonly ToolName[];
  loadGoogleStatus: () => Promise<GoogleConnectionStatus>;
};

/** Both adapters enter here immediately before running a mutation callback. */
export async function executeWithPolicy<T>(
  context: MutationPolicyContext,
  mutate: () => Promise<T>,
  simulate: () => T | Promise<T>,
): Promise<T> {
  if (!context.ownerId?.trim()) {
    throw new ForbiddenException('Propriétaire de commande manquant.');
  }
  if (!context.capabilities.length) {
    throw new ForbiddenException('Capacité de commande manquante.');
  }
  if (context.capabilities.some(isDeferredCapability)) {
    throw new ForbiddenException(DEFERRED_CAPABILITY_MESSAGE);
  }
  // Simulation never enters the mutation closure, including its local writes.
  if (context.simulation) return simulate();
  if (context.capabilities.some((name) => /^(gmail|calendar)\./.test(name))) {
    const status = await context.loadGoogleStatus();
    for (const name of context.capabilities) {
      const error = gateToolCall({ name }, status);
      if (error) throw error;
    }
  }
  return mutate();
}
