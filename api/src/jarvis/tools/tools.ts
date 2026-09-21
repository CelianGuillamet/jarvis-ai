import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CalendarProvider,
  CalendarEventItem,
} from '../../calendar/providers/calendar.provider';
import { resolveRange, RangeParseError } from '../lib/resolve-range';
import { resolveWhenWindow } from '../lib/resolve-when';
import {
  WEB_DISABLED_MESSAGE,
  type WebProvider,
} from '../providers/web.provider';
import type { WeatherProvider } from '../providers/weather.provider';
export {
  TOOL_META,
  type ToolMetadata,
  type ToolName,
  type ToolOnly,
  type ToolRiskLevel,
} from './tool-registry';
import type {
  GmailMessageDetail,
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import {
  type GmailCategory,
  GMAIL_CATEGORIES,
  GMAIL_CATEGORY_LABELS_FR,
  getGmailCategoryFromLabels,
  getGmailCategoryLabel,
} from '../../gmail/gmail-category';
import { JarvisGoalService } from '../services/jarvis-goal.service';
import { ConflictDetectionService } from '../services/conflict-detection.service';
import { JarvisDependencyTrackingService } from '../services/jarvis-dependency-tracking.service';
import { JarvisResourceAllocationService } from '../services/jarvis-resource-allocation.service';
import { JarvisPredictiveAnalyticsService } from '../services/jarvis-predictive-analytics.service';
import { JarvisSmartSchedulingService } from '../services/jarvis-smart-scheduling.service';
import { JarvisContextualHelpService } from '../services/jarvis-contextual-help.service';
import { JarvisSearchService } from '../services/jarvis-search.service';
import { JarvisKnowledgeBaseService } from '../services/jarvis-knowledge-base.service';
import { JarvisTimeInsightsService } from '../services/jarvis-time-insights.service';
import { JarvisDelegationService } from '../services/jarvis-delegation.service';
import { JarvisReminderService } from '../services/jarvis-reminder.service';
import { JarvisHabitService } from '../services/jarvis-habit.service';
import { JarvisContactService } from '../services/jarvis-contact.service';
import { JarvisFinanceService } from '../services/jarvis-finance.service';
import {
  JarvisMemoryService,
  type MemoryLayer,
} from '../services/jarvis-memory.service';

export type ToolCall =
  | { type: 'tool'; name: 'todo.add'; args: { text: string } }
  | { type: 'tool'; name: 'todo.list'; args: { show?: 'open' | 'all' } }
  | { type: 'tool'; name: 'todo.done'; args: { query: string } }
  | { type: 'tool'; name: 'todo.reopen'; args: { query: string } }
  | { type: 'tool'; name: 'todo.done_all'; args: Record<string, never> }
  | { type: 'tool'; name: 'todo.update'; args: { query: string; text: string } }
  | { type: 'tool'; name: 'todo.delete'; args: { query: string } }
  | { type: 'tool'; name: 'todo.bulk_done'; args: { refs: number[] } }
  | { type: 'tool'; name: 'todo.bulk_delete'; args: { refs: number[] } }
  | { type: 'tool'; name: 'todo.clear_done'; args: Record<string, never> }
  | { type: 'tool'; name: 'todo.clear_all'; args: Record<string, never> }
  | {
      type: 'tool';
      name: 'calendar.create';
      args: { title: string; when: string; endWhen?: string };
    }
  | {
      type: 'tool';
      name: 'calendar.list';
      args: {
        rangeText?: string;
        startIso?: string;
        endIso?: string;
        limit?: number;
      };
    }
  | {
      type: 'tool';
      name: 'calendar.has';
      args: { when?: string; startIso?: string; endIso?: string };
    }
  | {
      type: 'tool';
      name: 'calendar.duration';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'calendar.delete';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'calendar.update';
      args: {
        ref?: number;
        query?: string;
        title?: string;
        when?: string;
        endWhen?: string;
      };
    }
  | { type: 'tool'; name: 'note.add'; args: { title?: string; text: string } }
  | { type: 'tool'; name: 'note.list'; args: { limit?: number } }
  | { type: 'tool'; name: 'note.search'; args: { query: string } }
  | {
      type: 'tool';
      name: 'note.update';
      args: { query: string; title?: string | null; text?: string };
    }
  | { type: 'tool'; name: 'note.delete'; args: { query: string } }
  | { type: 'tool'; name: 'shopping.add'; args: { text: string } }
  | { type: 'tool'; name: 'shopping.list'; args: { show?: 'open' | 'all' } }
  | { type: 'tool'; name: 'shopping.bought'; args: { query: string } }
  | { type: 'tool'; name: 'shopping.unbought'; args: { query: string } }
  | { type: 'tool'; name: 'shopping.bought_all'; args: Record<string, never> }
  | {
      type: 'tool';
      name: 'shopping.update';
      args: { query: string; text: string };
    }
  | { type: 'tool'; name: 'shopping.delete'; args: { query: string } }
  | { type: 'tool'; name: 'shopping.bulk_bought'; args: { refs: number[] } }
  | { type: 'tool'; name: 'shopping.bulk_delete'; args: { refs: number[] } }
  | { type: 'tool'; name: 'shopping.clear_bought'; args: Record<string, never> }
  | { type: 'tool'; name: 'shopping.clear_all'; args: Record<string, never> }
  | {
      type: 'tool';
      name: 'weather.forecast';
      args: { location?: string; day?: 'today' | 'tomorrow' };
    }
  | {
      type: 'tool';
      name: 'web.search';
      args: { query: string; limit?: number };
    }
  | { type: 'tool'; name: 'web.open'; args: { url: string } }
  | {
      type: 'tool';
      name: 'gmail.list';
      args: {
        query?: string;
        unreadOnly?: boolean;
        limit?: number;
        category?: GmailCategory;
      };
    }
  | { type: 'tool'; name: 'gmail.get'; args: { ref?: number; query?: string } }
  | {
      type: 'tool';
      name: 'gmail.summary';
      args: {
        ref?: number;
        query?: string;
        unreadOnly?: boolean;
        limit?: number;
        category?: GmailCategory;
      };
    }
  | {
      type: 'tool';
      name: 'gmail.send';
      args: {
        to: string;
        subject: string;
        text: string;
        cc?: string;
        bcc?: string;
      };
    }
  | {
      type: 'tool';
      name: 'gmail.mark_read';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.bulk_mark_read';
      args: { refs?: number[]; unreadOnly?: boolean; limit?: number };
    }
  | {
      type: 'tool';
      name: 'gmail.mark_unread';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.archive';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.unarchive';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.trash';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.untrash';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'gmail.delete';
      args: { ref?: number; query?: string };
    }
  | { type: 'tool'; name: 'undo.last_action'; args: Record<string, never> }
  | { type: 'tool'; name: 'daily.briefing'; args: Record<string, never> }
  | {
      type: 'tool';
      name: 'action.history';
      args: { status?: 'pending' | 'all'; limit?: number };
    }
  | {
      type: 'tool';
      name: 'workflow.list';
      args: { limit?: number };
    }
  | {
      type: 'tool';
      name: 'mission.list';
      args: { status?: 'active' | 'all'; limit?: number };
    }
  | {
      type: 'tool';
      name: 'mission.close';
      args: { ref?: number; query?: string };
    }
  | {
      type: 'tool';
      name: 'mission.plan';
      args: { objective: string; horizon?: string };
    }
  // ===== MEMORY =====
  | {
      type: 'tool';
      name: 'memory.list';
      args: { layer?: MemoryLayer | 'all'; limit?: number };
    }
  | {
      type: 'tool';
      name: 'memory.set';
      args: {
        layer: MemoryLayer;
        key: string;
        label: string;
        value: string;
        confidence?: number;
        source?: string;
      };
    }
  | {
      type: 'tool';
      name: 'memory.forget';
      args: { ref?: number; layer?: MemoryLayer; key?: string; query?: string };
    }
  // ===== GOALS =====
  | {
      type: 'tool';
      name: 'goal.create';
      args: {
        title: string;
        description?: string;
        priority?: number;
        targetDate?: string;
        parentGoalId?: string;
      };
    }
  | { type: 'tool'; name: 'goal.list'; args: { status?: 'active' | 'all' } }
  | {
      type: 'tool';
      name: 'goal.decompose';
      args: {
        goalId: string;
        subGoals: Array<{ title: string; priority?: number }>;
      };
    }
  | { type: 'tool'; name: 'goal.done'; args: { goalId: string } }
  // ===== CONFLICTS =====
  | { type: 'tool'; name: 'conflict.detect'; args: Record<string, never> }
  // ===== DEPENDENCIES =====
  | {
      type: 'tool';
      name: 'dependency.add';
      args: {
        sourceTaskId: string;
        targetTaskId: string;
        dependencyType?: string;
        estimatedDays?: number;
      };
    }
  | { type: 'tool'; name: 'dependency.list'; args: { taskId: string } }
  | { type: 'tool'; name: 'dependency.order'; args: { taskIds: string[] } }
  // ===== RESOURCES =====
  | {
      type: 'tool';
      name: 'resource.allocate';
      args: {
        resourceType: string;
        resourceName: string;
        allocatedHours: number;
        allocationDate?: string;
        expiryDate?: string;
      };
    }
  | { type: 'tool'; name: 'resource.capacity'; args: { resourceType?: string } }
  | { type: 'tool'; name: 'resource.optimize'; args: Record<string, never> }
  // ===== ANALYTICS =====
  | {
      type: 'tool';
      name: 'analytics.forecast';
      args: {
        metricType: string;
        historicalData: number[];
        forecast: number[];
        accuracy?: number;
      };
    }
  | { type: 'tool'; name: 'analytics.trend'; args: { metricType: string } }
  // ===== SCHEDULING =====
  | {
      type: 'tool';
      name: 'schedule.suggest';
      args: {
        suggestedTime: string;
        rationale: string;
        taskId?: string;
        priority?: number;
      };
    }
  | { type: 'tool'; name: 'schedule.list'; args: { applied?: boolean } }
  | { type: 'tool'; name: 'schedule.apply'; args: { suggestionId: string } }
  | {
      type: 'tool';
      name: 'schedule.next_slot';
      args: { afterDate?: string; durationMinutes?: number };
    }
  // ===== CONTEXTUAL HELP =====
  | {
      type: 'tool';
      name: 'help.create';
      args: {
        context: string;
        contentType: string;
        content: string;
        relevanceScore?: number;
      };
    }
  | { type: 'tool'; name: 'help.find'; args: { context: string } }
  // ===== SEARCH =====
  | {
      type: 'tool';
      name: 'search.query';
      args: { query: string; types?: string[]; limit?: number };
    }
  // ===== KNOWLEDGE BASE =====
  | {
      type: 'tool';
      name: 'knowledge.save';
      args: {
        title: string;
        content: string;
        tags?: string[];
        category?: string;
      };
    }
  | {
      type: 'tool';
      name: 'knowledge.find';
      args: { query: string; category?: string; limit?: number };
    }
  | {
      type: 'tool';
      name: 'knowledge.list';
      args: { category?: string; limit?: number };
    }
  // ===== TIME INSIGHTS =====
  | {
      type: 'tool';
      name: 'time.record';
      args: {
        metricName: string;
        value: number;
        unit?: string;
        period?: string;
      };
    }
  | { type: 'tool'; name: 'time.summary'; args: { period?: string } }
  // ===== DELEGATION =====
  | {
      type: 'tool';
      name: 'delegation.create';
      args: {
        taskDescription: string;
        delegateTo: string;
        reason?: string;
        priority?: string;
        dueDate?: string;
      };
    }
  | {
      type: 'tool';
      name: 'delegation.list';
      args: { status?: string; delegateTo?: string; limit?: number };
    }
  | {
      type: 'tool';
      name: 'delegation.escalate';
      args: { delegationId: string; escalateTo: string; reason?: string };
    }
  | {
      type: 'tool';
      name: 'delegation.resolve';
      args: { delegationId: string; resolutionNote?: string };
    }
  // ===== REMINDERS =====
  | {
      type: 'tool';
      name: 'reminder.create';
      args: {
        text: string;
        triggerAt: string;
        recurring?: boolean;
        rrule?: string;
      };
    }
  | {
      type: 'tool';
      name: 'reminder.list';
      args: { done?: boolean; limit?: number };
    }
  | { type: 'tool'; name: 'reminder.done'; args: { ref: number } }
  | {
      type: 'tool';
      name: 'reminder.snooze';
      args: { ref: number; until: string };
    }
  | { type: 'tool'; name: 'reminder.delete'; args: { ref: number } }
  // ===== HABITS =====
  | {
      type: 'tool';
      name: 'habit.create';
      args: { name: string; emoji?: string; frequency?: string };
    }
  | {
      type: 'tool';
      name: 'habit.list';
      args: { includeArchived?: boolean };
    }
  | {
      type: 'tool';
      name: 'habit.log';
      args: { ref: number; date?: string; note?: string };
    }
  | { type: 'tool'; name: 'habit.streak'; args: Record<string, never> }
  | { type: 'tool'; name: 'habit.archive'; args: { ref: number } }
  // ===== CONTACTS =====
  | {
      type: 'tool';
      name: 'contact.save';
      args: {
        name: string;
        email?: string;
        phone?: string;
        company?: string;
        role?: string;
        notes?: string;
        tags?: string[];
      };
    }
  | { type: 'tool'; name: 'contact.find'; args: { query: string } }
  | { type: 'tool'; name: 'contact.list'; args: { limit?: number } }
  | {
      type: 'tool';
      name: 'contact.update';
      args: {
        query: string;
        patch: {
          name?: string;
          email?: string;
          phone?: string;
          company?: string;
          role?: string;
          notes?: string;
          tags?: string[];
        };
      };
    }
  | { type: 'tool'; name: 'contact.delete'; args: { query: string } }
  // ===== FINANCE =====
  | {
      type: 'tool';
      name: 'expense.add';
      args: {
        amount: number;
        category: string;
        description: string;
        date?: string;
        currency?: string;
      };
    }
  | {
      type: 'tool';
      name: 'expense.list';
      args: {
        category?: string;
        from?: string;
        to?: string;
        limit?: number;
      };
    }
  | { type: 'tool'; name: 'expense.summary'; args: { period?: string } }
  | {
      type: 'tool';
      name: 'budget.set';
      args: {
        category: string;
        limit: number;
        period?: string;
        currency?: string;
      };
    }
  | { type: 'tool'; name: 'budget.status'; args: { period?: string } }
  | { type: 'final'; text: string };

export type ToolContext = {
  prisma: PrismaService;
  memory: JarvisMemoryService;
  simulation: boolean;
  tz: string;
  sessionId: string;
  calendar: CalendarProvider;
  web: WebProvider;
  weather: WeatherProvider;
  gmail: GmailProvider;
  goals?: JarvisGoalService;
  conflicts?: ConflictDetectionService;
  dependencies?: JarvisDependencyTrackingService;
  resources?: JarvisResourceAllocationService;
  analytics?: JarvisPredictiveAnalyticsService;
  scheduling?: JarvisSmartSchedulingService;
  help?: JarvisContextualHelpService;
  search?: JarvisSearchService;
  knowledge?: JarvisKnowledgeBaseService;
  timeInsights?: JarvisTimeInsightsService;
  delegation?: JarvisDelegationService;
  reminders?: JarvisReminderService;
  habits?: JarvisHabitService;
  contacts?: JarvisContactService;
  finance?: JarvisFinanceService;
};

type LastCalendarList = {
  events: CalendarEventItem[];
  createdAt: number;
};

type LastCalendarFocus = {
  event: CalendarEventItem;
  createdAt: number;
};

type TodoListItem = {
  id: string;
  text: string;
  done: boolean;
};

type LastTodoList = {
  items: TodoListItem[];
  createdAt: number;
};

type ShoppingListItem = {
  id: string;
  text: string;
  bought: boolean;
};

type LastShoppingList = {
  items: ShoppingListItem[];
  createdAt: number;
};

type NoteListItem = {
  id: string;
  title: string | null;
  text: string;
};

type LastNoteList = {
  items: NoteListItem[];
  createdAt: number;
};

type MemoryListItem = {
  layer: MemoryLayer;
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: string;
};

type LastMemoryList = {
  items: MemoryListItem[];
  createdAt: number;
};

type WebSearchListItem = {
  title: string;
  url: string;
  snippet: string;
};

type LastWebSearchList = {
  items: WebSearchListItem[];
  createdAt: number;
};

type GmailListItem = {
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

type LastGmailList = {
  items: GmailListItem[];
  createdAt: number;
};

type LastGmailFocus = {
  item: GmailListItem;
  createdAt: number;
};

type MissionListItem = {
  id: string;
  objective: string;
  horizon: string | null;
  status: string;
  summary: string;
  nextStep: string | null;
  updatedAt?: Date;
};

type LastMissionList = {
  items: MissionListItem[];
  createdAt: number;
};

type TodoSnapshot = {
  id: string;
  text: string;
  done: boolean;
  doneAt: Date | null;
  createdAt: Date;
};

type ShoppingSnapshot = {
  id: string;
  text: string;
  bought: boolean;
  boughtAt: Date | null;
  createdAt: Date;
};

type NoteSnapshot = {
  id: string;
  title: string | null;
  text: string;
  createdAt: Date;
};

type UndoMutation =
  | { kind: 'todo.delete'; id: string }
  | { kind: 'todo.upsert'; row: TodoSnapshot }
  | {
      kind: 'todo.update';
      id: string;
      data: { text?: string; done?: boolean; doneAt?: Date | null };
    }
  | { kind: 'shopping.delete'; id: string }
  | { kind: 'shopping.upsert'; row: ShoppingSnapshot }
  | {
      kind: 'shopping.update';
      id: string;
      data: { text?: string; bought?: boolean; boughtAt?: Date | null };
    }
  | { kind: 'note.delete'; id: string }
  | { kind: 'note.upsert'; row: NoteSnapshot }
  | {
      kind: 'note.update';
      id: string;
      data: { title?: string | null; text?: string };
    };

type UndoEntry = {
  createdAt: number;
  label: string;
  reversible: boolean;
  mutations: UndoMutation[];
};

// cache RAM de la dernière liste pour pouvoir faire "supprime #3"
const LAST_CAL_LIST = new Map<string, LastCalendarList>();
const LAST_CAL_FOCUS = new Map<string, LastCalendarFocus>();
const LAST_CAL_LIST_TTL_MS = 30 * 60_000;
const LAST_CAL_LIST_MAX_SESSIONS = 1_000;
const LAST_TODO_LIST = new Map<string, LastTodoList>();
const LAST_NOTE_LIST = new Map<string, LastNoteList>();
const LAST_MEMORY_LIST = new Map<string, LastMemoryList>();
const LAST_SHOPPING_LIST = new Map<string, LastShoppingList>();
const LAST_WEB_SEARCH = new Map<string, LastWebSearchList>();
const LAST_GMAIL_LIST = new Map<string, LastGmailList>();
const LAST_GMAIL_FOCUS = new Map<string, LastGmailFocus>();
const LAST_MISSION_LIST = new Map<string, LastMissionList>();
const LAST_LIST_TTL_MS = 30 * 60_000;
const LAST_LIST_MAX_SESSIONS = 1_000;
const LAST_UNDO = new Map<string, UndoEntry>();
const LAST_UNDO_TTL_MS = 60 * 60_000;
const LAST_UNDO_MAX_SESSIONS = 1_000;

function cleanupLastCalendarCache() {
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

function setLastCalendarList(sessionId: string, events: CalendarEventItem[]) {
  cleanupLastCalendarCache();
  LAST_CAL_LIST.set(sessionId, { events, createdAt: Date.now() });
}

function getLastCalendarList(sessionId: string) {
  cleanupLastCalendarCache();
  return LAST_CAL_LIST.get(sessionId)?.events ?? [];
}

function isSameCalendarEvent(
  a: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
  b: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
) {
  return (
    a.provider === b.provider &&
    a.eventId === b.eventId &&
    (a.calendarId ?? '') === (b.calendarId ?? '')
  );
}

function setLastCalendarFocus(sessionId: string, event: CalendarEventItem) {
  cleanupLastCalendarCache();
  LAST_CAL_FOCUS.set(sessionId, { event, createdAt: Date.now() });
}

function getLastCalendarFocus(sessionId: string) {
  cleanupLastCalendarCache();
  return LAST_CAL_FOCUS.get(sessionId)?.event ?? null;
}

function patchCalendarInCache(
  sessionId: string,
  target: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
  patch: Partial<Pick<CalendarEventItem, 'title' | 'when' | 'end'>>,
) {
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

function removeCalendarFromCache(
  sessionId: string,
  target: Pick<CalendarEventItem, 'provider' | 'eventId' | 'calendarId'>,
) {
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

function cleanupSimpleCache<T extends { createdAt: number }>(
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

function setLastTodoList(sessionId: string, items: TodoListItem[]) {
  cleanupSimpleCache(LAST_TODO_LIST);
  LAST_TODO_LIST.set(sessionId, { items, createdAt: Date.now() });
}

function getLastTodoList(sessionId: string) {
  cleanupSimpleCache(LAST_TODO_LIST);
  return LAST_TODO_LIST.get(sessionId)?.items ?? [];
}

function patchTodoInCache(
  sessionId: string,
  id: string,
  patch: Partial<TodoListItem>,
) {
  const row = LAST_TODO_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

function removeTodoFromCache(sessionId: string, id: string) {
  const row = LAST_TODO_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

function setLastNoteList(sessionId: string, items: NoteListItem[]) {
  cleanupSimpleCache(LAST_NOTE_LIST);
  LAST_NOTE_LIST.set(sessionId, { items, createdAt: Date.now() });
}

function getLastNoteList(sessionId: string) {
  cleanupSimpleCache(LAST_NOTE_LIST);
  return LAST_NOTE_LIST.get(sessionId)?.items ?? [];
}

function setLastMemoryList(sessionId: string, items: MemoryListItem[]) {
  cleanupSimpleCache(LAST_MEMORY_LIST);
  LAST_MEMORY_LIST.set(sessionId, { items, createdAt: Date.now() });
}

function getLastMemoryList(sessionId: string) {
  cleanupSimpleCache(LAST_MEMORY_LIST);
  return LAST_MEMORY_LIST.get(sessionId)?.items ?? [];
}

function patchNoteInCache(
  sessionId: string,
  id: string,
  patch: Partial<NoteListItem>,
) {
  const row = LAST_NOTE_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

function removeNoteFromCache(sessionId: string, id: string) {
  const row = LAST_NOTE_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

function setLastShoppingList(sessionId: string, items: ShoppingListItem[]) {
  cleanupSimpleCache(LAST_SHOPPING_LIST);
  LAST_SHOPPING_LIST.set(sessionId, { items, createdAt: Date.now() });
}

function getLastShoppingList(sessionId: string) {
  cleanupSimpleCache(LAST_SHOPPING_LIST);
  return LAST_SHOPPING_LIST.get(sessionId)?.items ?? [];
}

function getLastWebSearch(sessionId: string) {
  cleanupSimpleCache(LAST_WEB_SEARCH);
  return LAST_WEB_SEARCH.get(sessionId)?.items ?? [];
}

function setLastMissionList(sessionId: string, items: MissionListItem[]) {
  cleanupSimpleCache(LAST_MISSION_LIST);
  LAST_MISSION_LIST.set(sessionId, { items, createdAt: Date.now() });
}

function getLastMissionList(sessionId: string) {
  cleanupSimpleCache(LAST_MISSION_LIST);
  return LAST_MISSION_LIST.get(sessionId)?.items ?? [];
}

function patchMissionInCache(
  sessionId: string,
  id: string,
  patch: Partial<MissionListItem>,
) {
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

function mapGmailItem(item: GmailMessageItem | GmailListItem): GmailListItem {
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

function setLastGmailList(sessionId: string, items: GmailMessageItem[]) {
  cleanupSimpleCache(LAST_GMAIL_LIST);
  LAST_GMAIL_LIST.set(sessionId, {
    items: items.map((item) => mapGmailItem(item)),
    createdAt: Date.now(),
  });
}

function getLastGmailList(sessionId: string) {
  cleanupSimpleCache(LAST_GMAIL_LIST);
  return LAST_GMAIL_LIST.get(sessionId)?.items ?? [];
}

function setLastGmailFocus(
  sessionId: string,
  item: GmailMessageItem | GmailListItem,
) {
  cleanupSimpleCache(LAST_GMAIL_FOCUS);
  LAST_GMAIL_FOCUS.set(sessionId, {
    item: mapGmailItem(item),
    createdAt: Date.now(),
  });
}

function getLastGmailFocus(sessionId: string) {
  cleanupSimpleCache(LAST_GMAIL_FOCUS);
  return LAST_GMAIL_FOCUS.get(sessionId)?.item ?? null;
}

function patchGmailInCache(
  sessionId: string,
  id: string,
  patch: Partial<Pick<GmailListItem, 'unread' | 'labels' | 'category'>>,
) {
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

function removeGmailFromCache(sessionId: string, id: string) {
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

function patchShoppingInCache(
  sessionId: string,
  id: string,
  patch: Partial<ShoppingListItem>,
) {
  const row = LAST_SHOPPING_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.map((item) =>
    item.id === id ? { ...item, ...patch } : item,
  );
  row.createdAt = Date.now();
}

function removeShoppingFromCache(sessionId: string, id: string) {
  const row = LAST_SHOPPING_LIST.get(sessionId);
  if (!row) return;
  row.items = row.items.filter((item) => item.id !== id);
  row.createdAt = Date.now();
}

function cleanupUndoCache() {
  const now = Date.now();
  for (const [sessionId, row] of LAST_UNDO.entries()) {
    if (now - row.createdAt > LAST_UNDO_TTL_MS) LAST_UNDO.delete(sessionId);
  }

  if (LAST_UNDO.size <= LAST_UNDO_MAX_SESSIONS) return;
  const oldest = [...LAST_UNDO.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  for (let i = 0; i < oldest.length - LAST_UNDO_MAX_SESSIONS; i++) {
    LAST_UNDO.delete(oldest[i][0]);
  }
}

function rememberUndo(
  sessionId: string,
  label: string,
  reversible: boolean,
  mutations: UndoMutation[] = [],
) {
  cleanupUndoCache();
  LAST_UNDO.set(sessionId, {
    createdAt: Date.now(),
    label,
    reversible,
    mutations,
  });
}

function consumeUndo(sessionId: string): UndoEntry | null {
  cleanupUndoCache();
  const entry = LAST_UNDO.get(sessionId);
  if (!entry) return null;
  LAST_UNDO.delete(sessionId);
  return entry;
}

async function applyUndo(prisma: PrismaService, entry: UndoEntry) {
  for (const mutation of entry.mutations) {
    switch (mutation.kind) {
      case 'todo.delete':
        await prisma.todo.deleteMany({ where: { id: mutation.id } });
        break;

      case 'todo.upsert':
        await prisma.todo.upsert({
          where: { id: mutation.row.id },
          create: {
            id: mutation.row.id,
            text: mutation.row.text,
            done: mutation.row.done,
            doneAt: mutation.row.doneAt,
            createdAt: mutation.row.createdAt,
          },
          update: {
            text: mutation.row.text,
            done: mutation.row.done,
            doneAt: mutation.row.doneAt,
          },
        });
        break;

      case 'todo.update':
        await prisma.todo.updateMany({
          where: { id: mutation.id },
          data: mutation.data,
        });
        break;

      case 'shopping.delete':
        await prisma.shoppingItem.deleteMany({ where: { id: mutation.id } });
        break;

      case 'shopping.upsert':
        await prisma.shoppingItem.upsert({
          where: { id: mutation.row.id },
          create: {
            id: mutation.row.id,
            text: mutation.row.text,
            bought: mutation.row.bought,
            boughtAt: mutation.row.boughtAt,
            createdAt: mutation.row.createdAt,
          },
          update: {
            text: mutation.row.text,
            bought: mutation.row.bought,
            boughtAt: mutation.row.boughtAt,
          },
        });
        break;

      case 'shopping.update':
        await prisma.shoppingItem.updateMany({
          where: { id: mutation.id },
          data: mutation.data,
        });
        break;

      case 'note.delete':
        await prisma.note.deleteMany({ where: { id: mutation.id } });
        break;

      case 'note.upsert':
        await prisma.note.upsert({
          where: { id: mutation.row.id },
          create: {
            id: mutation.row.id,
            title: mutation.row.title,
            text: mutation.row.text,
            createdAt: mutation.row.createdAt,
          },
          update: {
            title: mutation.row.title,
            text: mutation.row.text,
          },
        });
        break;

      case 'note.update':
        await prisma.note.updateMany({
          where: { id: mutation.id },
          data: mutation.data,
        });
        break;
    }
  }
}

function clearSessionCaches(sessionId: string) {
  LAST_TODO_LIST.delete(sessionId);
  LAST_NOTE_LIST.delete(sessionId);
  LAST_MEMORY_LIST.delete(sessionId);
  LAST_SHOPPING_LIST.delete(sessionId);
  LAST_WEB_SEARCH.delete(sessionId);
  LAST_GMAIL_LIST.delete(sessionId);
  LAST_GMAIL_FOCUS.delete(sessionId);
  LAST_MISSION_LIST.delete(sessionId);
  LAST_CAL_LIST.delete(sessionId);
  LAST_CAL_FOCUS.delete(sessionId);
}

function parseNumberRef(query: string) {
  const m = query.trim().match(/^#(\d{1,3})$/);
  if (!m) return null;
  return Number(m[1]);
}

function formatDate(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("ccc dd/LL 'à' HH:mm");
}

function formatMailDate(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("ccc dd/LL 'à' HH:mm");
}

function getMailCategory(mail: Pick<GmailMessageItem, 'category' | 'labels'>) {
  return mail.category ?? getGmailCategoryFromLabels(mail.labels);
}

function formatMailCategoryTag(
  mail: Pick<GmailMessageItem, 'category' | 'labels'>,
) {
  const category = getMailCategory(mail);
  return `[${getGmailCategoryLabel(category)}]`;
}

function summarizeMailCategoryBreakdown(messages: GmailMessageItem[]) {
  const counts = new Map<GmailCategory, number>();
  for (const message of messages) {
    const category = getMailCategory(message);
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const parts = GMAIL_CATEGORIES.filter((category) => counts.has(category)).map(
    (category) =>
      `${GMAIL_CATEGORY_LABELS_FR[category]} ${counts.get(category)}`,
  );

  return parts.length ? `Repartition onglets: ${parts.join(' | ')}` : null;
}

function normalizeForMatch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseCalendarOrdinalRef(textNorm: string) {
  const patterns: Array<{ n: number; re: RegExp }> = [
    { n: 1, re: /\b(premier|premiere|1er|1ere)\b/ },
    { n: 2, re: /\b(deuxieme|second|seconde|2e|2eme)\b/ },
    { n: 3, re: /\b(troisieme|3e|3eme)\b/ },
    { n: 4, re: /\b(quatrieme|4e|4eme)\b/ },
    { n: 5, re: /\b(cinquieme|5e|5eme)\b/ },
    { n: 6, re: /\b(sixieme|6e|6eme)\b/ },
    { n: 7, re: /\b(septieme|7e|7eme)\b/ },
    { n: 8, re: /\b(huitieme|8e|8eme)\b/ },
    { n: 9, re: /\b(neuvieme|9e|9eme)\b/ },
    { n: 10, re: /\b(dixieme|10e|10eme)\b/ },
  ];
  for (const { n, re } of patterns) {
    if (re.test(textNorm)) return n;
  }
  return null;
}

function parseCalendarRefFromQuery(query: string) {
  const raw = query.trim();
  if (!raw) return null;

  const hash = raw.match(/#\s*(\d{1,3})\b/);
  if (hash) return Number(hash[1]);

  const norm = normalizeForMatch(raw);
  const num = norm.match(/\b(?:numero|num|n)\s*(\d{1,3})\b/);
  if (num) return Number(num[1]);

  return parseCalendarOrdinalRef(norm);
}

function parseGmailRefFromQuery(query: string) {
  return parseCalendarRefFromQuery(query);
}

function compactText(value: string, max = 260) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

const MEMORY_LAYER_VALUES: MemoryLayer[] = [
  'identity',
  'preference',
  'project',
  'relationship',
  'workflow',
];

function isMemoryLayer(value: unknown): value is MemoryLayer {
  return (
    typeof value === 'string' &&
    MEMORY_LAYER_VALUES.includes(value as MemoryLayer)
  );
}

function formatCalendarEventPreview(event: CalendarEventItem, tz: string) {
  const start = DateTime.fromJSDate(event.when).setZone(tz);
  const end = DateTime.fromJSDate(event.end ?? event.when).setZone(tz);
  const range =
    event.end && end.isValid && end.toMillis() !== start.toMillis()
      ? `${start.toFormat("ccc dd/LL 'à' HH:mm")} → ${end.toFormat('HH:mm')}`
      : start.toFormat("ccc dd/LL 'à' HH:mm");
  return `${event.title} — ${range}`;
}

function formatPreviewLines(lines: Array<string | null | undefined>) {
  return lines
    .filter(
      (line): line is string =>
        typeof line === 'string' && line.trim().length > 0,
    )
    .join('\n');
}

export async function previewTool(
  ctx: ToolContext,
  call: Extract<ToolCall, { type: 'tool' }>,
): Promise<string | null> {
  try {
    const { prisma, tz, sessionId } = ctx;

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
        if (!item)
          return `Référence todo #${ref} (liste récente indisponible).`;
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
        if (!item)
          return `Référence note #${ref} (liste récente indisponible).`;
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
        if (!item)
          return `Référence email #${ref} (liste récente indisponible).`;
        return `${formatMailCategoryTag(item)} "${item.subject}" — ${compactText(item.from, 80)}`;
      }

      if (query === '__last__') {
        const focus = getLastGmailFocus(sessionId);
        if (!focus) return 'Email ciblé indisponible.';
        return `${formatMailCategoryTag(focus)} "${focus.subject}" — ${compactText(focus.from, 80)}`;
      }

      return null;
    };

    switch (call.name) {
      case 'gmail.send': {
        return formatPreviewLines([
          `To: ${call.args.to}`,
          call.args.cc ? `Cc: ${call.args.cc}` : null,
          call.args.bcc ? `Bcc: ${call.args.bcc}` : null,
          `Sujet: ${compactText(call.args.subject, 140)}`,
          `Message: ${compactText(call.args.text, 260)}`,
        ]);
      }

      case 'gmail.bulk_mark_read': {
        const unreadOnly = call.args.unreadOnly ?? true;
        const limit = Math.min(Math.max(call.args.limit ?? 50, 1), 50);
        const list = getLastGmailList(sessionId);
        if (!list.length) return 'Liste récente indisponible.';

        const refs = call.args.refs?.length ? call.args.refs : null;
        const picked = refs
          ? refs
              .map((ref) => list[ref - 1])
              .filter((item): item is GmailListItem => !!item)
          : list;
        const filtered = (
          unreadOnly ? picked.filter((item) => item.unread) : picked
        ).slice(0, limit);

        if (!filtered.length) {
          return unreadOnly
            ? 'Aucun email non lu dans la sélection.'
            : 'Aucun email dans la sélection.';
        }

        const sample = filtered.slice(0, 5).map((item) => {
          const ref = list.findIndex((row) => row.id === item.id) + 1;
          return `#${ref} ${formatMailCategoryTag(item)} "${compactText(item.subject, 120)}"`;
        });
        const rest = filtered.length - sample.length;

        return formatPreviewLines([
          `Cibles: ${filtered.length} email(s)${unreadOnly ? ' non lu(s)' : ''}.`,
          ...sample,
          rest > 0 ? `(+${rest} autres)` : null,
        ]);
      }

      case 'gmail.trash':
      case 'gmail.delete': {
        const target = previewGmailByArgs(call.args);
        return target ? `Cible: ${target}` : null;
      }

      case 'calendar.create': {
        return formatPreviewLines([
          `Titre: ${compactText(call.args.title, 140)}`,
          `Quand: ${call.args.when}${call.args.endWhen ? ` → ${call.args.endWhen}` : ''}`,
        ]);
      }

      case 'calendar.delete': {
        const target = previewCalendarByArgs(call.args);
        return target ? `Cible: ${target}` : null;
      }

      case 'calendar.update': {
        const target = previewCalendarByArgs(call.args);
        const patch = formatPreviewLines([
          call.args.title
            ? `Nouveau titre: ${compactText(call.args.title, 140)}`
            : null,
          call.args.when ? `Nouvelle date: ${call.args.when}` : null,
          call.args.endWhen ? `Nouvelle fin: ${call.args.endWhen}` : null,
        ]);
        if (!target && !patch) return null;
        return formatPreviewLines([
          target ? `Cible: ${target}` : null,
          patch ? `Modifs:\n${patch}` : null,
        ]);
      }

      case 'todo.delete': {
        return await previewTodoByQuery(call.args.query);
      }

      case 'todo.bulk_delete': {
        const refs = cleanRefs(call.args.refs ?? []);
        if (!refs.length) return null;
        const list = getLastTodoList(sessionId);
        if (!list.length)
          return `Todos: #${refs.join(', #')} (liste récente indisponible).`;
        const lines = refs
          .map((ref) => {
            const item = list[ref - 1];
            return item
              ? `- #${ref} ${item.done ? '[x]' : '[ ]'} ${item.text}`
              : null;
          })
          .filter((line): line is string => !!line);
        return lines.length ? `Todos:\n${lines.join('\n')}` : null;
      }

      case 'todo.clear_done': {
        const doneCount = await prisma.todo.count({ where: { done: true } });
        const sample = await prisma.todo.findMany({
          where: { done: true },
          orderBy: { doneAt: 'desc' },
          take: 5,
          select: { text: true },
        });
        const sampleLines = sample.map((t) => `- ${compactText(t.text, 120)}`);
        return formatPreviewLines([
          `Todos terminés à supprimer: ${doneCount}`,
          sampleLines.length ? `Exemples:\n${sampleLines.join('\n')}` : null,
        ]);
      }

      case 'todo.clear_all': {
        const total = await prisma.todo.count();
        const open = await prisma.todo.count({ where: { done: false } });
        const sample = await prisma.todo.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { text: true, done: true },
        });
        const sampleLines = sample.map(
          (t) => `- ${t.done ? '[x]' : '[ ]'} ${compactText(t.text, 120)}`,
        );
        return formatPreviewLines([
          `Todos à supprimer: ${total} (ouverts: ${open})`,
          sampleLines.length ? `Exemples:\n${sampleLines.join('\n')}` : null,
        ]);
      }

      case 'shopping.delete': {
        return await previewShoppingByQuery(call.args.query);
      }

      case 'shopping.bulk_delete': {
        const refs = cleanRefs(call.args.refs ?? []);
        if (!refs.length) return null;
        const list = getLastShoppingList(sessionId);
        if (!list.length)
          return `Courses: #${refs.join(', #')} (liste récente indisponible).`;
        const lines = refs
          .map((ref) => {
            const item = list[ref - 1];
            return item
              ? `- #${ref} ${item.bought ? '[x]' : '[ ]'} ${item.text}`
              : null;
          })
          .filter((line): line is string => !!line);
        return lines.length ? `Courses:\n${lines.join('\n')}` : null;
      }

      case 'shopping.clear_bought': {
        const boughtCount = await prisma.shoppingItem.count({
          where: { bought: true },
        });
        const sample = await prisma.shoppingItem.findMany({
          where: { bought: true },
          orderBy: { boughtAt: 'desc' },
          take: 5,
          select: { text: true },
        });
        const sampleLines = sample.map((t) => `- ${compactText(t.text, 120)}`);
        return formatPreviewLines([
          `Articles achetés à supprimer: ${boughtCount}`,
          sampleLines.length ? `Exemples:\n${sampleLines.join('\n')}` : null,
        ]);
      }

      case 'shopping.clear_all': {
        const total = await prisma.shoppingItem.count();
        const open = await prisma.shoppingItem.count({
          where: { bought: false },
        });
        const sample = await prisma.shoppingItem.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { text: true, bought: true },
        });
        const sampleLines = sample.map(
          (t) => `- ${t.bought ? '[x]' : '[ ]'} ${compactText(t.text, 120)}`,
        );
        return formatPreviewLines([
          `Articles à supprimer: ${total} (à acheter: ${open})`,
          sampleLines.length ? `Exemples:\n${sampleLines.join('\n')}` : null,
        ]);
      }

      case 'note.delete': {
        return await previewNoteByQuery(call.args.query);
      }

      case 'mission.close': {
        const ref =
          typeof call.args.ref === 'number' && Number.isInteger(call.args.ref)
            ? call.args.ref
            : null;
        if (ref === null) return null;
        const list = getLastMissionList(sessionId);
        const item = list[ref - 1];
        if (!item) return null;
        return `Mission #${ref}: ${compactText(item.objective, 160)}`;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

function stripQuotedReplyLines(value: string) {
  return value
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith('>')) return false;
      if (/^le\s.+a ecrit\s*:/i.test(trimmed)) return false;
      if (/^on\s.+wrote\s*:/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function summarizeMail(detail: GmailMessageDetail) {
  const body = stripQuotedReplyLines(detail.bodyText || '');
  const preview = compactText(body || detail.snippet || '', 420);
  if (!preview) return 'Contenu court ou vide.';
  return preview;
}

function formatClock(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat('HH:mm');
}

function describeRelativeMoment(target: DateTime, now: DateTime) {
  const diffMinutes = Math.round(target.diff(now, 'minutes').minutes);
  if (Math.abs(diffMinutes) <= 5) return 'maintenant';
  if (diffMinutes < 0) {
    const abs = Math.abs(diffMinutes);
    return abs < 60 ? `depuis ${abs} min` : `depuis ${Math.round(abs / 60)} h`;
  }
  if (diffMinutes < 60) return `dans ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `dans ${hours} h ${minutes}` : `dans ${hours} h`;
}

function scoreMailUrgency(mail: GmailMessageItem, now: DateTime) {
  const category = mail.category ?? getGmailCategoryFromLabels(mail.labels);
  const text = normalizeForMatch(
    `${mail.subject} ${mail.from} ${mail.snippet} ${mail.labels.join(' ')}`,
  );
  const weightedKeywords: Array<{ weight: number; words: string[] }> = [
    {
      weight: 3,
      words: [
        'urgent',
        'asap',
        'immediat',
        'alerte',
        'incident',
        'security',
        'securite',
        'verification',
        'mot de passe',
        'password',
      ],
    },
    {
      weight: 2,
      words: [
        'facture',
        'invoice',
        'paiement',
        'payment',
        'echeance',
        'rappel',
        'action requise',
        'action requise',
        'important',
      ],
    },
  ];

  let score = 0;
  for (const group of weightedKeywords) {
    if (group.words.some((word) => text.includes(word))) {
      score += group.weight;
    }
  }

  const ageHours = Math.abs(
    now.diff(DateTime.fromJSDate(mail.date).setZone(now.zone), 'hours').hours,
  );
  if (ageHours <= 24) score += 1;
  if (mail.unread) score += 1;
  if (/\b(?:billing|security|support|admin|noreply|no reply)\b/.test(text)) {
    score += 1;
  }

  if (category === 'primary') score += 2;
  else if (category === 'updates') score += 1;
  else if (category === 'social') score -= 1;
  else if (category === 'promotions') score -= 2;

  return score;
}

function attentionLabel(score: number) {
  if (score >= 6) return 'CRITIQUE';
  if (score >= 4) return 'ELEVEE';
  if (score >= 2) return 'MODEREE';
  return 'STABLE';
}

function monthFromFrench(name: string): number | null {
  const n = normalizeForMatch(name);
  const map: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
  };
  return map[n] ?? null;
}

function extractDayMonthHint(textNorm: string) {
  const numeric = textNorm.match(
    /\b(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?\b/,
  );
  if (numeric) {
    return { day: Number(numeric[1]), month: Number(numeric[2]) };
  }

  const named = textNorm.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  );
  if (named) {
    const month = monthFromFrench(named[2]);
    if (month) return { day: Number(named[1]), month };
  }

  const dayOnly = textNorm.match(
    /\b(?:le|du|de|au|a)\s+(\d{1,2})(?!\s*(?:h|:))\b/,
  );
  if (dayOnly) {
    return { day: Number(dayOnly[1]), month: null };
  }

  return null;
}

function extractWeekdayHint(textNorm: string) {
  const map: Record<string, number> = {
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
    dimanche: 7,
  };
  for (const [name, weekday] of Object.entries(map)) {
    if (textNorm.includes(name)) return weekday;
  }
  return null;
}

function extractTimeHint(textNorm: string) {
  if (textNorm.includes('midi')) return { hour: 12, minute: 0 };
  if (textNorm.includes('minuit')) return { hour: 0, minute: 0 };
  const m = textNorm.match(/\b(\d{1,2})(?:h|:)(\d{1,2})?\b/);
  if (!m) return null;
  return {
    hour: Number(m[1]),
    minute: m[2] ? Number(m[2]) : 0,
  };
}

const CALENDAR_QUERY_STOPWORDS = new Set<string>([
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'un',
  'une',
  'et',
  'a',
  'au',
  'aux',
  'pour',
  'que',
  'qui',
  'ce',
  'quoi',
  'est',
  'j',
  'ai',
  'mes',
  'mon',
  'sur',
  'dans',
  'rendez',
  'vous',
  'rdv',
  'agenda',
  'calendrier',
  'prochain',
  'prochaine',
  'prochains',
  'prochaines',
  'supprime',
  'supprimer',
  'modifie',
  'modifier',
  'deplace',
  'deplacer',
  'durent',
  'duree',
  'combien',
  'temps',
  'premier',
  'deuxieme',
  'troisieme',
  'numero',
  'celui',
  'celle',
  'meme',
  '__last__',
]);

const CALENDAR_FOCUS_QUERIES = new Set<string>([
  '__last__',
  'dernier',
  'dernier rdv',
  'dernier rendez vous',
  'dernier rendez-vous',
  'le dernier',
  'celui',
  'celle',
  'celui la',
  'celle la',
  'ce rdv',
  'ce rendez vous',
  'ce rendez-vous',
  'le meme',
]);

function isFocusQuery(queryNorm: string) {
  const compact = queryNorm.replace(/\s+/g, ' ').trim();
  if (!compact) return true;
  if (CALENDAR_FOCUS_QUERIES.has(compact)) return true;
  const tokens = compact
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !CALENDAR_QUERY_STOPWORDS.has(t));
  return tokens.length === 0;
}

function resolveCalendarInterval(
  input: {
    rangeText?: string;
    when?: string;
    startIso?: string;
    endIso?: string;
  },
  tz: string,
):
  | { error: string; startIso: null; endIso: null }
  | { error: null; startIso: string; endIso: string } {
  const hasIso = !!(input.startIso && input.endIso);
  if (hasIso) {
    const start = DateTime.fromISO(input.startIso!, { zone: tz });
    const end = DateTime.fromISO(input.endIso!, { zone: tz });
    if (!start.isValid || !end.isValid) {
      return {
        error: 'Intervalle ISO invalide (startIso/endIso).',
        startIso: null,
        endIso: null,
      };
    }
    if (end <= start) {
      return {
        error: 'Intervalle invalide: endIso doit être après startIso.',
        startIso: null,
        endIso: null,
      };
    }
    return {
      error: null,
      startIso: start.toISO({ suppressMilliseconds: true }),
      endIso: end.toISO({ suppressMilliseconds: true }),
    };
  }

  const text = input.rangeText ?? input.when;
  if (!text || !text.trim()) {
    return {
      error:
        'Période manquante. Donne-moi une période (ex: "2 semaines") ou startIso/endIso.',
      startIso: null,
      endIso: null,
    };
  }

  const { startIso, endIso } = resolveRange(text, tz);
  return { error: null, startIso, endIso };
}

function formatDurationMinutes(totalMinutes: number) {
  const minutes = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function noteLabel(note: { title: string | null; text: string }) {
  if (note.title && note.title.trim()) return note.title;
  const base = note.text.replace(/\s+/g, ' ').trim();
  return base.length > 60 ? `${base.slice(0, 60)}…` : base;
}

const MISSION_STOPWORDS = new Set<string>([
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'ou',
  'pour',
  'sur',
  'dans',
  'avec',
  'sans',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'votre',
  'vos',
  'notre',
  'nos',
  'ce',
  'cet',
  'cette',
  'ces',
  'au',
  'aux',
  'par',
  'd',
  'l',
  'me',
  'moi',
  'toi',
  'faire',
  'fais',
  'preparer',
  'prepare',
  'construire',
  'construis',
  'plan',
  'mission',
  'strategie',
  'roadmap',
  'objectif',
  'action',
]);

const MISSION_FOCUS_QUERIES = new Set<string>([
  'mission',
  'la mission',
  'ma mission',
  'cette mission',
  'celle ci',
  'celle la',
  'mission en cours',
  'mission active',
  'mission actuelle',
  'mission ouverte',
]);

function tokenizeMissionText(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !MISSION_STOPWORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

function uniqueTokens(tokens: string[]) {
  return [...new Set(tokens)];
}

function computeMissionMatchScore(haystack: string, objectiveTokens: string[]) {
  if (!objectiveTokens.length) return 0;
  const normalized = normalizeForMatch(haystack);
  let score = 0;
  for (const token of objectiveTokens) {
    if (!normalized.includes(token)) continue;
    score += token.length >= 7 ? 3 : token.length >= 5 ? 2 : 1;
  }
  return score;
}

function isMissionFocusQuery(query: string) {
  const normalized = normalizeForMatch(query);
  if (!normalized) return true;
  if (MISSION_FOCUS_QUERIES.has(normalized)) return true;
  const tokens = tokenizeMissionText(normalized);
  return tokens.length === 0;
}

function missionComplexityLabel(score: number) {
  if (score >= 8) return 'ELEVEE';
  if (score >= 5) return 'SOUTENUE';
  if (score >= 3) return 'MODEREE';
  return 'CONTENUE';
}

function formatMissionWindow(startIso: string, endIso: string, tz: string) {
  const start = DateTime.fromISO(startIso, { zone: tz });
  const end = DateTime.fromISO(endIso, { zone: tz });
  if (!start.isValid || !end.isValid) return `${startIso} -> ${endIso}`;
  return `${start.toFormat('ccc d LLL HH:mm')} -> ${end.toFormat('ccc d LLL HH:mm')}`;
}

function cleanRefs(refs: number[]) {
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

export async function runTool(
  ctx: ToolContext,
  call: ToolCall,
): Promise<string> {
  const { prisma, tz, sessionId } = ctx;

  const resolveTodo = async (query: string, done?: boolean) => {
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

  switch (call.type) {
    case 'final':
      return call.text;

    case 'tool': {
      switch (call.name) {
        // ===== TODOS =====
        case 'todo.add': {
          const created = await prisma.todo.create({
            data: { text: call.args.text },
            select: { id: true },
          });
          rememberUndo(sessionId, 'ajout todo', true, [
            { kind: 'todo.delete', id: created.id },
          ]);
          return `OK. Ajouté: "${call.args.text}"`;
        }

        case 'todo.list': {
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
        }

        case 'todo.done': {
          const { row, error } = await resolveTodo(call.args.query, false);
          if (error) return error;
          if (!row) return `Aucun todo trouvé pour "${call.args.query}".`;

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
            rememberUndo(sessionId, 'todo marqué fait', true, [
              {
                kind: 'todo.update',
                id: row.id,
                data: { done: before.done, doneAt: before.doneAt },
              },
            ]);
          }

          return `OK. Terminé: "${row.text}" ✅`;
        }

        case 'todo.reopen': {
          const { row, error } = await resolveTodo(call.args.query, true);
          if (error) return error;
          if (!row)
            return `Aucun todo terminé trouvé pour "${call.args.query}".`;

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
            rememberUndo(sessionId, 'todo rouvert', true, [
              {
                kind: 'todo.update',
                id: row.id,
                data: { done: before.done, doneAt: before.doneAt },
              },
            ]);
          }

          return `OK. Réouvert: "${row.text}"`;
        }

        case 'todo.done_all': {
          const before = await prisma.todo.findMany({
            where: { done: false },
            select: { id: true, done: true, doneAt: true },
          });
          if (!before.length) return 'Aucun todo ouvert à terminer.';

          await prisma.todo.updateMany({
            where: { done: false },
            data: { done: true, doneAt: new Date() },
          });
          for (const row of before)
            patchTodoInCache(sessionId, row.id, { done: true });

          rememberUndo(
            sessionId,
            `todos marqués terminés (${before.length})`,
            true,
            before.map((r) => ({
              kind: 'todo.update' as const,
              id: r.id,
              data: { done: r.done, doneAt: r.doneAt },
            })),
          );

          return `OK. ${before.length} todos marqués comme terminés.`;
        }

        case 'todo.update': {
          const nextText = call.args.text.trim();
          if (!nextText) return 'Le nouveau texte du todo est vide.';

          const { row, error } = await resolveTodo(call.args.query);
          if (error) return error;
          if (!row) return `Aucun todo trouvé pour "${call.args.query}".`;

          await prisma.todo.update({
            where: { id: row.id },
            data: { text: nextText },
          });
          patchTodoInCache(sessionId, row.id, { text: nextText });

          rememberUndo(sessionId, 'modification todo', true, [
            { kind: 'todo.update', id: row.id, data: { text: row.text } },
          ]);

          return `OK. Todo modifié: "${row.text}" → "${nextText}"`;
        }

        case 'todo.delete': {
          const { row, error } = await resolveTodo(call.args.query);
          if (error) return error;
          if (!row) return `Aucun todo trouvé pour "${call.args.query}".`;

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
            rememberUndo(sessionId, 'suppression todo', true, [
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
        }

        case 'todo.bulk_done': {
          const { rows, error } = resolveTodoRefs(call.args.refs, false);
          if (error) return error;
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

          rememberUndo(
            sessionId,
            `todo marqués faits (${rows.length})`,
            true,
            before.map((r) => ({
              kind: 'todo.update' as const,
              id: r.id,
              data: { done: r.done, doneAt: r.doneAt },
            })),
          );

          return `OK. ${rows.length} todos marqués comme terminés.`;
        }

        case 'todo.bulk_delete': {
          const { rows, error } = resolveTodoRefs(call.args.refs);
          if (error) return error;
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

          rememberUndo(
            sessionId,
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
        }

        case 'todo.clear_done': {
          const before = await prisma.todo.findMany({
            where: { done: true },
            select: {
              id: true,
              text: true,
              done: true,
              doneAt: true,
              createdAt: true,
            },
          });
          if (!before.length) return 'Aucun todo terminé à supprimer.';

          await prisma.todo.deleteMany({ where: { done: true } });
          for (const row of before) removeTodoFromCache(sessionId, row.id);

          rememberUndo(
            sessionId,
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
        }

        case 'todo.clear_all': {
          const before = await prisma.todo.findMany({
            select: {
              id: true,
              text: true,
              done: true,
              doneAt: true,
              createdAt: true,
            },
          });
          if (!before.length) return 'Aucun todo à supprimer.';

          await prisma.todo.deleteMany({});
          LAST_TODO_LIST.delete(sessionId);

          rememberUndo(
            sessionId,
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
        }

        // ===== CALENDAR =====
        case 'calendar.list': {
          try {
            const interval = resolveCalendarInterval(call.args, tz);
            if (interval.error !== null) return interval.error;
            const limit = call.args.limit ?? 20;

            const events = await ctx.calendar.listEventsInterval(
              sessionId,
              interval.startIso,
              interval.endIso,
              tz,
              limit,
            );
            setLastCalendarList(sessionId, events);
            if (events.length === 1) setLastCalendarFocus(sessionId, events[0]);

            if (!events.length) return 'Aucun événement sur cette période.';

            return (
              `Rendez-vous:\n` +
              events
                .map(
                  (e, idx) =>
                    `#${idx + 1} - ${formatDate(e.when, tz)} — ${e.title}`,
                )
                .join('\n')
            );
          } catch (e: any) {
            if (e instanceof RangeParseError) {
              if (/période trop large/i.test(e.message ?? '')) {
                return `${e.message} Réduis la plage (ex: "2 mois", "dans 8 semaines").`;
              }
              return `Je n’ai pas compris la période (“${call.args.rangeText ?? call.args.startIso ?? 'inconnue'}”). Exemples : "aujourd’hui", "2 semaines", "du 12 au 18 mars", "avril 2026".`;
            }
            throw e;
          }
        }

        case 'calendar.has': {
          try {
            const interval = resolveCalendarInterval(call.args, tz);
            if (interval.error !== null) return interval.error;
            const events = await ctx.calendar.listEventsInterval(
              sessionId,
              interval.startIso,
              interval.endIso,
              tz,
              20,
            );
            setLastCalendarList(sessionId, events);
            if (events.length === 1) setLastCalendarFocus(sessionId, events[0]);

            if (!events.length) {
              return 'Non, aucun rendez-vous sur cette période.';
            }

            return [
              events.length === 1
                ? 'Oui, tu as 1 rendez-vous sur cette période:'
                : `Oui, tu as ${events.length} rendez-vous sur cette période:`,
              ...events.map(
                (event, idx) =>
                  `#${idx + 1} - ${formatDate(event.when, tz)} — ${event.title}`,
              ),
            ].join('\n');
          } catch (e: any) {
            if (e instanceof RangeParseError) {
              if (/période trop large/i.test(e.message ?? '')) {
                return `${e.message} Réduis la plage (ex: "2 mois", "dans 8 semaines").`;
              }
              return `Je n’ai pas compris la période (“${call.args.when ?? call.args.startIso ?? 'inconnue'}”). Exemples : "le 17 mars", "aujourd’hui", "2 semaines", "avril 2026".`;
            }
            throw e;
          }
        }

        case 'calendar.duration': {
          const { target, error } = await resolveCalendarTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun rendez-vous ciblé.';

          const list = getLastCalendarList(sessionId);
          const resolvedRef =
            list.findIndex(
              (event) =>
                event.provider === target.provider &&
                event.eventId === target.eventId &&
                (event.calendarId ?? '') === (target.calendarId ?? ''),
            ) + 1;

          const endDate =
            target.end && target.end.getTime() > target.when.getTime()
              ? target.end
              : DateTime.fromJSDate(target.when)
                  .plus({ minutes: 60 })
                  .toJSDate();
          const durationMinutes = DateTime.fromJSDate(endDate).diff(
            DateTime.fromJSDate(target.when),
            'minutes',
          ).minutes;
          const durationText = formatDurationMinutes(durationMinutes);

          const label =
            resolvedRef > 0 ? `#${resolvedRef}` : `"${target.title}"`;
          return `Le rendez-vous ${label} ("${target.title}") dure ${durationText} (${formatDate(target.when, tz)} → ${formatDate(endDate, tz)}).`;
        }

        case 'calendar.create': {
          const startIsoRaw = call.args.when.trim();
          if (!startIsoRaw) return 'La date de début est vide.';

          const startParsed = DateTime.fromISO(startIsoRaw, { zone: tz });
          if (!startParsed.isValid)
            return `Date de début invalide: "${call.args.when}".`;

          const endIsoRaw = call.args.endWhen?.trim();
          const endParsed = endIsoRaw
            ? DateTime.fromISO(endIsoRaw, { zone: tz })
            : DateTime.invalid('no-end');
          const effectiveEnd = endParsed.isValid
            ? endParsed
            : startParsed.plus({ minutes: 60 });
          if (effectiveEnd <= startParsed) {
            return 'L’heure de fin doit être après l’heure de début.';
          }

          if (ctx.simulation) {
            rememberUndo(sessionId, 'création événement (simulation)', false);
            return `SIMULATION: événement "${call.args.title}" prévu de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}.`;
          }

          await ctx.calendar.createEvent(
            sessionId,
            call.args.title,
            startParsed.toISO({ suppressMilliseconds: true }),
            tz,
            effectiveEnd.toISO({ suppressMilliseconds: true }),
          );

          rememberUndo(sessionId, 'création événement calendrier', false);
          return `OK. Événement créé: "${call.args.title}" de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}`;
        }

        case 'calendar.delete': {
          const { target, error } = await resolveCalendarTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun rendez-vous ciblé.';

          if (ctx.simulation) {
            rememberUndo(
              sessionId,
              'suppression événement (simulation)',
              false,
            );
            return `SIMULATION: supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
          }

          await ctx.calendar.deleteEvent(
            sessionId,
            target.provider,
            target.eventId,
            target.calendarId,
          );
          removeCalendarFromCache(sessionId, target);

          rememberUndo(sessionId, 'suppression événement calendrier', false);
          return `OK. Supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
        }

        case 'calendar.update': {
          const { target, error } = await resolveCalendarTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun rendez-vous ciblé.';
          const targetStart = DateTime.fromJSDate(target.when).setZone(tz);
          const targetEnd =
            target.end && target.end.getTime() > target.when.getTime()
              ? DateTime.fromJSDate(target.end).setZone(tz)
              : targetStart.plus({ minutes: 60 });

          const nextTitle =
            call.args.title && call.args.title.trim()
              ? call.args.title.trim()
              : target.title;

          let nextStart = targetStart;
          let nextEnd = targetEnd;

          if (call.args.when && call.args.when.trim()) {
            const whenRaw = call.args.when.trim();
            const whenIsoParsed = DateTime.fromISO(whenRaw, { zone: tz });

            if (whenIsoParsed.isValid) {
              nextStart = whenIsoParsed;
            } else {
              const resolved = resolveWhenWindow(whenRaw, tz, {
                baseDate: targetStart,
                defaultHour: targetStart.hour,
                defaultMinute: targetStart.minute,
              });
              nextStart = DateTime.fromISO(resolved.startIso, { zone: tz });
              if (resolved.endIso) {
                const resolvedEnd = DateTime.fromISO(resolved.endIso, {
                  zone: tz,
                });
                if (resolvedEnd.isValid) nextEnd = resolvedEnd;
              }
            }

            if (!(call.args.endWhen && call.args.endWhen.trim())) {
              const durationMs = Math.max(
                60_000,
                targetEnd.toMillis() - targetStart.toMillis(),
              );
              nextEnd = nextStart.plus({ milliseconds: durationMs });
            }
          }

          if (call.args.endWhen && call.args.endWhen.trim()) {
            const endRaw = call.args.endWhen.trim();
            let parsedEnd = DateTime.fromISO(endRaw, { zone: tz });
            if (!parsedEnd.isValid) {
              const resolvedEnd = resolveWhenWindow(endRaw, tz, {
                baseDate: nextStart,
                defaultHour: targetEnd.hour,
                defaultMinute: targetEnd.minute,
              });
              parsedEnd = DateTime.fromISO(resolvedEnd.startIso, { zone: tz });
            }
            if (!parsedEnd.isValid) {
              return `Heure de fin invalide: "${call.args.endWhen}".`;
            }
            if (parsedEnd <= nextStart) parsedEnd = parsedEnd.plus({ days: 1 });
            nextEnd = parsedEnd;
          }

          if (nextEnd <= nextStart) {
            return 'L’heure de fin doit être après l’heure de début.';
          }

          const nextWhenIso = nextStart.toISO({ suppressMilliseconds: true })!;
          const nextEndWhenIso = nextEnd.toISO({ suppressMilliseconds: true })!;

          if (ctx.simulation) {
            rememberUndo(
              sessionId,
              'modification événement (simulation)',
              false,
            );
            return `SIMULATION: modifié — ${nextTitle} de ${nextWhenIso} à ${nextEndWhenIso}`;
          }

          await ctx.calendar.updateEvent(
            sessionId,
            target.provider,
            target.eventId,
            target.calendarId,
            nextTitle,
            nextWhenIso,
            tz,
            nextEndWhenIso,
          );

          patchCalendarInCache(sessionId, target, {
            title: nextTitle,
            when: nextStart.toJSDate(),
            end: nextEnd.toJSDate(),
          });

          rememberUndo(sessionId, 'modification événement calendrier', false);
          return `OK. Événement modifié: ${nextTitle} de ${nextWhenIso} à ${nextEndWhenIso}`;
        }

        // ===== NOTES =====
        case 'note.add': {
          const created = await prisma.note.create({
            data: { title: call.args.title ?? null, text: call.args.text },
            select: { id: true },
          });

          rememberUndo(sessionId, 'ajout note', true, [
            { kind: 'note.delete', id: created.id },
          ]);

          return call.args.title
            ? `OK. Note ajoutée: "${call.args.title}"`
            : `OK. Note ajoutée.`;
        }

        case 'note.list': {
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
        }

        case 'note.search': {
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
        }

        case 'note.update': {
          const { row, error } = await resolveNote(call.args.query);
          if (error) return error;
          if (!row) return `Aucune note trouvée pour "${call.args.query}".`;

          const hasTitle = Object.hasOwn(call.args, 'title');
          const hasText = Object.hasOwn(call.args, 'text');
          if (!hasTitle && !hasText) {
            return 'Rien à modifier: envoie au moins title ou text.';
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
            if (!cleaned) return 'Le texte de la note ne peut pas être vide.';
            data.text = cleaned;
          }

          await prisma.note.update({ where: { id: row.id }, data });
          patchNoteInCache(sessionId, row.id, {
            ...(data.title === undefined ? {} : { title: data.title }),
            ...(data.text === undefined ? {} : { text: data.text }),
          });

          rememberUndo(sessionId, 'modification note', true, [
            {
              kind: 'note.update',
              id: row.id,
              data: { title: row.title, text: row.text },
            },
          ]);

          return `OK. Note modifiée: "${noteLabel(row)}"`;
        }

        case 'note.delete': {
          const { row, error } = await resolveNote(call.args.query);
          if (error) return error;
          if (!row) return `Aucune note trouvée pour "${call.args.query}".`;

          const before = await prisma.note.findUnique({
            where: { id: row.id },
            select: { id: true, title: true, text: true, createdAt: true },
          });

          await prisma.note.delete({ where: { id: row.id } });
          removeNoteFromCache(sessionId, row.id);

          if (before) {
            rememberUndo(sessionId, 'suppression note', true, [
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
        }

        // ===== SHOPPING =====
        case 'shopping.add': {
          const created = await prisma.shoppingItem.create({
            data: { text: call.args.text },
            select: { id: true },
          });

          rememberUndo(sessionId, 'ajout article courses', true, [
            { kind: 'shopping.delete', id: created.id },
          ]);

          return `OK. Ajouté à la liste de courses: "${call.args.text}"`;
        }

        case 'shopping.list': {
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
            .map(
              (i, idx) => `- #${idx + 1} - ${i.text}${i.bought ? ' ✅' : ''}`,
            )
            .join('\n')}`;
        }

        case 'shopping.bought': {
          const { row, error } = await resolveShopping(call.args.query, false);
          if (error) return error;
          if (!row) return `Aucun article trouvé pour "${call.args.query}".`;

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
            rememberUndo(sessionId, 'article marqué acheté', true, [
              {
                kind: 'shopping.update',
                id: row.id,
                data: { bought: before.bought, boughtAt: before.boughtAt },
              },
            ]);
          }

          return `OK. Acheté: "${row.text}" ✅`;
        }

        case 'shopping.unbought': {
          const { row, error } = await resolveShopping(call.args.query, true);
          if (error) return error;
          if (!row) {
            return `Aucun article déjà acheté trouvé pour "${call.args.query}".`;
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
            rememberUndo(sessionId, 'article remis en non acheté', true, [
              {
                kind: 'shopping.update',
                id: row.id,
                data: { bought: before.bought, boughtAt: before.boughtAt },
              },
            ]);
          }

          return `OK. Remis en non acheté: "${row.text}"`;
        }

        case 'shopping.bought_all': {
          const before = await prisma.shoppingItem.findMany({
            where: { bought: false },
            select: { id: true, bought: true, boughtAt: true },
          });
          if (!before.length) return 'Aucun article non acheté à marquer.';

          await prisma.shoppingItem.updateMany({
            where: { bought: false },
            data: { bought: true, boughtAt: new Date() },
          });
          for (const row of before) {
            patchShoppingInCache(sessionId, row.id, { bought: true });
          }

          rememberUndo(
            sessionId,
            `articles marqués achetés (${before.length})`,
            true,
            before.map((r) => ({
              kind: 'shopping.update' as const,
              id: r.id,
              data: { bought: r.bought, boughtAt: r.boughtAt },
            })),
          );

          return `OK. ${before.length} articles marqués comme achetés.`;
        }

        case 'shopping.update': {
          const nextText = call.args.text.trim();
          if (!nextText) return "Le nouveau texte de l'article est vide.";

          const { row, error } = await resolveShopping(call.args.query);
          if (error) return error;
          if (!row) return `Aucun article trouvé pour "${call.args.query}".`;

          await prisma.shoppingItem.update({
            where: { id: row.id },
            data: { text: nextText },
          });
          patchShoppingInCache(sessionId, row.id, { text: nextText });

          rememberUndo(sessionId, 'modification article courses', true, [
            {
              kind: 'shopping.update',
              id: row.id,
              data: { text: row.text },
            },
          ]);

          return `OK. Article modifié: "${row.text}" → "${nextText}"`;
        }

        case 'shopping.delete': {
          const { row, error } = await resolveShopping(call.args.query);
          if (error) return error;
          if (!row) return `Aucun article trouvé pour "${call.args.query}".`;

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
            rememberUndo(sessionId, 'suppression article courses', true, [
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
        }

        case 'shopping.bulk_bought': {
          const { rows, error } = resolveShoppingRefs(call.args.refs, false);
          if (error) return error;
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

          rememberUndo(
            sessionId,
            `articles marqués achetés (${rows.length})`,
            true,
            before.map((r) => ({
              kind: 'shopping.update' as const,
              id: r.id,
              data: { bought: r.bought, boughtAt: r.boughtAt },
            })),
          );

          return `OK. ${rows.length} articles marqués comme achetés.`;
        }

        case 'shopping.bulk_delete': {
          const { rows, error } = resolveShoppingRefs(call.args.refs);
          if (error) return error;
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

          rememberUndo(
            sessionId,
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
        }

        case 'shopping.clear_bought': {
          const before = await prisma.shoppingItem.findMany({
            where: { bought: true },
            select: {
              id: true,
              text: true,
              bought: true,
              boughtAt: true,
              createdAt: true,
            },
          });
          if (!before.length) return 'Aucun article acheté à supprimer.';

          await prisma.shoppingItem.deleteMany({ where: { bought: true } });
          for (const row of before) removeShoppingFromCache(sessionId, row.id);

          rememberUndo(
            sessionId,
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
        }

        case 'shopping.clear_all': {
          const before = await prisma.shoppingItem.findMany({
            select: {
              id: true,
              text: true,
              bought: true,
              boughtAt: true,
              createdAt: true,
            },
          });
          if (!before.length) return 'Aucun article à supprimer.';

          await prisma.shoppingItem.deleteMany({});
          LAST_SHOPPING_LIST.delete(sessionId);

          rememberUndo(
            sessionId,
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
        }

        // ===== WEATHER =====
        case 'weather.forecast': {
          const day = call.args.day ?? 'today';
          const requestedLocation = (call.args.location ?? '').trim();
          let location = requestedLocation;
          let usedDefaultLocation = false;

          if (!location) {
            const snapshot = await ctx.memory.getSnapshot(sessionId);
            const allFacts = Object.values(snapshot.factsByLayer).flat();
            const preferredLocation =
              allFacts.find(
                (fact) =>
                  fact.key === 'home_city' ||
                  fact.key === 'location_city' ||
                  fact.key === 'city',
              )?.value ?? '';
            location = preferredLocation.trim();
          }

          if (!location) {
            usedDefaultLocation = true;
            location = 'Paris';
          }

          try {
            const forecast = await ctx.weather.getDailyForecast({
              location,
              day,
              tz: ctx.tz,
            });

            const parts: string[] = [];
            if (forecast.day.description) parts.push(forecast.day.description);
            parts.push(`${forecast.day.tempMinC}–${forecast.day.tempMaxC}°C`);
            if (typeof forecast.day.precipitationProbMax === 'number') {
              parts.push(`pluie max ${forecast.day.precipitationProbMax}%`);
            }
            if (typeof forecast.day.windMaxKmh === 'number') {
              parts.push(`vent max ${forecast.day.windMaxKmh} km/h`);
            }

            const label = day === 'tomorrow' ? 'Demain' : "Aujourd'hui";
            const line = `${label} (${forecast.day.date}) — ${forecast.resolvedLocation}: ${parts.join(', ')}.`;
            const note = usedDefaultLocation
              ? `Note: je n'ai pas ta ville. Dis-moi "météo demain à <ville>" pour une localisation précise.`
              : null;

            return [line, note].filter((x): x is string => !!x).join('\n');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Erreur météo';
            return `Météo indisponible: ${message}`;
          }
        }

        // ===== WEB =====
        case 'web.search':
        case 'web.open':
          return WEB_DISABLED_MESSAGE;

        // ===== GMAIL =====
        case 'gmail.list': {
          const requestedQuery = (call.args.query ?? '').trim();
          const limit = Math.min(Math.max(call.args.limit ?? 10, 1), 30);
          const unreadOnly = !!call.args.unreadOnly;
          const category = call.args.category;

          const queryParts: string[] = [];
          if (unreadOnly) queryParts.push('is:unread');
          if (category) queryParts.push(`category:${category}`);
          const restrictToInbox =
            !requestedQuery ||
            (!!category && !/\bin:\w+/i.test(requestedQuery));
          if (restrictToInbox) queryParts.push('in:inbox');
          if (requestedQuery) queryParts.push(requestedQuery);
          const q = queryParts.join(' ').trim();

          const messages = await ctx.gmail.listMessages(sessionId, {
            q: q || undefined,
            maxResults: limit,
          });

          setLastGmailList(sessionId, messages);
          if (messages.length === 1) setLastGmailFocus(sessionId, messages[0]);

          if (!messages.length) {
            if (category)
              return `Aucun email dans ${GMAIL_CATEGORY_LABELS_FR[category]}.`;
            if (unreadOnly) return 'Aucun email non lu.';
            return requestedQuery
              ? `Aucun email trouvé pour "${requestedQuery}".`
              : 'Aucun email trouvé.';
          }

          const categoryLabel = category
            ? GMAIL_CATEGORY_LABELS_FR[category]
            : null;
          const title =
            categoryLabel && unreadOnly
              ? `Emails non lus — ${categoryLabel} (${messages.length}):`
              : categoryLabel
                ? `${categoryLabel} (${messages.length}):`
                : unreadOnly
                  ? `Emails non lus (${messages.length}):`
                  : `Emails (${messages.length}):`;
          const categoryBreakdown =
            !category && !requestedQuery
              ? summarizeMailCategoryBreakdown(messages)
              : null;

          return [
            title,
            categoryBreakdown,
            ...messages.map((item, idx) => {
              const state = item.unread ? 'NON LU' : 'LU';
              const preview = compactText(item.snippet || '', 120);
              return `#${idx + 1} - [${state}] ${formatMailCategoryTag(item)} ${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})${preview ? `\nExtrait: ${preview}` : ''}`;
            }),
          ].join('\n');
        }

        case 'gmail.get': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          const detail = await ctx.gmail.getMessage(sessionId, target.id);
          setLastGmailFocus(sessionId, detail);
          patchGmailInCache(sessionId, detail.id, {
            unread: detail.unread,
            labels: detail.labels,
            category: getMailCategory(detail),
          });

          const body = compactText(
            stripQuotedReplyLines(detail.bodyText || detail.snippet || ''),
            4000,
          );

          return [
            `Email:`,
            `Sujet: ${detail.subject}`,
            `De: ${detail.from}`,
            detail.to ? `A: ${detail.to}` : null,
            `Date: ${formatMailDate(detail.date, tz)}`,
            `Categorie: ${getGmailCategoryLabel(getMailCategory(detail))}`,
            detail.unread ? `Etat: non lu` : `Etat: lu`,
            detail.snippet
              ? `Extrait: ${compactText(detail.snippet, 320)}`
              : null,
            `Contenu:`,
            body || '(vide)',
          ]
            .filter((line): line is string => !!line)
            .join('\n');
        }

        case 'gmail.summary': {
          const mailboxSummaryRequested =
            typeof call.args.ref !== 'number' &&
            (call.args.category !== undefined ||
              call.args.unreadOnly !== undefined ||
              call.args.limit !== undefined);

          if (mailboxSummaryRequested) {
            const requestedQuery = (call.args.query ?? '').trim();
            const unreadOnly = call.args.unreadOnly ?? true;
            const limit = Math.min(Math.max(call.args.limit ?? 10, 1), 30);
            const category = call.args.category;

            const queryParts: string[] = [];
            if (unreadOnly) queryParts.push('is:unread');
            if (category) queryParts.push(`category:${category}`);
            const restrictToInbox =
              !requestedQuery ||
              (!!category && !/\bin:\w+/i.test(requestedQuery));
            if (restrictToInbox) queryParts.push('in:inbox');
            if (requestedQuery) queryParts.push(requestedQuery);
            const q = queryParts.join(' ').trim();

            const messages = await ctx.gmail.listMessages(sessionId, {
              q: q || undefined,
              maxResults: limit,
            });

            setLastGmailList(sessionId, messages);
            if (messages.length === 1)
              setLastGmailFocus(sessionId, messages[0]);

            if (!messages.length) {
              const categoryLabel = category
                ? GMAIL_CATEGORY_LABELS_FR[category]
                : null;
              if (categoryLabel && unreadOnly) {
                if (!requestedQuery && category) {
                  const otherTabs = await Promise.all(
                    GMAIL_CATEGORIES.filter((tab) => tab !== category).map(
                      async (tab) => {
                        const probe = await ctx.gmail.listMessages(sessionId, {
                          q: `is:unread in:inbox category:${tab}`,
                          maxResults: 1,
                        });
                        return probe.length ? tab : null;
                      },
                    ),
                  );
                  const availableTabs = otherTabs.filter(
                    (tab): tab is GmailCategory => !!tab,
                  );
                  if (availableTabs.length) {
                    const tabs = availableTabs
                      .map((tab) => GMAIL_CATEGORY_LABELS_FR[tab])
                      .join(' | ');
                    return [
                      `Aucun email non lu dans ${categoryLabel}.`,
                      `J’en vois dans: ${tabs}.`,
                      `Dis par ex: "résume mes mails non lus dans promotions".`,
                    ].join('\n');
                  }
                }

                return `Aucun email non lu dans ${categoryLabel}.`;
              }
              if (categoryLabel) return `Aucun email dans ${categoryLabel}.`;
              if (unreadOnly) return 'Aucun email non lu.';
              return requestedQuery
                ? `Aucun email trouvé pour "${requestedQuery}".`
                : 'Aucun email trouvé.';
            }

            const categoryLabel = category
              ? GMAIL_CATEGORY_LABELS_FR[category]
              : null;
            const title =
              categoryLabel && unreadOnly
                ? `Résumé emails non lus — ${categoryLabel} (${messages.length}):`
                : categoryLabel
                  ? `Résumé emails — ${categoryLabel} (${messages.length}):`
                  : unreadOnly
                    ? `Résumé emails non lus (${messages.length}):`
                    : `Résumé emails (${messages.length}):`;
            const categoryBreakdown =
              !category && !requestedQuery
                ? summarizeMailCategoryBreakdown(messages)
                : null;

            const senderCounts = new Map<string, number>();
            for (const item of messages) {
              senderCounts.set(
                item.from,
                (senderCounts.get(item.from) ?? 0) + 1,
              );
            }
            const topSenders = [...senderCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([from, count]) => `${from} (${count})`);
            const topSendersLine = topSenders.length
              ? `Principaux expéditeurs: ${topSenders.join(', ')}`
              : null;

            const highlights = messages.slice(0, Math.min(5, messages.length));
            const restCount = messages.length - highlights.length;

            return [
              title,
              categoryBreakdown,
              topSendersLine,
              'À traiter:',
              ...highlights.map((item, idx) => {
                const state = item.unread ? 'NON LU' : 'LU';
                const preview = compactText(item.snippet || '', 140);
                return `#${idx + 1} - [${state}] ${formatMailCategoryTag(item)} ${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})${preview ? `\nExtrait: ${preview}` : ''}`;
              }),
              restCount > 0
                ? `(+${restCount} autres. Dis "liste mes emails" pour tout afficher.)`
                : null,
            ]
              .filter((line): line is string => !!line)
              .join('\n');
          }

          const { target, error } = await resolveGmailTarget({
            ref: call.args.ref,
            query: call.args.query,
          });
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          const detail = await ctx.gmail.getMessage(sessionId, target.id);
          setLastGmailFocus(sessionId, detail);
          patchGmailInCache(sessionId, detail.id, {
            unread: detail.unread,
            labels: detail.labels,
            category: getMailCategory(detail),
          });

          return [
            `Résumé email:`,
            `Sujet: ${detail.subject}`,
            `De: ${detail.from}`,
            `Date: ${formatMailDate(detail.date, tz)}`,
            `Categorie: ${getGmailCategoryLabel(getMailCategory(detail))}`,
            `Résumé: ${summarizeMail(detail)}`,
          ].join('\n');
        }

        case 'gmail.send': {
          const to = call.args.to.trim();
          const subject = call.args.subject.trim();
          const textBody = call.args.text.trim();
          const cc = call.args.cc?.trim();
          const bcc = call.args.bcc?.trim();

          if (!to) return 'Destinataire email manquant.';
          if (!subject) return 'Sujet email manquant.';
          if (!textBody) return 'Contenu email vide.';

          if (ctx.simulation) {
            return `SIMULATION: email envoyé à ${to} (sujet: "${subject}").`;
          }

          await ctx.gmail.sendMessage(sessionId, {
            to,
            subject,
            text: textBody,
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
          });
          return `OK. Email envoyé à ${to} (sujet: "${subject}").`;
        }

        case 'gmail.mark_read': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email marqué comme lu "${target.subject}".`;
          }

          await ctx.gmail.modifyLabels(sessionId, target.id, [], ['UNREAD']);
          const nextLabels = target.labels.filter(
            (label) => label !== 'UNREAD',
          );
          patchGmailInCache(sessionId, target.id, {
            unread: false,
            labels: nextLabels,
            category: getGmailCategoryFromLabels(nextLabels),
          });
          return `OK. Email marqué comme lu: "${target.subject}"`;
        }

        case 'gmail.bulk_mark_read': {
          const unreadOnly = call.args.unreadOnly ?? true;
          const limit = Math.min(Math.max(call.args.limit ?? 50, 1), 50);

          const list = getLastGmailList(sessionId);
          if (!list.length) {
            return 'Je n’ai pas de liste récente d’emails. Demande d’abord "liste mes emails".';
          }

          const selected = (() => {
            const refs = call.args.refs?.length ? call.args.refs : null;
            if (!refs) return { items: list };
            const items: GmailListItem[] = [];
            for (const ref of refs) {
              const idx = ref - 1;
              const item = list[idx];
              if (!item) {
                return {
                  error: `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`,
                };
              }
              items.push(item);
            }
            return { items };
          })();

          if ('error' in selected) return (selected as { error: string }).error;
          let items = (selected as { items: GmailListItem[] }).items;
          if (unreadOnly) items = items.filter((item) => item.unread);
          if (items.length > limit) items = items.slice(0, limit);

          if (!items.length) {
            return unreadOnly
              ? 'Aucun email non lu à marquer comme lu.'
              : 'Aucun email à marquer comme lu.';
          }

          if (ctx.simulation) {
            const sample = items
              .slice(0, 6)
              .map((item) => `- ${formatMailCategoryTag(item)} ${item.subject}`)
              .join('\n');
            const rest = items.length - Math.min(6, items.length);
            return [
              `SIMULATION: ${items.length} emails marqués comme lus.`,
              sample,
              rest > 0 ? `(+${rest} autres)` : null,
            ]
              .filter((line): line is string => !!line)
              .join('\n');
          }

          for (const item of items) {
            await ctx.gmail.modifyLabels(sessionId, item.id, [], ['UNREAD']);
            const nextLabels = item.labels.filter(
              (label) => label !== 'UNREAD',
            );
            patchGmailInCache(sessionId, item.id, {
              unread: false,
              labels: nextLabels,
              category: getGmailCategoryFromLabels(nextLabels),
            });
          }

          const sample = items
            .slice(0, 6)
            .map((item) => `- ${formatMailCategoryTag(item)} ${item.subject}`)
            .join('\n');
          const rest = items.length - Math.min(6, items.length);

          return [
            `OK. ${items.length} emails marqués comme lus.`,
            sample,
            rest > 0 ? `(+${rest} autres)` : null,
          ]
            .filter((line): line is string => !!line)
            .join('\n');
        }

        case 'gmail.mark_unread': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email marqué comme non lu "${target.subject}".`;
          }

          await ctx.gmail.modifyLabels(sessionId, target.id, ['UNREAD'], []);
          const nextLabels = [...new Set([...target.labels, 'UNREAD'])];
          patchGmailInCache(sessionId, target.id, {
            unread: true,
            labels: nextLabels,
            category: getGmailCategoryFromLabels(nextLabels),
          });
          return `OK. Email marqué comme non lu: "${target.subject}"`;
        }

        case 'gmail.archive': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email archivé "${target.subject}".`;
          }

          await ctx.gmail.modifyLabels(sessionId, target.id, [], ['INBOX']);
          const nextLabels = target.labels.filter((label) => label !== 'INBOX');
          patchGmailInCache(sessionId, target.id, {
            labels: nextLabels,
            category: getGmailCategoryFromLabels(nextLabels),
          });
          return `OK. Email archivé: "${target.subject}"`;
        }

        case 'gmail.unarchive': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email desarchivé "${target.subject}".`;
          }

          await ctx.gmail.modifyLabels(sessionId, target.id, ['INBOX'], []);
          const nextLabels = [...new Set([...target.labels, 'INBOX'])];
          patchGmailInCache(sessionId, target.id, {
            labels: nextLabels,
            category: getGmailCategoryFromLabels(nextLabels),
          });
          return `OK. Email remis dans la boîte de réception: "${target.subject}"`;
        }

        case 'gmail.trash': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email déplacé à la corbeille "${target.subject}".`;
          }

          await ctx.gmail.trashMessage(sessionId, target.id);
          removeGmailFromCache(sessionId, target.id);
          return `OK. Email déplacé à la corbeille: "${target.subject}"`;
        }

        case 'gmail.untrash': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email restauré depuis la corbeille "${target.subject}".`;
          }

          await ctx.gmail.untrashMessage(sessionId, target.id);
          const nextLabels = [...new Set([...target.labels, 'INBOX'])].filter(
            (label) => label !== 'TRASH',
          );
          patchGmailInCache(sessionId, target.id, {
            labels: nextLabels,
            category: getGmailCategoryFromLabels(nextLabels),
          });
          return `OK. Email restauré de la corbeille: "${target.subject}"`;
        }

        case 'gmail.delete': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) return error;
          if (!target) return 'Aucun email ciblé.';

          if (ctx.simulation) {
            return `SIMULATION: email supprimé définitivement "${target.subject}".`;
          }

          await ctx.gmail.deleteMessage(sessionId, target.id);
          removeGmailFromCache(sessionId, target.id);
          return `OK. Email supprimé définitivement: "${target.subject}"`;
        }

        case 'undo.last_action': {
          const entry = consumeUndo(sessionId);
          if (!entry) return 'Aucune action récente à annuler.';

          if (!entry.reversible || !entry.mutations.length) {
            return `Je ne peux pas annuler la dernière action (${entry.label}).`;
          }

          await applyUndo(prisma, entry);
          clearSessionCaches(sessionId);
          return `OK. Dernière action annulée (${entry.label}).`;
        }

        case 'action.history': {
          const status = call.args.status ?? 'all';
          const limit = Math.min(Math.max(call.args.limit ?? 8, 1), 12);
          const events = await prisma.jarvisActionEvent.findMany({
            where: {
              sessionId,
              ...(status === 'pending' ? { status: 'pending' } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              toolName: true,
              summary: true,
              status: true,
              resultPreview: true,
              errorMessage: true,
              createdAt: true,
            },
          });

          if (!events.length) {
            return status === 'pending'
              ? 'Aucune action en attente.'
              : 'Aucune action récente enregistrée.';
          }

          return `Historique des actions (${status}):\n${events
            .map((event) => {
              const at = DateTime.fromJSDate(event.createdAt).setZone(tz);
              const outcome =
                event.status === 'completed'
                  ? event.resultPreview
                  : event.errorMessage;
              return `- ${at.toFormat('dd/LL HH:mm')} | ${event.status} | ${event.summary}${outcome ? ` — ${compactText(outcome, 120)}` : ''}`;
            })
            .join('\n')}`;
        }

        case 'workflow.list': {
          const limit = Math.min(Math.max(call.args.limit ?? 5, 1), 10);
          const workflows = await prisma.jarvisWorkflowMemory.findMany({
            where: { sessionId },
            orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
            take: limit,
            select: {
              triggerSummary: true,
              followUpPrompt: true,
              usageCount: true,
            },
          });

          if (!workflows.length) {
            return 'Aucun workflow appris pour le moment.';
          }

          return `Workflows appris:\n${workflows
            .map(
              (workflow, index) =>
                `- #${index + 1} - Après ${workflow.triggerSummary} -> ${workflow.followUpPrompt} (${workflow.usageCount} fois)`,
            )
            .join('\n')}`;
        }

        // ===== MEMORY =====
        case 'memory.list': {
          const layerRaw = call.args.layer;
          const limit = Math.min(Math.max(call.args.limit ?? 20, 1), 40);
          if (
            layerRaw !== undefined &&
            layerRaw !== 'all' &&
            !isMemoryLayer(layerRaw)
          ) {
            return `Couche mémoire invalide: "${String(layerRaw)}". Valeurs: ${MEMORY_LAYER_VALUES.join(', ')}, all.`;
          }
          const snapshot = await ctx.memory.getSnapshot(sessionId);
          const layers =
            layerRaw && layerRaw !== 'all' ? [layerRaw] : MEMORY_LAYER_VALUES;

          const items = layers
            .flatMap((layer) => snapshot.factsByLayer[layer])
            .sort((a, b) =>
              a.updatedAt < b.updatedAt
                ? 1
                : a.updatedAt > b.updatedAt
                  ? -1
                  : 0,
            )
            .slice(0, limit);

          setLastMemoryList(sessionId, items);

          if (!items.length) {
            return 'Aucun fait en mémoire persistante pour le moment.';
          }

          const factsText = items
            .map((fact, index) => {
              const conf = Math.round((fact.confidence ?? 0) * 100);
              const label = `${fact.label} = ${fact.value}`;
              return `- #${index + 1} [${fact.layer}:${fact.key}] ${compactText(label, 180)} (${conf}%)`;
            })
            .join('\n');

          const summaryText = snapshot.sessionSummary?.summary
            ? `\n\nRésumé persistant:\n${snapshot.sessionSummary.summary}`
            : '';

          return `Mémoire Jarvis:\n${factsText}${summaryText}`;
        }

        case 'memory.set': {
          const layer = call.args.layer;
          if (!isMemoryLayer(layer)) {
            return `Couche mémoire invalide: "${String(layer)}". Valeurs: ${MEMORY_LAYER_VALUES.join(', ')}.`;
          }
          const key = (call.args.key ?? '').trim();
          const label = (call.args.label ?? '').trim();
          const value = (call.args.value ?? '').trim();
          if (!key || !label || !value) {
            return `Champs manquants. Requis: layer, key, label, value.`;
          }

          const fact = await ctx.memory.upsertFact(sessionId, {
            layer,
            key,
            label,
            value,
            confidence: call.args.confidence,
            source: call.args.source,
          });

          if (!fact)
            return `Impossible de mettre à jour la mémoire pour "${layer}:${key}".`;

          return `OK. Mémoire mise à jour: [${fact.layer}:${fact.key}] ${fact.label} = ${fact.value}.`;
        }

        case 'memory.forget': {
          const ref =
            typeof call.args.ref === 'number' && Number.isInteger(call.args.ref)
              ? call.args.ref
              : null;

          if (ref !== null) {
            const list = getLastMemoryList(sessionId);
            if (!list.length) {
              return `Je n’ai pas de liste récente de mémoire. Dis-moi "montre ma mémoire" puis utilise #N.`;
            }
            const idx = ref - 1;
            if (idx < 0 || idx >= list.length) {
              return `Numéro invalide (#${ref}). Donne-moi un numéro entre 1 et ${list.length}.`;
            }
            const target = list[idx];
            const ok = await ctx.memory.forgetFact(sessionId, {
              layer: target.layer,
              key: target.key,
            });
            LAST_MEMORY_LIST.delete(sessionId);
            return ok
              ? `OK. Mémoire oubliée: [${target.layer}:${target.key}] ${target.label}.`
              : `Aucune mémoire trouvée pour [${target.layer}:${target.key}].`;
          }

          if (call.args.layer && call.args.key) {
            const layer = call.args.layer;
            if (!isMemoryLayer(layer)) {
              return `Couche mémoire invalide: "${String(layer)}". Valeurs: ${MEMORY_LAYER_VALUES.join(', ')}.`;
            }
            const key = (call.args.key ?? '').trim();
            if (!key) return `Clé mémoire manquante (key).`;
            const ok = await ctx.memory.forgetFact(sessionId, { layer, key });
            LAST_MEMORY_LIST.delete(sessionId);
            return ok
              ? `OK. Mémoire oubliée: [${layer}:${key}].`
              : `Aucune mémoire trouvée pour [${layer}:${key}].`;
          }

          const query = (call.args.query ?? '').trim();
          if (query) {
            const matches = await ctx.memory.searchFacts(sessionId, query, {
              limit: 6,
            });
            if (!matches.length)
              return `Aucune mémoire ne correspond à "${compactText(query, 80)}".`;
            if (matches.length > 1) {
              return `Plusieurs entrées correspondent à "${compactText(query, 80)}". Utilise "memory.list" puis "memory.forget" avec ref (#N).`;
            }
            const target = matches[0];
            const ok = await ctx.memory.forgetFact(sessionId, {
              layer: target.layer,
              key: target.key,
            });
            LAST_MEMORY_LIST.delete(sessionId);
            return ok
              ? `OK. Mémoire oubliée: [${target.layer}:${target.key}] ${target.label}.`
              : `Aucune mémoire trouvée pour [${target.layer}:${target.key}].`;
          }

          return `Précise ref (#N), ou layer+key, ou query.`;
        }

        case 'mission.list': {
          const status = call.args.status ?? 'active';
          const limit = Math.min(Math.max(call.args.limit ?? 5, 1), 12);
          const missions = await prisma.jarvisMission.findMany({
            where: {
              sessionId,
              ...(status === 'all' ? {} : { status: 'active' }),
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
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

          if (!missions.length) {
            return status === 'all'
              ? 'Aucune mission enregistrée.'
              : 'Aucune mission active.';
          }

          setLastMissionList(sessionId, missions);
          return `Missions (${status}):\n${missions
            .map((mission, index) => {
              const horizon = mission.horizon ? ` (${mission.horizon})` : '';
              const detail = mission.nextStep || mission.summary;
              return `- #${index + 1} - ${mission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}`;
            })
            .join('\n')}`;
        }

        case 'mission.close': {
          const { target, error } = await resolveMissionTarget(call.args);
          if (!target) return error ?? 'Mission introuvable.';
          if (target.status !== 'active') {
            return `La mission "${target.objective}" n’est plus active.`;
          }

          if (ctx.simulation) {
            return `SIMULATION: mission clôturée "${target.objective}".`;
          }

          await prisma.jarvisMission.update({
            where: { id: target.id },
            data: { status: 'done' },
          });
          patchMissionInCache(sessionId, target.id, {
            status: 'done',
            updatedAt: new Date(),
          });

          return `OK. Mission clôturée: "${target.objective}"${target.nextStep ? ` — dernière prochaine étape: ${compactText(target.nextStep, 120)}` : ''}`;
        }

        case 'mission.plan': {
          const objective = call.args.objective.trim();
          if (!objective) return 'Objectif mission vide.';

          const now = DateTime.now().setZone(tz);
          let startIso =
            now.startOf('day').toISO({ suppressMilliseconds: true }) ?? '';
          let endIso =
            now.plus({ days: 2 }).endOf('day').toISO({
              suppressMilliseconds: true,
            }) ?? '';
          let horizonLabel = "aujourd'hui + 48h";

          if (call.args.horizon?.trim()) {
            try {
              const resolved = resolveRange(call.args.horizon, tz);
              startIso = resolved.startIso;
              endIso = resolved.endIso;
              horizonLabel = call.args.horizon.trim();
            } catch {
              horizonLabel = `${call.args.horizon.trim()} (interprétation partielle)`;
            }
          }

          const objectiveTokens = uniqueTokens(
            tokenizeMissionText(objective),
          ).slice(0, 8);
          const keywordPhrase = objectiveTokens.slice(0, 3).join(' ');

          const [todos, notes, shopping, events] = await Promise.all([
            prisma.todo.findMany({
              where: { done: false },
              orderBy: { createdAt: 'asc' },
              take: 16,
              select: { text: true, createdAt: true },
            }),
            prisma.note.findMany({
              orderBy: { createdAt: 'desc' },
              take: 16,
              select: { title: true, text: true, createdAt: true },
            }),
            prisma.shoppingItem.findMany({
              where: { bought: false },
              orderBy: { createdAt: 'asc' },
              take: 10,
              select: { text: true },
            }),
            ctx.calendar.listEventsInterval(
              sessionId,
              startIso,
              endIso,
              tz,
              12,
            ),
          ]);

          let unreadMails: GmailMessageItem[] | null = null;
          try {
            unreadMails = await ctx.gmail.listMessages(sessionId, {
              q: 'is:unread',
              maxResults: 8,
            });
          } catch {
            unreadMails = null;
          }

          const matchedTodos = todos
            .map((todo) => ({
              ...todo,
              score: computeMissionMatchScore(todo.text, objectiveTokens),
            }))
            .filter((todo) => todo.score > 0)
            .sort(
              (a, b) =>
                b.score - a.score ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .slice(0, 3);

          const matchedNotes = notes
            .map((note) => ({
              ...note,
              score: computeMissionMatchScore(
                `${note.title ?? ''} ${note.text}`,
                objectiveTokens,
              ),
            }))
            .filter((note) => note.score > 0)
            .sort(
              (a, b) =>
                b.score - a.score ||
                b.createdAt.getTime() - a.createdAt.getTime(),
            )
            .slice(0, 3);

          const matchedEvents = events
            .map((event) => ({
              ...event,
              score: computeMissionMatchScore(event.title, objectiveTokens),
            }))
            .filter((event) => event.score > 0)
            .sort(
              (a, b) =>
                b.score - a.score || a.when.getTime() - b.when.getTime(),
            )
            .slice(0, 3);

          const scoredUnread =
            unreadMails?.map((mail) => ({
              ...mail,
              relevanceScore: computeMissionMatchScore(
                `${mail.subject} ${mail.from} ${mail.snippet}`,
                objectiveTokens,
              ),
              urgencyScore: scoreMailUrgency(mail, now),
            })) ?? [];
          const matchedMails = [...scoredUnread]
            .filter((mail) => mail.relevanceScore > 0 || mail.urgencyScore >= 4)
            .sort((a, b) => {
              const aScore = a.relevanceScore * 2 + a.urgencyScore;
              const bScore = b.relevanceScore * 2 + b.urgencyScore;
              return bScore - aScore || b.date.getTime() - a.date.getTime();
            })
            .slice(0, 3);

          const sortedEvents = [...events].sort(
            (a, b) => a.when.getTime() - b.when.getTime(),
          );
          const nextEvent =
            sortedEvents.find((event) => {
              const end = DateTime.fromJSDate(event.end ?? event.when).setZone(
                tz,
              );
              return end >= now;
            }) ?? null;

          let complexityScore = 1;
          if (objectiveTokens.length >= 4) complexityScore += 2;
          else if (objectiveTokens.length >= 2) complexityScore += 1;
          if (matchedMails.length) complexityScore += 2;
          if (matchedEvents.length || nextEvent) complexityScore += 2;
          if (matchedTodos.length) complexityScore += 1;
          if (matchedNotes.length) complexityScore += 1;
          if (todos.length >= 6) complexityScore += 1;
          if (shopping.length >= 6) complexityScore += 1;

          const executiveLines: string[] = [];
          if (
            matchedTodos.length ||
            matchedNotes.length ||
            matchedMails.length ||
            matchedEvents.length
          ) {
            executiveLines.push(
              `- J'ai trouvé ${matchedTodos.length + matchedNotes.length + matchedMails.length + matchedEvents.length} signal(s) déjà liés à cet objectif dans ton contexte.`,
            );
          } else {
            executiveLines.push(
              `- Très peu de contexte déjà structuré pour cet objectif: il faut d'abord cadrer le terrain.`,
            );
          }

          if (nextEvent) {
            const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
            executiveLines.push(
              `- Prochain jalon détecté ${describeRelativeMoment(nextStart, now)}: ${nextEvent.title}.`,
            );
          } else {
            executiveLines.push(
              `- Aucun jalon calendrier clair sur la fenêtre analysée: pense à créer un point de passage.`,
            );
          }

          if (matchedMails.length) {
            executiveLines.push(
              `- Les emails sont un levier immédiat pour cette mission.`,
            );
          } else if (unreadMails && unreadMails.length) {
            executiveLines.push(
              `- Il reste ${unreadMails.length} email(s) non lus qui peuvent perturber l'exécution.`,
            );
          } else if (unreadMails === null) {
            executiveLines.push(
              `- Gmail n'est pas connecté, donc vision incomplète côté email.`,
            );
          }

          const signalLines = [
            matchedEvents.length
              ? `- Agenda: ${matchedEvents
                  .map(
                    (event) => `${formatDate(event.when, tz)} — ${event.title}`,
                  )
                  .join(' | ')}`
              : nextEvent
                ? `- Agenda: prochain rendez-vous ${formatDate(nextEvent.when, tz)} — ${nextEvent.title}`
                : `- Agenda: aucun signal spécifique sur la fenêtre.`,
            matchedMails.length
              ? `- Emails: ${matchedMails
                  .map((mail) => `${mail.subject} (${mail.from})`)
                  .join(' | ')}`
              : unreadMails === null
                ? `- Emails: indisponibles (Gmail non connecté).`
                : `- Emails: aucun email clairement rattaché à l'objectif.`,
            matchedNotes.length
              ? `- Notes: ${matchedNotes
                  .map((note) => noteLabel(note))
                  .join(' | ')}`
              : `- Notes: aucune note directement reliée détectée.`,
            matchedTodos.length
              ? `- Todos: ${matchedTodos.map((todo) => todo.text).join(' | ')}`
              : `- Todos: aucune action déjà ouverte clairement liée.`,
          ];

          const planSteps: string[] = [];
          if (matchedMails.length) {
            const leadMail = matchedMails[0];
            planSteps.push(
              `1. Ouvre la mission par le signal externe le plus chaud: traite l'email "${leadMail.subject}" de ${leadMail.from}.`,
            );
          } else if (matchedNotes.length) {
            planSteps.push(
              `1. Commence par consolider la base de connaissance existante autour de ${compactText(objective, 80)}.`,
            );
          } else {
            planSteps.push(
              `1. Cadre l'objectif en 2 ou 3 livrables mesurables avant toute exécution.`,
            );
          }

          if (matchedNotes.length) {
            const leadNote = matchedNotes[0];
            planSteps.push(
              `${planSteps.length + 1}. Réactive la matière existante via la note "${noteLabel(leadNote)}" pour éviter de repartir à zéro.`,
            );
          }

          if (matchedTodos.length) {
            planSteps.push(
              `${planSteps.length + 1}. Regroupe les actions déjà ouvertes liées à cette mission et clarifie leur ordre d'exécution.`,
            );
          } else {
            planSteps.push(
              `${planSteps.length + 1}. Transforme la mission en au moins un todo exécutable dès maintenant.`,
            );
          }

          if (nextEvent) {
            planSteps.push(
              `${planSteps.length + 1}. Utilise ${nextEvent.title} comme jalon de contrôle et prépare ce qui doit être prêt avant ${formatClock(nextEvent.when, tz)}.`,
            );
          } else {
            planSteps.push(
              `${planSteps.length + 1}. Réserve un créneau protégé de 45 à 90 minutes dans la fenêtre pour faire avancer la mission sans interruption.`,
            );
          }

          if (planSteps.length < 4) {
            planSteps.push(
              `${planSteps.length + 1}. Termine par une revue courte: ce qui est prêt, ce qui bloque, et la prochaine action visible.`,
            );
          }

          const riskLines: string[] = [];
          if (matchedMails.some((mail) => mail.urgencyScore >= 5)) {
            riskLines.push(
              `- Un email critique peut re-prioriser la mission à court terme.`,
            );
          }
          if (todos.length >= 6) {
            riskLines.push(
              `- La charge ouverte actuelle est déjà élevée (${todos.length} todos ouverts).`,
            );
          }
          if (
            !matchedTodos.length &&
            !matchedNotes.length &&
            !matchedEvents.length
          ) {
            riskLines.push(
              `- Faible empreinte contextuelle: risque de lancer une mission mal cadrée.`,
            );
          }
          if (shopping.length >= 6) {
            riskLines.push(
              `- Beaucoup d'éléments annexes restent ouverts en parallèle (${shopping.length} courses).`,
            );
          }
          if (!riskLines.length) {
            riskLines.push(
              `- Aucun risque majeur immédiat détecté sur la base des signaux disponibles.`,
            );
          }

          const suggestedCommands = [
            matchedMails.length
              ? `Résume l'email ${matchedMails[0].subject}`
              : null,
            keywordPhrase ? `Cherche mes notes sur ${keywordPhrase}` : null,
            matchedTodos.length
              ? `Liste mes todos`
              : `Ajoute le todo ${objective}`,
            nextEvent
              ? `Montre-moi mon agenda d'aujourd'hui`
              : `Planifie un créneau demain pour ${objective}`,
          ]
            .filter((item): item is string => !!item)
            .filter((item, index, list) => list.indexOf(item) === index)
            .slice(0, 4);

          return [
            `Mission plan - ${objective}`,
            `Fenetre tactique: ${formatMissionWindow(startIso, endIso, tz)} (${horizonLabel})`,
            `Complexite estimee: ${missionComplexityLabel(complexityScore)}`,
            ``,
            `Evaluation tactique`,
            ...executiveLines,
            ``,
            `Signaux pertinents`,
            ...signalLines,
            ``,
            `Plan recommande`,
            ...planSteps,
            ``,
            `Risques`,
            ...riskLines,
            ``,
            `Commandes suggerees`,
            ...suggestedCommands.map((command) => `- ${command}`),
          ].join('\n');
        }

        // ===== BRIEFING =====
        case 'daily.briefing': {
          const [todos, shopping, activeMissions] = await Promise.all([
            prisma.todo.findMany({
              where: { done: false },
              orderBy: { createdAt: 'asc' },
              select: { text: true },
            }),
            prisma.shoppingItem.findMany({
              where: { bought: false },
              orderBy: { createdAt: 'asc' },
              select: { text: true },
            }),
            prisma.jarvisMission.findMany({
              where: {
                sessionId,
                status: 'active',
              },
              orderBy: { updatedAt: 'desc' },
              take: 3,
              select: {
                objective: true,
                horizon: true,
                summary: true,
                nextStep: true,
              },
            }),
          ]);

          let unreadMails: GmailMessageItem[] | null = null;
          try {
            unreadMails = await ctx.gmail.listMessages(sessionId, {
              q: 'is:unread',
              maxResults: 5,
            });
          } catch {
            unreadMails = null;
          }

          const { startIso, endIso } = resolveRange("aujourd'hui", tz);
          const events = await ctx.calendar.listEventsInterval(
            sessionId,
            startIso,
            endIso,
            tz,
            20,
          );
          const now = DateTime.now().setZone(tz);
          const sortedEvents = [...events].sort(
            (a, b) => a.when.getTime() - b.when.getTime(),
          );
          const currentEvent =
            sortedEvents.find((event) => {
              const start = DateTime.fromJSDate(event.when).setZone(tz);
              const end = DateTime.fromJSDate(event.end ?? event.when).setZone(
                tz,
              );
              return start <= now && end >= now;
            }) ?? null;
          const nextEvent =
            currentEvent ??
            sortedEvents.find((event) => {
              const end = DateTime.fromJSDate(event.end ?? event.when).setZone(
                tz,
              );
              return end >= now;
            }) ??
            null;

          const scoredUnread =
            unreadMails?.map((mail) => ({
              ...mail,
              urgencyScore: scoreMailUrgency(mail, now),
            })) ?? [];
          const priorityMails = [...scoredUnread]
            .filter((mail) => mail.urgencyScore >= 3)
            .sort((a, b) => {
              if (b.urgencyScore !== a.urgencyScore) {
                return b.urgencyScore - a.urgencyScore;
              }
              return b.date.getTime() - a.date.getTime();
            })
            .slice(0, 3);

          let attentionScore = 0;
          if (currentEvent) {
            attentionScore += 4;
          } else if (nextEvent) {
            const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
            const diffMinutes = nextStart.diff(now, 'minutes').minutes;
            if (diffMinutes <= 60) attentionScore += 3;
            else if (diffMinutes <= 180) attentionScore += 2;
            else attentionScore += 1;
          }
          if (priorityMails.length) {
            attentionScore += priorityMails[0].urgencyScore >= 5 ? 3 : 2;
          } else if (unreadMails && unreadMails.length >= 5) {
            attentionScore += 1;
          }
          if (todos.length >= 5) attentionScore += 1;
          if (shopping.length >= 6) attentionScore += 1;

          const topMission = activeMissions[0] ?? null;
          const summaryLines: string[] = [];
          if (currentEvent) {
            const endText = currentEvent.end
              ? ` jusqu'à ${formatClock(currentEvent.end, tz)}`
              : '';
            summaryLines.push(
              `- Rendez-vous en cours${endText}: ${currentEvent.title}.`,
            );
          } else if (nextEvent) {
            const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
            summaryLines.push(
              `- Prochain rendez-vous ${describeRelativeMoment(nextStart, now)}: ${nextEvent.title} à ${formatClock(nextEvent.when, tz)}.`,
            );
          } else {
            summaryLines.push(`- Aucun rendez-vous restant aujourd'hui.`);
          }

          if (unreadMails === null) {
            summaryLines.push(`- Gmail non connecté pour cette session.`);
          } else if (priorityMails.length) {
            summaryLines.push(
              `- ${priorityMails.length} email(s) prioritaire(s) non lus demandent de l'attention.`,
            );
          } else if (unreadMails.length) {
            summaryLines.push(
              `- ${unreadMails.length} email(s) non lus, sans signal critique majeur.`,
            );
          } else {
            summaryLines.push(`- Aucun email non lu.`);
          }

          summaryLines.push(
            `- ${todos.length} todo(s) ouvert(s) et ${shopping.length} article(s) en attente.`,
          );
          if (topMission) {
            const horizon = topMission.horizon
              ? ` (${topMission.horizon})`
              : '';
            const detail = topMission.nextStep || topMission.summary;
            summaryLines.push(
              `- Mission active clé: ${topMission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}.`,
            );
          } else {
            summaryLines.push(
              `- Aucune mission active persistée pour l'instant.`,
            );
          }

          const radarLines: string[] = [];
          if (topMission) {
            radarLines.push(
              `- Mission | ${topMission.objective}${topMission.nextStep ? ` | prochaine étape: ${compactText(topMission.nextStep, 96)}` : ''}`,
            );
          }
          if (currentEvent) {
            radarLines.push(
              `- En cours | ${currentEvent.title}${currentEvent.end ? ` jusqu'à ${formatClock(currentEvent.end, tz)}` : ''}`,
            );
          } else if (nextEvent) {
            radarLines.push(
              `- Agenda | ${formatClock(nextEvent.when, tz)} | ${nextEvent.title}`,
            );
          }
          for (const mail of priorityMails.slice(0, 2)) {
            radarLines.push(`- Email | ${mail.subject} (${mail.from})`);
          }
          for (const todo of todos.slice(0, 2)) {
            radarLines.push(`- Todo | ${todo.text}`);
          }
          if (!radarLines.length) {
            radarLines.push(`- Aucun point chaud détecté.`);
          }

          const calendarLines = sortedEvents.length
            ? sortedEvents.map(
                (event) => `- ${formatDate(event.when, tz)} — ${event.title}`,
              )
            : [`- Aucun événement aujourd'hui.`];

          const mailLines =
            unreadMails === null
              ? [`- Gmail non connecté.`]
              : priorityMails.length
                ? priorityMails.map(
                    (mail) =>
                      `- ${mail.subject} (${mail.from}) — reçu ${formatMailDate(mail.date, tz)}`,
                  )
                : unreadMails.length
                  ? unreadMails
                      .slice(0, 3)
                      .map(
                        (mail) =>
                          `- ${mail.subject} (${mail.from}) — reçu ${formatMailDate(mail.date, tz)}`,
                      )
                  : [`- Aucun email non lu.`];

          const openLoopsLines = [
            topMission
              ? `- Mission: ${topMission.objective}${topMission.nextStep ? ` | prochaine étape: ${compactText(topMission.nextStep, 96)}` : ''}`
              : `- Mission: aucune mission active structurée.`,
            todos.length
              ? `- Todos: ${todos
                  .slice(0, 4)
                  .map((todo) => todo.text)
                  .join(' | ')}`
              : `- Todos: aucun blocage ouvert.`,
            shopping.length
              ? `- Courses: ${shopping
                  .slice(0, 4)
                  .map((item) => item.text)
                  .join(' | ')}`
              : `- Courses: rien d'ouvert.`,
          ];

          return [
            `Briefing du jour - ${now.toFormat('cccc d LLLL yyyy')}`,
            `Heure locale: ${now.toFormat('HH:mm')} (${tz})`,
            `Niveau d'attention: ${attentionLabel(attentionScore)}`,
            ``,
            `Resume executif`,
            ...summaryLines,
            ``,
            `Radar immediat`,
            ...radarLines,
            ``,
            `Calendrier`,
            ...calendarLines,
            ``,
            `Emails`,
            ...mailLines,
            ``,
            `Boucles ouvertes`,
            ...openLoopsLines,
          ].join('\n');
        }

        // ===== GOALS =====
        case 'goal.create': {
          if (!ctx.goals) return 'Service objectifs non disponible.';
          const goal = await ctx.goals.create(sessionId, {
            title: call.args.title,
            description: call.args.description,
            priority: call.args.priority,
            targetDate: call.args.targetDate
              ? new Date(call.args.targetDate)
              : undefined,
            parentGoalId: call.args.parentGoalId,
          });
          if (!goal) return "Échec de la création de l'objectif.";
          return `Objectif créé: "${goal.title}" [ID: ${goal.id}]${goal.priority ? ` [P${goal.priority}]` : ''}${goal.targetDate ? ` — échéance: ${goal.targetDate}` : ''}`;
        }

        case 'goal.list': {
          if (!ctx.goals) return 'Service objectifs non disponible.';
          const goals = await ctx.goals.list(sessionId, {
            status: call.args.status ?? 'active',
          });
          if (!goals.length) return 'Aucun objectif actif.';
          const format = (g: (typeof goals)[0], depth = 0): string => {
            const indent = '  '.repeat(depth);
            const sub = g.subGoals.map((s) => format(s, depth + 1)).join('\n');
            return `${indent}- [${g.id.slice(0, 8)}] ${g.title}${g.priority ? ` [P${g.priority}]` : ''}${g.targetDate ? ` (${g.targetDate.slice(0, 10)})` : ''}${sub ? '\n' + sub : ''}`;
          };
          return `${goals.length} objectif(s):\n${goals.map((g) => format(g)).join('\n')}`;
        }

        case 'goal.decompose': {
          if (!ctx.goals) return 'Service objectifs non disponible.';
          const sub = await ctx.goals.decompose(
            sessionId,
            call.args.goalId,
            call.args.subGoals,
          );
          if (!sub.length) return 'Aucun sous-objectif créé.';
          return `${sub.length} sous-objectif(s) créé(s) pour [${call.args.goalId.slice(0, 8)}]:\n${sub.map((s) => `- ${s.title}`).join('\n')}`;
        }

        case 'goal.done': {
          if (!ctx.goals) return 'Service objectifs non disponible.';
          const goal = await ctx.goals.updateStatus(call.args.goalId, 'done');
          if (!goal) return 'Objectif introuvable.';
          return `Objectif "${goal.title}" marqué comme terminé.`;
        }

        // ===== CONFLICTS =====
        case 'conflict.detect': {
          if (!ctx.conflicts) return 'Service conflits non disponible.';
          const reports = await ctx.conflicts.detectAllConflicts(sessionId);
          if (!reports.length) return 'Aucun conflit détecté.';
          return reports
            .map(
              (r) =>
                `[${r.severity.toUpperCase()}] ${r.type}: ${r.items.length} problème(s) — ${r.remediation}`,
            )
            .join('\n');
        }

        // ===== DEPENDENCIES =====
        case 'dependency.add': {
          if (!ctx.dependencies) return 'Service dépendances non disponible.';
          const dep = await ctx.dependencies.addDependency(
            sessionId,
            call.args.sourceTaskId,
            call.args.targetTaskId,
            {
              dependencyType: call.args.dependencyType,
              estimatedDays: call.args.estimatedDays,
            },
          );
          if (!dep) return "Échec de l'ajout de la dépendance.";
          return `Dépendance ajoutée: ${dep.sourceTaskId.slice(0, 8)} → ${dep.targetTaskId.slice(0, 8)} (${dep.dependencyType})`;
        }

        case 'dependency.list': {
          if (!ctx.dependencies) return 'Service dépendances non disponible.';
          const graph = await ctx.dependencies.getDependencies(
            sessionId,
            call.args.taskId,
          );
          const lines: string[] = [
            `Dépendances de [${call.args.taskId.slice(0, 8)}]:`,
          ];
          if (graph.blockingTasks.length)
            lines.push(
              `  Bloque: ${graph.blockingTasks.map((id) => id.slice(0, 8)).join(', ')}`,
            );
          else lines.push('  Bloque: aucune tâche');
          if (graph.blockedByTasks.length)
            lines.push(
              `  Bloqué par: ${graph.blockedByTasks.map((id) => id.slice(0, 8)).join(', ')}`,
            );
          else lines.push('  Bloqué par: rien');
          return lines.join('\n');
        }

        case 'dependency.order': {
          if (!ctx.dependencies) return 'Service dépendances non disponible.';
          const ordered = await ctx.dependencies.orderTasks(
            sessionId,
            call.args.taskIds,
          );
          return `Ordre d'exécution:\n${ordered.map((id, i) => `${i + 1}. ${id.slice(0, 8)}`).join('\n')}`;
        }

        // ===== RESOURCES =====
        case 'resource.allocate': {
          if (!ctx.resources) return 'Service ressources non disponible.';
          const alloc = await ctx.resources.allocateResource(sessionId, {
            resourceType: call.args.resourceType,
            resourceName: call.args.resourceName,
            allocatedHours: call.args.allocatedHours,
            allocationDate: call.args.allocationDate
              ? new Date(call.args.allocationDate)
              : new Date(),
            expiryDate: call.args.expiryDate
              ? new Date(call.args.expiryDate)
              : undefined,
          });
          if (!alloc) return "Échec de l'allocation.";
          return `Ressource allouée: ${alloc.resourceType}/${alloc.resourceName} — ${alloc.allocatedHours}h${alloc.expiryDate ? ` (expire: ${alloc.expiryDate.slice(0, 10)})` : ''}`;
        }

        case 'resource.capacity': {
          if (!ctx.resources) return 'Service ressources non disponible.';
          const capacities = await ctx.resources.getCapacity(
            sessionId,
            call.args.resourceType,
          );
          if (!capacities.length) return 'Aucune allocation active.';
          return capacities
            .map(
              (c) =>
                `${c.resourceType}/${c.resourceName}: ${c.totalUsed.toFixed(1)}/${c.totalAllocated.toFixed(1)}h utilisées (${c.utilizationPercentage.toFixed(0)}%)`,
            )
            .join('\n');
        }

        case 'resource.optimize': {
          if (!ctx.resources) return 'Service ressources non disponible.';
          const suggestions =
            await ctx.resources.suggestResourceOptimization(sessionId);
          if (!suggestions.length) return 'Aucune optimisation à suggérer.';
          return `${suggestions.length} suggestion(s):\n${suggestions.map((s) => `- ${s.resource}: ${s.suggestion}`).join('\n')}`;
        }

        // ===== ANALYTICS =====
        case 'analytics.forecast': {
          if (!ctx.analytics) return 'Service analytics non disponible.';
          const metric = await ctx.analytics.saveForecast(
            sessionId,
            call.args.metricType,
            call.args.historicalData,
            call.args.forecast,
            call.args.accuracy,
          );
          if (!metric) return 'Échec de la sauvegarde des prévisions.';
          return `Prévisions sauvegardées: ${metric.metricType} — ${metric.forecast.length} point(s) de prévision (précision: ${(metric.accuracy * 100).toFixed(0)}%)`;
        }

        case 'analytics.trend': {
          if (!ctx.analytics) return 'Service analytics non disponible.';
          const trend = await ctx.analytics.analyzeHistoricalTrend(
            sessionId,
            call.args.metricType,
          );
          if (!trend)
            return `Pas assez de données pour analyser ${call.args.metricType}.`;
          const dirLabel =
            trend.direction === 'up'
              ? '↑ hausse'
              : trend.direction === 'down'
                ? '↓ baisse'
                : '→ stable';
          return `Tendance ${trend.metricType}: ${dirLabel} de ${Math.abs(trend.changePercent)}% — moy. récente: ${trend.recentAverage} vs historique: ${trend.historicalAverage}`;
        }

        // ===== SCHEDULING =====
        case 'schedule.suggest': {
          if (!ctx.scheduling) return 'Service planification non disponible.';
          const suggestion = await ctx.scheduling.suggestSchedule(sessionId, {
            taskId: call.args.taskId,
            suggestedTime: new Date(call.args.suggestedTime),
            rationale: call.args.rationale,
            priority: call.args.priority,
          });
          if (!suggestion) return 'Échec de la suggestion de planification.';
          const time = new Date(suggestion.suggestedTime).toLocaleString(
            'fr-FR',
            { dateStyle: 'short', timeStyle: 'short' },
          );
          return `Suggestion créée [${suggestion.id.slice(0, 8)}]: ${time} — ${suggestion.rationale}`;
        }

        case 'schedule.list': {
          if (!ctx.scheduling) return 'Service planification non disponible.';
          const suggestions = await ctx.scheduling.listSuggestions(sessionId, {
            applied: call.args.applied,
          });
          if (!suggestions.length) return 'Aucune suggestion de planification.';
          return suggestions
            .map((s, i) => {
              const time = new Date(s.suggestedTime).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              });
              return `${i + 1}. [${s.id.slice(0, 8)}] ${time} — ${s.rationale}${s.applied ? ' ✓' : ''}`;
            })
            .join('\n');
        }

        case 'schedule.apply': {
          if (!ctx.scheduling) return 'Service planification non disponible.';
          const applied = await ctx.scheduling.applySuggestion(
            call.args.suggestionId,
          );
          if (!applied) return 'Suggestion introuvable.';
          const time = new Date(applied.suggestedTime).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
          return `Suggestion appliquée: ${time} — ${applied.rationale}`;
        }

        case 'schedule.next_slot': {
          if (!ctx.scheduling) return 'Service planification non disponible.';
          const after = call.args.afterDate
            ? new Date(call.args.afterDate)
            : new Date();
          const slot = await ctx.scheduling.findNextAvailableSlot(
            sessionId,
            after,
            call.args.durationMinutes ?? 60,
          );
          if (!slot)
            return 'Aucun créneau disponible trouvé dans les 48 prochaines heures.';
          const time = slot.toLocaleString('fr-FR', {
            dateStyle: 'full',
            timeStyle: 'short',
          });
          return `Prochain créneau disponible: ${time} (durée: ${call.args.durationMinutes ?? 60}min)`;
        }

        // ===== CONTEXTUAL HELP =====
        case 'help.create': {
          if (!ctx.help) return 'Service aide non disponible.';
          const help = await ctx.help.createHelp(sessionId, {
            context: call.args.context,
            contentType: call.args.contentType,
            content: call.args.content,
            relevanceScore: call.args.relevanceScore,
          });
          if (!help) return "Échec de la création de l'aide.";
          return `Aide créée [${help.id.slice(0, 8)}] pour contexte "${help.context}": ${help.contentType}`;
        }

        case 'help.find': {
          if (!ctx.help) return 'Service aide non disponible.';
          const items = await ctx.help.findRelevant(
            sessionId,
            call.args.context,
          );
          if (!items.length)
            return `Aucune aide disponible pour le contexte "${call.args.context}".`;
          return `${items.length} aide(s) pour "${call.args.context}":\n${items.map((h) => `- [${h.contentType}] ${h.content}`).join('\n')}`;
        }

        // ===== SEARCH =====
        case 'search.query': {
          if (!ctx.search) return 'Service recherche non disponible.';
          const results = await ctx.search.query(sessionId, call.args);
          if (!results.length)
            return `Aucun résultat pour "${call.args.query}".`;
          return `${results.length} résultat(s) pour "${call.args.query}":\n${results.map((r) => `- [${r.type}] ${r.title}: ${r.snippet}`).join('\n')}`;
        }

        // ===== KNOWLEDGE BASE =====
        case 'knowledge.save': {
          if (!ctx.knowledge)
            return 'Service base de connaissances non disponible.';
          const entry = await ctx.knowledge.save(sessionId, call.args);
          if (!entry) return 'Impossible de sauvegarder la connaissance.';
          return `OK. Connaissance sauvegardée: "${entry.title}" [${entry.category}]`;
        }

        case 'knowledge.find': {
          if (!ctx.knowledge)
            return 'Service base de connaissances non disponible.';
          const entries = await ctx.knowledge.find(sessionId, call.args);
          if (!entries.length)
            return `Aucune connaissance trouvée pour "${call.args.query}".`;
          return `${entries.length} connaissance(s):\n${entries.map((e) => `- [${e.category}] ${e.title}: ${e.content.slice(0, 100)}`).join('\n')}`;
        }

        case 'knowledge.list': {
          if (!ctx.knowledge)
            return 'Service base de connaissances non disponible.';
          const entries = await ctx.knowledge.list(sessionId, call.args);
          if (!entries.length) return 'Base de connaissances vide.';
          return `${entries.length} entrée(s):\n${entries.map((e) => `- [${e.category}] ${e.title} (utilisée ${e.useCount}x)`).join('\n')}`;
        }

        // ===== TIME INSIGHTS =====
        case 'time.record': {
          if (!ctx.timeInsights)
            return 'Service insights temporels non disponible.';
          const row = await ctx.timeInsights.record(sessionId, call.args);
          if (!row) return "Impossible d'enregistrer la métrique.";
          return `OK. Métrique enregistrée: ${row.metricName} = ${row.value} ${row.unit}`;
        }

        case 'time.summary': {
          if (!ctx.timeInsights)
            return 'Service insights temporels non disponible.';
          const summary = await ctx.timeInsights.summary(sessionId, call.args);
          const metricLines = Object.entries(summary.metrics).map(
            ([name, m]) =>
              `- ${name}: total ${m.total.toFixed(0)} ${m.unit}, moy ${m.avg.toFixed(0)}`,
          );
          if (!metricLines.length)
            return `Aucune donnée pour la période "${summary.period}".`;
          return `Résumé ${summary.period} (score: ${summary.productivityScore.toFixed(0)}/100):\n${metricLines.join('\n')}`;
        }

        // ===== DELEGATION =====
        case 'delegation.create': {
          if (!ctx.delegation) return 'Service délégation non disponible.';
          const d = await ctx.delegation.delegate(sessionId, {
            ...call.args,
            dueDate: call.args.dueDate
              ? new Date(call.args.dueDate)
              : undefined,
          });
          if (!d) return 'Impossible de créer la délégation.';
          return `OK. Tâche déléguée à ${d.delegateTo}: "${d.taskDescription}"`;
        }

        case 'delegation.list': {
          if (!ctx.delegation) return 'Service délégation non disponible.';
          const delegations = await ctx.delegation.list(sessionId, call.args);
          if (!delegations.length) return 'Aucune délégation.';
          return `${delegations.length} délégation(s):\n${delegations.map((d) => `- [${d.status}] → ${d.delegateTo}: ${d.taskDescription}`).join('\n')}`;
        }

        case 'delegation.escalate': {
          if (!ctx.delegation) return 'Service délégation non disponible.';
          const d = await ctx.delegation.escalate(
            sessionId,
            call.args.delegationId,
            call.args.escalateTo,
            call.args.reason,
          );
          if (!d) return "Impossible d'escalader la délégation.";
          return `OK. Escalade vers ${d.delegateTo}: "${d.taskDescription}"`;
        }

        case 'delegation.resolve': {
          if (!ctx.delegation) return 'Service délégation non disponible.';
          const d = await ctx.delegation.resolve(
            sessionId,
            call.args.delegationId,
            call.args.resolutionNote,
          );
          if (!d) return 'Impossible de résoudre la délégation.';
          return `OK. Délégation résolue: "${d.taskDescription}"`;
        }

        // ===== RAPPELS =====
        case 'reminder.create': {
          if (!ctx.reminders) return 'Service rappels non disponible.';
          const triggerAt = new Date(call.args.triggerAt);
          if (isNaN(triggerAt.getTime())) return 'Date de rappel invalide.';
          const r = await ctx.reminders.create(sessionId, {
            text: call.args.text,
            triggerAt,
            recurring: call.args.recurring,
            rrule: call.args.rrule,
          });
          if (!r) return 'Impossible de créer le rappel.';
          const when = new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: ctx.tz,
          }).format(triggerAt);
          return `OK. Rappel créé: "${r.text}" le ${when}`;
        }

        case 'reminder.list': {
          if (!ctx.reminders) return 'Service rappels non disponible.';
          const reminders = await ctx.reminders.list(sessionId, {
            done: call.args.done ?? false,
            limit: call.args.limit,
          });
          if (!reminders.length) return 'Aucun rappel.';
          return reminders
            .map((r, i) => {
              const when = new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: ctx.tz,
              }).format(new Date(r.triggerAt));
              return `#${i + 1} ${r.done ? '✓' : '⏰'} ${r.text} — ${when}`;
            })
            .join('\n');
        }

        case 'reminder.done': {
          if (!ctx.reminders) return 'Service rappels non disponible.';
          const reminders = await ctx.reminders.list(sessionId, {
            done: false,
            limit: 50,
          });
          const idx = call.args.ref - 1;
          const target = reminders[idx];
          if (!target) return `Rappel #${call.args.ref} introuvable.`;
          await ctx.reminders.markDone(sessionId, target.id);
          return `OK. Rappel marqué comme fait: "${target.text}"`;
        }

        case 'reminder.snooze': {
          if (!ctx.reminders) return 'Service rappels non disponible.';
          const reminders = await ctx.reminders.list(sessionId, {
            done: false,
            limit: 50,
          });
          const idx = call.args.ref - 1;
          const target = reminders[idx];
          if (!target) return `Rappel #${call.args.ref} introuvable.`;
          const until = new Date(call.args.until);
          if (isNaN(until.getTime())) return 'Date de snooze invalide.';
          await ctx.reminders.snooze(sessionId, target.id, until);
          const when = new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: ctx.tz,
          }).format(until);
          return `OK. Rappel reporté au ${when}: "${target.text}"`;
        }

        case 'reminder.delete': {
          if (!ctx.reminders) return 'Service rappels non disponible.';
          const reminders = await ctx.reminders.list(sessionId, {
            done: false,
            limit: 50,
          });
          const idx = call.args.ref - 1;
          const target = reminders[idx];
          if (!target) return `Rappel #${call.args.ref} introuvable.`;
          await ctx.reminders.delete(sessionId, target.id);
          return `OK. Rappel supprimé: "${target.text}"`;
        }

        // ===== HABITUDES =====
        case 'habit.create': {
          if (!ctx.habits) return 'Service habitudes non disponible.';
          const h = await ctx.habits.create(sessionId, {
            name: call.args.name,
            emoji: call.args.emoji,
            frequency: call.args.frequency,
          });
          if (!h) return "Impossible de créer l'habitude.";
          return `OK. Habitude créée: ${h.emoji ? `${h.emoji} ` : ''}${h.name} (${h.frequency})`;
        }

        case 'habit.list': {
          if (!ctx.habits) return 'Service habitudes non disponible.';
          const habits = await ctx.habits.list(
            sessionId,
            call.args.includeArchived ?? false,
          );
          if (!habits.length) return 'Aucune habitude enregistrée.';
          return habits
            .map((h, i) => {
              const today = h.loggedToday ? " ✓ (fait aujourd'hui)" : '';
              const streak = h.streak > 1 ? ` 🔥 ${h.streak}j` : '';
              return `#${i + 1} ${h.emoji ? `${h.emoji} ` : ''}${h.name}${today}${streak}`;
            })
            .join('\n');
        }

        case 'habit.log': {
          if (!ctx.habits) return 'Service habitudes non disponible.';
          const habits = await ctx.habits.list(sessionId);
          const idx = call.args.ref - 1;
          const target = habits[idx];
          if (!target) return `Habitude #${call.args.ref} introuvable.`;
          const date = call.args.date ?? new Date().toISOString().slice(0, 10);
          const updated = await ctx.habits.log(
            sessionId,
            target.id,
            date,
            call.args.note,
          );
          if (!updated) return "Impossible d'enregistrer le log.";
          const streakMsg =
            updated.streak > 1 ? ` 🔥 Série: ${updated.streak} jours!` : '';
          return `OK. "${updated.name}" — fait le ${date}.${streakMsg}`;
        }

        case 'habit.streak': {
          if (!ctx.habits) return 'Service habitudes non disponible.';
          const habits = await ctx.habits.list(sessionId);
          if (!habits.length) return 'Aucune habitude.';
          return habits
            .map((h) => {
              const bar =
                '█'.repeat(Math.min(h.streak, 10)) +
                '░'.repeat(Math.max(0, 10 - h.streak));
              return `${h.emoji ?? '•'} ${h.name}: ${bar} ${h.streak}j (total: ${h.totalLogs})`;
            })
            .join('\n');
        }

        case 'habit.archive': {
          if (!ctx.habits) return 'Service habitudes non disponible.';
          const habits = await ctx.habits.list(sessionId);
          const idx = call.args.ref - 1;
          const target = habits[idx];
          if (!target) return `Habitude #${call.args.ref} introuvable.`;
          await ctx.habits.archive(sessionId, target.id);
          return `OK. Habitude archivée: "${target.name}"`;
        }

        // ===== CONTACTS =====
        case 'contact.save': {
          if (!ctx.contacts) return 'Service contacts non disponible.';
          const c = await ctx.contacts.save(sessionId, call.args);
          if (!c) return 'Impossible de sauvegarder le contact.';
          const details = [c.email, c.company, c.role]
            .filter(Boolean)
            .join(' · ');
          return `OK. Contact sauvegardé: ${c.name}${details ? ` (${details})` : ''}`;
        }

        case 'contact.find': {
          if (!ctx.contacts) return 'Service contacts non disponible.';
          const contacts = await ctx.contacts.find(sessionId, call.args.query);
          if (!contacts.length)
            return `Aucun contact trouvé pour "${call.args.query}".`;
          return contacts
            .map((c) => {
              const details = [c.email, c.phone, c.company]
                .filter(Boolean)
                .join(' · ');
              return `- ${c.name}${details ? `: ${details}` : ''}`;
            })
            .join('\n');
        }

        case 'contact.list': {
          if (!ctx.contacts) return 'Service contacts non disponible.';
          const contacts = await ctx.contacts.list(
            sessionId,
            call.args.limit ?? 20,
          );
          if (!contacts.length) return 'Aucun contact enregistré.';
          return (
            `${contacts.length} contact(s):\n` +
            contacts
              .map(
                (c) =>
                  `- ${c.name}${c.email ? ` <${c.email}>` : ''}${c.company ? ` (${c.company})` : ''}`,
              )
              .join('\n')
          );
        }

        case 'contact.update': {
          if (!ctx.contacts) return 'Service contacts non disponible.';
          const contacts = await ctx.contacts.find(sessionId, call.args.query);
          if (!contacts.length)
            return `Contact "${call.args.query}" introuvable.`;
          const target = contacts[0];
          if (!target) return `Contact "${call.args.query}" introuvable.`;
          const updated = await ctx.contacts.update(
            sessionId,
            target.id,
            call.args.patch ?? {},
          );
          if (!updated) return 'Impossible de mettre à jour le contact.';
          return `OK. Contact mis à jour: ${updated.name}`;
        }

        case 'contact.delete': {
          if (!ctx.contacts) return 'Service contacts non disponible.';
          const contacts = await ctx.contacts.find(sessionId, call.args.query);
          if (!contacts.length)
            return `Contact "${call.args.query}" introuvable.`;
          const target = contacts[0];
          if (!target) return `Contact "${call.args.query}" introuvable.`;
          await ctx.contacts.delete(sessionId, target.id);
          return `OK. Contact supprimé: ${target.name}`;
        }

        // ===== FINANCE =====
        case 'expense.add': {
          if (!ctx.finance) return 'Service finance non disponible.';
          const e = await ctx.finance.addExpense(sessionId, call.args);
          if (!e) return 'Impossible de sauvegarder la dépense.';
          return `OK. Dépense ajoutée: ${e.amount} ${e.currency} — ${e.description} [${e.category}] le ${e.date}`;
        }

        case 'expense.list': {
          if (!ctx.finance) return 'Service finance non disponible.';
          const expenses = await ctx.finance.listExpenses(sessionId, call.args);
          if (!expenses.length) return 'Aucune dépense trouvée.';
          const total = expenses.reduce((s, e) => s + e.amount, 0);
          const lines = expenses.map(
            (e) =>
              `- ${e.date} | ${e.amount.toFixed(2)} ${e.currency} | ${e.category} | ${e.description}`,
          );
          return `${expenses.length} dépense(s) — Total: ${total.toFixed(2)} EUR\n${lines.join('\n')}`;
        }

        case 'expense.summary': {
          if (!ctx.finance) return 'Service finance non disponible.';
          const summary = await ctx.finance.summary(
            sessionId,
            call.args.period,
          );
          const catLines = summary.byCategory.map(
            (c) =>
              `- ${c.category}: ${c.amount.toFixed(2)} EUR (${c.count} dép.)`,
          );
          const budgetLines = summary.budgetStatus
            .filter((b) => b.limit > 0)
            .map((b) => {
              const bar =
                b.percent >= 100 ? '🔴' : b.percent >= 80 ? '🟠' : '🟢';
              return `  ${bar} ${b.category}: ${b.spent.toFixed(0)}/${b.limit.toFixed(0)} EUR (${b.percent}%)`;
            });
          const out = [
            `Résumé ${summary.period} — Total: ${summary.total.toFixed(2)} EUR`,
            ...catLines,
          ];
          if (budgetLines.length) out.push('Budgets:', ...budgetLines);
          return out.join('\n');
        }

        case 'budget.set': {
          if (!ctx.finance) return 'Service finance non disponible.';
          const b = await ctx.finance.setBudget(sessionId, call.args);
          if (!b) return 'Impossible de définir le budget.';
          return `OK. Budget défini: ${b.category} → ${b.limit} ${b.currency}/${b.period}`;
        }

        case 'budget.status': {
          if (!ctx.finance) return 'Service finance non disponible.';
          const summary = await ctx.finance.summary(
            sessionId,
            call.args.period ?? 'month',
          );
          if (!summary.budgetStatus.length) return 'Aucun budget configuré.';
          return summary.budgetStatus
            .map((b) => {
              const bar =
                b.percent >= 100
                  ? '🔴 Dépassé'
                  : b.percent >= 80
                    ? '🟠 Attention'
                    : '🟢 OK';
              return `${bar} ${b.category}: ${b.spent.toFixed(0)}/${b.limit.toFixed(0)} EUR (${b.percent}%)`;
            })
            .join('\n');
        }
      }
    }
  }
}
