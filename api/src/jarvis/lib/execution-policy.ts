import { describeToolCallForHuman, type HumanSpeechMode } from './humanize';
import {
  TOOL_META,
  type ToolOnly,
  type ToolRiskLevel,
} from '../tools/tool-registry';

export type DecisionPlanner = 'direct' | 'intent' | 'llm' | 'unknown';
export type DecisionConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type ConfirmationReason =
  | 'tool_policy'
  | 'intent_medium_confidence'
  | 'untrusted_context'
  | null;

export type ToolExecutionPlan = {
  planner: DecisionPlanner;
  confidence: DecisionConfidence;
  risk: ToolRiskLevel;
  sideEffect: boolean;
  requiresConfirmation: boolean;
  confirmationReason: ConfirmationReason;
  summary: string;
};

export function buildToolExecutionPlan(
  call: ToolOnly,
  input?: {
    planner?: DecisionPlanner;
    confidence?: DecisionConfidence;
    untrustedContext?: boolean;
    tz?: string;
    speechMode?: HumanSpeechMode;
  },
): ToolExecutionPlan {
  const planner = input?.planner ?? 'unknown';
  const confidence = input?.confidence ?? 'unknown';
  const meta = TOOL_META[call.name];

  const requiresIntentConfirmation =
    planner === 'intent' && confidence === 'medium' && meta.sideEffect;
  const requiresUntrustedConfirmation =
    planner === 'llm' && input?.untrustedContext === true && meta.sideEffect;
  const requiresConfirmation =
    meta.requiresConfirmation ||
    requiresIntentConfirmation ||
    requiresUntrustedConfirmation;

  let confirmationReason: ConfirmationReason = null;
  if (requiresIntentConfirmation) {
    confirmationReason = 'intent_medium_confidence';
  } else if (meta.requiresConfirmation) {
    confirmationReason = 'tool_policy';
  } else if (requiresUntrustedConfirmation) {
    confirmationReason = 'untrusted_context';
  }

  return {
    planner,
    confidence,
    risk: meta.risk,
    sideEffect: meta.sideEffect,
    requiresConfirmation,
    confirmationReason,
    summary: describeToolCallForHuman(
      call,
      input?.tz ?? 'Europe/Paris',
      input?.speechMode ?? 'tu',
    ),
  };
}
