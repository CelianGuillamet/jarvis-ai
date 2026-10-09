import { parseToolCall } from '../jarvis/tools/tool-call';
import { TOOL_DEFINITIONS } from '../jarvis/tools/tool-definitions';
import type { ToolOnly } from '../jarvis/tools/tool-registry';

export type RoutineStepDefinition = {
  id: string;
  label: string;
  tool: string;
  args: Record<string, unknown>;
  optional?: boolean;
};

export type RoutineDefinition = {
  key: string;
  title: string;
  description: string;
  steps: readonly RoutineStepDefinition[];
};

export const ROUTINES: readonly RoutineDefinition[] = [
  {
    key: 'prepare-day',
    title: 'Prépare ma journée',
    description:
      'Rassemble ton agenda du jour et tes tâches ouvertes. Lecture seule : aucun mail envoyé, aucun rendez-vous modifié.',
    steps: [
      {
        id: 'agenda',
        label: 'Agenda du jour',
        tool: 'calendar.list',
        args: { rangeText: 'aujourd’hui' },
        optional: true,
      },
      {
        id: 'tasks',
        label: 'Tâches ouvertes',
        tool: 'todo.list',
        args: { show: 'open' },
      },
    ],
  },
];

export const MAX_ROUTINE_STEPS = 8;

/** Steps must be canonical, strictly validated, read-only tools: effects go through chat confirmations. */
export function validateRoutine(definition: RoutineDefinition): ToolOnly[] {
  const { steps } = definition;
  if (!steps.length || steps.length > MAX_ROUTINE_STEPS)
    throw new Error(`Routine ${definition.key}: invalid step count.`);
  if (new Set(steps.map((step) => step.id)).size !== steps.length)
    throw new Error(`Routine ${definition.key}: duplicate step id.`);
  return steps.map((step) => {
    const call = parseToolCall(
      JSON.stringify({ type: 'tool', name: step.tool, args: step.args }),
    );
    if (!call || call.type !== 'tool')
      throw new Error(`Routine ${definition.key}/${step.id}: invalid call.`);
    const tool = TOOL_DEFINITIONS[call.name];
    if (!tool || tool.sideEffect || tool.requiresConfirmation || tool.deferred)
      throw new Error(
        `Routine ${definition.key}/${step.id}: ${step.tool} is not an allowed read-only tool.`,
      );
    return call;
  });
}
