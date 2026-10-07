import type { ToolDefinition } from './define-tool';
import type { ToolName } from './tool-registry';

export type ToolRegistry = { [N in ToolName]?: ToolDefinition<N> };

export const TOOL_DEFINITIONS: ToolRegistry = {};

export function registerTools(definitions: ToolDefinition[]) {
  for (const definition of definitions) {
    if (TOOL_DEFINITIONS[definition.name])
      throw new Error(`Duplicate tool definition: ${definition.name}`);
    (TOOL_DEFINITIONS as Record<string, ToolDefinition>)[definition.name] =
      definition;
  }
}
