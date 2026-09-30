// Generated from contracts/v1.ts. Do not edit this copy.
// Canonical HTTP response contracts. Generate application copies with scripts/sync-contracts.mjs.
import { z } from 'zod';

export const CONTRACT_VERSION = '1' as const;
const text = z.string();
const nullableText = text.nullable();
const count = z.number().int().nonnegative();
const dictionary = z.record(text, z.unknown());
export const ToolRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export const CommandStateSchema = z.enum([
  'proposed',
  'waiting',
  'executing',
  'completed',
  'failed',
  'unknown',
  'cancelled',
  'expired',
]);
export const PendingActionViewSchema = z.object({
  id: text,
  name: text,
  args: dictionary,
  summary: text,
  preview: nullableText,
  risk: ToolRiskLevelSchema,
  sideEffect: z.boolean(),
  planner: text,
  confidence: text,
  confirmationReason: nullableText.optional(),
});
export const JarvisChatMetaSchema = z.object({
  simulation: z.boolean().optional(),
  sessionId: text.optional(),
  awaiting: text.optional(),
  requiresConfirmation: z.boolean().optional(),
  gatedTool: text.optional(),
  toolName: text.optional(),
  toolArgs: dictionary.optional(),
  planner: text.optional(),
  confidence: text.optional(),
  commandId: text.optional(),
  commandState: CommandStateSchema.optional(),
});
export const JarvisChatResponseSchema = z.object({
  text,
  choices: z.array(text).optional(),
  pending_action: PendingActionViewSchema.optional(),
  meta: JarvisChatMetaSchema.optional(),
});
export const JarvisSuggestionSchema = z.object({
  title: text,
  detail: text,
  tone: z.enum(['ok', 'warn', 'neutral']),
  prompt: nullableText.optional(),
  href: nullableText.optional(),
});
export const JarvisQuickActionSchema = z.object({
  kind: z.enum(['chat', 'link', 'confirm']),
  label: text,
  prompt: nullableText.optional(),
  href: nullableText.optional(),
});
export const HumanProfileSchema = z.object({
  speechMode: text,
  verbosity: text,
  preferredName: nullableText.optional(),
  turnCount: count.optional(),
});
export const JarvisActionAuditRecordSchema = z.object({
  id: text,
  pendingActionId: nullableText,
  source: text,
  toolName: text,
  summary: text,
  planner: nullableText,
  confidence: nullableText,
  risk: nullableText,
  status: text,
  resultPreview: nullableText,
  errorMessage: nullableText,
  createdAt: text,
  completedAt: nullableText,
});
export const WorkflowMemoryRecordSchema = z.object({
  id: text,
  triggerToolName: text,
  triggerSummary: text,
  followUpToolName: text,
  followUpPrompt: text,
  usageCount: count,
  lastUsedAt: text,
});
export const MemoryLayerSchema = z.enum([
  'identity',
  'preference',
  'project',
  'relationship',
  'workflow',
]);
export const MemoryFactItemSchema = z.object({
  layer: MemoryLayerSchema,
  key: text,
  label: text,
  value: text,
  confidence: z.number(),
  source: text,
  updatedAt: text,
});
export const SessionSummarySnapshotSchema = z.object({
  summary: text,
  highlights: z.array(text),
  updatedAt: text,
});
export const JarvisWorldModelSnapshotSchema = z.object({
  factsByLayer: z.record(MemoryLayerSchema, z.array(MemoryFactItemSchema)),
  sessionSummary: SessionSummarySnapshotSchema.nullable(),
});
export const MissionRecordSchema = z.object({
  id: text,
  objective: text,
  horizon: nullableText,
  status: text,
  summary: text,
  nextStep: nullableText,
  updatedAt: text,
});
export const ReminderRecordSchema = z.object({
  id: text,
  text,
  triggerAt: text,
  done: z.boolean(),
  doneAt: nullableText,
  snoozedUntil: nullableText,
  recurring: z.boolean(),
  rrule: nullableText,
  createdAt: text,
});
export const HabitRecordSchema = z.object({
  id: text,
  name: text,
  emoji: nullableText,
  frequency: text,
  streak: count,
  totalLogs: count,
  lastLogDate: nullableText,
  loggedToday: z.boolean(),
  createdAt: text,
});
const activity = z.object({
  at: text,
  userText: text,
  assistantText: text,
  toolName: nullableText,
});
export const JarvisStatusSnapshotSchema = z.object({
  sessionId: text,
  now: text,
  timezone: text,
  simulation: z.boolean(),
  providers: z.object({ llm: text, web: text, weather: text.optional() }),
  profile: HumanProfileSchema,
  pendingAction: PendingActionViewSchema.nullable(),
  integrations: z.object({
    googleConnected: z.boolean(),
    calendarConnected: z.boolean(),
    gmailConnected: z.boolean(),
    scopes: z.array(text),
    lastGoogleSyncAt: nullableText,
  }),
  metrics: z.object({
    openTodos: count,
    openShopping: count,
    notesTotal: count,
    unreadEmails: count.nullable(),
    eventsToday: count.nullable(),
    upcomingReminders: count,
    habitsTotal: count,
    habitsLoggedToday: count,
  }),
  focus: z.object({
    nextEvent: z
      .object({ title: text, when: text, end: nullableText })
      .nullable(),
    activeMission: z
      .object({
        objective: text,
        summary: text,
        nextStep: nullableText,
        updatedAt: text,
      })
      .nullable(),
    topUnreadEmail: z
      .object({ subject: text, from: text, date: text })
      .nullable(),
  }),
  worldModel: JarvisWorldModelSnapshotSchema,
  missions: z.array(MissionRecordSchema),
  actionAudit: z.array(JarvisActionAuditRecordSchema),
  workflowMemory: z.array(WorkflowMemoryRecordSchema),
  workflowSuggestions: z.array(text),
  upcomingReminders: z.array(ReminderRecordSchema),
  habits: z.array(HabitRecordSchema),
  quickActions: z.array(JarvisQuickActionSchema),
  proactiveSuggestions: z.array(JarvisSuggestionSchema),
  recentActivity: z.array(activity),
  memoryTurns: z.array(activity.extend({ kind: text })),
});
export const InboxZeroCategorySchema = z.enum([
  'urgent',
  'quick_wins',
  'schedule',
  'ignore',
  'newsletters',
]);
export const InboxZeroStepSchema = z.enum([
  'urgent',
  'quick_wins',
  'schedule',
  'cleanup',
  'done',
]);
export const InboxZeroActionTypeSchema = z.enum([
  'archive',
  'mark_read',
  'mark_read_archive',
  'trash',
  'delete',
  'star',
  'remind',
  'draft_reply',
  'send_reply',
  'apply_recommended',
]);
export const InboxZeroSessionViewSchema = z.object({
  sessionId: text,
  status: z.enum(['active', 'completed']),
  step: InboxZeroStepSchema,
  query: text,
  startedAt: text,
  scannedAt: nullableText,
  counts: z.record(
    InboxZeroCategorySchema,
    z.object({ pending: count, processed: count }),
  ),
});
export const InboxZeroItemViewSchema = z.object({
  id: text,
  messageId: text,
  threadId: text,
  subject: text,
  from: text,
  to: text,
  date: text,
  snippet: text,
  labels: z.array(text),
  gmailCategory: nullableText,
  unread: z.boolean(),
  category: InboxZeroCategorySchema,
  priority: z.number(),
  reason: nullableText,
  suggested: z
    .object({ label: text, action: InboxZeroActionTypeSchema })
    .nullable(),
  status: z.enum(['pending', 'processed']),
  lastActionAt: nullableText,
});
export const InboxZeroActionViewSchema = z.object({
  id: text,
  messageId: nullableText,
  actionType: InboxZeroActionTypeSchema,
  status: text,
  errorMessage: nullableText,
  createdAt: text,
  payload: dictionary.nullable(),
});
export const InboxZeroScanResponseSchema = z.object({
  session: InboxZeroSessionViewSchema,
  items: z.array(InboxZeroItemViewSchema),
  recentActions: z.array(InboxZeroActionViewSchema),
});
export const InboxZeroApplyResponseSchema = InboxZeroScanResponseSchema.extend({
  results: z.array(
    z.object({
      messageId: text,
      ok: z.boolean(),
      simulated: z.boolean().optional(),
      operationId: text.optional(),
      steps: z
        .object({
          send: z.enum(['completed', 'unknown']),
          labels: z.enum(['completed', 'pending']),
          local: z.enum(['completed', 'pending']),
        })
        .optional(),
      providerReference: z
        .object({ messageId: text, threadId: nullableText })
        .nullable()
        .optional(),
      error: text.optional(),
    }),
  ),
});
export const GmailMessageDetailSchema = z.object({
  id: text,
  threadId: text,
  subject: text,
  from: text,
  to: text,
  date: text,
  snippet: text,
  labels: z.array(text),
  unread: z.boolean(),
  bodyText: text,
  bodyHtml: nullableText.optional(),
  messageIdHeader: nullableText.optional(),
  referencesHeader: nullableText.optional(),
});
export const InboxZeroMessageResponseSchema = z.object({
  item: InboxZeroItemViewSchema.nullable(),
  message: GmailMessageDetailSchema,
});
export const InboxZeroDraftReplyResponseSchema = z.object({
  messageId: text,
  subject: text,
  to: text,
  draftText: text,
});
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;
export type CommandState = z.infer<typeof CommandStateSchema>;
export type PendingActionView = z.infer<typeof PendingActionViewSchema>;
export type JarvisChatMeta = z.infer<typeof JarvisChatMetaSchema>;
export type JarvisChatResponse = z.infer<typeof JarvisChatResponseSchema>;
export type JarvisSuggestion = z.infer<typeof JarvisSuggestionSchema>;
export type JarvisQuickAction = z.infer<typeof JarvisQuickActionSchema>;
export type HumanProfile = z.infer<typeof HumanProfileSchema>;
export type JarvisActionAuditRecord = z.infer<
  typeof JarvisActionAuditRecordSchema
