import {
  getLastCalendarList,
  getLastCalendarFocus,
  getLastTodoList,
  getLastNoteList,
  getLastShoppingList,
  getLastGmailList,
  getLastGmailFocus,
} from './tool-caches';
import {
  formatDate,
  formatMailDate,
  formatMailCategoryTag,
  parseCalendarRefFromQuery,
  parseGmailRefFromQuery,
  compactText,
  formatCalendarEventPreview,
  noteLabel,
} from './tool-text';
import type { ToolHandlerEnv } from '../define-tool';

export function createPreviewHelpers(env: ToolHandlerEnv) {
  const { ctx, prisma, tz, sessionId } = env;
  const extractRef = (value: string) => {
    const m = value.match(/#\s*(\d{1,3})\b/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > 999) return null;
    return n;
  };

  const previewTodoByQuery = async (query: string) => {
    const q = query.trim();
    if (!q) return null;
    const ref = extractRef(q);
    if (ref !== null) {
      const list = getLastTodoList(sessionId);
      const item = list[ref - 1];
      if (!item) return `Référence todo #${ref} (liste récente indisponible).`;
      const status = item.done ? 'terminé' : 'ouvert';
      return `Todo #${ref}: "${item.text}" (${status}).`;
    }

    const row = await prisma.todo.findFirst({
      where: { text: { contains: q, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { text: true, done: true },
    });
    if (!row) return `Todo introuvable pour "${compactText(q, 80)}".`;
    const status = row.done ? 'terminé' : 'ouvert';
    return `Todo: "${row.text}" (${status}).`;
  };

  const previewShoppingByQuery = async (query: string) => {
    const q = query.trim();
    if (!q) return null;
    const ref = extractRef(q);
    if (ref !== null) {
      const list = getLastShoppingList(sessionId);
      const item = list[ref - 1];
      if (!item)
        return `Référence course #${ref} (liste récente indisponible).`;
      const status = item.bought ? 'acheté' : 'à acheter';
      return `Course #${ref}: "${item.text}" (${status}).`;
    }

    const row = await prisma.shoppingItem.findFirst({
      where: { text: { contains: q, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { text: true, bought: true },
    });
    if (!row) return `Article introuvable pour "${compactText(q, 80)}".`;
    const status = row.bought ? 'acheté' : 'à acheter';
    return `Article: "${row.text}" (${status}).`;
  };

  const previewNoteByQuery = async (query: string) => {
    const q = query.trim();
    if (!q) return null;
    const ref = extractRef(q);
    if (ref !== null) {
      const list = getLastNoteList(sessionId);
      const item = list[ref - 1];
      if (!item) return `Référence note #${ref} (liste récente indisponible).`;
      const label = noteLabel({ title: item.title, text: item.text });
      return `Note #${ref}: "${compactText(label, 120)}".`;
    }

    const row = await prisma.note.findFirst({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { text: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { title: true, text: true },
    });
    if (!row) return `Note introuvable pour "${compactText(q, 80)}".`;
    const label = noteLabel({ title: row.title, text: row.text });
    return `Note: "${compactText(label, 120)}".`;
  };

  const previewCalendarByArgs = (args: { ref?: number; query?: string }) => {
    if (ctx.frozenCalendarTarget) {
      const target = ctx.frozenCalendarTarget;
      return `${formatDate(target.when, tz)} — ${target.title}`;
    }
    const explicitRef =
      typeof args.ref === 'number' && Number.isInteger(args.ref)
        ? args.ref
        : null;
    const query = (args.query ?? '').trim();
    const queryRef = query ? parseCalendarRefFromQuery(query) : null;
    const ref = explicitRef ?? queryRef;

    if (ref !== null) {
      const list = getLastCalendarList(sessionId);
      const event = list[ref - 1];
      if (!event)
        return `Référence rendez-vous #${ref} (liste récente indisponible).`;
      return formatCalendarEventPreview(event, tz);
    }

    if (query === '__last__') {
      const focus = getLastCalendarFocus(sessionId);
      if (!focus) return 'Rendez-vous ciblé indisponible.';
      return formatCalendarEventPreview(focus, tz);
    }

    return null;
  };

  const previewGmailByArgs = (args: { ref?: number; query?: string }) => {
    if (ctx.frozenGmailTargets?.length === 1) {
      const item = ctx.frozenGmailTargets[0];
      return `${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})`;
    }
    const explicitRef =
      typeof args.ref === 'number' && Number.isInteger(args.ref)
        ? args.ref
        : null;
    const query = (args.query ?? '').trim();
    const queryRef = query ? parseGmailRefFromQuery(query) : null;
    const ref = explicitRef ?? queryRef;

    if (ref !== null) {
      const list = getLastGmailList(sessionId);
      const item = list[ref - 1];
      if (!item) return `Référence email #${ref} (liste récente indisponible).`;
      return `${formatMailCategoryTag(item)} "${item.subject}" — ${compactText(item.from, 80)}`;
    }

    if (query === '__last__') {
      const focus = getLastGmailFocus(sessionId);
      if (!focus) return 'Email ciblé indisponible.';
      return `${formatMailCategoryTag(focus)} "${focus.subject}" — ${compactText(focus.from, 80)}`;
    }

    return null;
  };

  return {
    extractRef,
    previewTodoByQuery,
    previewShoppingByQuery,
    previewNoteByQuery,
    previewCalendarByArgs,
    previewGmailByArgs,
  };
}
