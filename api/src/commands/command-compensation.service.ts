import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { ownedDomainClient } from '../prisma/owned-domain';
import {
  clearLocalToolCaches,
  runTool,
  type ToolContext,
  type UndoMutation,
} from '../jarvis/tools/tools';
import type { ToolOnly } from '../jarvis/tools/tool-registry';
import { requiresLocalTargets } from './local-target';

type Model = 'todo' | 'shopping' | 'note';
type Change = { inverse: UndoMutation; expected: Prisma.JsonObject | null };
export type UndoPreview = { commandId: string; label: string };
const stale = () =>
  new ConflictException(
    'Les éléments ou la dernière action ont changé. Aucun retour arrière effectué : vérifie à nouveau les éléments.',
  );
const json = (value: unknown): Prisma.JsonObject | null =>
  JSON.parse(JSON.stringify(value)) as Prisma.JsonObject | null;

export function supportsLocalCompensation(call: ToolOnly) {
  return (
    requiresLocalTargets(call) ||
    ['todo.add', 'note.add', 'shopping.add'].includes(call.name)
  );
}

export function readUndoPreview(
  targets: Prisma.JsonValue | undefined,
): UndoPreview {
  const row =
    Array.isArray(targets) && targets.length === 1 ? targets[0] : null;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    row.kind !== 'compensation' ||
    typeof row.commandId !== 'string' ||
    !row.commandId ||
    typeof row.label !== 'string'
  )
    throw stale();
  return { commandId: row.commandId, label: row.label };
}

function target(inverse: UndoMutation) {
  return {
    model: inverse.kind.split('.')[0] as Model,
    id: 'row' in inverse ? inverse.row.id : inverse.id,
  };
}

async function readRow(
  tx: Record<
    'todo' | 'shoppingItem' | 'note',
    {
      findFirst(args: {
        where: { ownerId: string; id: string };
      }): Promise<unknown>;
    }
  >,
  model: Model,
  ownerId: string,
  id: string,
) {
  const where = { ownerId, id };
  if (model === 'todo') return json(await tx.todo.findFirst({ where }));
  if (model === 'shopping')
    return json(await tx.shoppingItem.findFirst({ where }));
  if (model === 'note') return json(await tx.note.findFirst({ where }));
  throw stale();
}

/** Local effects and their inverse commit together. Undo is a separate approved command. */
@Injectable()
export class CommandCompensationService {
  constructor(private readonly prisma: PrismaService) {}

