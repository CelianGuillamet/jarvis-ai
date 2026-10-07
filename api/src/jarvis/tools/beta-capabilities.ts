import { TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolName } from './tool-registry';

export const DEFERRED_CAPABILITY_MESSAGE =
  'Cette fonctionnalité est reportée après la bêta privée.';

export function isDeferredCapability(name: string): boolean {
  return TOOL_DEFINITIONS[name as ToolName]?.deferred ?? false;
}
