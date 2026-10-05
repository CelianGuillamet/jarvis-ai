# Today controls — implementation checkpoint

JAR-030 is in progress. The read and target services below are not yet exposed
through HTTP; this document does not claim that the product flow is complete.

## Data and ownership

The authenticated account supplies the owner. Clients cannot submit an owner in
Today mutation contracts. Every edit/completion resolves the exact resource ID
with an owner predicate. Missing and foreign IDs both return Not Found; there is
no text-search fallback. Existing local command compensation checks the frozen
resource values again inside its transaction before changing anything.

Tasks and notes are read together in a transaction, ordered deterministically,
with at most 50 rows per resource and explicit has-more flags. Storage failure
returns a sanitized Unavailable outcome, never an apparently empty account.
The snapshot includes the time of the successful read.

## Remaining execution work

Wire the explicit operation mapping to the shared command policy and atomic
local compensation handlers. Commands use the distinct `direct` source, with
the existing database trigger continuing to forbid source changes.

The client must retain one request UUID for a submitted mutation until its
outcome is known. The server must bind that identity to immutable intent and
replay a completed response, never repeat an uncertain effect. A retry must
reuse the recorded target snapshot, rather than recompute a changed envelope.
The durable TodayCommandService now implements request-scoped transaction locks,
immutable intent matching, a single execution claim, completed-response replay,
unknown-outcome refusal to repeat, and simulation replay. Its PostgreSQL tests
cover concurrent duplicates and a fresh service instance. This adapter is not
yet connected to the HTTP routes or local compensation handlers; complete that
wiring and its tests before enabling UI submission.

## Remaining product work

Build the French Today surface for calendar, owned tasks, notes and current
pending actions. Add create/edit/complete/reopen controls, bounded navigation,
explicit unavailable/stale/empty states and relevant refresh after writes.
Preserve the passive status and explicit provider refresh introduced by JAR-026.
No LLM routing is required for these deterministic controls.

## Verification recorded so far

Thirteen focused unit tests pass: owner-scoped reads, bounded response and
continuation metadata, genuine empty state, storage and malformed-row failures,
strict mutation input, deterministic handler selection, exact owner/ID resolution,
missing targets, frozen task/note values and creation without target lookup.
PostgreSQL integration passes 104 tests in 12 suites with all 26 migrations,
including direct-source persistence and immutability. The disposable database
was removed. API typecheck and changed-file lint pass without warnings.

Additional validation: 109 PostgreSQL tests in 13 suites pass with all 26
migrations and database cleanup. Types and changed-file lint pass. The direct
executor accepts a previously claimed command ID instead of inventing a new
request identity.
