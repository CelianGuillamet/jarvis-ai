# JAR-023 Tool Definition Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two monolithic tool switches in `api/src/jarvis/tools/tools.ts` (execution and preview) with one explicit definition per tool, and derive tool metadata from a single registry, with no behavior change.

**Architecture:** A `defineTool()` contract plus a registry. Shared helpers and per-session caches move out of `tools.ts` into support modules so domain definition files can import them without cycles. `runToolInContext` / `previewToolInContext` dispatch to the registry first and fall back to the legacy switch until the last domain is migrated. `TOOL_META`, `gateToolCall` requirements and `isDeferredCapability` are then derived from the registry.

**Tech Stack:** TypeScript, NestJS, Prisma, Jest (`api/`, `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run lint`, `npm run build`).

**Spec:** `docs/superpowers/specs/2026-10-07-jar-023-tool-definition-contract-design.md`

## Global Constraints

- No behavior change: same return strings, same errors (`CommandRejectedError`, `GoogleIntegrationError`), same `DEFERRED_CAPABILITY_MESSAGE` for deferred tools, deferred check runs first.
- All ~100 tools are migrated, deferred ones included with `deferred: true`; case bodies are moved verbatim.
- Public signatures stay: `runTool`, `previewTool`, `prepareGmailTargets`, `prepareLocalTargets`, `prepareCalendarTarget`, `TOOL_META`, `gateToolCall`, `isDeferredCapability`, `withLocalToolCaches`, `clearLocalToolCaches`, `getLastWebSearchResults`, `dropFactFromMemoryLists`, `resolveMemoryForget`.
- No code comments unless documenting a non-obvious why. No refactors beyond moving code.
- `jarvis.service.ts`, `tool-call.ts` parsing and execution policy are out of scope (JAR-024 and later).
- Run `npm test`, `npm run typecheck`, `npm run lint` from `api/` after every task; run `npm run test:integration` at Tasks 4, 9 and 10.
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push.
- Branch: `claude/jar-023-tool-definitions` (already created).

## Review Focus

- A tool name present in `ToolName` but missing from the registry must fail a test, not return `undefined` at runtime (Task 2 consistency test).
- Per-session caches (`LAST_*` maps) must stay one shared instance after the move; two copies would silently break `#N` references across tools (Task 3 test).
- A deferred tool must still short-circuit to `DEFERRED_CAPABILITY_MESSAGE` before any resolver or Prisma access (Task 4 test).
- `gmail.delete` is deferred and also needs `gmail.permanent_delete`; deferred check must win (Task 5/derivation test).
- Frozen local targets (`ctx.frozenLocalTargets`) must keep restricting todo/shopping selection after resolvers are built once per call (Task 4 test).

---

### Task 1: Freeze current metadata as a characterization snapshot

**Files:**
- Create: `api/src/jarvis/tools/tool-metadata.snapshot.spec.ts`
- Create (generated): `api/src/jarvis/tools/__snapshots__/tool-metadata.snapshot.spec.ts.snap`

**Interfaces:**
- Consumes: `TOOL_META` (`tool-registry.ts`), `gateToolCall` (`tool-engine.ts`), `isDeferredCapability` (`beta-capabilities.ts`), `GOOGLE_AUTH_SCOPES` (`../../google/google-scopes`).
- Produces: a committed snapshot that every later task must keep green without regenerating.

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Generate the snapshot from the untouched code**

Run: `cd api && npx jest src/jarvis/tools/tool-metadata.snapshot.spec.ts`
Expected: PASS, `1 snapshot written`.

- [ ] **Step 3: Verify it is stable**

Run: `cd api && npx jest src/jarvis/tools/tool-metadata.snapshot.spec.ts --ci`
Expected: PASS, `1 snapshot passed`.

- [ ] **Step 4: Record the baseline**

Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
Expected: all green. Note the unit test count in the commit message.

- [ ] **Step 5: Commit**

