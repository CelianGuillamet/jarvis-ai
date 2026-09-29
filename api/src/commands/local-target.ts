import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ToolOnly } from '../jarvis/tools/tool-registry';

export type LocalTargets =
  | { kind: 'todo'; items: Array<{ id: string; text: string; done: boolean }> }
  | {
      kind: 'shopping';
      items: Array<{ id: string; text: string; bought: boolean }>;
    }
  | {
      kind: 'note';
      items: Array<{ id: string; title: string | null; text: string }>;
    };

const localTargetNames = new Set<ToolOnly['name']>([
  'todo.done',
  'todo.reopen',
  'todo.done_all',
  'todo.update',
  'todo.delete',
  'todo.bulk_done',
  'todo.bulk_delete',
  'todo.clear_done',
  'todo.clear_all',
  'shopping.bought',
  'shopping.unbought',
  'shopping.bought_all',
  'shopping.update',
  'shopping.delete',
  'shopping.bulk_bought',
  'shopping.bulk_delete',
  'shopping.clear_bought',
  'shopping.clear_all',
  'note.update',
  'note.delete',
]);

export function requiresLocalTargets(call: ToolOnly) {
  return localTargetNames.has(call.name);
}

export function freezeLocalTargets(
  targets: LocalTargets,
): Prisma.InputJsonObject[] {
  return targets.items.map(
    (item: LocalTargets['items'][number]): Prisma.InputJsonObject => ({
      kind: targets.kind,
      ...item,
    }),
  );
}

export function readLocalTargets(
  call: ToolOnly,
  value: Prisma.JsonValue | undefined,
): LocalTargets {
  const invalid = () =>
    new BadRequestException(
      'Cibles enregistrées indisponibles. Propose à nouveau cette action.',
    );
  if (
    !requiresLocalTargets(call) ||
    !Array.isArray(value) ||
    !value.length ||
    value.length > 200
  )
    throw invalid();
  const kind = call.name.split('.')[0];
  const items = value.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      row.kind !== kind ||
      typeof row.id !== 'string' ||
      !row.id ||
      typeof row.text !== 'string'
    )
      throw invalid();
    return row;
  });
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw invalid();
  const multi = /\.(bulk_|clear_|done_all$|bought_all$)/.test(call.name);
  if (!multi && items.length !== 1) throw invalid();
  if (kind === 'todo')
    return {
      kind,
      items: items.map((row) => {
        if (
          typeof row.done !== 'boolean' ||
          typeof row.id !== 'string' ||
          typeof row.text !== 'string'
        )
          throw invalid();
        return { id: row.id, text: row.text, done: row.done };
      }),
    };
  if (kind === 'shopping')
    return {
      kind,
      items: items.map((row) => {
        if (
          typeof row.bought !== 'boolean' ||
          typeof row.id !== 'string' ||
          typeof row.text !== 'string'
        )
          throw invalid();
        return { id: row.id, text: row.text, bought: row.bought };
      }),
    };
  if (kind === 'note')
    return {
      kind,
      items: items.map((row) => {
        if (
          !(row.title === null || typeof row.title === 'string') ||
          typeof row.id !== 'string' ||
          typeof row.text !== 'string'
        )
          throw invalid();
        return { id: row.id, title: row.title, text: row.text };
      }),
    };
  throw invalid();
}
