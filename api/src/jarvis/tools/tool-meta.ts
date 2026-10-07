import { TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolMetadata, ToolName } from './tool-registry';

export const TOOL_META = Object.fromEntries(
  Object.values(TOOL_DEFINITIONS).map((definition) => [
    definition.name,
    {
      requiresConfirmation: definition.requiresConfirmation,
      sideEffect: definition.sideEffect,
      risk: definition.risk,
    },
  ]),
) as Record<ToolName, ToolMetadata>;
