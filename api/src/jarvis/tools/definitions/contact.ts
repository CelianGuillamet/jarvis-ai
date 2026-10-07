import { dataUnavailable } from '../../../http/data-unavailable';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { defineTool } from '../define-tool';

export const contactTools = [
  defineTool({
    name: 'contact.save',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.contacts) throw dataUnavailable();
      const c = await ctx.contacts.save(sessionId, call.args);
      const details = [c.email, c.company, c.role].filter(Boolean).join(' · ');
      return `OK. Contact sauvegardé: ${c.name}${details ? ` (${details})` : ''}`;
    },
  }),
  defineTool({
    name: 'contact.find',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.contacts) throw dataUnavailable();
      const contacts = await ctx.contacts.find(sessionId, call.args.query);
      if (!contacts.length)
        return `Aucun contact trouvé pour "${call.args.query}".`;
      return contacts
        .map((c) => {
          const details = [c.email, c.phone, c.company]
            .filter(Boolean)
            .join(' · ');
          return `- ${c.name}${details ? `: ${details}` : ''}`;
        })
        .join('\n');
    },
  }),
  defineTool({
    name: 'contact.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.contacts) throw dataUnavailable();
      const contacts = await ctx.contacts.list(
        sessionId,
        call.args.limit ?? 20,
      );
      if (!contacts.length) return 'Aucun contact enregistré.';
      return (
        `${contacts.length} contact(s):\n` +
        contacts
          .map(
            (c) =>
              `- ${c.name}${c.email ? ` <${c.email}>` : ''}${c.company ? ` (${c.company})` : ''}`,
          )
          .join('\n')
      );
    },
  }),
  defineTool({
    name: 'contact.update',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.contacts) throw dataUnavailable();
      const contacts = await ctx.contacts.find(sessionId, call.args.query);
      if (!contacts.length)
        throw new CommandRejectedError(
          `Contact "${call.args.query}" introuvable.`,
          'NOT_FOUND',
        );
      const target = contacts[0];
      if (!target)
        throw new CommandRejectedError(
          `Contact "${call.args.query}" introuvable.`,
          'NOT_FOUND',
        );
      const updated = await ctx.contacts.update(
        sessionId,
        target.id,
        call.args.patch ?? {},
      );
      if (!updated) throw dataUnavailable();
      return `OK. Contact mis à jour: ${updated.name}`;
    },
  }),
  defineTool({
    name: 'contact.delete',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.contacts) throw dataUnavailable();
      const contacts = await ctx.contacts.find(sessionId, call.args.query);
      if (!contacts.length)
        throw new CommandRejectedError(
          `Contact "${call.args.query}" introuvable.`,
          'NOT_FOUND',
        );
      const target = contacts[0];
      if (!target)
        throw new CommandRejectedError(
          `Contact "${call.args.query}" introuvable.`,
          'NOT_FOUND',
        );
      const deleted = await ctx.contacts.delete(sessionId, target.id);
      if (!deleted) throw dataUnavailable();
      return `OK. Contact supprimé: ${target.name}`;
    },
  }),
];
