import { TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolDefinition } from './define-tool';
import { buildToolEnv } from './support/tool-env';
import type { LocalTargets } from '../../commands/local-target';
import {
  isDeferredCapability,
  DEFERRED_CAPABILITY_MESSAGE,
} from './beta-capabilities';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CalendarProvider,
  CalendarEventItem,
} from '../../calendar/providers/calendar.provider';
import { type WebProvider } from '../providers/web.provider';
import type { WeatherProvider } from '../providers/weather.provider';
import type {
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import { type GmailCategory } from '../../gmail/gmail-category';
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
import { withLocalToolCaches } from './support/tool-caches';
import { compactText } from './support/tool-text';
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
    const definition = TOOL_DEFINITIONS[call.name] as
      | ToolDefinition
      | undefined;
    if (!definition?.preview) return null;
    return await definition.preview(buildToolEnv(ctx), call as never);
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
  if (call.type === 'final') return call.text;
  if (isDeferredCapability(call.name)) return DEFERRED_CAPABILITY_MESSAGE;
  const definition = TOOL_DEFINITIONS[call.name] as ToolDefinition | undefined;
  if (!definition) throw new Error(`Unknown tool: ${call.name}`);
  return definition.handler(buildToolEnv(ctx), call as never);
}