>;
export type WorkflowMemoryRecord = z.infer<typeof WorkflowMemoryRecordSchema>;
export type MemoryLayer = z.infer<typeof MemoryLayerSchema>;
export type MemoryFactItem = z.infer<typeof MemoryFactItemSchema>;
export type SessionSummarySnapshot = z.infer<
  typeof SessionSummarySnapshotSchema
>;
export type JarvisWorldModelSnapshot = z.infer<
  typeof JarvisWorldModelSnapshotSchema
>;
export type MissionRecord = z.infer<typeof MissionRecordSchema>;
export type ReminderRecord = z.infer<typeof ReminderRecordSchema>;
export type HabitRecord = z.infer<typeof HabitRecordSchema>;
export type JarvisStatusSnapshot = z.infer<typeof JarvisStatusSnapshotSchema>;
export type InboxZeroCategory = z.infer<typeof InboxZeroCategorySchema>;
export type InboxZeroStep = z.infer<typeof InboxZeroStepSchema>;
export type InboxZeroActionType = z.infer<typeof InboxZeroActionTypeSchema>;
export type InboxZeroSessionView = z.infer<typeof InboxZeroSessionViewSchema>;
export type InboxZeroItemView = z.infer<typeof InboxZeroItemViewSchema>;
export type InboxZeroActionView = z.infer<typeof InboxZeroActionViewSchema>;
export type InboxZeroScanResponse = z.infer<typeof InboxZeroScanResponseSchema>;
export type InboxZeroApplyResponse = z.infer<
  typeof InboxZeroApplyResponseSchema
>;
export type GmailMessageDetail = z.infer<typeof GmailMessageDetailSchema>;
export type InboxZeroMessageResponse = z.infer<
  typeof InboxZeroMessageResponseSchema
>;
export type InboxZeroDraftReplyResponse = z.infer<
  typeof InboxZeroDraftReplyResponseSchema
>;
