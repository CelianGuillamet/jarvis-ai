// Canonical HTTP response contracts. Generate application copies with scripts/sync-contracts.mjs.
import { z } from 'zod';

export const CONTRACT_VERSION = '1' as const;
export const AccountProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullable(),
    email: z.email(),
  })
  .strict();
export type AccountProfile = z.infer<typeof AccountProfileSchema>;
export const SignInOptionsSchema = z.object({ google: z.boolean() }).strict();
export const GoogleDisconnectResponseSchema = z
  .object({
    connected: z.literal(false),
    revocationPending: z.boolean(),
  })
  .strict();
export const TimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Fuseau horaire invalide.');
export const AccountPreferencesSchema = z
  .object({
    displayTimezone: TimezoneSchema,
    theme: z.enum(['light', 'dark']),
    onboardingCompleted: z.boolean(),
  })
  .strict();
export type AccountPreferences = z.infer<typeof AccountPreferencesSchema>;
export const PersonalFactTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(280)
  .refine(
    (value) =>
      ![...value].some((char) => {
        const code = char.charCodeAt(0);
        return code < 32 || code === 127;
      }),
    {
      message: 'Control characters are not allowed',
    },
  );
export const PersonalFactInputSchema = z
  .object({ text: PersonalFactTextSchema })
  .strict();
export type PersonalFactInput = z.infer<typeof PersonalFactInputSchema>;
export const PersonalFactSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1).max(280),
    origin: z.enum(['chat', 'settings']),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type PersonalFact = z.infer<typeof PersonalFactSchema>;
export const PersonalFactListSchema = z
  .object({ facts: z.array(PersonalFactSchema).max(200) })
  .strict();
export type PersonalFactList = z.infer<typeof PersonalFactListSchema>;
export const AccountErasureReceiptSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const AccountErasureRequestSchema = z
  .object({
    expectedAccountId: z.string().min(1).max(500).optional(),
    confirmEmail: z.email().max(320),
    receipt: AccountErasureReceiptSchema,
  })
  .strict();
export type AccountErasureRequest = z.infer<typeof AccountErasureRequestSchema>;
export const AccountErasureStatusSchema = z
  .object({
    id: z.uuid(),
    state: z.enum([
      'queued',
      'purging',
      'local_deleted',
      'completed',
      'blocked',
    ]),
    revocationStatus: z.enum(['pending', 'complete', 'manual_required']),
    requestedAt: z.iso.datetime(),
    localDeletedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    receiptExpiresAt: z.iso.datetime(),
  })
  .strict();
export type AccountErasureStatus = z.infer<typeof AccountErasureStatusSchema>;
export const AccountProfileExportSchema = z
  .object({
    formatVersion: z.literal(1),
    exportedAt: z.iso.datetime(),
    profile: AccountProfileSchema.extend({
      emailVerified: z.boolean(),
      image: z.string().nullable(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }).strict(),
    preferences: AccountPreferencesSchema,
  })
  .strict();
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
  historyTurnId: text.optional(),
  historySaved: z.boolean().optional(),
});
export const JarvisChatResponseSchema = z.object({
  text,
  choices: z.array(text).optional(),
  pending_action: PendingActionViewSchema.optional(),
  meta: JarvisChatMetaSchema.optional(),
});
export const ConversationHistoryQuerySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(128).optional(),
    cursor: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ConversationHistoryQuery = z.infer<
  typeof ConversationHistoryQuerySchema
>;
export const ConversationHistoryTurnSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['chat', 'confirm']),
    inputText: text,
    state: z.enum(['started', 'completed', 'failed']),
    response: JarvisChatResponseSchema.nullable(),
    command: z.object({ id: text, state: CommandStateSchema }).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((turn, context) => {
    if ((turn.state === 'completed') !== (turn.response !== null))
      context.addIssue({
        code: 'custom',
        message: 'History completion and response disagree.',
      });
  });
