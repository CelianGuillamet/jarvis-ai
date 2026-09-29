# Durable command journal — JAR-017

`CommandJournalService` provides a persistent foundation for JAR-018 confirmation claims and JAR-019 shared execution. Existing `PendingAction` handling is intentionally unchanged in this additive migration; commands are not yet routed through the journal. Do not claim existing provider operations are replay-safe until those adoption tickets pass.

A proposal contains the verified owner, canonical owned conversation, stable request ID, tool name/version, exact arguments, resolved target snapshots and expiry. The envelope is immutable. Its SHA-256 digest uses canonical JSON with sorted object keys; array order is retained. Inputs reject non-JSON values, excessive depth and envelopes over32KiB. Callers must resolve aliases/display indices before proposal and never store tokens or credentials. A request key is unique per owner: identical retries recover the same command, while altered payloads conflict. Clients must retain the original expiry and request ID for retries.

The composite conversation/owner foreign key prevents inconsistent ownership. Reads and updates also filter by verified owner. Approval requires the current revision and exact envelope digest; it becomes immutable and is logged as a waiting-to-waiting event. Execution cannot start without approval, or after expiry. Each update compares the expected revision and increments it, allowing one concurrent claim.

Allowed transitions:

- proposed → waiting, cancelled, expired
- waiting → executing, cancelled, expired (or one approval event)
- executing → completed, failed, unknown
- unknown → completed or failed after explicit reconciliation

Completed, failed, cancelled and expired are terminal. Unknown never transitions back to executing: a timeout is not evidence that a remote mutation failed. Final/unknown outcomes require a bounded symbolic code rather than raw provider errors. Callers may mark failed only after a definitive rejection; recovery/reconciliation policy belongs to subsequent execution tickets.

PostgreSQL triggers enforce immutable envelopes, approvals, revisions, expiry and the transition graph even when ORM methods are bypassed. History rows are inserted transactionally with every successful state/approval change and cannot be edited or deleted through ordinary writes. State and history roll back together. Future retention/deletion work (JAR-039) needs an explicit privileged purge procedure; this feature does not silently delete audit records.

The migration is additive, replays on disposable PostgreSQL and does not infer approvals for old pending actions. Integration tests cover concurrent proposal/claim, restart replay, changed request rejection, foreign owners, direct SQL/ORM tampering, invalid transitions, terminal outcomes, unknown reconciliation, expiry and rollback. No provider calls or real database migration are performed by these tests.
