# JAR-023 — Single tool definition contract and domain handlers

Date: 2026-10-07 · Ticket: JAR-023 (blocks JAR-024 → JAR-027 → JAR-035/036)

## Goal

Replace the global tool `switch` in `api/src/jarvis/tools/tools.ts` with one explicit definition per tool. Each definition centralizes schema, risk, confirmation, side-effect, required Google capability, deferred flag, preview and an independently testable handler. No behavior change.

## Scope

All tools (about 100 across 29 domains), including those deferred for the beta. Deferred tools (`habit.`, `expense.`, `budget.`, `delegation.`, `analytics.`, `resource.`, `reminder.`, `gmail.delete`) are defined with `deferred: true` and keep returning `DEFERRED_CAPABILITY_MESSAGE`.

Out of scope: parser rewrite (`tool-call.ts`), `jarvis.service.ts` decomposition (JAR-024), execution-policy changes, new features, message or prompt changes.

## Current state

- `runTool()` is the single execution entry; callers: `jarvis.service.ts`, `commands/command-compensation.service.ts`, via execution policy.
- `runToolInContext()` (`tools.ts:3079` to end, 109 `case`) builds resolvers and frozen-target filters on each call, then switches.
- Metadata is spread over `TOOL_META` (`tool-registry.ts`), `gateToolCall` (`tool-engine.ts`, hard-coded name lists), `isDeferredCapability` (`beta-capabilities.ts`) and `tool-call.ts` parsing.

## Design

### Contract

`api/src/jarvis/tools/define-tool.ts` exports `defineTool({ name, risk, requiresConfirmation, sideEffect, requires, deferred, preview?, handler })`.

- `requires`: one of `none | calendar.read | calendar.write | gmail.read | gmail.modify | gmail.send | gmail.permanent_delete`.
- `handler(ctx, call) => Promise<string>`, with `ctx` the existing `ToolContext` and resolvers created lazily from it.

### Layout

`api/src/jarvis/tools/definitions/<domain>.ts` exports that domain's definitions. `tool-definitions.ts` aggregates them into a registry keyed by `ToolName`.

### Derivation

`TOOL_META`, the scope mapping used by `gateToolCall`, and `isDeferredCapability` keep their current exported signatures and are computed from the registry. External callers do not change.

`runToolInContext` keeps: deferred check first, `final` handling, shared resolver setup, then dispatches to `registry[call.name].handler`. An unknown tool returns the same result as today.

### Safety nets (written before migrating)

1. Snapshot test freezing the current `TOOL_META`, scope requirement per tool and deferred set. The derived values must equal it tool by tool.
2. Consistency test: every `ToolName` has exactly one definition and every definition has a `ToolName`.
3. Parser check: tool names accepted by `tool-call.ts` validate against the registry.

### Migration order

One domain at a time: move its `case` bodies to `definitions/<domain>.ts`, run the existing suites, continue. The legacy switch shrinks until removed. Order: simple local domains (todo, note, shopping), then calendar, gmail, memory/mission, then the remaining and deferred ones.

### Error handling

Unchanged: same messages, same Google integration errors, same deferred message.

## Verification

`npm test`, `npm run test:integration` (disposable PostgreSQL), typecheck, lint and build in `api/`, plus the representative regression specs (`tools.*.spec.ts`, `jarvis.service.spec.ts`, execution-failure gate). Never mark a check passed without running it.

## Acceptance (from ticket)

- Each tool has one definition with an independently testable handler.
- Parser/planner metadata derive from or validate against the contract.
- No unrelated behavior change; regression tests pass.

## Risks

- `runToolInContext` shares closures across cases (resolvers, selections); extraction must pass them through `ctx` without changing evaluation order. Mitigation: migrate per domain with the full suite after each step.
- ~3,100 lines move; keep diffs mechanical and review per domain.
