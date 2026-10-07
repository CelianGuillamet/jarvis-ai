import { TOOL_META, type ToolName } from './tool-registry';
import { TOOL_DEFINITIONS } from './tool-definitions';

describe('tool definitions', () => {
  it.skip('defines every ToolName exactly once and nothing else', () => {
    const declared = Object.keys(TOOL_META).sort();
    const defined = Object.keys(TOOL_DEFINITIONS).sort();
    expect(defined).toEqual(declared);
  });

  it('keeps each definition name equal to its key', () => {
    for (const [key, def] of Object.entries(TOOL_DEFINITIONS)) {
      expect(def.name).toBe(key as ToolName);
    }
  });
});
