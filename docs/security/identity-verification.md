# Identity and ownership verification — JAR-016

The local gate uses the real Nest guards, Better Auth signed cookies and disposable migrated PostgreSQL. Gmail, Calendar and model execution use fakes. The test transport forbids external provider traffic. This verifies application isolation; it does not claim live Google consent, production proxy configuration or a deployed penetration test.

## HTTP coverage

`api/test/integration/app.integration-spec.ts` inventories controller metadata so a new private route fails the gate until the matrix is updated. Every private route in this inventory rejects anonymous requests, including requests presenting another user's identifiers without a signed cookie.

| Routes | Authenticated second-account negative scenario |
| --- | --- |
| GET `/account/preferences`, POST `/account/preferences` | Signed-in owner only; rejects anonymous requests, identity overrides, invalid timezones and untrusted mutation origins. |
| GET `/account/me` | Spoofed owner query/header still returns only the signed-in account. |
| GET `/account/export/profile`, GET `/account/export/data` | Authenticated owner only; explicit credential-free projections, strictly validated collection/cursor, pages bounded to 50. PostgreSQL export isolation checks remain in progress under JAR-039. |
| GET `/jarvis/history`, `/jarvis/status`, `/inbox-zero/session`, `/inbox-zero/message`, `/auth/google/status`, `/auth/google` | A known foreign canonical conversation returns 404 before accessing its data or authorization flow. |
| POST `/jarvis/chat`, `/jarvis/confirm` | Foreign conversation refused; a real foreign pending-action ID paired with the attacker's own conversation is not consumed. |
| GET `/today`, POST `/today/mutations` | Foreign canonical conversations and resource IDs are refused; owner comes from the signed session. Mutations require an allowed Origin and strict deterministic input. |
| POST `/jarvis/status/refresh` | Refresh requires the authenticated conversation owner and an allowed Origin. Passive GET status performs no provider or model transport. |
| POST `/inbox-zero/scan`, `/inbox-zero/step`, `/inbox-zero/apply`, `/inbox-zero/draft-reply` | Valid DTOs with a foreign conversation and known message ID return 404. |
| GET `/auth/google/callback` | A state belonging to another account is rejected and remains claimable by its owner. |
| POST `/auth/google/disconnect` | A spoofed body owner cannot remove the other account's integration. |

Public root and sign-in options are intentionally excluded. Better Auth's library endpoints have separate signed-session/login fixtures: forged/expired/revoked sessions, uninvited login, local OAuth/JWKS callback and missing state. Signing out the second account leaves the first signed session active. Mutations also require trusted origins.

## Data, cached state and migration evidence

- `ownership.integration-spec.ts`: unique known IDs, OR searches, counts/aggregates, updates and bulk deletion, local calendar, numbered references, preview, undo and parent references. Deferred domains cannot execute or preview.
- `google-security.integration-spec.ts`: durable state across restart, owner/login-session binding, expiry, concurrent single claim, ciphertext, provider-subject uniqueness, reconnect/refresh generations and disconnect without decryption keys.
- The integration runner replays all 17 migrations and seven maintenance rehearsals: approved-only ownership backfill, ambiguous-row quarantine, replay, atomic rollback, safe restore, plaintext-token refusal, encryption and key rotation.
- `config/runtime-config.spec.ts` and `http/*.spec.ts`: configuration failures without values, production origin/header policy, request bounds, spoof-resistant address quotas and bounded owner windows. HTTP integration also verifies quotas cannot be escaped by changing conversation keys.

This gate must pass together with the mandatory API and Web GitHub checks. Execution idempotency/durable confirmations remain JAR-017 onward; live Google verification and deployment remain separate launch gates. No evidence here authorizes deployment or real provider operations.
