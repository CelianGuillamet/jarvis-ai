export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type PendingActionView = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  preview: string | null;
  risk: ToolRiskLevel;
  sideEffect: boolean;
  planner: string;
  confidence: string;
  confirmationReason?: string | null;
};

export type JarvisChatMeta = {
  simulation?: boolean;
  sessionId?: string;
  awaiting?: string;
  requiresConfirmation?: boolean;
  gatedTool?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  planner?: string;
  confidence?: string;
};

export type JarvisChatResponse = {
  text: string;
  choices?: string[];
  pending_action?: PendingActionView;
  meta?: JarvisChatMeta;
};

export type JarvisSuggestion = {
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'critical';
  prompt?: string | null;
  href?: string | null;
};

export type JarvisQuickAction = {
  title: string;
  icon: string;
  prompt?: string | null;
  href?: string | null;
  enabled: boolean;
  badge?: string | null;
  detail?: string | null;
};

export type HumanProfile = {
  speechMode: string;
  verbosity: string;
  preferredName?: string | null;
  turnCount?: number;
};

export type JarvisActionAuditRecord = {
  id: string;
  pendingActionId: string | null;
  source: string;
  toolName: string;
  summary: string;
  planner: string | null;
  confidence: string | null;
  risk: string | null;
  status: string;
  resultPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type WorkflowMemoryRecord = {
  id: string;
  triggerToolName: string;
  triggerSummary: string;
  followUpToolName: string;
  followUpPrompt: string;
  usageCount: number;
  lastUsedAt: string;
};

export type MemoryLayer =
  | 'identity'
  | 'preference'
  | 'project'
  | 'relationship'
  | 'workflow';

export type MemoryFactItem = {
  layer: MemoryLayer;
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: string;
};

export type SessionSummarySnapshot = {
  summary: string;
  highlights: string[];
  updatedAt: string;
};

export type JarvisWorldModelSnapshot = {
  factsByLayer: Record<MemoryLayer, MemoryFactItem[]>;
  sessionSummary: SessionSummarySnapshot | null;
};

export type MissionRecord = {
  id: string;
  objective: string;
  horizon: string | null;
  status: string;
  summary: string;
  nextStep: string | null;
  updatedAt: string;
};

export type ReminderRecord = {
  id: string;
  text: string;
  triggerAt: string;
  done: boolean;
  doneAt: string | null;
  snoozedUntil: string | null;
  recurring: boolean;
  rrule: string | null;
  createdAt: string;
};

export type HabitRecord = {
  id: string;
  name: string;
  emoji: string | null;
  frequency: string;
  streak: number;
  totalLogs: number;
  lastLogDate: string | null;
  loggedToday: boolean;
  createdAt: string;
};

export type JarvisStatusSnapshot = {
  sessionId: string;
  now: string;
  timezone: string;
  simulation: boolean;
  providers: {
    llm: string;
    web: string;
    weather?: string;
  };
  profile: HumanProfile;
  pendingAction: PendingActionView | null;
  integrations: {
    googleConnected: boolean;
    calendarConnected: boolean;
    gmailConnected: boolean;
    scopes: string[];
    lastGoogleSyncAt: string | null;
  };
  metrics: {
    openTodos: number;
    openShopping: number;
    notesTotal: number;
    unreadEmails: number | null;
    eventsToday: number | null;
    upcomingReminders: number;
    habitsTotal: number;
    habitsLoggedToday: number;
  };
  focus: {
    nextEvent:
      | {
          title: string;
          when: string;
          end: string | null;
        }
      | null;
    activeMission:
      | {
          objective: string;
          summary: string;
          nextStep: string | null;
          updatedAt: string;
        }
      | null;
    topUnreadEmail:
      | {
          subject: string;
          from: string;
          date: string;
        }
      | null;
  };
  worldModel: JarvisWorldModelSnapshot;
  missions: MissionRecord[];
  actionAudit: JarvisActionAuditRecord[];
  workflowMemory: WorkflowMemoryRecord[];
  workflowSuggestions: string[];
  upcomingReminders: ReminderRecord[];
  habits: HabitRecord[];
  quickActions: JarvisQuickAction[];
  proactiveSuggestions: JarvisSuggestion[];
  recentActivity: Array<{
    at: string;
    userText: string;
    assistantText: string;
    toolName: string | null;
  }>;
  memoryTurns: Array<{
    at: string;
    kind: string;
    userText: string;
    assistantText: string;
    toolName: string | null;
  }>;
};

