import {
  type DecisionConfidence,
  type DecisionPlanner,
  type ToolExecutionPlan,
} from './execution-policy';
import { ToolCall } from '../tools/tools';

export type ToolOnly = Extract<ToolCall, { type: 'tool' }>;
export type ToolName = Extract<ToolCall, { type: 'tool' }>['name'];

export type AskAction = {
  type: 'ask';
  text: string;
  choices?: string[];
  awaiting?: string;
};

export type JarvisAction = ToolCall | AskAction;

export type ActionDecision = {
  action: JarvisAction;
  planner: DecisionPlanner;
  confidence: DecisionConfidence;
};

export type PendingActionView = {
  id: string;
  name: ToolName;
  args: ToolOnly['args'];
  summary: string;
  preview: string | null;
  risk: ToolExecutionPlan['risk'];
  sideEffect: boolean;
  planner: DecisionPlanner;
  confidence: DecisionConfidence;
  confirmationReason: ToolExecutionPlan['confirmationReason'];
};

export type ConversationState = {
  askedText: string;
  awaiting: string;
  originalUserText: string;
  createdAt: number;
};

export type SessionMemoryTurn = {
  userText: string;
  assistantText: string;
  kind: 'ask' | 'final' | 'tool' | 'confirm' | 'error';
  toolName?: ToolName;
  createdAt: number;
};

export type JarvisQuickAction = {
  kind: 'chat' | 'link' | 'confirm';
  label: string;
  prompt?: string;
  href?: string;
};

export type JarvisSuggestion = {
  title: string;
  detail: string;
  tone: 'neutral' | 'warn' | 'ok';
  prompt?: string;
  href?: string;
};

export type AuditStatusFilter = 'pending' | 'all';

export type AuditExecutionContext = {
  sessionId: string;
  source: 'chat' | 'confirm_text' | 'confirm_endpoint';
  pendingActionId?: string;
  call?: ToolOnly;
  plan?: ToolExecutionPlan;
};
