import { isDeferredCapability } from './beta-capabilities';
import { gateToolCall } from './tool-engine';
import { TOOL_META, type ToolName } from './tool-registry';
import { GOOGLE_AUTH_SCOPES } from '../../google/google-scopes';

function status(scopes: string[]) {
  return {
    scopes,
    connected: scopes.length > 0,
    calendarConnected: scopes.some((s) => s.includes('/auth/calendar')),
    gmailConnected: scopes.some((s) => s.includes('/auth/gmail')),
  };
}

const statuses = {
  none: status([]),
  calendarReadonly: status([
    'https://www.googleapis.com/auth/calendar.readonly',
  ]),
  gmailReadonly: status(['https://www.googleapis.com/auth/gmail.readonly']),
  all: status([...GOOGLE_AUTH_SCOPES]),
};

describe('tool metadata characterization', () => {
  it('keeps risk, confirmation, side effect, deferral and Google gating', () => {
    const rows = (Object.keys(TOOL_META) as ToolName[]).sort().map((name) => ({
      name,
      ...TOOL_META[name],
      deferred: isDeferredCapability(name),
      gate: Object.fromEntries(
        Object.entries(statuses).map(([key, value]) => [
          key,
          gateToolCall({ name }, value)?.code ?? null,
        ]),
      ),
    }));
    expect(rows).toMatchSnapshot();
  });
});
