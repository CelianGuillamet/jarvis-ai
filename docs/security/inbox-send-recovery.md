# Inbox send recovery

Inbox replies now preserve send, label and local-update outcomes separately. A retry with the same request identity skips a confirmed send and resumes only unfinished safe steps. An uncertain send is never retried automatically.

## Implementation decisions

- Preserve Gmail's returned message ID and optional thread ID. A missing message ID is an uncertain outcome, never evidence that no send occurred.
- Introduce an owner-scoped operation identity retained across client retries, bound to the conversation, originating Google integration, original message and immutable reply payload. Reusing an identity with different intent must conflict. A deliberately new reply needs a new identity.
- Persist a send claim before contacting Gmail. Only a pending send can be claimed. A transport timeout, process interruption or failed receipt write leaves an uncertain send; no automatic path may claim it again.
- Save the send receipt before label changes. Keep label application and local item update as separate durable steps. Retrying those steps must never enter send again. Label changes are absolute add/remove operations and the local patch must be idempotent.
- Keep the JAR-019 owner, Google identity, capability and simulation boundary around each execution/recovery attempt. Simulation must not consume a live send identity. Unknown sends must remain visible for reconciliation.
- Return per-item and per-step states plus provider references. Avoid a generic failure that invites the client to submit a new operation blindly.

## Verification

Fake-provider and disposable PostgreSQL tests inject label/local failure and receipt-write failure, then retry after a new service instance. They verify one send total, concurrent duplicate claims, unknown outcomes, immutable SQL evidence, conflicting intent and owner isolation. HTTP tests exercise label failure/recovery, repeated completion, uncertain sends and simulation without consuming a live operation. Provider tests reject missing receipts. Browser identity tests verify repeated/concurrent calls, isolation by canonical conversation, changed-payload refusal and matching-acknowledgment cleanup.

## Client identity and limits

`send_reply` requires a request ID. The browser stores only that ID and a payload hash, keyed by the server's canonical conversation and message. Web Locks coordinate identity creation across tabs. Storage/lock failure prevents sending. Unresolved changed text is refused; an acknowledged complete operation releases its client identity for a deliberate new reply. Deleting browser storage or explicitly supplying a new request ID creates new intent; the server does not deduplicate different identities by email content. An uncertain send requires reconciliation, not a new identity.

Every attempt still enters the shared owner, capability and Google-account checks. The operation service runs only inside the live callback, and the local update checks the original scan identity. A storage outage after the send claim leaves a non-retryable sending/unknown state. The API exposes per-step states and provider references in the item result and action history. Typed outer command outcomes remain JAR-025; the precise compound outcome is in this operation record. Browser behavior was tested at the identity-helper level, not with a live Google account or a full browser end-to-end run.
