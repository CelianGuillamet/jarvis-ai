# JAR-050 — Routines with a durable journal

First increment: one built-in routine, « Prépare ma journée », launched manually from Activité. It gathers today's calendar (`calendar.list`, facultative) and open tasks (`todo.list`) and stores a composed text result. No open-source engine and no second orchestrator were added: steps run through the existing tool contract and command journal.

## Rules

- A routine is code-defined and validated at startup (`routine-definitions.ts`): 1 to 8 steps, canonical `parseToolCall` arguments, and only tools that are not side-effecting, need no confirmation and are not deferred. A write tool cannot be put in a routine; effects stay in chat behind the existing confirmations.
- Each step is a `direct` command in the shared journal with request ID `<runId>:<stepId>:<attempt>`. The journal claim is the resume key: a claimed step is never executed twice, and a restart returns the stored outcome.
- Run state is stored per owner in `RoutineRun` (steps JSON, revision for compare-and-swap) with `RoutineSetting` for enable/disable (default enabled). Both tables are in the privacy inventory, export projection, purge order and write fence.
- A step that returns an unknown or still-executing outcome suspends the run and blocks later steps. Resume is explicit: retry (new attempt, allowed because steps are read-only) or skip, each with a mandatory written justification stored on the step.
- A failed facultative step is skipped; a failed required step fails the run.
- Cancellation stops steps not yet started, lets an in-flight step finish, and records what ran. Every step is read-only, so there is no undo to offer.
- A step marked executing within the last 30 seconds belongs to a live caller; a second caller returns the current state instead of touching it. An older marker is treated as a crash and resolved through the journal, never by re-running blindly.

## API

`GET /routines`, `POST /routines/:key/enabled`, `POST /routines/:key/runs` (client request ID makes the start idempotent), `POST /routines/runs/:id/continue|cancel|resume`. Contracts in `contracts/v1.ts`; UI in `RoutinesCard` on the Activity screen. Each step also appears in the normal Activity command list.

## Verified

PostgreSQL tests (`routines.integration-spec.ts`): single execution and journal rows, duplicate and concurrent starts, crash between steps and resume, claimed-but-unfinished step suspended and not replayed, retry/skip with evidence, optional versus required failure, cancellation, enable/disable, cross-owner isolation, request-ID conflict, database constraints. Unit tests for definition validation; component tests for the card; endpoints added to the security matrix.

## Limits

- Read-only only: « Prépare les propositions » means a composed summary. Draft replies and mutation proposals are not included; they need a step type that creates a confirmation.
- No autonomous scheduling and no custom routine editor.
- Result text is the raw tool output joined by section, with no model summarisation.
- A step running longer than the 30 s lease can be reported as uncertain by a second caller; it is then resolved through the explicit resume.
- When merged with the JAR-040 kill switch, routine reads pass through the shared executor policy and would be refused while mutations are suspended; `executeWithPolicy` should skip the check for non-side-effect tools.
- Not exercised against live Google or a real browser.
