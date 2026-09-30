# Versioned HTTP contracts

`contracts/v1.ts` is the canonical definition of the chat, status and Inbox response shapes and command replay states. Zod derives TypeScript types from the same schemas that validate runtime data. The dependency is pinned in both applications; it avoids maintaining a separate handwritten validator that can disagree with its type declarations.

Run `node scripts/sync-contracts.mjs` after changing the canonical source. Generated copies are committed under `api/src/contracts` and `web/src/core/contracts`. Each application's typecheck verifies byte-for-byte agreement with the canonical source, including in required CI. This preserves independent application installs and the existing Nest output layout without introducing a workspace build dependency.

Controller interceptors validate the serialized JSON shape (including Date serialization), return only schema fields and advertise `X-Jarvis-Contract: 1`. Invalid outgoing structures fail with 502/INVALID_RESPONSE and a sanitized message. The browser validates each endpoint before passing data to stores. A valid JSON document is insufficient if required fields or nested states are invalid. Existing browser types re-export schema-inferred types.

This boundary does not prove that an external mutation failed when its response cannot be validated. It must never trigger an automatic retry. Journal replay and Inbox operation identifiers retain their existing behavior.

JAR-025 remains unfinished: request contracts, uniform error categories, provider/model validation and explicit partial/unknown outcomes still need completion. The schemas describe the current wire surface; this milestone is not a claim that every business outcome is already discriminated.
