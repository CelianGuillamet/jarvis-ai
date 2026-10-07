import { CommandRejectedError } from '../../../commands/command-rejected.error';
import {
  LAST_TODO_LIST,
  setLastTodoList,
  patchTodoInCache,
  removeTodoFromCache,
} from '../support/tool-caches';
import { defineTool } from '../define-tool';

export const todoTools = [
  defineTool({
    name: 'todo.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma } = env;
      const created = await prisma.todo.create({
        data: { ownerId: prisma.ownerId, text: call.args.text },
        select: { id: true },
      });
      ctx.recordUndo?.('ajout todo', true, [
        { kind: 'todo.delete', id: created.id },
      ]);
      return `OK. Ajouté: "${call.args.text}"`;
    },
  }),
  defineTool({
    name: 'todo.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const show = call.args.show ?? 'open';
      const todos = await prisma.todo.findMany({
        where: show === 'open' ? { done: false } : {},
        orderBy: { createdAt: 'asc' },
        select: { id: true, text: true, done: true },
      });
      setLastTodoList(
        sessionId,
        todos.map((t) => ({ id: t.id, text: t.text, done: t.done })),
      );
      if (!todos.length) return 'Aucun todo.';
      return `Todos (${show}):\n${todos
        .map((t, idx) => `- #${idx + 1} - ${t.text}${t.done ? ' ✅' : ''}`)
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'todo.done',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodo } = env.resolvers;
      const { row, error } = await resolveTodo(call.args.query, false);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun todo trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.todo.findUnique({
        where: { id: row.id },
        select: { done: true, doneAt: true },
      });

      await prisma.todo.update({
        where: { id: row.id },
        data: { done: true, doneAt: new Date() },
      });
      patchTodoInCache(sessionId, row.id, { done: true });

      if (before) {
        ctx.recordUndo?.('todo marqué fait', true, [
          {
            kind: 'todo.update',
            id: row.id,
            data: { done: before.done, doneAt: before.doneAt },
          },
        ]);
      }

      return `OK. Terminé: "${row.text}" ✅`;
    },
  }),
  defineTool({
    name: 'todo.reopen',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodo } = env.resolvers;
      const { row, error } = await resolveTodo(call.args.query, true);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun todo terminé trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.todo.findUnique({
        where: { id: row.id },
        select: { done: true, doneAt: true },
      });

      await prisma.todo.update({
        where: { id: row.id },
        data: { done: false, doneAt: null },
      });
      patchTodoInCache(sessionId, row.id, { done: false });

      if (before) {
        ctx.recordUndo?.('todo rouvert', true, [
          {
            kind: 'todo.update',
            id: row.id,
            data: { done: before.done, doneAt: before.doneAt },
          },
        ]);
      }

      return `OK. Réouvert: "${row.text}"`;
    },
  }),
  defineTool({
    name: 'todo.done_all',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, todoSelection } = env;
      const before = await prisma.todo.findMany({
        where: { ...todoSelection, done: false },
        select: { id: true, done: true, doneAt: true },
      });
      if (!before.length) return 'Aucun todo ouvert à terminer.';

      await prisma.todo.updateMany({
        where: { ...todoSelection, done: false },
        data: { done: true, doneAt: new Date() },
      });
      for (const row of before)
        patchTodoInCache(sessionId, row.id, { done: true });

      ctx.recordUndo?.(
        `todos marqués terminés (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'todo.update' as const,
          id: r.id,
          data: { done: r.done, doneAt: r.doneAt },
        })),
      );

      return `OK. ${before.length} todos marqués comme terminés.`;
    },
  }),
  defineTool({
    name: 'todo.update',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodo } = env.resolvers;
      const nextText = call.args.text.trim();
      if (!nextText)
        throw new CommandRejectedError('Le nouveau texte du todo est vide.');

      const { row, error } = await resolveTodo(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun todo trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      await prisma.todo.update({
        where: { id: row.id },
        data: { text: nextText },
      });
      patchTodoInCache(sessionId, row.id, { text: nextText });

      ctx.recordUndo?.('modification todo', true, [
        { kind: 'todo.update', id: row.id, data: { text: row.text } },
      ]);

      return `OK. Todo modifié: "${row.text}" → "${nextText}"`;
    },
  }),
  defineTool({
    name: 'todo.delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodo } = env.resolvers;
      const { row, error } = await resolveTodo(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucun todo trouvé pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.todo.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          text: true,
          done: true,
          doneAt: true,
          createdAt: true,
        },
      });

      await prisma.todo.delete({ where: { id: row.id } });
      removeTodoFromCache(sessionId, row.id);

      if (before) {
        ctx.recordUndo?.('suppression todo', true, [
          {
            kind: 'todo.upsert',
            row: {
              id: before.id,
              text: before.text,
              done: before.done,
              doneAt: before.doneAt,
              createdAt: before.createdAt,
            },
          },
        ]);
      }

      return `OK. Todo supprimé: "${row.text}"`;
    },
  }),
  defineTool({
    name: 'todo.bulk_done',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodoRefs } = env.resolvers;
      const { rows, error } = resolveTodoRefs(call.args.refs, false);
      if (error) throw new CommandRejectedError(error);
      if (!rows.length) return 'Aucun todo à marquer.';

      const ids = rows.map((r) => r.id);
      const before = await prisma.todo.findMany({
        where: { id: { in: ids } },
        select: { id: true, done: true, doneAt: true },
      });

      await prisma.todo.updateMany({
        where: { id: { in: ids } },
        data: { done: true, doneAt: new Date() },
      });
      for (const row of rows)
        patchTodoInCache(sessionId, row.id, { done: true });

      ctx.recordUndo?.(
        `todo marqués faits (${rows.length})`,
        true,
        before.map((r) => ({
          kind: 'todo.update' as const,
          id: r.id,
          data: { done: r.done, doneAt: r.doneAt },
        })),
      );

      return `OK. ${rows.length} todos marqués comme terminés.`;
    },
  }),
  defineTool({
    name: 'todo.bulk_delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveTodoRefs } = env.resolvers;
      const { rows, error } = resolveTodoRefs(call.args.refs);
      if (error) throw new CommandRejectedError(error);
      if (!rows.length) return 'Aucun todo à supprimer.';

      const ids = rows.map((r) => r.id);
      const before = await prisma.todo.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          text: true,
          done: true,
          doneAt: true,
          createdAt: true,
        },
      });

      await prisma.todo.deleteMany({ where: { id: { in: ids } } });
      for (const row of rows) removeTodoFromCache(sessionId, row.id);

      ctx.recordUndo?.(
        `suppression de todos (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'todo.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            done: r.done,
            doneAt: r.doneAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. ${before.length} todos supprimés.`;
    },
  }),
  defineTool({
    name: 'todo.clear_done',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, todoSelection } = env;
      const before = await prisma.todo.findMany({
        where: { ...todoSelection, done: true },
        select: {
          id: true,
          text: true,
          done: true,
          doneAt: true,
          createdAt: true,
        },
      });
      if (!before.length) return 'Aucun todo terminé à supprimer.';

      await prisma.todo.deleteMany({
        where: { ...todoSelection, done: true },
      });
      for (const row of before) removeTodoFromCache(sessionId, row.id);

      ctx.recordUndo?.(
        `nettoyage des todos terminés (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'todo.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            done: r.done,
            doneAt: r.doneAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. ${before.length} todos terminés supprimés.`;
    },
  }),
  defineTool({
    name: 'todo.clear_all',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, sessionId, todoSelection } = env;
      const before = await prisma.todo.findMany({
        where: todoSelection,
        select: {
          id: true,
          text: true,
          done: true,
          doneAt: true,
          createdAt: true,
        },
      });
      if (!before.length) return 'Aucun todo à supprimer.';

      await prisma.todo.deleteMany({ where: todoSelection });
      LAST_TODO_LIST.delete(sessionId);

      ctx.recordUndo?.(
        `suppression complète des todos (${before.length})`,
        true,
        before.map((r) => ({
          kind: 'todo.upsert' as const,
          row: {
            id: r.id,
            text: r.text,
            done: r.done,
            doneAt: r.doneAt,
            createdAt: r.createdAt,
          },
        })),
      );

      return `OK. Tous les todos ont été supprimés (${before.length}).`;
    },
  }),
];
