import { TOOL_META, type ToolName } from './tool-registry';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { isDeferredCapability } from './beta-capabilities';

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

  it('matches the hand-written metadata for every defined tool', () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      expect({
        risk: def.risk,
        requiresConfirmation: def.requiresConfirmation,
        sideEffect: def.sideEffect,
        deferred: def.deferred,
      }).toEqual({
        risk: TOOL_META[def.name].risk,
        requiresConfirmation: TOOL_META[def.name].requiresConfirmation,
        sideEffect: TOOL_META[def.name].sideEffect,
        deferred: isDeferredCapability(def.name),
      });
    }
  });
});
