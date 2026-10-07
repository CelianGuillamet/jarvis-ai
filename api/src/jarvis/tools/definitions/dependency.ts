import { dataUnavailable } from '../../../http/data-unavailable';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { defineTool } from '../define-tool';

export const dependencyTools = [
  defineTool({
    name: 'dependency.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.dependencies) throw dataUnavailable();
      const dep = await ctx.dependencies.addDependency(
        sessionId,
        call.args.sourceTaskId,
        call.args.targetTaskId,
        {
          dependencyType: call.args.dependencyType,
          estimatedDays: call.args.estimatedDays,
        },
      );
      if (!dep)
        throw new CommandRejectedError(
          'Dépendance invalide ou tâches introuvables.',
        );
      return `Dépendance ajoutée: ${dep.sourceTaskId.slice(0, 8)} → ${dep.targetTaskId.slice(0, 8)} (${dep.dependencyType})`;
    },
  }),
  defineTool({
    name: 'dependency.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.dependencies) throw dataUnavailable();
      const graph = await ctx.dependencies.getDependencies(
        sessionId,
        call.args.taskId,
      );
      const lines: string[] = [
        `Dépendances de [${call.args.taskId.slice(0, 8)}]:`,
      ];
      if (graph.blockingTasks.length)
        lines.push(
          `  Bloque: ${graph.blockingTasks.map((id) => id.slice(0, 8)).join(', ')}`,
        );
      else lines.push('  Bloque: aucune tâche');
      if (graph.blockedByTasks.length)
        lines.push(
          `  Bloqué par: ${graph.blockedByTasks.map((id) => id.slice(0, 8)).join(', ')}`,
        );
      else lines.push('  Bloqué par: rien');
      return lines.join('\n');
    },
  }),
  defineTool({
    name: 'dependency.order',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.dependencies) throw dataUnavailable();
      const ordered = await ctx.dependencies.orderTasks(
        sessionId,
        call.args.taskIds,
      );
      return `Ordre d'exécution:\n${ordered.map((id, i) => `${i + 1}. ${id.slice(0, 8)}`).join('\n')}`;
    },
  }),
];
