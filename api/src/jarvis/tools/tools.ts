import { asGoogleIntegrationError } from '../../google/google-integration.error';
import { dataUnavailable } from '../../http/data-unavailable';
import { CommandRejectedError } from '../../commands/command-rejected.error';
import { DateTime } from 'luxon';
import type { LocalTargets } from '../../commands/local-target';
import {
  isDeferredCapability,
  DEFERRED_CAPABILITY_MESSAGE,
} from './beta-capabilities';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MAX_FACTS_PER_OWNER,
  MAX_FACT_LENGTH,
  normalizeFactText,
  similarFacts,
} from '../../memory/personal-memory';
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
import type {
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
import { JarvisMemoryService } from '../services/jarvis-memory.service';
import {
  LAST_TODO_LIST,
  LAST_MEMORY_LIST,
  LAST_SHOPPING_LIST,
  setLastCalendarList,
  getLastCalendarList,
  setLastCalendarFocus,
  getLastCalendarFocus,
  patchCalendarInCache,
  removeCalendarFromCache,
  setLastTodoList,
  getLastTodoList,
  patchTodoInCache,
  removeTodoFromCache,
  setLastNoteList,
  getLastNoteList,
  setLastMemoryList,
  patchNoteInCache,
  removeNoteFromCache,
  setLastShoppingList,
  getLastShoppingList,
  setLastMissionList,
  getLastMissionList,
  patchMissionInCache,
  setLastGmailList,
  getLastGmailList,
  setLastGmailFocus,
  getLastGmailFocus,
  patchGmailInCache,
  removeGmailFromCache,
  patchShoppingInCache,
  removeShoppingFromCache,
  withLocalToolCaches,
} from './support/tool-caches';
import type { GmailListItem } from './support/tool-caches';
import {
  formatDate,
  formatMailDate,
  getMailCategory,
  formatMailCategoryTag,
  summarizeMailCategoryBreakdown,
  parseCalendarRefFromQuery,
  parseGmailRefFromQuery,
  compactText,
  formatCalendarEventPreview,
  formatPreviewLines,
  stripQuotedReplyLines,
  summarizeMail,
  formatClock,
  describeRelativeMoment,
  scoreMailUrgency,
  attentionLabel,
  resolveCalendarInterval,
  formatDurationMinutes,
  noteLabel,
} from './support/tool-text';
import {
  tokenizeMissionText,
  uniqueTokens,
  computeMissionMatchScore,
  missionComplexityLabel,
  formatMissionWindow,
} from './support/tool-mission';
import {
  cleanRefs,
  resolveGmailBatch,
  createToolResolvers,
} from './support/tool-resolvers';
export {
  TOOL_META,
  type ToolMetadata,
  type ToolName,
  type ToolOnly,
  type ToolRiskLevel,
} from './tool-registry';
export {
  clearLocalToolCaches,
  dropFactFromMemoryLists,
  getLastWebSearchResults,
  resolveMemoryForget,
  withLocalToolCaches,
} from './support/tool-caches';
export {
  prepareCalendarTarget,
  prepareGmailTargets,
  prepareLocalTargets,
} from './support/tool-resolvers';

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
      args: { limit?: number };
    }
  | {
      type: 'tool';
      name: 'memory.remember';
      args: { text: string };
    }
  | {
      type: 'tool';
      name: 'memory.forget';
      // ref/query are resolved to the frozen id/text pair before confirmation.
      args: { ref?: number; query?: string; id?: string; text?: string };
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
  prisma: Pick<
    Awaited<ReturnType<PrismaService['forConversation']>>,
    | 'ownerId'
    | 'todo'
    | 'note'
    | 'shoppingItem'
    | 'personalFact'
    | 'jarvisActionEvent'
    | 'jarvisMission'
    | 'jarvisWorkflowMemory'
  >;
  memory: JarvisMemoryService;
  simulation: boolean;
  tz: string;
  sessionId: string;
  frozenCalendarTarget?: CalendarEventItem;
  frozenGmailTargets?: GmailMessageItem[];
  frozenLocalTargets?: LocalTargets;
  undoPreview?: { commandId: string; label: string };
  recordUndo?: (
    label: string,
    reversible: boolean,
    mutations?: UndoMutation[],
  ) => void;
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

export type UndoMutation =
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

export async function previewTool(
  ctx: ToolContext,
  call: Extract<ToolCall, { type: 'tool' }>,
): Promise<string | null> {
  return withLocalToolCaches(ctx.sessionId, () =>
    previewToolInContext(ctx, call),
  );
}

async function previewToolInContext(
  ctx: ToolContext,
  call: Extract<ToolCall, { type: 'tool' }>,
): Promise<string | null> {
  if (isDeferredCapability(call.name)) return DEFERRED_CAPABILITY_MESSAGE;
  if (call.name === 'undo.last_action') {
    return ctx.undoPreview
      ? `Retour arrière proposé : ${ctx.undoPreview.label}. Les éléments seront revérifiés avant toute modification.`
      : 'Aucune action réversible vérifiée.';
  }
  if (ctx.frozenLocalTargets) {
    return (
      `Cibles (${ctx.frozenLocalTargets.items.length}) :\n` +
      ctx.frozenLocalTargets.items
        .map(
          (item: LocalTargets['items'][number]) =>
            `- ${compactText(item.text, 160)}`,
        )
        .join('\n')
    );
  }
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
        if (ctx.frozenGmailTargets) {
          return (
            `${ctx.frozenGmailTargets.length} emails :\n` +
            ctx.frozenGmailTargets
              .map((item) => `- ${item.subject} (${item.from})`)
              .join('\n')
          );
        }
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

      case 'memory.remember': {
        const text = normalizeFactText(call.args.text);
        if (!text) return null;
        const close = similarFacts(
          await prisma.personalFact.findMany({
            select: {
              id: true,
              text: true,
              origin: true,
              createdAt: true,
              updatedAt: true,
            },
            take: MAX_FACTS_PER_OWNER,
          }),
          text,
        );
        return formatPreviewLines([
          `Fait à retenir : « ${compactText(text, 200)} »`,
          'Portée : votre compte. Vous pourrez le corriger ou l’oublier dans Réglages.',
          close.length
            ? `Faits proches déjà retenus (vérifiez qu’ils ne se contredisent pas) :\n${close.map((fact) => `- « ${compactText(fact.text, 160)} »`).join('\n')}`
            : null,
        ]);
      }

      case 'memory.forget': {
        return call.args.text
          ? `Fait à oublier : « ${compactText(call.args.text, 200)} »`
          : null;
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

export async function runTool(
  ctx: ToolContext,
  call: ToolCall,
): Promise<string> {
  return withLocalToolCaches(ctx.sessionId, () => runToolInContext(ctx, call));
}

async function runToolInContext(
  ctx: ToolContext,
  call: ToolCall,
): Promise<string> {
  if (call.type === 'tool' && isDeferredCapability(call.name))
    return DEFERRED_CAPABILITY_MESSAGE;
  const { prisma, tz, sessionId } = ctx;
  const todoSelection =
    ctx.frozenLocalTargets?.kind === 'todo'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  const shoppingSelection =
    ctx.frozenLocalTargets?.kind === 'shopping'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  const {
    resolveTodo,
    resolveTodoRefs,
    resolveShopping,
    resolveShoppingRefs,
    resolveNote,
    resolveCalendarTarget,
    resolveGmailTarget,
    resolveMissionTarget,
  } = createToolResolvers(ctx);
  switch (call.type) {
    case 'final':
      return call.text;

    case 'tool': {
      switch (call.name) {
        // ===== TODOS =====
        case 'todo.add': {
          const created = await prisma.todo.create({
            data: { ownerId: prisma.ownerId, text: call.args.text },
            select: { id: true },
          });
          ctx.recordUndo?.('ajout todo', true, [
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
        }

        case 'todo.reopen': {
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
        }

        case 'todo.done_all': {
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
        }

        case 'todo.update': {
          const nextText = call.args.text.trim();
          if (!nextText)
            throw new CommandRejectedError(
              'Le nouveau texte du todo est vide.',
            );

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
        }

        case 'todo.delete': {
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
        }

        case 'todo.bulk_done': {
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
        }

        case 'todo.bulk_delete': {
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
        }

        case 'todo.clear_done': {
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
        }

        case 'todo.clear_all': {
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
          if (!startIsoRaw)
            throw new CommandRejectedError('La date de début est vide.');

          const startParsed = DateTime.fromISO(startIsoRaw, { zone: tz });
          if (!startParsed.isValid)
            throw new CommandRejectedError(
              `Date de début invalide: "${call.args.when}".`,
            );

          const endIsoRaw = call.args.endWhen?.trim();
          const endParsed = endIsoRaw
            ? DateTime.fromISO(endIsoRaw, { zone: tz })
            : DateTime.invalid('no-end');
          const effectiveEnd = endParsed.isValid
            ? endParsed
            : startParsed.plus({ minutes: 60 });
          if (effectiveEnd <= startParsed) {
            throw new CommandRejectedError(
              'L’heure de fin doit être après l’heure de début.',
            );
          }

          if (ctx.simulation) {
            ctx.recordUndo?.('création événement (simulation)', false);
            return `SIMULATION: événement "${call.args.title}" prévu de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}.`;
          }

          await ctx.calendar.createEvent(
            sessionId,
            call.args.title,
            startParsed.toISO({ suppressMilliseconds: true }),
            tz,
            effectiveEnd.toISO({ suppressMilliseconds: true }),
          );

          ctx.recordUndo?.('création événement calendrier', false);
          return `OK. Événement créé: "${call.args.title}" de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}`;
        }

        case 'calendar.delete': {
          const { target, error } = await resolveCalendarTarget(call.args);
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError(
              'Aucun rendez-vous ciblé.',
              'NOT_FOUND',
            );

          if (ctx.simulation) {
            ctx.recordUndo?.('suppression événement (simulation)', false);
            return `SIMULATION: supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
          }

          await ctx.calendar.deleteEvent(
            sessionId,
            target.provider,
            target.eventId,
            target.calendarId,
          );
          removeCalendarFromCache(sessionId, target);

          ctx.recordUndo?.('suppression événement calendrier', false);
          return `OK. Supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
        }

        case 'calendar.update': {
          const { target, error } = await resolveCalendarTarget(call.args);
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError(
              'Aucun rendez-vous ciblé.',
              'NOT_FOUND',
            );
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
              throw new CommandRejectedError(
                `Heure de fin invalide: "${call.args.endWhen}".`,
              );
            }
            if (parsedEnd <= nextStart) parsedEnd = parsedEnd.plus({ days: 1 });
            nextEnd = parsedEnd;
          }

          if (nextEnd <= nextStart) {
            throw new CommandRejectedError(
              'L’heure de fin doit être après l’heure de début.',
            );
          }

          const nextWhenIso = nextStart.toISO({ suppressMilliseconds: true })!;
          const nextEndWhenIso = nextEnd.toISO({ suppressMilliseconds: true })!;

          if (ctx.simulation) {
            ctx.recordUndo?.('modification événement (simulation)', false);
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

          ctx.recordUndo?.('modification événement calendrier', false);
          return `OK. Événement modifié: ${nextTitle} de ${nextWhenIso} à ${nextEndWhenIso}`;
        }

        // ===== NOTES =====
        case 'note.add': {
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
        }

        case 'note.delete': {
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
        }

        // ===== SHOPPING =====
        case 'shopping.add': {
          const created = await prisma.shoppingItem.create({
            data: { ownerId: prisma.ownerId, text: call.args.text },
            select: { id: true },
          });

          ctx.recordUndo?.('ajout article courses', true, [
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
        }

        case 'shopping.unbought': {
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
        }

        case 'shopping.bought_all': {
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
        }

        case 'shopping.update': {
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
        }

        case 'shopping.delete': {
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
        }

        case 'shopping.bulk_bought': {
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
        }

        case 'shopping.bulk_delete': {
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
        }

        case 'shopping.clear_bought': {
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
        }

        case 'shopping.clear_all': {
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

          if (!to)
            throw new CommandRejectedError('Destinataire email manquant.');
          if (!subject) throw new CommandRejectedError('Sujet email manquant.');
          if (!textBody) throw new CommandRejectedError('Contenu email vide.');

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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

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
          const items = resolveGmailBatch(ctx, call.args);
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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

          if (ctx.simulation) {
            return `SIMULATION: email déplacé à la corbeille "${target.subject}".`;
          }

          await ctx.gmail.trashMessage(sessionId, target.id);
          removeGmailFromCache(sessionId, target.id);
          return `OK. Email déplacé à la corbeille: "${target.subject}"`;
        }

        case 'gmail.untrash': {
          const { target, error } = await resolveGmailTarget(call.args);
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

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
          if (error) throw new CommandRejectedError(error);
          if (!target)
            throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

          if (ctx.simulation) {
            return `SIMULATION: email supprimé définitivement "${target.subject}".`;
          }

          await ctx.gmail.deleteMessage(sessionId, target.id);
          removeGmailFromCache(sessionId, target.id);
          return `OK. Email supprimé définitivement: "${target.subject}"`;
        }

        case 'undo.last_action':
          return 'Le retour arrière nécessite une commande vérifiée.';

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
          const limit = Math.min(Math.max(call.args.limit ?? 20, 1), 40);
          const facts = await prisma.personalFact.findMany({
            select: { id: true, text: true, origin: true, updatedAt: true },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            take: limit,
          });
          setLastMemoryList(
            sessionId,
            facts.map(({ id, text }) => ({ id, text })),
          );
          if (!facts.length)
            return 'Je n’ai encore retenu aucun fait vous concernant. Dites « Retiens que… » pour m’en proposer un.';
          const lines = facts.map(
            (fact, index) =>
              `- #${index + 1} « ${compactText(fact.text, 200)} » (${fact.origin === 'chat' ? 'chat' : 'Réglages'}, ${fact.updatedAt.toISOString().slice(0, 10)})`,
          );
          return `Ce que vous m’avez demandé de retenir :\n${lines.join('\n')}\n\nCorrigez ou oubliez ces faits dans Réglages, ou dites « Oublie #N ».`;
        }

        case 'memory.remember': {
          const text = normalizeFactText(call.args.text);
          if (!text)
            throw new CommandRejectedError(
              `Fait invalide : 1 à ${MAX_FACT_LENGTH} caractères, sans caractère de contrôle.`,
            );
          if ((await prisma.personalFact.count()) >= MAX_FACTS_PER_OWNER)
            throw new CommandRejectedError(
              'La mémoire est pleine. Oubliez un fait avant d’en ajouter un autre.',
            );
          await prisma.personalFact.create({
            data: { ownerId: prisma.ownerId, text, origin: 'chat' },
            select: { id: true },
          });
          LAST_MEMORY_LIST.delete(sessionId);
          return `C’est noté : « ${compactText(text, 200)} ».`;
        }

        case 'memory.forget': {
          const { id, text } = call.args;
          if (!id || !text)
            throw new CommandRejectedError(
              'Propose à nouveau l’oubli pour le confirmer.',
            );
          const { count } = await prisma.personalFact.deleteMany({
            where: { id, text },
          });
          LAST_MEMORY_LIST.delete(sessionId);
          if (!count)
            throw new CommandRejectedError(
              'Ce fait a changé ou n’existe plus. Rien n’a été oublié.',
              'NOT_FOUND',
            );
          return `C’est oublié : « ${compactText(text, 200)} ».`;
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
          if (!target)
            throw new CommandRejectedError(
              error ?? 'Mission introuvable.',
              error ? 'VALIDATION' : 'NOT_FOUND',
            );
          if (target.status !== 'active') {
            throw new CommandRejectedError(
              `La mission "${target.objective}" n’est plus active.`,
            );
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
          if (!objective)
            throw new CommandRejectedError('Objectif mission vide.');

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
          } catch (error) {
            const code = asGoogleIntegrationError(error)?.code;
            if (
              code !== 'GMAIL_NOT_CONNECTED' &&
              code !== 'GOOGLE_NOT_CONNECTED'
            )
              throw error;
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
          } catch (error) {
            const code = asGoogleIntegrationError(error)?.code;
            if (
              code !== 'GMAIL_NOT_CONNECTED' &&
              code !== 'GOOGLE_NOT_CONNECTED'
            )
              throw error;
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
          if (!ctx.goals) throw dataUnavailable();
          const goal = await ctx.goals.create(sessionId, {
            title: call.args.title,
            description: call.args.description,
            priority: call.args.priority,
            targetDate: call.args.targetDate
              ? new Date(call.args.targetDate)
              : undefined,
            parentGoalId: call.args.parentGoalId,
          });
          if (!goal)
            throw new CommandRejectedError(
              'Objectif parent introuvable.',
              'NOT_FOUND',
            );
          return `Objectif créé: "${goal.title}" [ID: ${goal.id}]${goal.priority ? ` [P${goal.priority}]` : ''}${goal.targetDate ? ` — échéance: ${goal.targetDate}` : ''}`;
        }

        case 'goal.list': {
          if (!ctx.goals) throw dataUnavailable();
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
          if (!ctx.goals) throw dataUnavailable();
          const sub = await ctx.goals.decompose(
            sessionId,
            call.args.goalId,
            call.args.subGoals,
          );
          if (!sub.length) return 'Aucun sous-objectif créé.';
          return `${sub.length} sous-objectif(s) créé(s) pour [${call.args.goalId.slice(0, 8)}]:\n${sub.map((s) => `- ${s.title}`).join('\n')}`;
        }

        case 'goal.done': {
          if (!ctx.goals) throw dataUnavailable();
          const goal = await ctx.goals.updateStatus(
            sessionId,
            call.args.goalId,
            'done',
          );
          if (!goal) throw dataUnavailable();
          return `Objectif "${goal.title}" marqué comme terminé.`;
        }

        // ===== CONFLICTS =====
        case 'conflict.detect': {
          if (!ctx.conflicts) throw dataUnavailable();
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
          if (!ctx.dependencies) throw dataUnavailable();
          const dep = await ctx.dependencies.addDependency(
            sessionId,
            call.args.sourceTaskId,
            call.args.targetTaskId,
            {
              dependencyType: call.args.dependencyType,
              estimatedDays: call.args.estimatedDays,
            },
          );
          if (!dep)
            throw new CommandRejectedError(
              'Dépendance invalide ou tâches introuvables.',
            );
          return `Dépendance ajoutée: ${dep.sourceTaskId.slice(0, 8)} → ${dep.targetTaskId.slice(0, 8)} (${dep.dependencyType})`;
        }

        case 'dependency.list': {
          if (!ctx.dependencies) throw dataUnavailable();
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
          if (!ctx.dependencies) throw dataUnavailable();
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
          if (!ctx.scheduling) throw dataUnavailable();
          const suggestion = await ctx.scheduling.suggestSchedule(sessionId, {
            taskId: call.args.taskId,
            suggestedTime: new Date(call.args.suggestedTime),
            rationale: call.args.rationale,
            priority: call.args.priority,
          });
          if (!suggestion) throw dataUnavailable();
          const time = new Date(suggestion.suggestedTime).toLocaleString(
            'fr-FR',
            { dateStyle: 'short', timeStyle: 'short' },
          );
          return `Suggestion créée [${suggestion.id.slice(0, 8)}]: ${time} — ${suggestion.rationale}`;
        }

        case 'schedule.list': {
          if (!ctx.scheduling) throw dataUnavailable();
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
          if (!ctx.scheduling) throw dataUnavailable();
          const applied = await ctx.scheduling.applySuggestion(
            sessionId,
            call.args.suggestionId,
          );
          if (!applied) throw dataUnavailable();
          const time = new Date(applied.suggestedTime).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
          return `Suggestion appliquée: ${time} — ${applied.rationale}`;
        }

        case 'schedule.next_slot': {
          if (!ctx.scheduling) throw dataUnavailable();
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
          if (!ctx.help) throw dataUnavailable();
          const help = await ctx.help.createHelp(sessionId, {
            context: call.args.context,
            contentType: call.args.contentType,
            content: call.args.content,
            relevanceScore: call.args.relevanceScore,
          });
          if (!help) throw dataUnavailable();
          return `Aide créée [${help.id.slice(0, 8)}] pour contexte "${help.context}": ${help.contentType}`;
        }

        case 'help.find': {
          if (!ctx.help) throw dataUnavailable();
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
          if (!ctx.search) throw dataUnavailable();
          const results = await ctx.search.query(sessionId, call.args);
          if (!results.length)
            return `Aucun résultat pour "${call.args.query}".`;
          return `${results.length} résultat(s) pour "${call.args.query}":\n${results.map((r) => `- [${r.type}] ${r.title}: ${r.snippet}`).join('\n')}`;
        }

        // ===== KNOWLEDGE BASE =====
        case 'knowledge.save': {
          if (!ctx.knowledge) throw dataUnavailable();
          const entry = await ctx.knowledge.save(sessionId, call.args);
          if (!entry) throw dataUnavailable();
          return `OK. Connaissance sauvegardée: "${entry.title}" [${entry.category}]`;
        }

        case 'knowledge.find': {
          if (!ctx.knowledge) throw dataUnavailable();
          const entries = await ctx.knowledge.find(sessionId, call.args);
          if (!entries.length)
            return `Aucune connaissance trouvée pour "${call.args.query}".`;
          return `${entries.length} connaissance(s):\n${entries.map((e) => `- [${e.category}] ${e.title}: ${e.content.slice(0, 100)}`).join('\n')}`;
        }

        case 'knowledge.list': {
          if (!ctx.knowledge) throw dataUnavailable();
          const entries = await ctx.knowledge.list(sessionId, call.args);
          if (!entries.length) return 'Base de connaissances vide.';
          return `${entries.length} entrée(s):\n${entries.map((e) => `- [${e.category}] ${e.title} (utilisée ${e.useCount}x)`).join('\n')}`;
        }

        // ===== TIME INSIGHTS =====
        case 'time.record': {
          if (!ctx.timeInsights) throw dataUnavailable();
          const row = await ctx.timeInsights.record(sessionId, call.args);
          if (!row) throw dataUnavailable();
          return `OK. Métrique enregistrée: ${row.metricName} = ${row.value} ${row.unit}`;
        }

        case 'time.summary': {
          if (!ctx.timeInsights) throw dataUnavailable();
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
          if (!ctx.contacts) throw dataUnavailable();
          const c = await ctx.contacts.save(sessionId, call.args);
          const details = [c.email, c.company, c.role]
            .filter(Boolean)
            .join(' · ');
          return `OK. Contact sauvegardé: ${c.name}${details ? ` (${details})` : ''}`;
        }

        case 'contact.find': {
          if (!ctx.contacts) throw dataUnavailable();
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
          if (!ctx.contacts) throw dataUnavailable();
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
          if (!ctx.contacts) throw dataUnavailable();
          const contacts = await ctx.contacts.find(sessionId, call.args.query);
          if (!contacts.length)
            throw new CommandRejectedError(
              `Contact "${call.args.query}" introuvable.`,
              'NOT_FOUND',
            );
          const target = contacts[0];
          if (!target)
            throw new CommandRejectedError(
              `Contact "${call.args.query}" introuvable.`,
              'NOT_FOUND',
            );
          const updated = await ctx.contacts.update(
            sessionId,
            target.id,
            call.args.patch ?? {},
          );
          if (!updated) throw dataUnavailable();
          return `OK. Contact mis à jour: ${updated.name}`;
        }

        case 'contact.delete': {
          if (!ctx.contacts) throw dataUnavailable();
          const contacts = await ctx.contacts.find(sessionId, call.args.query);
          if (!contacts.length)
            throw new CommandRejectedError(
              `Contact "${call.args.query}" introuvable.`,
              'NOT_FOUND',
            );
          const target = contacts[0];
          if (!target)
            throw new CommandRejectedError(
              `Contact "${call.args.query}" introuvable.`,
              'NOT_FOUND',
            );
          const deleted = await ctx.contacts.delete(sessionId, target.id);
          if (!deleted) throw dataUnavailable();
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
