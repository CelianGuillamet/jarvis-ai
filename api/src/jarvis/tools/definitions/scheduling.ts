import { dataUnavailable } from '../../../http/data-unavailable';
import { defineTool } from '../define-tool';

export const schedulingTools = [
  defineTool({
    name: 'schedule.suggest',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.scheduling) throw dataUnavailable();
      const suggestion = await ctx.scheduling.suggestSchedule(sessionId, {
        taskId: call.args.taskId,
        suggestedTime: new Date(call.args.suggestedTime),
        rationale: call.args.rationale,
        priority: call.args.priority,
      });
      if (!suggestion) throw dataUnavailable();
      const time = new Date(suggestion.suggestedTime).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return `Suggestion créée [${suggestion.id.slice(0, 8)}]: ${time} — ${suggestion.rationale}`;
    },
  }),
  defineTool({
    name: 'schedule.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.scheduling) throw dataUnavailable();
      const suggestions = await ctx.scheduling.listSuggestions(sessionId, {
        applied: call.args.applied,
      });
      if (!suggestions.length) return 'Aucune suggestion de planification.';
      return suggestions
        .map((s, i) => {
          const time = new Date(s.suggestedTime).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
          return `${i + 1}. [${s.id.slice(0, 8)}] ${time} — ${s.rationale}${s.applied ? ' ✓' : ''}`;
        })
        .join('\n');
    },
  }),
  defineTool({
    name: 'schedule.apply',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.scheduling) throw dataUnavailable();
      const applied = await ctx.scheduling.applySuggestion(
        sessionId,
        call.args.suggestionId,
      );
      if (!applied) throw dataUnavailable();
      const time = new Date(applied.suggestedTime).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return `Suggestion appliquée: ${time} — ${applied.rationale}`;
    },
  }),
  defineTool({
    name: 'schedule.next_slot',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.scheduling) throw dataUnavailable();
      const after = call.args.afterDate
        ? new Date(call.args.afterDate)
        : new Date();
      const slot = await ctx.scheduling.findNextAvailableSlot(
        sessionId,
        after,
        call.args.durationMinutes ?? 60,
      );
      if (!slot)
        return 'Aucun créneau disponible trouvé dans les 48 prochaines heures.';
      const time = slot.toLocaleString('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      return `Prochain créneau disponible: ${time} (durée: ${call.args.durationMinutes ?? 60}min)`;
    },
  }),
];
