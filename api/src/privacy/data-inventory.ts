// Complete inventory of retained tables. Export implementations must still use explicit field projections.
export type OwnershipScope =
  | 'account'
  | 'owner'
  | 'conversation'
  | 'habit'
  | 'command'
  | 'integration'
  | 'auth-user'
  | 'verification-identifier'
  | 'account-email'
  | 'migration-manifest'
  | 'migration-owner';
export type ExportDisposition = 'data' | 'metadata' | 'excluded';
export const RETAINED_DATA_INVENTORY = {
  AccountErasureJob: { scope: 'owner', export: 'metadata' },
  Todo: { scope: 'owner', export: 'data' },
  CalendarEvent: { scope: 'owner', export: 'data' },
  Note: { scope: 'owner', export: 'data' },
  ShoppingItem: { scope: 'owner', export: 'data' },
  PersonalFact: { scope: 'owner', export: 'data' },
  HomeAssistantConnection: { scope: 'owner', export: 'data' },
  RoutineSetting: { scope: 'owner', export: 'data' },
  RoutineRun: { scope: 'owner', export: 'data' },
  PendingAction: { scope: 'conversation', export: 'data' },
  JarvisLog: { scope: 'conversation', export: 'data' },
  GoogleOAuthToken: { scope: 'integration', export: 'excluded' },
  JarvisHumanProfile: { scope: 'conversation', export: 'data' },
  JarvisMemoryFact: { scope: 'conversation', export: 'data' },
  JarvisSessionSummary: { scope: 'conversation', export: 'data' },
  JarvisMission: { scope: 'conversation', export: 'data' },
  JarvisActionEvent: { scope: 'conversation', export: 'data' },
  JarvisWorkflowMemory: { scope: 'conversation', export: 'data' },
  JarvisGoal: { scope: 'conversation', export: 'data' },
  JarvisTaskDependency: { scope: 'conversation', export: 'data' },
  JarvisResourceAllocation: { scope: 'conversation', export: 'data' },
  JarvisPredictiveMetric: { scope: 'conversation', export: 'data' },
  JarvisSchedulingSuggestion: { scope: 'conversation', export: 'data' },
  JarvisContextualHelp: { scope: 'conversation', export: 'data' },
  JarvisKnowledgeEntry: { scope: 'conversation', export: 'data' },
  JarvisTimeInsight: { scope: 'conversation', export: 'data' },
  JarvisDelegation: { scope: 'conversation', export: 'data' },
  Reminder: { scope: 'conversation', export: 'data' },
  Habit: { scope: 'conversation', export: 'data' },
  HabitLog: { scope: 'habit', export: 'data' },
  Contact: { scope: 'conversation', export: 'data' },
  Expense: { scope: 'conversation', export: 'data' },
  Budget: { scope: 'conversation', export: 'data' },
  InboxZeroSession: { scope: 'conversation', export: 'data' },
  InboxZeroItem: { scope: 'conversation', export: 'data' },
  InboxZeroAction: { scope: 'conversation', export: 'data' },
  User: { scope: 'account', export: 'data' },
  Conversation: { scope: 'owner', export: 'data' },
  InboxReplyOperation: { scope: 'owner', export: 'data' },
  Command: { scope: 'owner', export: 'data' },
  ConversationTurn: { scope: 'owner', export: 'data' },
  CommandTransition: { scope: 'command', export: 'data' },
  IntegrationAccount: { scope: 'owner', export: 'data' },
  GoogleOAuthState: { scope: 'owner', export: 'excluded' },
  LegacyOwnershipBatch: { scope: 'migration-manifest', export: 'excluded' },
  LegacyOwnershipRecord: { scope: 'migration-owner', export: 'data' },
  Session: { scope: 'auth-user', export: 'metadata' },
  Account: { scope: 'auth-user', export: 'metadata' },
  Verification: { scope: 'verification-identifier', export: 'excluded' },
  BetaInvite: { scope: 'account-email', export: 'metadata' },
  CommandCompensation: { scope: 'command', export: 'data' },
  InboxReplyDraft: { scope: 'owner', export: 'data' },
} as const satisfies Record<
  string,
  { scope: OwnershipScope; export: ExportDisposition }
>;
