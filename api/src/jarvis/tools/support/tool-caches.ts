import { PrivateCacheFence } from '../../services/private-cache-fence';
import { MAX_FACTS_PER_OWNER } from '../../../memory/personal-memory';
import type { CalendarEventItem } from '../../../calendar/providers/calendar.provider';
import type { GmailMessageItem } from '../../../gmail/providers/gmail.provider';
import {
  type GmailCategory,
  getGmailCategoryFromLabels,
} from '../../../gmail/gmail-category';
import type { ToolContext } from '../tools';

export type LastCalendarList = {
  events: CalendarEventItem[];
  createdAt: number;
};

export type LastCalendarFocus = {
  event: CalendarEventItem;
  createdAt: number;
};

export type TodoListItem = {
  id: string;
  text: string;
  done: boolean;
};

export type LastTodoList = {
  items: TodoListItem[];
  createdAt: number;
};

export type ShoppingListItem = {
  id: string;
  text: string;
  bought: boolean;
};

export type LastShoppingList = {
  items: ShoppingListItem[];
  createdAt: number;
};

export type NoteListItem = {
  id: string;
  title: string | null;
  text: string;
};

export type LastNoteList = {
  items: NoteListItem[];
  createdAt: number;
};

export type MemoryListItem = { id: string; text: string };

export type LastMemoryList = {
  items: MemoryListItem[];
  createdAt: number;
};

export type WebSearchListItem = {
  title: string;
  url: string;
  snippet: string;
};

export type LastWebSearchList = {
  items: WebSearchListItem[];
  createdAt: number;
};

export type GmailListItem = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  labels: string[];
  category?: GmailCategory | null;
  unread: boolean;
};

export type LastGmailList = {
  items: GmailListItem[];
  createdAt: number;
};

export type LastGmailFocus = {
  item: GmailListItem;
  createdAt: number;
};

export type MissionListItem = {
  id: string;
  objective: string;
  horizon: string | null;
  status: string;
  summary: string;
  nextStep: string | null;
  updatedAt?: Date;
};

export type LastMissionList = {
  items: MissionListItem[];
  createdAt: number;
};

// cache RAM de la dernière liste pour pouvoir faire "supprime #3"
export const toolCacheFence = new PrivateCacheFence(1_000);
export const LAST_CAL_LIST = new Map<string, LastCalendarList>();
export const LAST_CAL_FOCUS = new Map<string, LastCalendarFocus>();
export const LAST_CAL_LIST_TTL_MS = 30 * 60_000;
export const LAST_CAL_LIST_MAX_SESSIONS = 1_000;
export const LAST_TODO_LIST = new Map<string, LastTodoList>();
export const LAST_NOTE_LIST = new Map<string, LastNoteList>();
export const LAST_MEMORY_LIST = new Map<string, LastMemoryList>();
export const LAST_SHOPPING_LIST = new Map<string, LastShoppingList>();
export const LAST_WEB_SEARCH = new Map<string, LastWebSearchList>();
export const LAST_GMAIL_LIST = new Map<string, LastGmailList>();
export const LAST_GMAIL_FOCUS = new Map<string, LastGmailFocus>();
export const LAST_MISSION_LIST = new Map<string, LastMissionList>();
export const LAST_LIST_TTL_MS = 30 * 60_000;
export const LAST_LIST_MAX_SESSIONS = 1_000;

