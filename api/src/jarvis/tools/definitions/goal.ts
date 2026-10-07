import { dataUnavailable } from '../../../http/data-unavailable';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { defineTool } from '../define-tool';

export const goalTools = [
  defineTool({
    name: 'goal.create',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.goals) throw dataUnavailable();
      const goal = await ctx.goals.create(sessionId, {
        title: call.args.title,
        description: call.args.description,
        priority: call.args.priority,
        targetDate: call.args.targetDate
          ? new Date(call.args.targetDate)
          : undefined,
        parentGoalId: call.args.parentGoalId,
      });
      if (!goal)
        throw new CommandRejectedError(
          'Objectif parent introuvable.',
          'NOT_FOUND',
        );
      return `Objectif créé: "${goal.title}" [ID: ${goal.id}]${goal.priority ? ` [P${goal.priority}]` : ''}${goal.targetDate ? ` — échéance: ${goal.targetDate}` : ''}`;
    },
  }),
  defineTool({
    name: 'goal.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.goals) throw dataUnavailable();
      const goals = await ctx.goals.list(sessionId, {
        status: call.args.status ?? 'active',
      });
      if (!goals.length) return 'Aucun objectif actif.';
      const format = (g: (typeof goals)[0], depth = 0): string => {
        const indent = '  '.repeat(depth);
        const sub = g.subGoals.map((s) => format(s, depth + 1)).join('\n');
        return `${indent}- [${g.id.slice(0, 8)}] ${g.title}${g.priority ? ` [P${g.priority}]` : ''}${g.targetDate ? ` (${g.targetDate.slice(0, 10)})` : ''}${sub ? '\n' + sub : ''}`;
      };
      return `${goals.length} objectif(s):\n${goals.map((g) => format(g)).join('\n')}`;
    },
  }),
  defineTool({
    name: 'goal.decompose',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.goals) throw dataUnavailable();
      const sub = await ctx.goals.decompose(
        sessionId,
        call.args.goalId,
        call.args.subGoals,
      );
      if (!sub.length) return 'Aucun sous-objectif créé.';
      return `${sub.length} sous-objectif(s) créé(s) pour [${call.args.goalId.slice(0, 8)}]:\n${sub.map((s) => `- ${s.title}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'goal.done',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.goals) throw dataUnavailable();
      const goal = await ctx.goals.updateStatus(
        sessionId,
        call.args.goalId,
        'done',
      );
      if (!goal) throw dataUnavailable();
      return `Objectif "${goal.title}" marqué comme terminé.`;
    },
  }),
];
