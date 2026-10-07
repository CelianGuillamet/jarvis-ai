import type { ToolCall } from './tools';

export type ToolOnly = Extract<ToolCall, { type: 'tool' }>;
export type ToolName = ToolOnly['name'];
export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type ToolMetadata = {
  requiresConfirmation: boolean;
  sideEffect: boolean;
  risk: ToolRiskLevel;
};

export { TOOL_META } from './tool-meta';
