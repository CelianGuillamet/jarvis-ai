# Phase 2 execution failure gate — JAR-022

This gate verifies durable execution identities, confirmation claims, compound
Inbox replies and supported compensation with fake effects and disposable
PostgreSQL. It does not authorize a deployment or establish live Google readiness.

## Failure matrix

| Failure window | Required observable result | Executable evidence in `api/test/integration/` |
| --- | --- | --- |
| Duplicate/concurrent confirmation | One claim; stored response replay; no second effect | `pending-confirmation.integration-spec.ts`: concurrent claims and response replay |
| Concurrent Inbox send | One provider call; active claim reported conservatively | `inbox-reply-operation.integration-spec.ts`: concurrent send claim |
| Database failure before intent commit | No provider/local effect | `execution-failure-gate.integration-spec.ts`: intent storage failure |
| Database failure before Inbox send claim | No send; same request can claim once after recovery | failure gate: pre-send claim outage |
| Effect accepted, command completion write fails | Persist unknown; never reclaim; verification message survives new connection | failure gate: post-effect uncertainty, first variant |
| Completion and unknown-state writes both fail | Preserve executing claim and approval; do not interpret it as retryable | failure gate: post-effect uncertainty, second variant |
| Send accepted, receipt and unknown-state writes both fail | Durable sending claim; retry returns send unknown; no labels/local follow-up and no resend | failure gate: post-send outage |
| Post-send labels or local patch fails | Receipt retained; resume only unfinished idempotent steps | `inbox-reply-operation.integration-spec.ts`: labels/local restart cases; `app.integration-spec.ts`: authenticated Inbox retry |
| Permissions revoked after approval | Reload permissions immediately before effect; provider count stays zero | failure gate: revoked permissions; `google-command-binding.integration-spec.ts`: account disconnect/switch |
| Claimed work interrupted | Approval and immutable intent survive; new service cannot reclaim | pending confirmations: claimed intent across crashes; failure gate: fresh connection/replay |
| Local compensation persistence fails | Roll back forward mutation | `command-compensation.integration-spec.ts`: inverse-write failure |
| Undo commits, response write fails | Consumed marker survives; no repeated inverse; response remains uncertain | failure gate: undo response outage |
| A later item in an undo batch conflicts | Roll back earlier restores and leave compensation unconsumed | compensation: occupied-ID rollback |
| Newer action or edited target after preview | Refuse stale undo; preserve newer data | compensation: stale batch, newer action, stale forward preview |
| Older completion arrives after a newer send | Do not expose the older local inverse as the latest action | compensation: delayed completion regression |
| New proposal after unknown outcome | Old operation remains retrievable by its owned ID and cannot be reclaimed | failure gate: post-effect uncertainty |

The new gate opens fresh Prisma clients/connection pools and constructs fresh
services for recovery assertions. It injects storage exceptions at precise write
boundaries. Abrupt termination is represented by leaving a committed executing or
sending claim without a terminal write; this is not an OS-level process-kill test.
The existing integration runner blocks external transports and uses only generated
database fixtures. Scope revocation is a fake permission snapshot changing after
approval, complemented by real database account-binding tests.

## Reconciliation rule

An executing/sending claim without a final receipt is **not evidence that nothing
happened**. An unknown result must not be made retryable by resetting its state,
clearing an operation ID or submitting a replacement ID automatically. Confirmation
replay states that the result must be checked and will not be rerun. Inbox replies
return `steps.send = unknown` with no fabricated provider reference.

Reconciliation requires evidence of the actual effect (for example a verified
provider receipt, or the committed local compensation marker). Keep the immutable
intent, ownership and transition history. This gate does not add a manual
reconciliation endpoint or fabricate such evidence. JAR-025 retains the general
typed outcome contract; JAR-033 retains the Activity/recovery interface. After a
permission failure following a claim, the current adapter conservatively records
unknown even though this test proves zero provider calls.

## Scope of replay guarantees

The replay key is the original confirmation/command ID or the original Inbox
reply request ID. A new chat request or an explicitly new reply ID is new intent;
identical content alone is not a replay key. Completed effects under the original
identity are not repeated. Absolute Gmail label updates and local patches may be
retried if their completion marker was not stored; those operations are intentionally
idempotent. This is not a claim of exactly-once delivery across arbitrary networks.

The database suite also replays all 23 migrations and seven legacy migration
rehearsals. Required API/Web CI must pass on the reviewed PR head before this gate
is marked Done. Real accounts, provider-side failures, browser recovery presentation
and deployment remain outside this local verification gate.
