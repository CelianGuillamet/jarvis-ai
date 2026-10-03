# JAR-025 acceptance evidence

## Shared frontend/server contracts

Canonical source: `contracts/v1.ts`; generated files: `api/src/contracts/v1.ts` and `web/src/core/contracts/v1.ts`. `scripts/sync-contracts.mjs --check` runs in both application typechecks. Chat, status, confirmation replay and all six Inbox endpoints apply response schemas. Requests apply strict shared schemas before service execution. The browser validates both request and response boundaries in `web/src/core/api/jarvis.ts`.

Evidence: `api/src/http/request-contract.spec.ts`, `api/src/http/response-contract.spec.ts`, `web/test/contracts.test.mjs`, and required application typechecks. Response tests check nested replay metadata, serialized dates and journal state agreement.

## Distinct errors and execution outcomes

The HTTP filter and client share error codes for validation, not-found, unavailable and invalid responses. Explicit pre-effect rejection records failed/VALIDATION or failed/NOT_FOUND. Chat and confirmation success record COMPLETED or SIMULATED. Inbox partial and uncertain sends retain PARTIAL and unknown execution state with durable operation details. Cross-field schemas reject contradictory receipts, steps and outcome flags.

Evidence: `api/src/http/api-exception.filter.spec.ts`, `api/test/integration/command-execution.integration-spec.ts`, `api/test/integration/pending-confirmation.integration-spec.ts`, `api/test/integration/inbox-reply-operation.integration-spec.ts`, cross-source HTTP cases in `api/test/integration/app.integration-spec.ts`, and browser contract tests. Unknown effects never authorize automatic resend; these states retain the prior failure-injection and replay safeguards.

## Invalid upstream responses and storage outages

Google Calendar/Gmail and model adapters validate provider envelopes and mutation receipts. Invalid identifiers, timestamps, nested MIME content, completion status and empty model answers fail validation. Invalid mutation receipts remain uncertain rather than proving absence of an effect.

Retained storage read failures propagate UNAVAILABLE instead of empty collections or reports. Explicit mutation failures propagate instead of null/false success. Optional Gmail context in mission/briefing tools is omitted only for explicit disconnection; other failures propagate.

Evidence: provider response and adapter tests under `api/src/calendar/providers`, `api/src/gmail/providers` and `api/src/jarvis/providers`; `api/src/http/data-unavailable.spec.ts`; service failure tests for contacts, goals, memory, supporting storage and insights; mission tool regression tests.

## Validation and practical limits

Reviewed implementation head `3e9a82c`: API typecheck, zero-warning lint, 365 unit tests across 52 suites, build and 96 disposable-PostgreSQL integration tests across 11 suites passed. Required API/Web GitHub checks passed on that head. Web refresh: typecheck, zero-warning lint, 31 tests, application build and prototype build passed. Subsequent documentation-only changes require their own successful GitHub checks before merge.

Providers were mocked and PostgreSQL was disposable. Live Google and paid model operation were not exercised. No deployment occurred. An earlier integration run had expiration/transaction timing failures and passed on retry; this change does not claim to eliminate that timing instability. Compound operations are not universally atomic: failure after a possible effect remains conservatively unknown. Deferred capabilities are excluded by the existing execution policy.
