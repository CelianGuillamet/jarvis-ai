import { DateTime, Settings } from 'luxon';
import { buildToolExecutionPlan } from '../lib/execution-policy';
import { tryDirectToolCall } from '../lib/direct-intent';
import { resolveWhenWindow } from '../lib/resolve-when';
import { GOOGLE_AUTH_SCOPES } from '../../google/google-scopes';
import { gateToolCall } from '../tools/tool-engine';
import { parseToolCall } from '../tools/tool-call';
import type { ToolOnly } from '../tools/tool-registry';
import {
  fixtureProblems,
  loadEvalFixtures,
  type EvalCase,
  type EvalFixtureFile,
} from './eval-fixtures';

const fixtures = loadEvalFixtures();
const byName = (name: string): EvalFixtureFile => {
  const found = fixtures.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`missing fixture ${name}`);
  return found;
};

function check(item: EvalCase, holds: boolean) {
  if (item.status === 'known_gap') {
    expect({ id: item.id, holdsNow: holds, gap: item.gap }).toEqual({
      id: item.id,
      holdsNow: false,
      gap: item.gap,
    });
    return;
  }
  expect({ id: item.id, holds }).toEqual({ id: item.id, holds: true });
}

function connectionStatus(scopes: string[]) {
  return {
    scopes,
    connected: scopes.length > 0,
    calendarConnected: scopes.some((s) => s.includes('/auth/calendar')),
    gmailConnected: scopes.some((s) => s.includes('/auth/gmail')),
  };
}

function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object')
    return actual === expected;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => matchesSubset(actual[index], value))
    );
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(expected).every(([key, value]) =>
    matchesSubset((actual as Record<string, unknown>)[key], value),
  );
}

describe('evaluation fixtures', () => {
  it.each(fixtures.map((fixture) => [fixture.file, fixture] as const))(
    '%s is consented, redacted and well formed',
    (_file, fixture) => {
      expect(fixtureProblems(fixture)).toEqual([]);
    },
  );
});

describe('French intent routing', () => {
  const cases = byName('intent-routing.fr').cases;
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    const expected = item.expect as {
      tool: string;
      args?: Record<string, unknown>;
    };
    const routed = tryDirectToolCall(item.utterance as string, null);
    const holds =
      routed !== null &&
      routed.name === expected.tool &&
      (expected.args === undefined ||
        matchesSubset(routed.args, expected.args));
    check(item, holds);
  });
});

describe('ambiguity is never routed to a tool', () => {
  const cases = byName('ambiguity.fr').cases;
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    check(item, tryDirectToolCall(item.utterance as string, null) === null);
  });
});

describe('Europe/Paris time resolution', () => {
  const originalNow = Settings.now;
  afterEach(() => {
    Settings.now = originalNow;
  });
  const fixture = byName('timezone');
  it.each(fixture.cases.map((item) => [item.id, item] as const))(
    '%s',
    (_id, item) => {
      const nowMs = DateTime.fromISO(item.now as string).toMillis();
      Settings.now = () => nowMs;
      const out = resolveWhenWindow(item.text as string, fixture.tz as string);
      const holds =
        out.startIso === item.start &&
        (item.end === undefined || out.endIso === item.end);
      check(item, holds);
    },
  );
});

describe('malformed tool calls', () => {
  const cases = byName('malformed-tool-calls').cases;
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    const parsed = parseToolCall(item.raw as string);
    const expected = item.expect as { tool: string } | null;
    const holds =
      expected === null
        ? parsed === null
        : parsed?.type === 'tool' && parsed.name === expected.tool;
    check(item, holds);
  });
});

describe('Google permissions at the policy boundary', () => {
  const cases = byName('permissions').cases;
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    const raw = item.scopes as string[];
    const scopes = raw.includes('ALL') ? [...GOOGLE_AUTH_SCOPES] : raw;
    const error = gateToolCall(
      { name: item.tool as ToolOnly['name'] },
      connectionStatus(scopes),
    );
    check(item, (error?.code ?? null) === item.expect);
  });
});

describe('untrusted content cannot authorize actions', () => {
  const cases = byName('untrusted-content').cases;
  it.each(cases.map((item) => [item.id, item] as const))('%s', (_id, item) => {
    const call = parseToolCall(JSON.stringify(item.proposed));
    expect(call?.type).toBe('tool');
    const plan = buildToolExecutionPlan(call as ToolOnly, {
      planner: 'llm',
      untrustedContext: true,
    });
    const expected = item.expect as {
      requiresConfirmation: boolean;
      reason?: string;
    };
    const holds =
      plan.requiresConfirmation === expected.requiresConfirmation &&
      (expected.reason === undefined ||
        plan.confirmationReason === expected.reason);
    check(item, holds);
  });
});
