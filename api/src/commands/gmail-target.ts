import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GmailMessageItem } from '../gmail/providers/gmail.provider';
import { getGmailCategoryFromLabels } from '../gmail/gmail-category';
import type { ToolOnly } from '../jarvis/tools/tool-registry';

export type GmailTargetCall = Extract<
  ToolOnly,
  {
    name:
      | 'gmail.mark_read'
      | 'gmail.bulk_mark_read'
      | 'gmail.mark_unread'
      | 'gmail.archive'
      | 'gmail.unarchive'
      | 'gmail.trash'
      | 'gmail.untrash'
      | 'gmail.delete';
  }
>;
export function requiresGmailTargets(call: ToolOnly): call is GmailTargetCall {
  return [
    'gmail.mark_read',
    'gmail.bulk_mark_read',
    'gmail.mark_unread',
    'gmail.archive',
    'gmail.unarchive',
    'gmail.trash',
    'gmail.untrash',
    'gmail.delete',
  ].includes(call.name);
}

export function freezeGmailTargets(
  items: GmailMessageItem[],
): Prisma.InputJsonObject[] {
  return items.map((item) => ({
    kind: 'gmail',
    id: item.id,
    threadId: item.threadId,
    subject: item.subject,
    from: item.from,
    to: item.to,
    date: item.date.toISOString(),
    snippet: item.snippet,
    labels: [...item.labels],
    unread: item.unread,
  }));
}

export function readGmailTargets(
  targets: Prisma.JsonValue | undefined,
): GmailMessageItem[] {
  const invalid = () =>
    new BadRequestException(
      'Cibles enregistrées indisponibles. Propose à nouveau cette action.',
    );
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 50)
    throw invalid();
  const items = targets.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      item.kind !== 'gmail' ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.threadId !== 'string' ||
      typeof item.subject !== 'string' ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      typeof item.date !== 'string' ||
      !Number.isFinite(Date.parse(item.date)) ||
      typeof item.snippet !== 'string' ||
      typeof item.unread !== 'boolean' ||
      !Array.isArray(item.labels) ||
      !item.labels.every((label): label is string => typeof label === 'string')
    )
      throw invalid();
    return {
      id: item.id,
      threadId: item.threadId,
      subject: item.subject,
      from: item.from,
      to: item.to,
      date: new Date(item.date),
      snippet: item.snippet,
      labels: item.labels,
      category: getGmailCategoryFromLabels(item.labels),
      unread: item.unread,
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw invalid();
  return items;
}
