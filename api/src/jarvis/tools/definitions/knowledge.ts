import { dataUnavailable } from '../../../http/data-unavailable';
import { defineTool } from '../define-tool';

export const knowledgeTools = [
  defineTool({
    name: 'knowledge.save',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.knowledge) throw dataUnavailable();
      const entry = await ctx.knowledge.save(sessionId, call.args);
      if (!entry) throw dataUnavailable();
      return `OK. Connaissance sauvegardée: "${entry.title}" [${entry.category}]`;
    },
  }),
  defineTool({
    name: 'knowledge.find',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.knowledge) throw dataUnavailable();
      const entries = await ctx.knowledge.find(sessionId, call.args);
      if (!entries.length)
        return `Aucune connaissance trouvée pour "${call.args.query}".`;
      return `${entries.length} connaissance(s):\n${entries.map((e) => `- [${e.category}] ${e.title}: ${e.content.slice(0, 100)}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'knowledge.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.knowledge) throw dataUnavailable();
      const entries = await ctx.knowledge.list(sessionId, call.args);
      if (!entries.length) return 'Base de connaissances vide.';
      return `${entries.length} entrée(s):\n${entries.map((e) => `- [${e.category}] ${e.title} (utilisée ${e.useCount}x)`).join('\n')}`;
    },
  }),
];
