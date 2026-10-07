import { CommandRejectedError } from '../../../commands/command-rejected.error';
import {
  setLastNoteList,
  patchNoteInCache,
  removeNoteFromCache,
} from '../support/tool-caches';
import { noteLabel } from '../support/tool-text';
import { defineTool } from '../define-tool';

export const noteTools = [
  defineTool({
    name: 'note.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma } = env;
      const created = await prisma.note.create({
        data: {
          ownerId: prisma.ownerId,
          title: call.args.title ?? null,
          text: call.args.text,
        },
        select: { id: true },
      });

      ctx.recordUndo?.('ajout note', true, [
        { kind: 'note.delete', id: created.id },
      ]);

      return call.args.title
        ? `OK. Note ajoutée: "${call.args.title}"`
        : `OK. Note ajoutée.`;
    },
  }),
  defineTool({
    name: 'note.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const limit = Math.min(Math.max(call.args.limit ?? 10, 1), 50);
      const notes = await prisma.note.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, title: true, text: true },
      });

      setLastNoteList(
        sessionId,
        notes.map((n) => ({ id: n.id, title: n.title, text: n.text })),
      );

      if (!notes.length) return 'Aucune note.';
      return `Notes (${notes.length}):\n${notes
        .map((n, idx) => `- #${idx + 1} - ${noteLabel(n)}`)
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'note.search',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const q = call.args.query.trim();
      const notes = await prisma.note.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { text: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, text: true },
      });

      setLastNoteList(
        sessionId,
        notes.map((n) => ({ id: n.id, title: n.title, text: n.text })),
      );

      if (!notes.length) return `Aucune note trouvée pour "${q}".`;
      return `Notes (${notes.length}):\n${notes
        .map((n, idx) => `- #${idx + 1} - ${noteLabel(n)}`)
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'note.update',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveNote } = env.resolvers;
      const { row, error } = await resolveNote(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucune note trouvée pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const hasTitle = Object.hasOwn(call.args, 'title');
      const hasText = Object.hasOwn(call.args, 'text');
      if (!hasTitle && !hasText) {
        throw new CommandRejectedError(
          'Rien à modifier: envoie au moins title ou text.',
        );
      }

      const data: { title?: string | null; text?: string } = {};
      if (hasTitle) {
        if (call.args.title === null) data.title = null;
        else {
          const cleaned = (call.args.title ?? '').trim();
          data.title = cleaned ? cleaned : null;
        }
      }
      if (hasText) {
        const cleaned = (call.args.text ?? '').trim();
        if (!cleaned)
          throw new CommandRejectedError(
            'Le texte de la note ne peut pas être vide.',
          );
        data.text = cleaned;
      }

      await prisma.note.update({ where: { id: row.id }, data });
      patchNoteInCache(sessionId, row.id, {
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.text === undefined ? {} : { text: data.text }),
      });

      ctx.recordUndo?.('modification note', true, [
        {
          kind: 'note.update',
          id: row.id,
          data: { title: row.title, text: row.text },
        },
      ]);

      return `OK. Note modifiée: "${noteLabel(row)}"`;
    },
  }),
  defineTool({
    name: 'note.delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveNote } = env.resolvers;
      const { row, error } = await resolveNote(call.args.query);
      if (error) throw new CommandRejectedError(error);
      if (!row)
        throw new CommandRejectedError(
          `Aucune note trouvée pour "${call.args.query}".`,
          'NOT_FOUND',
        );

      const before = await prisma.note.findUnique({
        where: { id: row.id },
        select: { id: true, title: true, text: true, createdAt: true },
      });

      await prisma.note.delete({ where: { id: row.id } });
      removeNoteFromCache(sessionId, row.id);

      if (before) {
        ctx.recordUndo?.('suppression note', true, [
          {
            kind: 'note.upsert',
            row: {
              id: before.id,
              title: before.title,
              text: before.text,
              createdAt: before.createdAt,
            },
          },
        ]);
      }

      return `OK. Note supprimée: "${noteLabel(row)}"`;
    },
  }),
];
