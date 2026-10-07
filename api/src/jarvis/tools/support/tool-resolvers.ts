import { DateTime } from 'luxon';
import type { ToolOnly } from '.././tool-registry';
import { TargetResolutionError } from '../../../commands/calendar-target';
import { requiresGmailTargets } from '../../../commands/gmail-target';
import type { LocalTargets } from '../../../commands/local-target';
import type { CalendarEventItem } from '../../../calendar/providers/calendar.provider';
import { RangeParseError } from '../../lib/resolve-range';
import {
  setLastCalendarList,
  getLastCalendarList,
  setLastCalendarFocus,
  getLastCalendarFocus,
  getLastTodoList,
  getLastNoteList,
  getLastShoppingList,
  setLastMissionList,
  getLastMissionList,
  setLastGmailList,
  getLastGmailList,
  setLastGmailFocus,
  getLastGmailFocus,
  withLocalToolCaches,
} from './tool-caches';
import type {
  TodoListItem,
  ShoppingListItem,
  NoteListItem,
  GmailListItem,
  MissionListItem,
} from './tool-caches';
import {
  parseNumberRef,
  formatDate,
  formatMailDate,
  normalizeForMatch,
  parseCalendarRefFromQuery,
  parseGmailRefFromQuery,
  compactText,
  extractDayMonthHint,
  extractWeekdayHint,
  extractTimeHint,
  CALENDAR_QUERY_STOPWORDS,
  isFocusQuery,
} from './tool-text';
import {
  tokenizeMissionText,
  uniqueTokens,
  computeMissionMatchScore,
  isMissionFocusQuery,
} from './tool-mission';
import type { ToolContext } from '../tools';