export function cleanupLastCalendarCache() {
  const now = Date.now();
  for (const [sessionId, row] of LAST_CAL_LIST.entries()) {
    if (now - row.createdAt > LAST_CAL_LIST_TTL_MS)
      LAST_CAL_LIST.delete(sessionId);
  }
  for (const [sessionId, row] of LAST_CAL_FOCUS.entries()) {
    if (now - row.createdAt > LAST_CAL_LIST_TTL_MS)
      LAST_CAL_FOCUS.delete(sessionId);
  }

  if (LAST_CAL_LIST.size <= LAST_CAL_LIST_MAX_SESSIONS) return;
  const oldest = [...LAST_CAL_LIST.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  for (let i = 0; i < oldest.length - LAST_CAL_LIST_MAX_SESSIONS; i++) {
    LAST_CAL_LIST.delete(oldest[i][0]);
  }

  if (LAST_CAL_FOCUS.size <= LAST_CAL_LIST_MAX_SESSIONS) return;
  const oldestFocus = [...LAST_CAL_FOCUS.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  for (let i = 0; i < oldestFocus.length - LAST_CAL_LIST_MAX_SESSIONS; i++) {
    LAST_CAL_FOCUS.delete(oldestFocus[i][0]);
  }
}

export function setLastCalendarList(
  sessionId: string,
  events: CalendarEventItem[],
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupLastCalendarCache();
  LAST_CAL_LIST.set(sessionId, { events, createdAt: Date.now() });
}

export function getLastCalendarList(sessionId: string) {
  cleanupLastCalendarCache();
  return LAST_CAL_LIST.get(sessionId)?.events ?? [];
}

export function isSameCalendarEvent(
  a: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
  b: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
) {
  return (
    a.provider === b.provider &&
    a.eventId === b.eventId &&
    (a.calendarId ?? '') === (b.calendarId ?? '')
  );
}

export function setLastCalendarFocus(
  sessionId: string,
  event: CalendarEventItem,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupLastCalendarCache();
  LAST_CAL_FOCUS.set(sessionId, { event, createdAt: Date.now() });
}

export function getLastCalendarFocus(sessionId: string) {
  cleanupLastCalendarCache();
  return LAST_CAL_FOCUS.get(sessionId)?.event ?? null;
}

export function patchCalendarInCache(
  sessionId: string,
  target: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
  patch: Partial<Pick<CalendarEventItem, 'title' | 'when' | 'end'>>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_CAL_LIST.get(sessionId);
  if (!row) return;
  row.events = row.events.map((event) => {
    if (isSameCalendarEvent(event, target)) {
      return { ...event, ...patch };
    }
    return event;
  });
  row.createdAt = Date.now();

  const focus = LAST_CAL_FOCUS.get(sessionId);
  if (focus && isSameCalendarEvent(focus.event, target)) {
    focus.event = { ...focus.event, ...patch };
    focus.createdAt = Date.now();
  }
}

export function removeCalendarFromCache(
  sessionId: string,
  target: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_CAL_LIST.get(sessionId);
  if (!row) return;
  row.events = row.events.filter(
    (event) => !isSameCalendarEvent(event, target),
  );
  row.createdAt = Date.now();

  const focus = LAST_CAL_FOCUS.get(sessionId);
  if (focus && isSameCalendarEvent(focus.event, target)) {
    LAST_CAL_FOCUS.delete(sessionId);
  }
}

export function cleanupSimpleCache<T extends { createdAt: number }>(
  cache: Map<string, T>,
) {
  const now = Date.now();
  for (const [sessionId, row] of cache.entries()) {
    if (now - row.createdAt > LAST_LIST_TTL_MS) cache.delete(sessionId);
  }

  if (cache.size <= LAST_LIST_MAX_SESSIONS) return;
  const oldest = [...cache.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  for (let i = 0; i < oldest.length - LAST_LIST_MAX_SESSIONS; i++) {
    cache.delete(oldest[i][0]);
  }
}

export function setLastTodoList(sessionId: string, items: TodoListItem[]) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_TODO_LIST);
  LAST_TODO_LIST.set(sessionId, { items, createdAt: Date.now() });
}

export function getLastTodoList(sessionId: string) {
  cleanupSimpleCache(LAST_TODO_LIST);
  return LAST_TODO_LIST.get(sessionId)?.items ?? [];
}

export function patchTodoInCache(
  sessionId: string,
  id: string,
  patch: Partial<TodoListItem>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_TODO_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

export function removeTodoFromCache(sessionId: string, id: string) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_TODO_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

export function setLastNoteList(sessionId: string, items: NoteListItem[]) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_NOTE_LIST);
  LAST_NOTE_LIST.set(sessionId, { items, createdAt: Date.now() });
}

