import type { ToolContext } from './tools';
import type { createToolResolvers } from './support/tool-resolvers';
import type { ToolName, ToolOnly, ToolRiskLevel } from './tool-registry';

export type ToolRequirement =
  | 'none'
  | 'calendar.read'
  | 'calendar.write'
  | 'gmail.read'
  | 'gmail.modify'
  | 'gmail.send'
  | 'gmail.permanent_delete';

export type ToolHandlerEnv = {
  ctx: ToolContext;
  prisma: ToolContext['prisma'];
  tz: ToolContext['tz'];
  sessionId: string;
  todoSelection: { id?: { in: string[] } };
  shoppingSelection: { id?: { in: string[] } };
  resolvers: ReturnType<typeof createToolResolvers>;
};

type CallOf<N extends ToolName> = Extract<ToolOnly, { name: N }>;

export type ToolDefinition<N extends ToolName = ToolName> = {
  name: N;
  risk: ToolRiskLevel;
  requiresConfirmation: boolean;
  sideEffect: boolean;
  requires: ToolRequirement;
  deferred: boolean;
  handler: (env: ToolHandlerEnv, call: CallOf<N>) => Promise<string>;
  preview?: (env: ToolHandlerEnv, call: CallOf<N>) => Promise<string | null>;
};

export function defineTool<N extends ToolName>(
  definition: ToolDefinition<N>,
): ToolDefinition<N> {
  return definition;
}
