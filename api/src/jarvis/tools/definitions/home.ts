import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { defineTool } from '../define-tool';

const NOT_READY =
  'L’intégration Home Assistant n’est pas disponible. Active-la dans Réglages.';

export const homeTools = [
  defineTool({
    name: 'home.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async ({ ctx }) => {
      if (!ctx.home) return NOT_READY;
      const status = await ctx.home.status();
      if (!status.enabled) return 'L’intégration domotique est désactivée.';
      if (!status.connected)
        return 'Home Assistant n’est pas connecté. Connecte-le dans Réglages.';
      if (!status.entities.length)
        return 'Aucun appareil n’est autorisé pour Jarvis. Choisis-les dans Réglages.';
      const readings = await ctx.home.readAllowed();
      if (!readings.length) return 'Aucun appareil autorisé n’a répondu.';
      return `Maison:\n${readings
        .map(
          (r) =>
            `- ${r.label} (${r.domain}) : ${r.state}${r.unit ? ` ${r.unit}` : ''}${r.brightnessPct !== null ? `, ${r.brightnessPct} %` : ''}`,
        )
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'home.light',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async ({ ctx }, call) => {
      if (!ctx.home) throw new CommandRejectedError(NOT_READY);
      const entity = await ctx.home.resolve(call.args.entity, 'light');
      const on = call.args.action === 'on';
      await ctx.home.setLight(entity, on, call.args.brightnessPct);
      return `OK. ${entity.label} ${on ? 'allumée' : 'éteinte'}${on && call.args.brightnessPct !== undefined ? ` à ${call.args.brightnessPct} %` : ''}.`;
    },
    preview: async ({ ctx }, call) => {
      if (!ctx.home) return NOT_READY;
      try {
        const entity = await ctx.home.resolve(call.args.entity, 'light');
        return `${call.args.action === 'on' ? 'Allumer' : 'Éteindre'} « ${entity.label} »${call.args.brightnessPct !== undefined ? ` à ${call.args.brightnessPct} %` : ''}.`;
      } catch (error) {
        return error instanceof Error ? error.message : NOT_READY;
      }
    },
  }),
  defineTool({
    name: 'home.scene',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async ({ ctx }, call) => {
      if (!ctx.home) throw new CommandRejectedError(NOT_READY);
      const entity = await ctx.home.resolve(call.args.entity, 'scene');
      await ctx.home.activateScene(entity);
      return `OK. Scène « ${entity.label} » activée.`;
    },
    preview: async ({ ctx }, call) => {
      if (!ctx.home) return NOT_READY;
      try {
        const entity = await ctx.home.resolve(call.args.entity, 'scene');
        return `Activer la scène « ${entity.label} ».`;
      } catch (error) {
        return error instanceof Error ? error.message : NOT_READY;
      }
    },
  }),
];
