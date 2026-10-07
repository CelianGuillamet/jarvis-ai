import type { ToolName } from '../tools/tool-registry';

const THIRD_PARTY_OUTPUT_TOOLS = new Set<ToolName>([
  'calendar.list',
  'calendar.has',
  'calendar.duration',
  'daily.briefing',
  'mission.plan',
]);

export function isUntrustedOutputTool(name: ToolName): boolean {
  return name.startsWith('gmail.') || THIRD_PARTY_OUTPUT_TOOLS.has(name);
}