export function getLastNoteList(sessionId: string) {
  cleanupSimpleCache(LAST_NOTE_LIST);
  return LAST_NOTE_LIST.get(sessionId)?.items ?? [];
}

export function setLastMemoryList(sessionId: string, items: MemoryListItem[]) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_MEMORY_LIST);
  LAST_MEMORY_LIST.set(sessionId, { items, createdAt: Date.now() });
}

export function getLastMemoryList(sessionId: string) {
  cleanupSimpleCache(LAST_MEMORY_LIST);
  return LAST_MEMORY_LIST.get(sessionId)?.items ?? [];
}

export function patchNoteInCache(
  sessionId: string,
  id: string,
  patch: Partial<NoteListItem>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_NOTE_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

export function removeNoteFromCache(sessionId: string, id: string) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_NOTE_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

export function setLastShoppingList(
  sessionId: string,
  items: ShoppingListItem[],
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_SHOPPING_LIST);
  LAST_SHOPPING_LIST.set(sessionId, { items, createdAt: Date.now() });
}

export function getLastShoppingList(sessionId: string) {
  cleanupSimpleCache(LAST_SHOPPING_LIST);
  return LAST_SHOPPING_LIST.get(sessionId)?.items ?? [];
}

export function getLastWebSearch(sessionId: string) {
  cleanupSimpleCache(LAST_WEB_SEARCH);
  return LAST_WEB_SEARCH.get(sessionId)?.items ?? [];
}

export function setLastMissionList(
  sessionId: string,
  items: MissionListItem[],
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_MISSION_LIST);
  LAST_MISSION_LIST.set(sessionId, { items, createdAt: Date.now() });
}

export function getLastMissionList(sessionId: string) {
  cleanupSimpleCache(LAST_MISSION_LIST);
  return LAST_MISSION_LIST.get(sessionId)?.items ?? [];
}

export function patchMissionInCache(
  sessionId: string,
  id: string,
  patch: Partial<MissionListItem>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_MISSION_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

export function getLastWebSearchResults(sessionId: string) {
  return getLastWebSearch(sessionId);
}

export function mapGmailItem(
  item: GmailMessageItem | GmailListItem,
): GmailListItem {
  return {
    id: item.id,
    threadId: item.threadId,
    subject: item.subject,
    from: item.from,
    to: item.to,
    date: item.date,
    snippet: item.snippet,
    labels: item.labels,
    category: item.category ?? getGmailCategoryFromLabels(item.labels),
    unread: item.unread,
  };
}

export function setLastGmailList(sessionId: string, items: GmailMessageItem[]) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_GMAIL_LIST);
  LAST_GMAIL_LIST.set(sessionId, {
    items: items.map((item) => mapGmailItem(item)),
    createdAt: Date.now(),
  });
}

export function getLastGmailList(sessionId: string) {
  cleanupSimpleCache(LAST_GMAIL_LIST);
  return LAST_GMAIL_LIST.get(sessionId)?.items ?? [];
}

export function setLastGmailFocus(
  sessionId: string,
  item: GmailMessageItem | GmailListItem,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  cleanupSimpleCache(LAST_GMAIL_FOCUS);
  LAST_GMAIL_FOCUS.set(sessionId, {
    item: mapGmailItem(item),
    createdAt: Date.now(),
  });
}

export function getLastGmailFocus(sessionId: string) {
  cleanupSimpleCache(LAST_GMAIL_FOCUS);
  return LAST_GMAIL_FOCUS.get(sessionId)?.item ?? null;
}

