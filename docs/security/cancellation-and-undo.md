# Cancellation and supported undo

Cancellation and compensation are different operations. Cancelling a waiting
command prevents its claim. It cannot reverse an effect which has already started.

## Cancellation

The cancellation transaction takes the same conversation lock as confirmation
claim and proposal replacement. It targets the displayed command ID, never a new
proposal which replaced it. It returns the durable state after the race: cancelled,
expired, executing, completed or unknown. The adapter only reports cancellation
and updates the cancellation audit when that exact command became cancelled.
Late bare refusals replay the existing result/state without invoking a new tool.

## Local compensation

Tasks, notes and shopping items support one-level undo in their originating
conversation. Each local mutation runs in a serializable transaction with its
owned delegate, validates its frozen selection, and records both the inverse and
the complete expected post-state in `CommandCompensation`. Failure to persist the
inverse rolls back the mutation. The record survives service restarts. Existing
actions without such a record cannot be compensated automatically.

Undo requires a separate confirmation. Its immutable command targets contain the
original command ID, so approval cannot silently select a newer action. Execution
rechecks the owner, conversation, latest non-simulated execution claim, completed
state, unconsumed compensation and all affected records. Changed targets require
review; no inverse is automatically adapted to a newer value. All restores and
the consumed marker commit together. Deleted rows are restored with create, never
an overwrite/upsert of an occupied ID. Concurrent inverses or edits abort rather
than replaying automatically. Local numbered-reference caches are invalidated
after commit/rollback so an intermediate cached mutation cannot be reused.

The inverse and expected state are immutable in SQL; a consumed record cannot be
reset. The existing confirmation journal replays a completed confirmation response.
If the response cannot be saved after the local commit, the command remains
uncertain and the consumed marker prevents applying the inverse again. Broader
unknown-outcome reconciliation belongs to JAR-022.

## Boundaries

- Gmail sends, Gmail label changes, calendar operations and other unsupported
  commands have no local compensation. A completed, executing or unknown send
  blocks falling back to an earlier reversible action. Undo never claims to recall
  an email. Ordering uses immutable execution-claim timestamps rather than delayed
  completion times; simultaneous timestamps with an ambiguous order refuse undo.
  Inbox Zero uses the same command journal and therefore the same barrier.
- Simulation does not enter either the mutation or compensation closure.
- The maximum local selection is 200 records. Compensation compares complete
  current values, including ownership and creation timestamps; it is not an edit
  history or multi-level undo stack.
- The legacy tool runner cannot execute undo directly. Production mutations use
  the shared command executor and the compensation service.
- No database migration was applied to a real user database. Validation uses
  disposable PostgreSQL and fake providers, with no live Google or paid calls.

## Verification

`pending-confirmation.integration-spec.ts` covers cancellation/claim races, exact
command targeting, foreign conversations, replacement proposals and completed
response replay. `command-compensation.integration-spec.ts` covers each supported
inverse, restart, stale state, a newer command, owner isolation, successful and
uncertain sends, concurrent compensation, occupied IDs, forward stale previews,
atomic rollback on persistence/restore failure, SQL immutability and confirmed
response replay. Jarvis service unit tests cover late cancellation and binding an
undo preview to a confirmation.
