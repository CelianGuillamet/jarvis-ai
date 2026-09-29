# Shared execution policy — JAR-019 (in progress)

The chat execution adapter and Inbox Zero apply adapter now enter `executeWithPolicy` before their mutation callback. The adapter supplies the owner resolved from the canonical conversation, the capabilities needed by the action, and a fresh Google permission lookup. Compound Inbox replies require both send and modify permission before sending begins. Deferred deletion and reminders fail closed, including in simulation.

Simulation skips the mutation callback altogether. Inbox results explicitly include `simulated: true`; its audit row is `simulated`, and email item labels/status remain untouched. The chat adapter returns a simulation message instead of running the domain tool. Conversation metadata and audit records can still be written. This does not claim a database-wide read-only mode.

Verification covers policy refusal without an owner/capability, permission revocation, compound permissions, deferred capabilities and provider errors. HTTP integration fixtures cover simulated replies with zero provider mutations and unchanged item state, plus revoked scopes and deferred deletion. Fixtures use disposable PostgreSQL and fake providers.

## Remaining acceptance work

This is an intermediate implementation, not a completed ticket or launch gate. The shared guard does not yet own approval or durable command execution. Existing confirmations still use the JAR-018 journal adapter. Immediate chat and direct Inbox actions must be integrated with that journal, and resolved targets must be frozen before approval rather than re-resolved by legacy handlers. Complete the side-effect entrypoint inventory (including undo and follow-ups), review every path, and add chat/direct durable-outcome equivalence tests before requesting merge. JAR-020 retains responsibility for compound send recovery after partial failure.
