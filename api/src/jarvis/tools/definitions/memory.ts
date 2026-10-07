import {
  MAX_FACTS_PER_OWNER,
  normalizeFactText,
  similarFacts,
  MAX_FACT_LENGTH,
} from '../../../memory/personal-memory';
import { compactText, formatPreviewLines } from '../support/tool-text';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { LAST_MEMORY_LIST, setLastMemoryList } from '../support/tool-caches';
import { defineTool } from '../define-tool';

export const memoryTools = [
  defineTool({
    name: 'memory.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const limit = Math.min(Math.max(call.args.limit ?? 20, 1), 40);
      const facts = await prisma.personalFact.findMany({
        select: { id: true, text: true, origin: true, updatedAt: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: limit,
      });
      setLastMemoryList(
        sessionId,
        facts.map(({ id, text }) => ({ id, text })),
      );
      if (!facts.length)
        return 'Je n’ai encore retenu aucun fait vous concernant. Dites « Retiens que… » pour m’en proposer un.';
      const lines = facts.map(
        (fact, index) =>
          `- #${index + 1} « ${compactText(fact.text, 200)} » (${fact.origin === 'chat' ? 'chat' : 'Réglages'}, ${fact.updatedAt.toISOString().slice(0, 10)})`,
      );
      return `Ce que vous m’avez demandé de retenir :\n${lines.join('\n')}\n\nCorrigez ou oubliez ces faits dans Réglages, ou dites « Oublie #N ».`;
    },
  }),
  defineTool({
    name: 'memory.remember',
    risk: 'low',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const text = normalizeFactText(call.args.text);
      if (!text)
        throw new CommandRejectedError(
          `Fait invalide : 1 à ${MAX_FACT_LENGTH} caractères, sans caractère de contrôle.`,
        );
      if ((await prisma.personalFact.count()) >= MAX_FACTS_PER_OWNER)
        throw new CommandRejectedError(
          'La mémoire est pleine. Oubliez un fait avant d’en ajouter un autre.',
        );
      await prisma.personalFact.create({
        data: { ownerId: prisma.ownerId, text, origin: 'chat' },
        select: { id: true },
      });
      LAST_MEMORY_LIST.delete(sessionId);
      return `C’est noté : « ${compactText(text, 200)} ».`;
    },
    preview: async (env, call) => {
      const { prisma } = env;
      const text = normalizeFactText(call.args.text);
      if (!text) return null;
      const close = similarFacts(
        await prisma.personalFact.findMany({
          select: {
            id: true,
            text: true,
            origin: true,
            createdAt: true,
            updatedAt: true,
          },
          take: MAX_FACTS_PER_OWNER,
        }),
        text,
      );
      return formatPreviewLines([
        `Fait à retenir : « ${compactText(text, 200)} »`,
        'Portée : votre compte. Vous pourrez le corriger ou l’oublier dans Réglages.',
        close.length
          ? `Faits proches déjà retenus (vérifiez qu’ils ne se contredisent pas) :\n${close.map((fact) => `- « ${compactText(fact.text, 160)} »`).join('\n')}`
          : null,
      ]);
    },
  }),
  defineTool({
    name: 'memory.forget',
    risk: 'low',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const { id, text } = call.args;
      if (!id || !text)
        throw new CommandRejectedError(
          'Propose à nouveau l’oubli pour le confirmer.',
        );
      const { count } = await prisma.personalFact.deleteMany({
        where: { id, text },
      });
      LAST_MEMORY_LIST.delete(sessionId);
      if (!count)
        throw new CommandRejectedError(
          'Ce fait a changé ou n’existe plus. Rien n’a été oublié.',
          'NOT_FOUND',
        );
      return `C’est oublié : « ${compactText(text, 200)} ».`;
    },
    preview: (_env, call) => {
      return call.args.text
        ? `Fait à oublier : « ${compactText(call.args.text, 200)} »`
        : null;
    },
  }),
];