export function cleanRefs(refs: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const ref of refs) {
    if (!Number.isInteger(ref)) continue;
    if (ref < 1 || ref > 999) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

export function resolveGmailBatch(
  ctx: ToolContext,
  args: Extract<ToolOnly, { name: 'gmail.bulk_mark_read' }>['args'],
) {
  if (ctx.frozenGmailTargets) return ctx.frozenGmailTargets;
  const list = getLastGmailList(ctx.sessionId);
  if (!list.length)
    throw new TargetResolutionError(
      'Je n’ai pas de liste récente d’emails. Demande d’abord "liste mes emails".',
    );
  const picked = args.refs?.length
    ? args.refs.map((ref) => {
        const item = list[ref - 1];
        if (!item)
          throw new TargetResolutionError(
            `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
          );
        return item;
      })
    : list;
  const unique = [...new Map(picked.map((item) => [item.id, item])).values()];
  const items = unique
    .filter((item) => !(args.unreadOnly ?? true) || item.unread)
    .slice(0, Math.min(Math.max(args.limit ?? 50, 1), 50));
  if (!items.length)
    throw new TargetResolutionError(
      'Aucun email dans la sélection à marquer comme lu.',
    );
  return items;
}

export async function prepareGmailTargets(ctx: ToolContext, call: ToolOnly) {
  return withLocalToolCaches(ctx.sessionId, () =>
    prepareGmailTargetsInContext(ctx, call),
  );
}

export async function prepareGmailTargetsInContext(
  ctx: ToolContext,
  call: ToolOnly,
) {
  if (!requiresGmailTargets(call)) return undefined;
  if (call.name === 'gmail.bulk_mark_read')
    return resolveGmailBatch(ctx, call.args);
  const { target, error } = await createToolResolvers(ctx).resolveGmailTarget(
    call.args,
  );
  if (error || !target)
    throw new TargetResolutionError(error || 'Aucun email ciblé.');
  return [target];
}

export async function prepareLocalTargets(
  ctx: ToolContext,
  call: ToolOnly,
): Promise<LocalTargets | undefined> {
  return withLocalToolCaches(ctx.sessionId, () =>
    prepareLocalTargetsInContext(ctx, call),
  );
}

export async function prepareLocalTargetsInContext(
  ctx: ToolContext,
  call: ToolOnly,
): Promise<LocalTargets | undefined> {
  const resolve = createToolResolvers(ctx);
  let targets: LocalTargets;
  switch (call.name) {
    case 'todo.done':
    case 'todo.reopen':
    case 'todo.update':
    case 'todo.delete': {
      const { row, error } = await resolve.resolveTodo(
        call.args.query,
        call.name === 'todo.done'
          ? false
          : call.name === 'todo.reopen'
            ? true
            : undefined,
      );
      if (error) throw new TargetResolutionError(error);
      targets = { kind: 'todo', items: row ? [row] : [] };
      break;
    }
    case 'todo.bulk_done':
    case 'todo.bulk_delete': {
      const { rows, error } = resolve.resolveTodoRefs(
        call.args.refs,
        call.name === 'todo.bulk_done' ? false : undefined,
      );
      if (error) throw new TargetResolutionError(error);
      targets = { kind: 'todo', items: rows };
      break;
    }
    case 'todo.done_all':
    case 'todo.clear_done':
    case 'todo.clear_all':
      targets = {
        kind: 'todo',
        items: await ctx.prisma.todo.findMany({
          where:
            call.name === 'todo.clear_all'
              ? {}
              : { done: call.name === 'todo.clear_done' },
          select: { id: true, text: true, done: true },
          take: 201,
          orderBy: { id: 'asc' },
        }),
      };
      break;
    case 'shopping.bought':
    case 'shopping.unbought':
    case 'shopping.update':
    case 'shopping.delete': {
      const { row, error } = await resolve.resolveShopping(
        call.args.query,
        call.name === 'shopping.bought'
          ? false
          : call.name === 'shopping.unbought'
            ? true
            : undefined,
      );
      if (error) throw new TargetResolutionError(error);
      targets = { kind: 'shopping', items: row ? [row] : [] };
      break;
    }
    case 'shopping.bulk_bought':
    case 'shopping.bulk_delete': {
      const { rows, error } = resolve.resolveShoppingRefs(
        call.args.refs,
        call.name === 'shopping.bulk_bought' ? false : undefined,
      );
      if (error) throw new TargetResolutionError(error);
      targets = { kind: 'shopping', items: rows };
      break;
    }
    case 'shopping.bought_all':
    case 'shopping.clear_bought':
    case 'shopping.clear_all':
      targets = {
        kind: 'shopping',
        items: await ctx.prisma.shoppingItem.findMany({
          where:
            call.name === 'shopping.clear_all'
              ? {}
              : { bought: call.name === 'shopping.clear_bought' },
          select: { id: true, text: true, bought: true },
          take: 201,
          orderBy: { id: 'asc' },
        }),
      };
      break;
    case 'note.update':
    case 'note.delete': {
      const { row, error } = await resolve.resolveNote(call.args.query);
      if (error) throw new TargetResolutionError(error);
      targets = { kind: 'note', items: row ? [row] : [] };
      break;
    }
    default:
      return undefined;
  }
  if (!targets.items.length)
    throw new TargetResolutionError(
      'Aucun élément ciblé. Précise les éléments à modifier.',
    );
  if (targets.items.length > 200)
    throw new TargetResolutionError(
      'La sélection dépasse 200 éléments. Réduis-la avant de confirmer.',
    );
  return targets;
}

export function createToolResolvers(ctx: ToolContext) {
  const { prisma, tz, sessionId } = ctx;

  const resolveTodo = async (query: string, done?: boolean) => {
    if (ctx.frozenLocalTargets?.kind === 'todo')
      return {
        row: ctx.frozenLocalTargets.items[0],
        error: null as string | null,
      };
    const ref = parseNumberRef(query);
    if (ref !== null) {
      const list = getLastTodoList(sessionId);
      if (!list.length) {
        return {
          row: null as TodoListItem | null,
          error:
            'Je n’ai pas de liste récente de todos. Dis-moi d’abord "liste mes todos", puis utilise #N.',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          row: null as TodoListItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      const row = list[idx];
      if (done !== undefined && row.done !== done) {
        return {
          row: null as TodoListItem | null,
          error: done
            ? `Le todo #${ref} n’est pas terminé.`
            : `Le todo #${ref} est déjà terminé.`,
        };
      }
      return { row, error: null as string | null };
    }

    const q = query.trim();
    if (!q)
      return { row: null as TodoListItem | null, error: null as string | null };
    const row = await prisma.todo.findFirst({
      where: {
        ...(done === undefined ? {} : { done }),
        text: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, text: true, done: true },
    });
    return {
      row: row ? { id: row.id, text: row.text, done: row.done } : null,
      error: null as string | null,
    };
  };

  const resolveTodoRefs = (refs: number[], done?: boolean) => {
    if (ctx.frozenLocalTargets?.kind === 'todo')
      return {
        rows: ctx.frozenLocalTargets.items,
        error: null as string | null,
      };
    const cleaned = cleanRefs(refs);
    if (!cleaned.length) {
      return {
        rows: [] as TodoListItem[],
        error: 'Aucun numéro valide reçu. Exemples: [1,2,4].',
      };
    }

    const list = getLastTodoList(sessionId);
    if (!list.length) {
      return {
        rows: [] as TodoListItem[],
        error:
          'Je n’ai pas de liste récente de todos. Dis-moi d’abord "liste mes todos", puis utilise des #N.',
      };
    }

    const rows: TodoListItem[] = [];
    for (const ref of cleaned) {
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          rows: [] as TodoListItem[],
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      const row = list[idx];
      if (done !== undefined && row.done !== done) {
        return {
          rows: [] as TodoListItem[],
          error: done
            ? `Le todo #${ref} n’est pas terminé.`
            : `Le todo #${ref} est déjà terminé.`,
        };
      }
      rows.push(row);
    }

    return { rows, error: null as string | null };
  };

  const resolveShopping = async (query: string, bought?: boolean) => {
    if (ctx.frozenLocalTargets?.kind === 'shopping')
      return {
        row: ctx.frozenLocalTargets.items[0],
        error: null as string | null,
      };
    const ref = parseNumberRef(query);
    if (ref !== null) {
      const list = getLastShoppingList(sessionId);
      if (!list.length) {
        return {
          row: null as ShoppingListItem | null,
          error:
            'Je n’ai pas de liste récente de courses. Dis-moi d’abord "liste mes courses", puis utilise #N.',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          row: null as ShoppingListItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      const row = list[idx];
      if (bought !== undefined && row.bought !== bought) {
        return {
          row: null as ShoppingListItem | null,
          error: bought
            ? `L’article #${ref} est déjà marqué comme acheté.`
            : `L’article #${ref} n’est pas marqué comme acheté.`,
        };
      }
      return { row, error: null as string | null };
    }

    const q = query.trim();
    if (!q)
      return {
        row: null as ShoppingListItem | null,
        error: null as string | null,
      };
    const row = await prisma.shoppingItem.findFirst({
      where: {
        ...(bought === undefined ? {} : { bought }),
        text: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, text: true, bought: true },
    });
    return {
      row: row ? { id: row.id, text: row.text, bought: row.bought } : null,
      error: null as string | null,
    };
  };

  const resolveShoppingRefs = (refs: number[], bought?: boolean) => {
    if (ctx.frozenLocalTargets?.kind === 'shopping')
      return {
        rows: ctx.frozenLocalTargets.items,
        error: null as string | null,
      };
    const cleaned = cleanRefs(refs);
    if (!cleaned.length) {
      return {
        rows: [] as ShoppingListItem[],
        error: 'Aucun numéro valide reçu. Exemples: [1,2,4].',
      };
    }

    const list = getLastShoppingList(sessionId);
    if (!list.length) {
      return {
        rows: [] as ShoppingListItem[],
        error:
          'Je n’ai pas de liste récente de courses. Dis-moi d’abord "liste mes courses", puis utilise des #N.',
      };
    }

    const rows: ShoppingListItem[] = [];
    for (const ref of cleaned) {
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          rows: [] as ShoppingListItem[],
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      const row = list[idx];
      if (bought !== undefined && row.bought !== bought) {
        return {
          rows: [] as ShoppingListItem[],
          error: bought
            ? `L’article #${ref} est déjà marqué comme acheté.`
            : `L’article #${ref} n’est pas marqué comme acheté.`,
        };
      }
      rows.push(row);
    }

    return { rows, error: null as string | null };
  };

  const resolveNote = async (query: string) => {
    if (ctx.frozenLocalTargets?.kind === 'note')
      return {
        row: ctx.frozenLocalTargets.items[0],
        error: null as string | null,
      };
    const ref = parseNumberRef(query);
    if (ref !== null) {
      const list = getLastNoteList(sessionId);
      if (!list.length) {
        return {
          row: null as NoteListItem | null,
          error:
            'Je n’ai pas de liste récente de notes. Dis-moi d’abord "liste mes notes", puis utilise #N.',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          row: null as NoteListItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      return { row: list[idx], error: null as string | null };
    }

    const q = query.trim();
    if (!q)
      return { row: null as NoteListItem | null, error: null as string | null };

    const row = await prisma.note.findFirst({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { text: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, text: true },
    });

    return {
      row: row ? { id: row.id, title: row.title, text: row.text } : null,
      error: null as string | null,
    };
  };

  const scoreCalendarCandidate = (
    queryNorm: string,
    event: CalendarEventItem,
    hints: {
      dayMonth: { day: number; month: number | null } | null;
      weekday: number | null;
      time: { hour: number; minute: number } | null;
    },
  ) => {
    const titleNorm = normalizeForMatch(event.title);
    const eventDt = DateTime.fromJSDate(event.when).setZone(tz);
    const tokenMatches = queryNorm
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !CALENDAR_QUERY_STOPWORDS.has(t))
      .reduce((acc, token) => acc + (titleNorm.includes(token) ? 1 : 0), 0);

    let score = 0;
    if (queryNorm.length >= 4 && titleNorm.includes(queryNorm)) score += 10;
    score += tokenMatches * 2;

    if (hints.weekday !== null) {
      score += eventDt.weekday === hints.weekday ? 4 : -1;
    }

    if (hints.dayMonth) {
      const sameDay = eventDt.day === hints.dayMonth.day;
      const sameMonth =
        hints.dayMonth.month === null || eventDt.month === hints.dayMonth.month;
      score +=
        sameDay && sameMonth ? (hints.dayMonth.month === null ? 4 : 6) : -1;
    }

    if (hints.time) {
      const exact =
        eventDt.hour === hints.time.hour &&
        eventDt.minute === hints.time.minute;
      const sameHour = eventDt.hour === hints.time.hour;
      score += exact ? 4 : sameHour ? 1 : -1;
    }

    return score;
  };

  const resolveCalendarTarget = async (args: {
    ref?: number;
    query?: string;
  }) => {
    if (ctx.frozenCalendarTarget) {
      return { target: ctx.frozenCalendarTarget, error: null as string | null };
    }
    const explicitRef =
      typeof args.ref === 'number' && Number.isInteger(args.ref)
        ? args.ref
        : null;
    const query = (args.query ?? '').trim();
    const queryRef = query ? parseCalendarRefFromQuery(query) : null;
    const ref = explicitRef ?? queryRef;

    // Mode index (#N / "numéro 2"): uniquement sur la dernière liste affichée.
    if (ref !== null) {
      const list = getLastCalendarList(sessionId);
      if (!list.length) {
        return {
          target: null as CalendarEventItem | null,
          error:
            'Je n’ai pas de liste récente de rendez-vous. Dis-moi d’abord "liste mes rendez-vous", puis indique #N.',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          target: null as CalendarEventItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      setLastCalendarFocus(sessionId, list[idx]);
      return { target: list[idx], error: null as string | null };
    }

    const queryNorm = normalizeForMatch(query);
    const hints = {
      dayMonth: extractDayMonthHint(queryNorm),
      weekday: extractWeekdayHint(queryNorm),
      time: extractTimeHint(queryNorm),
    };
    const focus = getLastCalendarFocus(sessionId);
    const focusRequested =
      !query ||
      (isFocusQuery(queryNorm) &&
        hints.dayMonth === null &&
        hints.weekday === null &&
        hints.time === null);
    if (focus && focusRequested) {
      setLastCalendarFocus(sessionId, focus);
      return { target: focus, error: null as string | null };
    }
    if (focusRequested && !focus) {
      return {
        target: null as CalendarEventItem | null,
        error:
          'Je ne sais pas encore quel rendez-vous tu vises. Donne un repère (ex: "du 17 mars", "#1") ou demande d’abord une liste.',
      };
    }

    if (!query) {
      return {
        target: null as CalendarEventItem | null,
        error:
          'Précise le rendez-vous à cibler (ex: "#1", "cours de golf mardi").',
      };
    }

    const scoreFrom = (events: CalendarEventItem[]) =>
      events
        .map((event) => ({
          event,
          score: scoreCalendarCandidate(queryNorm, event, hints),
        }))
        .filter((row) => row.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.event.when.getTime() - b.event.when.getTime(),
        );

    const last = getLastCalendarList(sessionId);
    let ranked = scoreFrom(last);

    if (!ranked.length) {
      const nowDt = DateTime.now().setZone(tz);
      const fallbackStart = nowDt.minus({ days: 30 }).startOf('day');
      const fallbackEnd = nowDt.plus({ days: 180 }).endOf('day');
      if (!fallbackStart.isValid || !fallbackEnd.isValid) {
        throw new RangeParseError('Fuseau horaire invalide.');
      }
      const fallbackEvents = await ctx.calendar.listEventsInterval(
        sessionId,
        fallbackStart.toISO({ suppressMilliseconds: true }),
        fallbackEnd.toISO({ suppressMilliseconds: true }),
        tz,
        250,
      );
      ranked = scoreFrom(fallbackEvents);
    }

    if (!ranked.length) {
      return {
        target: null as CalendarEventItem | null,
        error: `Aucun rendez-vous trouvé pour "${query}".`,
      };
    }

    const shortlist = ranked.slice(0, 5).map((row) => row.event);
    if (shortlist.length >= 2 && ranked[1].score >= ranked[0].score - 1) {
      setLastCalendarList(sessionId, shortlist);
      return {
        target: null as CalendarEventItem | null,
        error:
          `J’ai trouvé plusieurs rendez-vous possibles pour "${query}". Dis-moi lequel:\n` +
          shortlist
            .map(
              (event, idx) =>
                `#${idx + 1} - ${formatDate(event.when, tz)} — ${event.title}`,
            )
            .join('\n'),
      };
    }

    setLastCalendarList(sessionId, shortlist);
    setLastCalendarFocus(sessionId, shortlist[0]);
    return { target: shortlist[0], error: null as string | null };
  };

  const resolveGmailTarget = async (args: { ref?: number; query?: string }) => {
    if (ctx.frozenGmailTargets?.length === 1) {
      return {
        target: ctx.frozenGmailTargets[0],
        error: null as string | null,
      };
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
      if (!list.length) {
        return {
          target: null as GmailListItem | null,
          error:
            'Je n’ai pas de liste récente d’emails. Demande d’abord "liste mes emails".',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          target: null as GmailListItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      setLastGmailFocus(sessionId, list[idx]);
      return { target: list[idx], error: null as string | null };
    }

    if (!query) {
      const focus = getLastGmailFocus(sessionId);
      if (focus) return { target: focus, error: null as string | null };
      return {
        target: null as GmailListItem | null,
        error:
          'Précise quel email cibler (ex: "#1", "mail Uber", "email de Paul").',
      };
    }

    const queryNorm = normalizeForMatch(query);
    const scoreFrom = (items: GmailListItem[]) =>
      items
        .map((item) => {
          const text = normalizeForMatch(
            `${item.subject} ${item.from} ${item.snippet}`,
          );
          const tokens = queryNorm
            .split(' ')
            .map((token) => token.trim())
            .filter((token) => token.length >= 3);
          const tokenScore = tokens.reduce(
            (sum, token) => sum + (text.includes(token) ? 2 : 0),
            0,
          );
          const full = text.includes(queryNorm) ? 8 : 0;
          return { item, score: full + tokenScore };
        })
        .filter((row) => row.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || b.item.date.getTime() - a.item.date.getTime(),
        );

    let ranked = scoreFrom(getLastGmailList(sessionId));
    if (!ranked.length) {
      const fetched = await ctx.gmail.listMessages(sessionId, {
        q: query,
        maxResults: 20,
      });
      setLastGmailList(sessionId, fetched);
      ranked = scoreFrom(getLastGmailList(sessionId));
    }

    if (!ranked.length) {
      return {
        target: null as GmailListItem | null,
        error: `Aucun email trouvé pour "${query}".`,
      };
    }

    const shortlist = ranked.slice(0, 5).map((row) => row.item);
    if (shortlist.length >= 2 && ranked[1].score >= ranked[0].score - 1) {
      setLastGmailList(sessionId, shortlist);
      return {
        target: null as GmailListItem | null,
        error:
          `J’ai trouvé plusieurs emails possibles pour "${query}". Dis-moi lequel:\n` +
          shortlist
            .map(
              (item, idx) =>
                `#${idx + 1} - ${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})`,
            )
            .join('\n'),
      };
    }

    setLastGmailList(sessionId, shortlist);
    setLastGmailFocus(sessionId, shortlist[0]);
    return { target: shortlist[0], error: null as string | null };
  };

  const resolveMissionTarget = async (args: {
    ref?: number;
    query?: string;
  }) => {
    const explicitRef =
      typeof args.ref === 'number' && Number.isInteger(args.ref)
        ? args.ref
        : null;
    const query = (args.query ?? '').trim();
    const queryRef = query ? parseCalendarRefFromQuery(query) : null;
    const ref = explicitRef ?? queryRef;

    if (ref !== null) {
      const list = getLastMissionList(sessionId);
      if (!list.length) {
        return {
          target: null as MissionListItem | null,
          error:
            'Je n’ai pas de liste récente de missions. Demande d’abord "liste mes missions".',
        };
      }
      const idx = ref - 1;
      if (idx < 0 || idx >= list.length) {
        return {
          target: null as MissionListItem | null,
          error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
        };
      }
      return { target: list[idx], error: null as string | null };
    }

    if (!query) {
      return {
        target: null as MissionListItem | null,
        error: 'Précise la mission à clôturer (ex: "#1", "démo investisseur").',
      };
    }

    const loadActiveMissions = async () => {
      const rows = await prisma.jarvisMission.findMany({
        where: {
          sessionId,
          status: 'active',
        },
        orderBy: { updatedAt: 'desc' },
        take: 24,
        select: {
          id: true,
          objective: true,
          horizon: true,
          status: true,
          summary: true,
          nextStep: true,
          updatedAt: true,
        },
      });
      return rows.map((row) => ({
        id: row.id,
        objective: row.objective,
        horizon: row.horizon,
        status: row.status,
        summary: row.summary,
        nextStep: row.nextStep,
        updatedAt: row.updatedAt,
      }));
    };

    if (isMissionFocusQuery(query)) {
      const cached = getLastMissionList(sessionId).filter(
        (item) => item.status === 'active',
      );
      if (cached.length === 1) {
        return { target: cached[0], error: null as string | null };
      }

      const active = await loadActiveMissions();
      if (!active.length) {
        return {
          target: null as MissionListItem | null,
          error: 'Aucune mission active à clôturer.',
        };
      }
      if (active.length === 1) {
        setLastMissionList(sessionId, active);
        return { target: active[0], error: null as string | null };
      }

      setLastMissionList(sessionId, active.slice(0, 5));
      return {
        target: null as MissionListItem | null,
        error:
          `J’ai plusieurs missions actives. Dis-moi laquelle:\n` +
          active
            .slice(0, 5)
            .map((mission, index) => {
              const horizon = mission.horizon ? ` (${mission.horizon})` : '';
              const detail = mission.nextStep || mission.summary;
              return `#${index + 1} - ${mission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}`;
            })
            .join('\n'),
      };
    }

    const scoreFrom = (missions: MissionListItem[]) => {
      const queryNorm = normalizeForMatch(query);
      const queryTokens = uniqueTokens(tokenizeMissionText(queryNorm));
      return missions
        .map((mission) => {
          const objectiveScore = computeMissionMatchScore(
            mission.objective,
            queryTokens,
          );
          const contextScore = computeMissionMatchScore(
            `${mission.summary} ${mission.nextStep ?? ''}`,
            queryTokens,
          );
          const objectiveNorm = normalizeForMatch(mission.objective);
          let score = objectiveScore * 2 + contextScore;
          if (queryNorm.length >= 4 && objectiveNorm.includes(queryNorm)) {
            score += 8;
          }
          return { mission, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (
            (b.mission.updatedAt?.getTime() ?? 0) -
            (a.mission.updatedAt?.getTime() ?? 0)
          );
        });
    };

    let ranked = scoreFrom(
      getLastMissionList(sessionId).filter((item) => item.status === 'active'),
    );
    if (!ranked.length) {
      ranked = scoreFrom(await loadActiveMissions());
    }

    if (!ranked.length) {
      return {
        target: null as MissionListItem | null,
        error: `Aucune mission active trouvée pour "${query}".`,
      };
    }

    const shortlist = ranked.slice(0, 5).map((row) => row.mission);
    if (shortlist.length >= 2 && ranked[1].score >= ranked[0].score - 1) {
      setLastMissionList(sessionId, shortlist);
      return {
        target: null as MissionListItem | null,
        error:
          `J’ai trouvé plusieurs missions possibles pour "${query}". Dis-moi laquelle:\n` +
          shortlist
            .map((mission, index) => {
              const horizon = mission.horizon ? ` (${mission.horizon})` : '';
              const detail = mission.nextStep || mission.summary;
              return `#${index + 1} - ${mission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}`;
            })
            .join('\n'),
      };
    }

    setLastMissionList(sessionId, shortlist);
    return { target: shortlist[0], error: null as string | null };
  };

  return {
    resolveTodo,
    resolveTodoRefs,
    resolveShopping,
    resolveShoppingRefs,
    resolveNote,
    resolveCalendarTarget,
    resolveGmailTarget,
    resolveMissionTarget,
  };
}

export async function prepareCalendarTarget(ctx: ToolContext, call: ToolOnly) {
  return withLocalToolCaches(ctx.sessionId, () =>
    prepareCalendarTargetInContext(ctx, call),
  );
}

export async function prepareCalendarTargetInContext(
  ctx: ToolContext,
  call: ToolOnly,
) {
  if (call.name !== 'calendar.update' && call.name !== 'calendar.delete')
    return undefined;
  const { target, error } = await createToolResolvers(
    ctx,
  ).resolveCalendarTarget(call.args);
  if (error || !target)
    throw new TargetResolutionError(error || 'Aucun rendez-vous ciblé.');
  return target;
}
