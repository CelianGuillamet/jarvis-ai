import { CommandRejectedError } from '../../../commands/command-rejected.error';
import {
  LAST_SHOPPING_LIST,
  setLastShoppingList,
  patchShoppingInCache,
  removeShoppingFromCache,
} from '../support/tool-caches';
import { defineTool } from '../define-tool';

export const shoppingTools = [
  defineTool({
    name: 'shopping.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma } = env;
      const created = await prisma.shoppingItem.create({
        data: { ownerId: prisma.ownerId, text: call.args.text },
        select: { id: true },
      });

      ctx.recordUndo?.('ajout article courses', true, [
        { kind: 'shopping.delete', id: created.id },
      ]);

      return `OK. Ajouté à la liste de courses: "${call.args.text}"`;
    },
  }),
  defineTool({
    name: 'shopping.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const show = call.args.show ?? 'open';
      const items = await prisma.shoppingItem.findMany({
        where: show === 'open' ? { bought: false } : {},
        orderBy: { createdAt: 'asc' },
        select: { id: true, text: true, bought: true },
      });
      setLastShoppingList(
        sessionId,
        items.map((i) => ({ id: i.id, text: i.text, bought: i.bought })),
      );
      if (!items.length) return 'Liste de courses vide.';
      return `Courses (${show}):\n${items
        .map((i, idx) => `- #${idx + 1} - ${i.text}${i.bought ? ' ✅' : ''}`)
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'shopping.bought',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShopping } = env.resolvers;
      const { row, error } = await resolveShopping(call.args.query, false);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun article trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.shoppingItem.findUnique({
        where: { id: row.id },
        select: { bought: true, boughtAt: true },
      });

      await prisma.shoppingItem.update({
        where: { id: row.id },
        data: { bought: true, boughtAt: new Date() },
      });
      patchShoppingInCache(sessionId, row.id, { bought: true });

      if (before) {
        ctx.recordUndo?.('article marqué acheté', true, [
          {
            kind: 'shopping.update',
            id: row.id,
            data: { bought: before.bought, boughtAt: before.boughtAt },
          },
        ]);
      }

      return `OK. Acheté: "${row.text}" ✅`;
    },
  }),
  defineTool({
    name: 'shopping.unbought',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShopping } = env.resolvers;
      const { row, error } = await resolveShopping(call.args.query, true);
      if (error) throw new CommandRejectedError(error);
      if (!row) {
        throw new CommandRejectedError(
          `Aucun article déjà acheté trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );
      }

      const before = await prisma.shoppingItem.findUnique({
        where: { id: row.id },
        select: { bought: true, boughtAt: true },
      });

      await prisma.shoppingItem.update({
        where: { id: row.id },
        data: { bought: false, boughtAt: null },
      });
      patchShoppingInCache(sessionId, row.id, { bought: false });

      if (before) {
        ctx.recordUndo?.('article remis en non acheté', true, [
          {
            kind: 'shopping.update',
            id: row.id,
            data: { bought: before.bought, boughtAt: before.boughtAt },
          },
        ]);
      }

      return `OK. Remis en non acheté: "${row.text}"`;
    },
  }),
  defineTool({
    name: 'shopping.bought_all',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, shoppingSelection } = env;
      const before = await prisma.shoppingItem.findMany({
        where: { ...shoppingSelection, bought: false },
        select: { id: true, bought: true, boughtAt: true },
      });
      if (!before.length) return 'Aucun article non acheté à marquer.';

      await prisma.shoppingItem.updateMany({
        where: { ...shoppingSelection, bought: false },
        data: { bought: true, boughtAt: new Date() },
      });
      for (const row of before) {
        patchShoppingInCache(sessionId, row.id, { bought: true });
      }

      ctx.recordUndo?.(
        `articles marqués achetés (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'shopping.update' as const,
          id: r.id,
          data: { bought: r.bought, boughtAt: r.boughtAt },
        })),
      );

      return `OK. ${before.length} articles marqués comme achetés.`;
    },
  }),
  defineTool({
    name: 'shopping.update',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShopping } = env.resolvers;
      const nextText = call.args.text.trim();
      if (!nextText)
        throw new CommandRejectedError(
          "Le nouveau texte de l'article est vide.",
        );

      const { row, error } = await resolveShopping(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun article trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      await prisma.shoppingItem.update({
        where: { id: row.id },
        data: { text: nextText },
      });
      patchShoppingInCache(sessionId, row.id, { text: nextText });

      ctx.recordUndo?.('modification article courses', true, [
        {
          kind: 'shopping.update',
          id: row.id,
          data: { text: row.text },
        },
      ]);

      return `OK. Article modifié: "${row.text}" → "${nextText}"`;
    },
  }),
  defineTool({
    name: 'shopping.delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShopping } = env.resolvers;
      const { row, error } = await resolveShopping(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun article trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.shoppingItem.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          text: true,
          bought: true,
          boughtAt: true,
          createdAt: true,
        },
      });

      await prisma.shoppingItem.delete({ where: { id: row.id } });
      removeShoppingFromCache(sessionId, row.id);

      if (before) {
        ctx.recordUndo?.('suppression article courses', true, [
          {
            kind: 'shopping.upsert',
            row: {
              id: before.id,
              text: before.text,
              bought: before.bought,
              boughtAt: before.boughtAt,
              createdAt: before.createdAt,
            },
          },
        ]);
      }

      return `OK. Article supprimé: "${row.text}"`;
    },
  }),
  defineTool({
    name: 'shopping.bulk_bought',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShoppingRefs } = env.resolvers;
      const { rows, error } = resolveShoppingRefs(call.args.refs, false);
      if (error) throw new CommandRejectedError(error);
      if (!rows.length) return 'Aucun article à marquer.';

      const ids = rows.map((r) => r.id);
      const before = await prisma.shoppingItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, bought: true, boughtAt: true },
      });

      await prisma.shoppingItem.updateMany({
        where: { id: { in: ids } },
        data: { bought: true, boughtAt: new Date() },
      });
      for (const row of rows)
        patchShoppingInCache(sessionId, row.id, { bought: true });

      ctx.recordUndo?.(
        `articles marqués achetés (${rows.length})`,
        true,
        before.map((r) => ({
          kind: 'shopping.update' as const,
          id: r.id,
          data: { bought: r.bought, boughtAt: r.boughtAt },
        })),
      );

      return `OK. ${rows.length} articles marqués comme achetés.`;
    },
  }),
  defineTool({
    name: 'shopping.bulk_delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveShoppingRefs } = env.resolvers;
      const { rows, error } = resolveShoppingRefs(call.args.refs);
      if (error) throw new CommandRejectedError(error);
      if (!rows.length) return 'Aucun article à supprimer.';

      const ids = rows.map((r) => r.id);
      const before = await prisma.shoppingItem.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          text: true,
          bought: true,
          boughtAt: true,
          createdAt: true,
        },
      });

      await prisma.shoppingItem.deleteMany({ where: { id: { in: ids } } });
      for (const row of rows) removeShoppingFromCache(sessionId, row.id);

      ctx.recordUndo?.(
        `suppression articles courses (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'shopping.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            bought: r.bought,
            boughtAt: r.boughtAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. ${before.length} articles supprimés.`;
    },
  }),
  defineTool({
    name: 'shopping.clear_bought',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, shoppingSelection } = env;
      const before = await prisma.shoppingItem.findMany({
        where: { ...shoppingSelection, bought: true },
        select: {
          id: true,
          text: true,
          bought: true,
          boughtAt: true,
          createdAt: true,
        },
      });
      if (!before.length) return 'Aucun article acheté à supprimer.';

      await prisma.shoppingItem.deleteMany({
        where: { ...shoppingSelection, bought: true },
      });
      for (const row of before) removeShoppingFromCache(sessionId, row.id);

      ctx.recordUndo?.(
        `nettoyage articles achetés (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'shopping.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            bought: r.bought,
            boughtAt: r.boughtAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. ${before.length} articles achetés supprimés.`;
    },
  }),
  defineTool({
    name: 'shopping.clear_all',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, shoppingSelection } = env;
      const before = await prisma.shoppingItem.findMany({
        where: shoppingSelection,
        select: {
          id: true,
          text: true,
          bought: true,
          boughtAt: true,
          createdAt: true,
        },
      });
      if (!before.length) return 'Aucun article à supprimer.';

      await prisma.shoppingItem.deleteMany({ where: shoppingSelection });
      LAST_SHOPPING_LIST.delete(sessionId);

      ctx.recordUndo?.(
        `suppression complète des courses (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'shopping.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            bought: r.bought,
            boughtAt: r.boughtAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. Toute la liste de courses a été supprimée (${before.length}).`;
    },
  }),
];
