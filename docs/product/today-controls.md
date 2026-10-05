# Today controls

The French Aujourd’hui screen is the default landing page. It displays the next
calendar event, pending confirmation, owned tasks and notes. Calendar reads remain
passive until the user explicitly refreshes; unavailable and expired data are
labelled separately from a verified empty result.

## Data and ownership

GET `/today` and POST `/today/mutations` require an authenticated session and
owned conversation. Mutation requests are subject to the existing Origin guard.
Clients cannot submit an owner. Every edit/completion resolves the exact resource
ID with an owner predicate. Missing and foreign IDs both return Not Found; there
is no text-search fallback. Local compensation checks frozen resource values
again inside its transaction before changing anything.

Tasks and notes are read together, ordered by creation time and ID descending.
Independent offsets select pages of at most 50 rows; a 51st row supplies the
has-more flag. Offsets are bounded to 10,000. Navigation retains the last
successful page on failure. Offset pagination can shift when records are inserted
between reads; it is not an immutable browsing snapshot. Completion does not
change ordering. Storage failures return Unavailable, never an empty account.
The response includes the successful read time and canonical conversation ID.

## Deterministic writes and recovery

Task creation, editing, completion and reopening, and note creation and editing,
use strict typed contracts without LLM routing. They enter the shared command
policy and atomic compensation handlers. Commands use the immutable `direct`
source. Simulation is labelled and produces no domain effect.

The client retains a request UUID and SHA-256 intent fingerprint per owner,
canonical conversation and resource lane. Task/note text is not stored in this
recovery metadata. Web Locks serialize submissions across tabs. An unresolved
intent must be retried with its original values; a distinct intent cannot replace
it. Completed identities remain available for duplicate response replay. The
explicit Nouvelle tâche/ Nouvelle note control starts a fresh creation intent
only after the previous outcome is known.

The server serializes claims with a transaction-scoped lock, binds each request
to immutable intent and the original target snapshot, and claims execution once.
Completed retries replay the stored response. Executing or unknown results never
repeat an effect automatically. The screen retains uncertain form input and
refreshes owned data and passive status after a response.

## Verification

413 API unit tests, 112 disposable PostgreSQL integration tests across 26
migrations, 64 web tests and four integration-runner tests pass. Coverage includes
all six HTTP operations, exact IDs and homonyms, foreign ownership and Origin
rejection, atomic compensation, concurrent duplicate claims, restart replay,
uncertain outcomes, tied-timestamp pagination and independent offsets.

Real Vue DOM tests exercise task/note forms, exact editing, completion/reopening,
uncertain retries and pagination failure. API/web typecheck, zero-warning lint,
application builds and prototype build pass. Live Google calls, browser visual
inspection and deployment were not performed. GitHub checks must pass on the
reviewed head before merge; Notion moves to Done only after merge is verified.