export const ConversationHistoryResponseSchema = z.object({
  conversationId: text,
  fetchedAt: z.iso.datetime(),
  nextCursor: text.nullable(),
  turns: z.array(ConversationHistoryTurnSchema).max(50),
  pendingCommand: z
    .object({
      id: text,
      state: z.literal('waiting'),
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
});
export type ConversationHistoryResponse = z.infer<
  typeof ConversationHistoryResponseSchema
>;
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
export const ResourceAvailabilitySchema = z.enum([
  'available',
  'disconnected',
  'permission_required',
  'unavailable',
  'invalid_response',
  'not_refreshed',
]);
export const JarvisStatusSnapshotSchema = z.object({
  sessionId: text,
  now: text,
  timezone: text,
  simulation: z.boolean(),
  providers: z.object({ llm: text, web: text, weather: text.optional() }),
  profile: HumanProfileSchema,
  pendingAction: PendingActionViewSchema.nullable(),
  availability: z.object({
    gmail: ResourceAvailabilitySchema,
    calendar: ResourceAvailabilitySchema,
  }),
  freshness: z.object({
    gmail: z.object({
      fetchedAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime().nullable(),
    }),
    calendar: z.object({
      fetchedAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime().nullable(),
    }),
  }),
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
  'restore_inbox',
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
export const InboxZeroApplyResultSchema = z
  .object({
    messageId: text,
    ok: z.boolean(),
    outcome: z.enum(['completed', 'simulated', 'partial', 'unknown']),
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
  })
  .superRefine((result, ctx) => {
    const success =
      result.outcome === 'completed' || result.outcome === 'simulated';
    const invalid = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (result.ok !== success)
      invalid('ok', 'Success flag disagrees with outcome.');
    if ((result.simulated === true) !== (result.outcome === 'simulated'))
      invalid('simulated', 'Simulation flag disagrees with outcome.');
    const steps = result.steps;
    if (
      result.outcome === 'simulated' &&
      (steps || result.providerReference || result.operationId)
    )
      invalid('outcome', 'Simulation cannot claim executed steps.');
    if (
      result.outcome === 'partial' &&
      (!steps ||
        steps.send !== 'completed' ||
        (steps.labels === 'completed' && steps.local === 'completed') ||
        !result.providerReference ||
        !result.operationId)
    )
      invalid(
        'outcome',
        'Partial send requires a receipt and unfinished follow-up.',
      );
    if (steps) {
      if (
        result.outcome === 'completed' &&
        Object.values(steps).some((step) => step !== 'completed')
      )
        invalid('steps', 'Completed operations require completed steps.');
      if (result.outcome === 'unknown' && steps.send !== 'unknown')
        invalid('steps', 'Unknown send cannot claim a confirmed send.');
      if (
        (steps.labels === 'completed' && steps.send !== 'completed') ||
        (steps.local === 'completed' && steps.labels !== 'completed')
      )
        invalid('steps', 'Follow-up steps require prior completion.');
      if (steps.send === 'unknown' && result.providerReference)
        invalid(
          'providerReference',
          'Unknown sends cannot claim a saved receipt.',
        );
    }
  });
export const InboxZeroApplyResponseSchema = InboxZeroScanResponseSchema.extend({
  results: z.array(InboxZeroApplyResultSchema),
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
  reply: z.strictObject({ to: z.email(), subject: text }),
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

export const REQUEST_LIMITS = {
  bodyBytes: 64 * 1024,
  urlBytes: 8192,
  sessionChars: 128,
  objectIdChars: 256,
  queryChars: 500,
  chatChars: 8000,
  replyChars: 20000,
  batchItems: 20,
} as const;
const identifier = text.trim().min(1).max(REQUEST_LIMITS.objectIdChars);
const sessionId = text
  .trim()
  .min(1)
  .max(REQUEST_LIMITS.sessionChars)
  .optional();
export const ConversationQuerySchema = z.strictObject({ sessionId });
export const MessageQuerySchema = ConversationQuerySchema.extend({
  messageId: identifier,
});
export const ChatRequestSchema = z.strictObject({
  sessionId,
  text: text.trim().min(1).max(REQUEST_LIMITS.chatChars),
});
export const ConfirmRequestSchema = z.strictObject({
  sessionId,
  actionId: identifier,
});
export const InboxZeroScanRequestSchema = z.strictObject({
  sessionId,
  query: text.trim().min(1).max(REQUEST_LIMITS.queryChars).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  refresh: z.boolean().optional(),
});
export const InboxZeroStepRequestSchema = z.strictObject({
  sessionId,
  step: InboxZeroStepSchema,
});
export const InboxZeroDraftReplyRequestSchema = MessageQuerySchema;
export const InboxZeroApplyRequestSchema = z
  .strictObject({
    sessionId,
    action: InboxZeroActionTypeSchema,
    messageIds: z.array(identifier).min(1).max(REQUEST_LIMITS.batchItems),
    requestId: text.trim().min(1).max(128).optional(),
    reminderWhen: text.trim().min(1).max(REQUEST_LIMITS.queryChars).optional(),
    reminderText: text.trim().min(1).max(REQUEST_LIMITS.chatChars).optional(),
    replyText: text.trim().min(1).max(REQUEST_LIMITS.replyChars).optional(),
    archiveAfter: z.boolean().optional(),
    reviewedReply: z.strictObject({ to: z.email(), subject: text }).optional(),
  })
  .superRefine((value, context) => {
    const required =
      value.action === 'send_reply'
        ? (['requestId', 'replyText', 'reviewedReply'] as const)
        : value.action === 'remind'
          ? (['reminderWhen'] as const)
          : [];
    for (const field of required)
      if (!value[field])
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Champ requis pour cette action.',
        });
  });
export type ConversationQuery = z.infer<typeof ConversationQuerySchema>;
export type MessageQuery = z.infer<typeof MessageQuerySchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;
export type InboxZeroScanRequest = z.infer<typeof InboxZeroScanRequestSchema>;
export type InboxZeroStepRequest = z.infer<typeof InboxZeroStepRequestSchema>;
export type InboxZeroDraftReplyRequest = z.infer<
  typeof InboxZeroDraftReplyRequestSchema
>;
export type InboxZeroApplyRequest = z.infer<typeof InboxZeroApplyRequestSchema>;

export const ApiErrorCodeSchema = z.enum([
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'INVALID_RESPONSE',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorResponseSchema = z.object({
  code: ApiErrorCodeSchema,
  message: text,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export function errorCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
    case 414:
      return 'REQUEST_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    case 502:
    case 503:
    case 504:
      return 'UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

// Direct Today controls carry exact resource IDs; no assistant text interpretation.
const TodayTextSchema = z.string().trim().min(1).max(10000);
const TodayResourceIdSchema = z.uuid();
export const TodayMutationSchema = z.discriminatedUnion('operation', [
  z
    .object({ operation: z.literal('task.create'), text: TodayTextSchema })
    .strict(),
  z
    .object({
      operation: z.literal('task.edit'),
      id: TodayResourceIdSchema,
      text: TodayTextSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('task.complete'),
      id: TodayResourceIdSchema,
    })
    .strict(),
  z
    .object({ operation: z.literal('task.reopen'), id: TodayResourceIdSchema })
    .strict(),
  z
    .object({
      operation: z.literal('note.create'),
      title: z.string().trim().max(200).nullable(),
      text: TodayTextSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('note.edit'),
      id: TodayResourceIdSchema,
      title: z.string().trim().max(200).nullable(),
      text: TodayTextSchema,
    })
    .strict(),
]);
export type TodayMutation = z.infer<typeof TodayMutationSchema>;
export const TodayTaskSchema = z
  .object({
    id: TodayResourceIdSchema,
    text: z.string(),
    done: z.boolean(),
    doneAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const TodayNoteSchema = z
  .object({
    id: TodayResourceIdSchema,
    title: z.string().nullable(),
    text: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const AccountDataExportQuerySchema = z
  .object({
    collection: z.enum(['tasks', 'notes', 'shopping', 'calendar', 'memory']),
    after: z.uuid().optional(),
  })
  .strict();
export type AccountDataExportQuery = z.infer<
  typeof AccountDataExportQuerySchema
>;
const exportPage = {
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  nextCursor: z.uuid().nullable(),
};
export const AccountDataExportPageSchema = z.discriminatedUnion('collection', [
  z
    .object({
      ...exportPage,
      collection: z.literal('tasks'),
      items: z.array(TodayTaskSchema).max(50),
    })
    .strict(),
  z
    .object({
      ...exportPage,
      collection: z.literal('notes'),
      items: z.array(TodayNoteSchema).max(50),
    })
    .strict(),
  z
    .object({
      ...exportPage,
      collection: z.literal('memory'),
      items: z
        .array(
          z
            .object({
              id: z.uuid(),
              conversationId: z.uuid(),
              layer: z.string(),
              key: z.string(),
              label: z.string(),
              value: z.string(),
              confidence: z.number(),
              source: z.string(),
              lastSeenAt: z.iso.datetime(),
              createdAt: z.iso.datetime(),
              updatedAt: z.iso.datetime(),
            })
            .strict(),
        )
        .max(50),
    })
    .strict(),
  z
    .object({
      ...exportPage,
      collection: z.literal('shopping'),
      items: z
        .array(
          z
            .object({
              id: z.uuid(),
              text: z.string(),
              bought: z.boolean(),
              boughtAt: z.iso.datetime().nullable(),
              createdAt: z.iso.datetime(),
            })
            .strict(),
        )
        .max(50),
    })
    .strict(),
  z
    .object({
      ...exportPage,
      collection: z.literal('calendar'),
      items: z
        .array(
          z
            .object({
              id: z.uuid(),
              title: z.string(),
              when: z.iso.datetime(),
              createdAt: z.iso.datetime(),
            })
            .strict(),
        )
        .max(50),
    })
    .strict(),
]);
export const TodayLocalSnapshotSchema = z
  .object({
    fetchedAt: z.iso.datetime(),
    tasks: z.array(TodayTaskSchema).max(50),
    notes: z.array(TodayNoteSchema).max(50),
    tasksHasMore: z.boolean(),
    notesHasMore: z.boolean(),
  })
  .strict();
export type TodayLocalSnapshot = z.infer<typeof TodayLocalSnapshotSchema>;

export const TodayMutationRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(128),
    requestId: z.uuid(),
    mutation: TodayMutationSchema,
  })
  .strict();
export type TodayMutationRequest = z.infer<typeof TodayMutationRequestSchema>;

export const TodayCommandResponseSchema = z
  .object({
    commandId: z.uuid(),
    state: z.enum(['completed', 'executing', 'unknown', 'failed']),
    text: z.string(),
    simulation: z.boolean(),
  })
  .strict();
export type TodayCommandResponse = z.infer<typeof TodayCommandResponseSchema>;

export const TodayQuerySchema = ConversationQuerySchema.extend({
  taskOffset: z.coerce.number().int().min(0).max(10000).default(0),
  noteOffset: z.coerce.number().int().min(0).max(10000).default(0),
}).strict();
export type TodayQuery = z.infer<typeof TodayQuerySchema>;

export const TodayPageResponseSchema = TodayLocalSnapshotSchema.extend({
  conversationId: z.uuid(),
}).strict();

export const InboxReplyDraftSchema = z.strictObject({
  messageId: identifier,
  text: text.max(REQUEST_LIMITS.replyChars),
  version: z.number().int().min(1).max(1000000000),
  updatedAt: z.iso.datetime(),
});
export const InboxReplyDraftResponseSchema = z.strictObject({
  draft: InboxReplyDraftSchema.nullable(),
});
export const InboxReplyDraftSaveRequestSchema = MessageQuerySchema.extend({
  text: text.max(REQUEST_LIMITS.replyChars),
  version: z.number().int().min(0).max(999999999),
}).strict();
export type InboxReplyDraftSaveRequest = z.infer<
  typeof InboxReplyDraftSaveRequestSchema
>;
export type InboxReplyDraft = z.infer<typeof InboxReplyDraftSchema>;

export const ActivityQuerySchema = ConversationHistoryQuerySchema;
export const ActivityResponseSchema = z.strictObject({
  conversationId: z.string().min(1),
  fetchedAt: z.iso.datetime(),
  nextCursor: z.string().nullable(),
  commands: z.array(
    z.strictObject({
      id: z.string().min(1),
      operation: z.string().min(1),
      source: z.enum(['confirmation', 'chat', 'inbox', 'direct']),
      state: z.enum([
        'proposed',
        'waiting',
        'executing',
        'completed',
        'failed',
        'cancelled',
        'expired',
        'unknown',
      ]),
      outcomeCode: z.string().nullable(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      undoRecorded: z.boolean(),
    }),
  ),
});
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

export const PrivacyDisclosureSchema = z
  .object({
    model: z
      .object({
        provider: z.enum(['ollama', 'openai']),
        endpointHost: z.string().min(1).max(253),
        transport: z.enum(['loopback', 'network']),
      })
      .strict(),
    google: z
      .object({
        signInConfigured: z.boolean(),
        toolsConfigured: z.boolean(),
        requestedScopes: z.array(z.string().max(200)).max(20),
      })
      .strict(),
    weatherHosts: z.array(z.string().min(1).max(253)).max(2),
    webRetrieval: z.literal('disabled'),
    processingEnabled: z.boolean(),
    retention: z
      .object({
        diagnosticDays: z.literal(14),
        conversationDays: z.literal(90),
        receiptDays: z.literal(7),
        maximumBackupDays: z.literal(30),
        userData: z.literal('until-deleted'),
        commandJournal: z.literal('until-account-deletion'),
      })
      .strict(),
    backups: z.literal('operator-managed'),
  })
  .strict();
export type PrivacyDisclosure = z.infer<typeof PrivacyDisclosureSchema>;

export const RoutineStepStateSchema = z.enum([
  'pending',
  'executing',
  'completed',
  'failed',
  'skipped',
  'unknown',
  'blocked',
  'cancelled',
]);
export const RoutineRunStateSchema = z.enum([
  'running',
  'completed',
  'failed',
  'suspended',
  'cancelled',
]);
export const RoutineStepSchema = z.strictObject({
  id: z.string().min(1).max(40),
  tool: z.string().min(1).max(80),
  optional: z.boolean(),
  state: RoutineStepStateSchema,
  attempt: z.number().int().min(1).max(5),
  commandId: z.string().min(1).max(128).nullable(),
  text: z.string().max(2000).nullable(),
  evidence: z.string().max(300).nullable(),
});
export const RoutineRunSchema = z.strictObject({
  id: z.string().min(1),
  routineKey: z.string().min(1).max(60),
  state: RoutineRunStateSchema,
  steps: z.array(RoutineStepSchema).max(8),
  result: z.string().max(8000).nullable(),
  cancelRequested: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RoutineRun = z.infer<typeof RoutineRunSchema>;
export const RoutineSummarySchema = z.strictObject({
  key: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  enabled: z.boolean(),
  steps: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(40),
        tool: z.string().min(1).max(80),
        optional: z.boolean(),
        effect: z.literal('read-only'),
      }),
    )
    .max(8),
});
export const RoutineListSchema = z.strictObject({
  routines: z.array(RoutineSummarySchema).max(20),
  runs: z.array(RoutineRunSchema).max(20),
});
export type RoutineList = z.infer<typeof RoutineListSchema>;
export const RoutineEnabledRequestSchema = z.strictObject({
  enabled: z.boolean(),
});
export const RoutineStartRequestSchema = z.strictObject({
  sessionId: z.string().trim().min(1).max(128).optional(),
  requestId: z.uuid(),
});
export const RoutineResumeRequestSchema = z.strictObject({
  stepId: z.string().min(1).max(40),
  resolution: z.enum(['retry', 'skip']),
  evidence: z.string().trim().min(3).max(300),
});
export type RoutineEnabledRequest = z.infer<typeof RoutineEnabledRequestSchema>;
export type RoutineStartRequest = z.infer<typeof RoutineStartRequestSchema>;
export type RoutineResumeRequest = z.infer<typeof RoutineResumeRequestSchema>;
