import { allToolDefinitions } from './definitions';
import type { AnyToolDefinition, ToolDefinition } from './define-tool';
import type { ToolName } from './tool-registry';

export type ToolRegistry = { [N in ToolName]?: ToolDefinition<N> };

export const TOOL_DEFINITIONS: ToolRegistry = {};

export function registerTools(definitions: readonly AnyToolDefinition[]) {
  for (const definition of definitions) {
    if (TOOL_DEFINITIONS[definition.name])
      throw new Error(`Duplicate tool definition: ${definition.name}`);
    (TOOL_DEFINITIONS as Record<string, AnyToolDefinition>)[definition.name] =
      definition;
  }
}

registerTools(allToolDefinitions);
