import type { ToolContext } from '../tools';
import type { ToolHandlerEnv } from '../define-tool';
import { createToolResolvers } from './tool-resolvers';

export function buildToolEnv(ctx: ToolContext): ToolHandlerEnv {
  const { prisma, tz, sessionId } = ctx;
  const todoSelection =
    ctx.frozenLocalTargets?.kind === 'todo'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  const shoppingSelection =
    ctx.frozenLocalTargets?.kind === 'shopping'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  return {
    ctx,
    prisma,
    tz,
    sessionId,
    todoSelection,
    shoppingSelection,
    resolvers: createToolResolvers(ctx),
  };
}