```bash
git add api/src/jarvis/tools/tool-metadata.snapshot.spec.ts api/src/jarvis/tools/__snapshots__
git commit -m "JAR-023: freeze tool metadata as a characterization snapshot" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Contract, empty registry and consistency test

**Files:**
- Create: `api/src/jarvis/tools/define-tool.ts`
- Create: `api/src/jarvis/tools/tool-definitions.ts`
- Create: `api/src/jarvis/tools/tool-definitions.spec.ts`

**Interfaces:**
- Consumes: `ToolName`, `ToolOnly`, `ToolRiskLevel` (`tool-registry.ts`), `ToolContext` (type, `tools.ts`).
- Produces: `defineTool`, `ToolDefinition<N>`, `ToolRequirement`, `ToolHandlerEnv`, `TOOL_DEFINITIONS: Partial<{ [N in ToolName]: ToolDefinition<N> }>`, `registerTools(defs)`.

- [ ] **Step 1: Write the failing consistency test**

```ts
import { TOOL_META, type ToolName } from './tool-registry';
import { TOOL_DEFINITIONS } from './tool-definitions';

describe('tool definitions', () => {
  it('defines every ToolName exactly once and nothing else', () => {
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd api && npx jest src/jarvis/tools/tool-definitions.spec.ts`
Expected: FAIL (module `./tool-definitions` not found).

- [ ] **Step 3: Write `define-tool.ts`**

```ts
import type { ToolContext } from './tools';
import type { ToolName, ToolOnly, ToolRiskLevel } from './tool-registry';

export type ToolRequirement =
  | 'none'
  | 'calendar.read'
  | 'calendar.write'
  | 'gmail.read'
  | 'gmail.modify'
  | 'gmail.send'
  | 'gmail.permanent_delete';

export type ToolHandlerEnv = {
  ctx: ToolContext;
  prisma: ToolContext['prisma'];
  tz: ToolContext['tz'];
  sessionId: string;
  todoSelection: { id?: { in: string[] } };
  shoppingSelection: { id?: { in: string[] } };
  resolvers: ReturnType<
    typeof import('./support/tool-resolvers').createToolResolvers
  >;
};

type CallOf<N extends ToolName> = Extract<ToolOnly, { name: N }>;

export type ToolDefinition<N extends ToolName = ToolName> = {
  name: N;
  risk: ToolRiskLevel;
  requiresConfirmation: boolean;
  sideEffect: boolean;
  requires: ToolRequirement;
  deferred: boolean;
  handler: (env: ToolHandlerEnv, call: CallOf<N>) => Promise<string>;
  preview?: (env: ToolHandlerEnv, call: CallOf<N>) => Promise<string | null>;
};

export function defineTool<N extends ToolName>(
  definition: ToolDefinition<N>,
): ToolDefinition<N> {
  return definition;
}
```

- [ ] **Step 4: Write `tool-definitions.ts` (empty during migration)**

```ts
import type { ToolDefinition } from './define-tool';
import type { ToolName } from './tool-registry';

export type ToolRegistry = { [N in ToolName]?: ToolDefinition<N> };

export const TOOL_DEFINITIONS: ToolRegistry = {};

export function registerTools(definitions: ToolDefinition[]) {
  for (const definition of definitions) {
    if (TOOL_DEFINITIONS[definition.name])
      throw new Error(`Duplicate tool definition: ${definition.name}`);
    (TOOL_DEFINITIONS as Record<string, ToolDefinition>)[definition.name] =
      definition;
  }
}
```

- [ ] **Step 5: Mark the consistency test as pending until Task 9**

Change `it('defines every ToolName exactly once and nothing else'` to `it.failing(` is NOT used; instead wrap with `it.skip(` and add `// Re-enabled in Task 9` is forbidden (no comments). Use `it.skip(` now and remove `.skip` in Task 9 Step 3.

Run: `cd api && npx jest src/jarvis/tools/tool-definitions.spec.ts`
Expected: PASS (1 passed, 1 skipped). `import type` of `./support/tool-resolvers` resolves after Task 3; until then keep `typecheck` from failing by completing Task 3 before running typecheck, or temporarily typing `resolvers: unknown`. Prefer: do Task 3 first if typecheck complains, then return here.

- [ ] **Step 6: Commit**

```bash
git add api/src/jarvis/tools/define-tool.ts api/src/jarvis/tools/tool-definitions.ts api/src/jarvis/tools/tool-definitions.spec.ts
git commit -m "JAR-023: add defineTool contract and registry scaffold" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move shared helpers and caches out of `tools.ts`

**Files:**
- Create: `api/src/jarvis/tools/support/tool-caches.ts` (lines 734–1168: `toolCacheFence`, all `LAST_*` maps, `set/get/patch/removeXInCache`, `withLocalToolCaches`, `clearLocalToolCaches`, `getLastWebSearchResults`, `dropFactFromMemoryLists`)
- Create: `api/src/jarvis/tools/support/tool-text.ts` (lines 1169–1281 and 1710–2035: formatting/parsing helpers such as `formatDate`, `normalizeForMatch`, `compactText`, `parseCalendarRefFromQuery`, `scoreMailUrgency`, `resolveCalendarInterval`, `noteLabel`)
- Create: `api/src/jarvis/tools/support/tool-mission-text.ts` (lines 2036–2158: `MISSION_*`, `tokenizeMissionText`, `computeMissionMatchScore`, ...)
- Create: `api/src/jarvis/tools/support/tool-resolvers.ts` (lines 2159–3073: `cleanRefs`, `resolveGmailBatch`, `prepare*TargetsInContext`, `createToolResolvers`, `resolveMemoryForget`)
- Modify: `api/src/jarvis/tools/tools.ts` (import from the modules above; re-export the public names listed in Global Constraints)
- Test: `api/src/jarvis/tools/support/tool-caches.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same functions, now exported from `support/*`. `tools.ts` re-exports the public ones so no outside import changes.

- [ ] **Step 1: Write the failing cache-singleton test**

```ts
import {
  clearLocalToolCaches,
  getLastTodoList,
  setLastTodoList,
  withLocalToolCaches,
} from './tool-caches';
import * as toolsModule from '../tools';

describe('tool caches', () => {
  it('shares one cache instance between support modules and tools.ts', () => {
    clearLocalToolCaches('s1');
    setLastTodoList('s1', [{ id: 'a', text: 'x', done: false }]);
    expect(getLastTodoList('s1')).toEqual([
      { id: 'a', text: 'x', done: false },
    ]);
    toolsModule.clearLocalToolCaches('s1');
    expect(getLastTodoList('s1')).toEqual([]);
  });

  it('withLocalToolCaches clears the session afterwards', async () => {
    await withLocalToolCaches('s2', async () => {
      setLastTodoList('s2', [{ id: 'b', text: 'y', done: false }]);
    });
    expect(getLastTodoList('s2')).toEqual([]);
  });
});
```

Before relying on the second test, read `withLocalToolCaches` (`tools.ts:1160`) and adjust the assertion to its real contract (it may preserve instead of clear); the test must describe current behavior.

- [ ] **Step 2: Run it and see it fail**

Run: `cd api && npx jest src/jarvis/tools/support/tool-caches.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Move the code mechanically**

For each new file, cut the listed line ranges from `tools.ts` verbatim, add `export` to every symbol that `tools.ts` or another support file uses, and copy only the imports each file needs. Do not edit function bodies. Order: `tool-caches.ts`, then `tool-text.ts`, `tool-mission-text.ts`, then `tool-resolvers.ts`. In `tools.ts` replace the removed ranges with imports and `export { ... } from './support/...'` for the public names.

Find exact boundaries before cutting:
Run: `cd api/src/jarvis/tools && grep -nE "^(export )?(async )?(function|const|class) " tools.ts | sed -n 1,200p`

- [ ] **Step 4: Run the whole suite**

Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
Expected: same test count as Task 1 plus the new cache tests; snapshot test still passing; no lint or type errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/jarvis/tools
git commit -m "JAR-023: move tool helpers, caches and resolvers into support modules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Registry-first dispatch for execution and preview

**Files:**
- Modify: `api/src/jarvis/tools/tools.ts` (`runToolInContext`, `previewToolInContext`)
- Create: `api/src/jarvis/tools/support/tool-env.ts`
- Test: `api/src/jarvis/tools/tool-dispatch.spec.ts`

**Interfaces:**
- Consumes: `TOOL_DEFINITIONS`, `ToolHandlerEnv`, `createToolResolvers`.
- Produces: `buildToolEnv(ctx: ToolContext): ToolHandlerEnv` in `support/tool-env.ts`.

- [ ] **Step 1: Write the failing dispatch tests**

```ts
import { DEFERRED_CAPABILITY_MESSAGE } from './beta-capabilities';
import { defineTool } from './define-tool';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { runTool, type ToolContext } from './tools';

function ctxWith(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    prisma: new Proxy({}, { get: () => { throw new Error('prisma touched'); } }),
    tz: 'Europe/Paris',
    sessionId: 'dispatch',
    ...overrides,
  } as unknown as ToolContext;
}

describe('registry dispatch', () => {
  afterEach(() => {
    delete (TOOL_DEFINITIONS as Record<string, unknown>)['todo.list'];
  });

  it('runs a registered handler with the built environment', async () => {
    (TOOL_DEFINITIONS as Record<string, unknown>)['todo.list'] = defineTool({
      name: 'todo.list',
      risk: 'low',
      requiresConfirmation: false,
      sideEffect: false,
      requires: 'none',
      deferred: false,
      handler: async (env) => `handled:${env.sessionId}`,
    });
    const out = await runTool(ctxWith(), {
      type: 'tool',
      name: 'todo.list',
      args: {},
    });
    expect(out).toBe('handled:dispatch');
  });

  it('short-circuits deferred tools before any resolver or database access', async () => {
    const out = await runTool(ctxWith(), {
      type: 'tool',
      name: 'habit.list',
      args: {},
    });
    expect(out).toBe(DEFERRED_CAPABILITY_MESSAGE);
  });

  it('restricts todo selection to frozen local targets', async () => {
    let seen: unknown;
    (TOOL_DEFINITIONS as Record<string, unknown>)['todo.list'] = defineTool({
      name: 'todo.list',
      risk: 'low',
      requiresConfirmation: false,
      sideEffect: false,
      requires: 'none',
      deferred: false,
      handler: async (env) => {
        seen = env.todoSelection;
        return 'ok';
      },
    });
    await runTool(
      ctxWith({
        frozenLocalTargets: { kind: 'todo', items: [{ id: 't1', text: 'a' }] },
      } as Partial<ToolContext>),
      { type: 'tool', name: 'todo.list', args: {} },
    );
    expect(seen).toEqual({ id: { in: ['t1'] } });
  });
});
```

Check the real `frozenLocalTargets` shape in `commands/local-target.ts` and fix the literal if it differs.

- [ ] **Step 2: Run and see it fail**

Run: `cd api && npx jest src/jarvis/tools/tool-dispatch.spec.ts`
Expected: FAIL (first test returns the legacy switch result or throws).

- [ ] **Step 3: Implement `buildToolEnv`**

```ts
import type { ToolContext } from '../tools';
import type { ToolHandlerEnv } from '../define-tool';
import { createToolResolvers } from './tool-resolvers';

export function buildToolEnv(ctx: ToolContext): ToolHandlerEnv {
  const { prisma, tz, sessionId } = ctx;
  const todoSelection =
    ctx.frozenLocalTargets?.kind === 'todo'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  const shoppingSelection =
    ctx.frozenLocalTargets?.kind === 'shopping'
      ? { id: { in: ctx.frozenLocalTargets.items.map((item) => item.id) } }
      : {};
  return {
    ctx,
    prisma,
    tz,
    sessionId,
    todoSelection,
    shoppingSelection,
    resolvers: createToolResolvers(ctx),
  };
}
```

- [ ] **Step 4: Dispatch registry-first in `tools.ts`**

In `runToolInContext`, immediately after the deferred check and before the legacy `switch`, add:

```ts
  if (call.type === 'tool') {
    const definition = TOOL_DEFINITIONS[call.name];
    if (definition)
      return (definition.handler as (env: ToolHandlerEnv, c: typeof call) => Promise<string>)(
        buildToolEnv(ctx),
        call,
      );
  }
```

In `previewToolInContext`, after the deferred, `undo.last_action` and frozen-targets branches and before the `try` block, add the same lookup using `definition.preview` and return its result when present. Leave the existing destructuring of `ctx` in place for the legacy path.

- [ ] **Step 5: Run everything including integration**

Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint && npm run test:integration 2>&1 | tail -15`
Expected: all green; dispatch tests pass; snapshot unchanged.

- [ ] **Step 6: Commit**

```bash
git add api/src/jarvis/tools
git commit -m "JAR-023: dispatch tool execution and preview through the registry first" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migrate local-data domains (todo, note, shopping)

**Files:**
- Create: `api/src/jarvis/tools/definitions/todo.ts`, `definitions/note.ts`, `definitions/shopping.ts`
- Modify: `api/src/jarvis/tools/tools.ts` (remove the migrated `case` blocks from both switches), `api/src/jarvis/tools/tool-definitions.ts` (register)
- Test: `api/src/jarvis/tools/definitions/todo.spec.ts` (plus existing suites)

**Interfaces:**
- Consumes: `defineTool`, `ToolHandlerEnv`, `TOOL_META` values for each tool (copy risk, confirmation, side effect exactly from `tool-registry.ts`).
- Produces: `todoTools`, `noteTools`, `shoppingTools: ToolDefinition[]`.

Migration procedure applied to every tool of the domain (todo shown in full):

- [ ] **Step 1: Write a handler test for one migrated tool**

```ts
import { todoTools } from './todo';
import type { ToolHandlerEnv } from '../define-tool';

function env(prisma: unknown): ToolHandlerEnv {
  return {
    ctx: { recordUndo: jest.fn() },
    prisma,
    tz: 'Europe/Paris',
    sessionId: 'todo-test',
    todoSelection: {},
    shoppingSelection: {},
    resolvers: {},
  } as unknown as ToolHandlerEnv;
}

describe('todo.add', () => {
  it('creates an owned todo and records an undo', async () => {
    const create = jest.fn().mockResolvedValue({ id: 't1' });
    const e = env({ ownerId: 'u1', todo: { create } });
    const def = todoTools.find((d) => d.name === 'todo.add')!;
    const out = await def.handler(e, {
      type: 'tool',
      name: 'todo.add',
      args: { text: 'Acheter du pain' },
    } as never);
    expect(create).toHaveBeenCalledWith({
      data: { ownerId: 'u1', text: 'Acheter du pain' },
      select: { id: true },
    });
    expect(out).toBe('OK. Ajouté: "Acheter du pain"');
  });
});
```

- [ ] **Step 2: Run it and see it fail** (`definitions/todo` missing).

Run: `cd api && npx jest src/jarvis/tools/definitions/todo.spec.ts`

- [ ] **Step 3: Move the `// ===== TODOS =====` execution cases**

Create `definitions/todo.ts`. For each `case 'todo.xxx'` block in `runToolInContext` (section starting at the `// ===== TODOS =====` marker, `grep -n "===== TODOS" tools.ts`), cut the block body verbatim into a handler, replacing destructured names with `const { prisma, sessionId, ctx, todoSelection, resolvers } = env;` and `const { resolveTodo, resolveTodoRefs } = resolvers;` at the top of the handler (only the names used). Example for `todo.add`:

```ts
import { defineTool } from '../define-tool';

export const todoTools = [
  defineTool({
    name: 'todo.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, ctx } = env;
      const created = await prisma.todo.create({
        data: { ownerId: prisma.ownerId, text: call.args.text },
        select: { id: true },
      });
      ctx.recordUndo?.('ajout todo', true, [
        { kind: 'todo.delete', id: created.id },
      ]);
      return `OK. Ajouté: "${call.args.text}"`;
    },
  }),
];
```

In the test above `prisma.ownerId` is read; set `ownerId: 'u1'` on the mock (as shown). Use exact `risk`, `requiresConfirmation`, `sideEffect` from `TOOL_META` for each tool and `requires: 'none'`.

- [ ] **Step 4: Move the matching preview cases**

For each migrated tool that has a `case` inside `previewToolInContext` (19 in total across all domains), move it to the `preview` field using the same env destructuring. Move shared preview helpers (`extractRef`, `previewTodoByQuery`, ...) into `support/tool-preview-helpers.ts` the first time they are needed and import them.

- [ ] **Step 5: Register and delete the legacy cases**

In `tool-definitions.ts` add `registerTools([...todoTools, ...noteTools, ...shoppingTools]);` at module end (import the arrays). Delete the migrated `case` blocks from `tools.ts`.

- [ ] **Step 6: Repeat Steps 1–5 for note and shopping**, one commit-sized chunk each.

- [ ] **Step 7: Run everything**

Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
Expected: green; `tool-metadata.snapshot.spec.ts` unchanged; `tools.*.spec.ts` unchanged and passing.

- [ ] **Step 8: Commit**

```bash
git add api/src/jarvis/tools
git commit -m "JAR-023: migrate todo, note and shopping tools to definitions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Migrate calendar and weather/web/time/help

**Files:**
- Create: `definitions/calendar.ts`, `definitions/weather.ts`, `definitions/web.ts`, `definitions/time.ts`
- Modify: `tools.ts`, `tool-definitions.ts`
- Test: `definitions/calendar.spec.ts`

**Interfaces:** same as Task 5. `requires` values: `calendar.create|update|delete` → `calendar.write`; `calendar.list|has|duration` → `calendar.read`; others `none`.

- [ ] Apply the Task 5 procedure (test → fail → move cases at `// ===== CALENDAR =====`, `// ===== WEATHER =====`, `// ===== WEB =====`, time-insight cases at `// ===== TIME INSIGHTS =====` → move previews → register → delete legacy cases).
- [ ] Calendar test to write first: `calendar.list` returns `Aucun événement…` text when `env.ctx.calendar.listEvents` resolves `[]` (read the existing `tools.calendar-context.spec.ts` for the provider mock shape and the exact expected message).
- [ ] Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
- [ ] Commit: `git add api/src/jarvis/tools && git commit -m "JAR-023: migrate calendar, weather, web and time tools" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 7: Migrate gmail

**Files:**
- Create: `definitions/gmail.ts`
- Modify: `tools.ts`, `tool-definitions.ts`
- Test: `definitions/gmail.spec.ts`

**Interfaces:** `requires`: `gmail.send` → `gmail.send`; `gmail.mark_read|bulk_mark_read|mark_unread|archive|unarchive|trash|untrash` → `gmail.modify`; `gmail.delete` → `gmail.permanent_delete` with `deferred: true`; the rest `gmail.read`.

- [ ] Apply the Task 5 procedure at `// ===== GMAIL =====` (largest block, about 510 lines). Move in two commits if the diff exceeds ~600 lines: read tools first (`gmail.list|read|search|…`), then mutating tools.
- [ ] Test to write first: `gmail.delete` stays deferred in the registry (`def.deferred === true`) and the snapshot test still passes; plus one handler test copied from `tools.gmail.spec.ts` style using `makeGmailMock`.
- [ ] Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
- [ ] Commit: `git add api/src/jarvis/tools && git commit -m "JAR-023: migrate gmail tools to definitions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 8: Migrate memory, mission, briefing and the remaining domains

**Files:**
- Create: `definitions/memory.ts`, `definitions/mission.ts`, `definitions/briefing.ts`, `definitions/goal.ts`, `definitions/conflict.ts`, `definitions/dependency.ts`, `definitions/scheduling.ts`, `definitions/help.ts`, `definitions/search.ts`, `definitions/knowledge.ts`, `definitions/contact.ts`
- Create (deferred, `deferred: true`): `definitions/resource.ts`, `definitions/analytics.ts`, `definitions/delegation.ts`, `definitions/reminder.ts`, `definitions/habit.ts`, `definitions/finance.ts` (expense and budget)
- Modify: `tools.ts`, `tool-definitions.ts`
- Test: `definitions/memory.spec.ts`, `definitions/deferred.spec.ts`

**Interfaces:** `requires: 'none'` for all; `deferred: true` for every tool whose name starts with `habit.`, `expense.`, `budget.`, `delegation.`, `analytics.`, `resource.`, `reminder.`.

- [ ] Apply the Task 5 procedure per section marker (`// ===== MEMORY =====` at the second occurrence, `BRIEFING`, `GOALS`, `CONFLICTS`, `DEPENDENCIES`, `SCHEDULING`, `CONTEXTUAL HELP`, `SEARCH`, `KNOWLEDGE BASE`, `CONTACTS`, then the deferred ones). Include `undo.last_action`, `action.*` and `daily.*` wherever their `case` lives (`grep -n "case 'undo\.\|case 'action\.\|case 'daily\." tools.ts`).
- [ ] Test to write first (`deferred.spec.ts`):

```ts
import { isDeferredCapability } from '../beta-capabilities';
import { TOOL_DEFINITIONS } from '../tool-definitions';

describe('deferred tools', () => {
  it('flags exactly the deferred capability set', () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      expect(def!.deferred).toBe(isDeferredCapability(def!.name));
    }
  });
});
```

- [ ] Memory test: copy the first case of `tools.memory.spec.ts` against `definitions/memory.ts` handlers directly.
- [ ] Run: `cd api && npm test 2>&1 | tail -8 && npm run typecheck && npm run lint`
- [ ] Commit: `git add api/src/jarvis/tools && git commit -m "JAR-023: migrate remaining and deferred tools to definitions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 9: Derive metadata from the registry and remove the legacy switches

**Files:**
- Modify: `api/src/jarvis/tools/tool-registry.ts` (`TOOL_META` derived), `tool-engine.ts` (requirements from registry), `beta-capabilities.ts` (deferred from registry), `tools.ts` (delete legacy `switch` and preview `switch`), `tool-definitions.spec.ts` (remove `.skip`)
- Test: `tool-definitions.spec.ts`, `tool-metadata.snapshot.spec.ts` (must stay unchanged)

**Interfaces:**
- Consumes: `TOOL_DEFINITIONS`.
- Produces: unchanged exports `TOOL_META`, `gateToolCall`, `isDeferredCapability`.

- [ ] **Step 1: Re-enable the consistency test**

In `tool-definitions.spec.ts` change `it.skip(` back to `it(`. It compares `Object.keys(TOOL_META)` with `Object.keys(TOOL_DEFINITIONS)`; since `TOOL_META` is still hand-written at this point, this proves every declared tool has a definition.

Run: `cd api && npx jest src/jarvis/tools/tool-definitions.spec.ts`
Expected: PASS.

- [ ] **Step 2: Derive `TOOL_META` and `isDeferredCapability`**

`tool-registry.ts` must not import `tool-definitions.ts` while definitions import types from it (cycle risk). Keep the `ToolName` type where it is. Replace the literal `TOOL_META` with a function-built object in a new file `tool-meta.ts`:

```ts
import { TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolMetadata, ToolName } from './tool-registry';

export const TOOL_META = Object.fromEntries(
  Object.values(TOOL_DEFINITIONS).map((def) => [
    def!.name,
    {
      requiresConfirmation: def!.requiresConfirmation,
      sideEffect: def!.sideEffect,
      risk: def!.risk,
    },
  ]),
) as Record<ToolName, ToolMetadata>;
```

Make `tool-registry.ts` re-export `TOOL_META` from `./tool-meta` and delete the literal table. Rewrite `isDeferredCapability` to `TOOL_DEFINITIONS[name as ToolName]?.deferred ?? false`, keeping `DEFERRED_CAPABILITY_MESSAGE`. Because the earlier consistency test used the literal `TOOL_META`, change it now to compare `Object.keys(TOOL_DEFINITIONS)` against the key list captured in the snapshot (the snapshot rows already pin every name).

- [ ] **Step 3: Derive gate requirements**

In `tool-engine.ts` replace the name-based lists with a lookup of `TOOL_DEFINITIONS[call.name].requires`:

```ts
const requirement = TOOL_DEFINITIONS[call.name as ToolName]?.requires ?? 'none';
if (requirement.startsWith('calendar.')) {
  if (!googleStatus.connected) return new GoogleIntegrationError('GOOGLE_NOT_CONNECTED');
  const ok = requirement === 'calendar.write' ? hasCalendarWrite(scopes) : hasCalendarRead(scopes);
  if (!ok) return new GoogleIntegrationError('CALENDAR_SCOPE_MISSING');
}
if (requirement.startsWith('gmail.')) {
  if (!googleStatus.connected) return new GoogleIntegrationError('GMAIL_NOT_CONNECTED');
  const ok =
    requirement === 'gmail.permanent_delete' ? hasGmailPermanentDelete(scopes)
    : requirement === 'gmail.send' ? hasGmailSend(scopes)
    : requirement === 'gmail.modify' ? hasGmailModify(scopes)
    : hasGmailRead(scopes);
  if (!ok) return new GoogleIntegrationError('GMAIL_SCOPE_MISSING');
}
return null;
```

The existing `tool-engine.spec.ts` and the Task 1 snapshot must pass unchanged.

- [ ] **Step 4: Delete the legacy switches**

Remove the remaining `switch (call.name)` in `runToolInContext` and `previewToolInContext`. `runToolInContext` becomes: deferred check, `final` handling, registry lookup, and for an unknown name the same fallthrough result the old `default` produced (read it before deleting and keep it verbatim).

- [ ] **Step 5: Full verification**

Run: `cd api && npm test 2>&1 | tail -10 && npm run typecheck && npm run lint && npm run build && npm run test:integration 2>&1 | tail -15`
Expected: all green; snapshot file unchanged (`git diff --stat api/src/jarvis/tools/__snapshots__` empty); `wc -l api/src/jarvis/tools/tools.ts` far below 6,187.

- [ ] **Step 6: Commit**

```bash
git add api/src/jarvis/tools
git commit -m "JAR-023: derive tool metadata from the registry and drop the legacy switches" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Documentation, tracker and handoff

**Files:**
- Create: `docs/architecture/tool-definitions.md`
- Modify: `docs/execution-checkpoint.md` (untracked; local note only)

- [ ] **Step 1: Write the short architecture note**

Describe the contract fields, how to add a tool (new definition in `definitions/<domain>.ts`, registered in `tool-definitions.ts`, snapshot regenerated deliberately), and the derivation of `TOOL_META`/gating/deferral. Keep it under one page.

- [ ] **Step 2: Final checks and diff size**

Run: `cd api && npm test 2>&1 | tail -6 && npm run typecheck && npm run lint && git diff --stat main...HEAD | tail -3`

- [ ] **Step 3: Commit and report**

```bash
git add docs/architecture/tool-definitions.md
git commit -m "JAR-023: document the tool definition contract" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Report outcomes and remaining limitations to the user; update the Notion ticket only if the user asks (merge and Done status require a reviewed PR). Do not open a PR or push without explicit approval.
