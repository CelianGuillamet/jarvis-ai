import type { ToolOnly } from '../jarvis/tools/tool-registry';

export const ROUTINE_STEP_RUNNER = Symbol('ROUTINE_STEP_RUNNER');

export type RoutineStepOutcome = {
  state: 'completed' | 'failed' | 'executing' | 'unknown';
  commandId?: string;
  text?: string;
};

/** Executes one journaled step. The request ID is the resume key: a claimed effect is never repeated. */
export interface RoutineStepRunner {
  runRoutineStep(input: {
    ownerId: string;
    conversationId: string;
    requestId: string;
    call: ToolOnly;
  }): Promise<RoutineStepOutcome>;
}
