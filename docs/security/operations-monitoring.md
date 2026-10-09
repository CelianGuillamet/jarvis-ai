# JAR-040 — Monitoring, correlation and mutation kill switch

## Kill switch

Set `MUTATIONS_DISABLED=true` (restart) or create the file named by `MUTATION_KILL_SWITCH_FILE` (effective on the next request, no restart). While engaged, every real execution is refused with 503 and a French message before any journal write, provider call or side effect:

- the shared command executor (`executeWithPolicy`): chat tool calls, confirmations, Today mutations, Inbox apply;
- the Inbox reply sender (`InboxReplyOperationService.execute`).

Not blocked, by design: simulation, reads, chat that does not execute a command, sign-out, Google disconnect and account erasure/export (user data controls must stay available). Personal-memory edits and preferences are not command executions and are not blocked; add them to the guard if the incident calls for it.

## Diagnosis without private content

Each response carries a fresh `X-Request-Id` (inbound values are ignored). Command failures log `request`, `command`, `tool` and an outcome code only; 5xx responses log request ID, method, path (no query), status and error class, never the error message. The `Command` table already holds state and `outcomeCode` per command, so a failed command is traced from the request ID in the log to its row.

## Readiness and alerts

`GET /health/live` and `GET /health/ready` are public and return states only: database, mutation state and active alert codes. Ready answers 503 when the database is unreachable. A 60-second monitor logs `ALERT <severity> <code>` once per change. Defaults (`api/src/ops/alerts.ts`): command failure rate 20% and unknown-outcome rate 5% (each from 10 commands), model failure rate 30% (from 10 calls), any model budget refusal, 20 HTTP 5xx, kill switch engaged. Thresholds are fixed constants, not yet configurable, and were exercised with injected counters in `ops.spec.ts`.

## Limitations

Counters are in memory per process and reset on restart. There is no queue in the system, so no queue metric; the privacy worker is not instrumented. Alerts go to the process log only; no pager or hosted monitoring exists (local-only beta). Integration tests against PostgreSQL were not run for this change.