  private async latest(
    tx: Prisma.TransactionClient,
    ownerId: string,
    conversationId: string,
  ) {
    // Order by the immutable execution claim, not completion time: a delayed
    // response from an older local action must never hide a newer email send.
    const claims = await tx.commandTransition.findMany({
      where: {
        toState: 'executing',
        command: {
          ownerId,
          conversationId,
          toolName: { not: 'undo.last_action' },
          OR: [{ outcomeCode: null }, { outcomeCode: { not: 'SIMULATED' } }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { commandId: 'desc' }],
      take: 2,
      include: { command: { include: { compensation: true } } },
    });
    // Millisecond timestamps cannot order simultaneous claims reliably.
    if (
      claims[1] &&
      claims[0].createdAt.getTime() === claims[1].createdAt.getTime()
    )
      return null;
    return claims[0]?.command ?? null;
  }

  async preview(ownerId: string, conversationId: string): Promise<UndoPreview> {
    const command = await this.latest(this.prisma, ownerId, conversationId);
    if (
      !command ||
      command.state !== 'completed' ||
      !command.compensation ||
      command.compensation.consumedAt
    ) {
      throw new ConflictException(
        'La dernière action ne peut pas être annulée automatiquement. Un envoi effectué ou incertain ne peut pas être rappelé.',
      );
    }
    return { commandId: command.id, label: command.compensation.label };
  }

  async record(
    context: ToolContext,
    call: ToolOnly,
    commandId: string,
  ): Promise<string> {
    if (
      !supportsLocalCompensation(call) ||
      (requiresLocalTargets(call) && !context.frozenLocalTargets) ||
      (context.frozenLocalTargets?.items.length ?? 0) > 200
    )
      throw stale();
    const ownerId = context.prisma.ownerId;
    const scoped = ownedDomainClient(this.prisma, ownerId);
    try {
      return await scoped.$transaction(
        async (tx) => {
          const command = await tx.command.findFirst({
            where: {
              id: commandId,
              ownerId,
              conversationId: context.sessionId,
              toolName: call.name,
              state: 'executing',
            },
          });
          if (!command) throw stale();
          // Do not execute a preview against changed values, even for an owned ID.
          for (const item of context.frozenLocalTargets?.items ?? []) {
            const current = await readRow(
              tx,
              context.frozenLocalTargets!.kind,
              ownerId,
              item.id,
            );
            if (
              !current ||
              Object.entries(item).some(
                ([key, value]) => current[key] !== value,
              )
            )
              throw stale();
          }
          let recorded:
            | { label: string; mutations: UndoMutation[] }
            | undefined;
          const result = await runTool(
            {
              ...context,
              prisma: Object.assign(tx, { ownerId }),
              recordUndo: (label, reversible, mutations = []) => {
                if (reversible && mutations.length)
                  recorded = { label, mutations };
              },
            },
            call,
          );
          if (recorded) {
            const changes: Change[] = [];
            for (const inverse of recorded.mutations) {
              const { model, id } = target(inverse);
              changes.push({
                inverse,
                expected: await readRow(tx, model, ownerId, id),
              });
            }
            await tx.commandCompensation.create({
              data: {
                commandId,
                label: recorded.label,
                changes: JSON.parse(
                  JSON.stringify(changes),
                ) as Prisma.InputJsonArray,
              },
            });
          }
          return result;
        },
        { isolationLevel: 'Serializable' },
      );
    } finally {
      // The legacy tool runner updates caches before transaction commit/rollback.
      clearLocalToolCaches(context.sessionId);
    }
  }

  async apply(
    ownerId: string,
    conversationId: string,
    preview: UndoPreview,
    undoCommandId: string,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const undo = await tx.command.findFirst({
          where: {
            id: undoCommandId,
            ownerId,
            conversationId,
            toolName: 'undo.last_action',
            state: 'executing',
          },
        });
        if (
          !undo ||
          readUndoPreview(undo.targets).commandId !== preview.commandId
        )
          throw stale();
        const command = await this.latest(tx, ownerId, conversationId);
        const record = command?.compensation;
        if (
          command?.id !== preview.commandId ||
          command.state !== 'completed' ||
          !record ||
          record.consumedAt
        )
          throw stale();
        const changes = record.changes as unknown as Change[];
        if (!Array.isArray(changes) || !changes.length || changes.length > 200)
          throw stale();
        // Check every row before writing any inverse. Serializable isolation makes
        // concurrent edits abort the whole transaction; no automatic retry.
        for (const change of changes) {
          const { model, id } = target(change.inverse);
          const current = await readRow(tx, model, ownerId, id);
          if (!isDeepStrictEqual(current, change.expected)) throw stale();
          if (change.expected && change.expected.ownerId !== ownerId)
            throw stale();
        }
        for (const { inverse } of changes)
          await this.restore(tx, ownerId, inverse);
        const claimed = await tx.commandCompensation.updateMany({
          where: { commandId: command.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (claimed.count !== 1) throw stale();
      },
      { isolationLevel: 'Serializable' },
    );
    clearLocalToolCaches(conversationId);
    return `OK. Retour arrière effectué (${preview.label}).`;
  }

  private async restore(
    tx: Prisma.TransactionClient,
    ownerId: string,
    inverse: UndoMutation,
  ) {
    // Restore deleted rows with CREATE, never upsert: an occupied ID must fail.
    switch (inverse.kind) {
      case 'todo.upsert':
        await tx.todo.create({ data: { ...inverse.row, ownerId } });
        break;
      case 'shopping.upsert':
        await tx.shoppingItem.create({ data: { ...inverse.row, ownerId } });
        break;
      case 'note.upsert':
        await tx.note.create({ data: { ...inverse.row, ownerId } });
        break;
      case 'todo.delete':
        await tx.todo.delete({ where: { id: inverse.id, ownerId } });
        break;
      case 'shopping.delete':
        await tx.shoppingItem.delete({ where: { id: inverse.id, ownerId } });
        break;
      case 'note.delete':
        await tx.note.delete({ where: { id: inverse.id, ownerId } });
        break;
      case 'todo.update':
        await tx.todo.update({
          where: { id: inverse.id, ownerId },
          data: inverse.data,
        });
        break;
      case 'shopping.update':
        await tx.shoppingItem.update({
          where: { id: inverse.id, ownerId },
          data: inverse.data,
        });
        break;
      case 'note.update':
        await tx.note.update({
          where: { id: inverse.id, ownerId },
          data: inverse.data,
        });
        break;
    }
  }
}
