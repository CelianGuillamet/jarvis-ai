# Durable confirmations — JAR-018

Both chat “oui” and the confirmation endpoint use the same confirmation method. PendingActionsService now adapts the durable Command journal. Legacy PendingAction rows are retained but cannot execute through the new service; the user must propose the action again. No old row is automatically approved.

Creating a proposal, cancelling and claiming serialize on the canonical conversation row. Replacement cancels only waiting proposals; it never removes an executing intent. Approval and the waiting→executing transition occur in one transaction. A losing concurrent request reads the stored state instead of invoking the tool. SQL deadlines use clock time, including time spent waiting for locks, rather than the transaction's start time.

On successful return, the rendered response is stored with completion and replayed on later button/text confirmations. Completion responses are immutable. If execution throws, the command becomes unknown and is not automatically retried. A process crash after claim leaves executing intent intact; its replay explicitly reports that the result needs verification. Automated reconciliation is not invented here: provider receipts/recovery are subsequent execution work. A returned tool error string is recorded as TOOL_RETURNED, not a claim that a provider mutation succeeded.

The existing provider/mutation gate still runs before a new claim. Replying “oui” again after completion replays the latest result in that conversation; creating another proposal establishes a new confirmation target. This preserves one pending proposal per conversation while retaining the history of superseded, completed and interrupted work.

This ticket freezes the existing tool arguments and prevents double claims. Domain-specific resolution of query aliases and target snapshots remains a required part of the shared execution policy (JAR-019); it must not be described as fully solved by a journal of literal arguments. In particular, legacy query-based tool resolution is still performed by current tool handlers. No new external execution route is enabled.

Tests use disposable PostgreSQL and fake providers: concurrent HTTP confirmations invoke the calendar fake once, endpoint/text retries reproduce the saved response, owner mismatch denies access, restart/crash preserves intent, replacement/cancel/claim races retain deterministic states, and lock waits respect expiry. No deployment or live provider operation is performed.