export function patchGmailInCache(
  sessionId: string,
  id: string,
  patch: Partial<Pick<GmailListItem, 'unread' | 'labels' | 'category'>>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_GMAIL_LIST.get(sessionId);
  if (row) {
    row.items = row.items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    row.createdAt = Date.now();
  }

  const focus = LAST_GMAIL_FOCUS.get(sessionId);
  if (focus && focus.item.id === id) {
    focus.item = { ...focus.item, ...patch };
    focus.createdAt = Date.now();
  }
}

export function removeGmailFromCache(sessionId: string, id: string) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_GMAIL_LIST.get(sessionId);
  if (row) {
    row.items = row.items.filter((item) => item.id !== id);
    row.createdAt = Date.now();
  }

  const focus = LAST_GMAIL_FOCUS.get(sessionId);
  if (focus && focus.item.id === id) {
    LAST_GMAIL_FOCUS.delete(sessionId);
  }
}

export function patchShoppingInCache(
  sessionId: string,
  id: string,
  patch: Partial<ShoppingListItem>,
) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_SHOPPING_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

export function removeShoppingFromCache(sessionId: string, id: string) {
  if (!toolCacheFence.canPublish(sessionId)) return;
  const row = LAST_SHOPPING_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

export function dropFactFromMemoryLists(factId: string) {
  for (const [sessionId, row] of LAST_MEMORY_LIST) {
    if (row.items.some((item) => item.id === factId))
      LAST_MEMORY_LIST.delete(sessionId);
  }
}

export async function resolveMemoryForget(
  ctx: Pick<ToolContext, 'prisma' | 'sessionId'>,
  args: { ref?: number; query?: string },
): Promise<{ id: string; text: string } | { error: string }> {
  let id: string | undefined;
  if (typeof args.ref === 'number') {
    const list = getLastMemoryList(ctx.sessionId);
    if (!list.length)
      return {
        error:
          'Je n’ai pas de liste récente. Demandez « Que sais-tu de moi ? » puis « Oublie #N ».',
      };
    id = list[args.ref - 1]?.id;
    if (!id)
      return {
        error: `Numéro invalide (#${args.ref}). Choisissez entre 1 et ${list.length}.`,
      };
  } else {
    const query = (args.query ?? '').trim().toLowerCase();
    if (!query) return { error: 'Précisez le fait à oublier.' };
    const facts = await ctx.prisma.personalFact.findMany({
      select: { id: true, text: true },
      take: MAX_FACTS_PER_OWNER,
    });
    const matches = facts.filter((fact) =>
      fact.text.toLowerCase().includes(query),
    );
    if (matches.length !== 1)
      return {
        error: matches.length
          ? 'Plusieurs faits correspondent. Demandez « Que sais-tu de moi ? » puis « Oublie #N ».'
          : 'Aucun fait retenu ne correspond.',
      };
    id = matches[0].id;
  }
  const fact = await ctx.prisma.personalFact.findFirst({
    where: { id },
    select: { id: true, text: true },
  });
  return fact
    ? { id: fact.id, text: fact.text }
    : { error: 'Ce fait n’existe plus.' };
}

/** Also invalidates delayed tool resolutions, including nested calls. */
export function clearLocalToolCaches(sessionId: string) {
  toolCacheFence.forget(sessionId);
  LAST_CAL_LIST.delete(sessionId);
  LAST_CAL_FOCUS.delete(sessionId);
  LAST_TODO_LIST.delete(sessionId);
  LAST_NOTE_LIST.delete(sessionId);
  LAST_MEMORY_LIST.delete(sessionId);
  LAST_SHOPPING_LIST.delete(sessionId);
  LAST_WEB_SEARCH.delete(sessionId);
  LAST_GMAIL_LIST.delete(sessionId);
  LAST_GMAIL_FOCUS.delete(sessionId);
  LAST_MISSION_LIST.delete(sessionId);
}

export function withLocalToolCaches<T>(
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return toolCacheFence.run(sessionId, operation, () =>
    clearLocalToolCaches(sessionId),
  );
}
