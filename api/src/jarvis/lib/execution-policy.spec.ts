import { buildToolExecutionPlan } from './execution-policy';
import type { ToolOnly } from '../tools/tool-registry';

const addTodo: ToolOnly = {
  type: 'tool',
  name: 'todo.add',
  args: { text: 'Payer la facture' },
};
const listTodos: ToolOnly = { type: 'tool', name: 'todo.list', args: {} };

describe('buildToolExecutionPlan untrusted context', () => {
  it('runs low-risk local writes without confirmation in a clean context', () => {
    const plan = buildToolExecutionPlan(addTodo, { planner: 'llm' });
    expect(plan.requiresConfirmation).toBe(false);
    expect(plan.confirmationReason).toBeNull();
  });

  it('requires confirmation for model-planned side effects after third-party content', () => {
    const plan = buildToolExecutionPlan(addTodo, {
      planner: 'llm',
      untrustedContext: true,
    });
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.confirmationReason).toBe('untrusted_context');
  });

  it('does not slow down read-only tools or deterministic planners', () => {
    expect(
      buildToolExecutionPlan(listTodos, {
        planner: 'llm',
        untrustedContext: true,
      }).requiresConfirmation,
    ).toBe(false);
    expect(
      buildToolExecutionPlan(addTodo, {
        planner: 'direct',
        confidence: 'high',
        untrustedContext: true,
      }).requiresConfirmation,
    ).toBe(false);
  });

  it('keeps the stronger tool policy reason when both apply', () => {
    const plan = buildToolExecutionPlan(
      { type: 'tool', name: 'todo.clear_all', args: {} },
      { planner: 'llm', untrustedContext: true },
    );
    expect(plan.confirmationReason).toBe('tool_policy');
  });
});
