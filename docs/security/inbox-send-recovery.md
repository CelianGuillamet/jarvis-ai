# Inbox send recovery (JAR-020, in progress)

The current Inbox reply callback sends, changes labels and updates the local item in sequence. The command journal records the overall outcome, but cannot currently distinguish a successful send followed by a label/storage failure. Repeating the request can therefore send again. This ticket is incomplete until the durable recovery path and client retry identity are implemented and verified.

## Implementation decisions

- Preserve Gmail's returned message ID and optional thread ID. A missing message ID is an uncertain outcome, never evidence that no send occurred.
- Introduce an owner-scoped operation identity retained across client retries, bound to the conversation, originating Google integration, original message and immutable reply payload. Reusing an identity with different intent must conflict. A deliberately new reply needs a new identity.
- Persist a send claim before contacting Gmail. Only a pending send can be claimed. A transport timeout, process interruption or failed receipt write leaves an uncertain send; no automatic path may claim it again.
- Save the send receipt before label changes. Keep label application and local item update as separate durable steps. Retrying those steps must never enter send again. Label changes are absolute add/remove operations and the local patch must be idempotent.
- Keep the JAR-019 owner, Google identity, capability and simulation boundary around each execution/recovery attempt. Simulation must not consume a live send identity. Unknown sends must remain visible for reconciliation.
- Return per-item and per-step states plus provider references. Avoid a generic failure that invites the client to submit a new operation blindly.

## Required verification before completion

Use fake providers and disposable PostgreSQL to inject failure after send, after label update and before local persistence. Retry with the same identity and assert one send total. Verify concurrent duplicate requests, process/service restart, unknown send outcome, missing provider receipt, conflicting payload, different owner/account, and simulation. Exercise the HTTP response and browser retry identity so this is not only a service-level guarantee.

## Current evidence

The adapter returns Gmail's message/thread references and rejects a missing message reference without retrying. The operation service now stores immutable intent, atomically claims send once, preserves its receipt and resumes only unfinished labels/local steps. SQL rejects send-state rollback, receipt replacement and reset of completed steps. Disposable-database tests cover label/local failures across service restart, replay, concurrent send claims, uncertainty, owner isolation and conflicting intent. The service is not yet wired into Inbox: HTTP/client identity and response integration remain pending, so duplicate-send prevention is not complete in the application.
