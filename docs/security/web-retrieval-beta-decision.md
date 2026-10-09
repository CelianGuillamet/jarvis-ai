# JAR-037 — Web retrieval stays disabled for the private beta

Status: **Decision recorded 8 October 2026 against `33db481`.** Web search and page reading are not part of the first private beta.

## Decision

`web.search` and `web.open` are disabled server-side. There is no runtime flag, environment variable or per-user setting that re-enables them. The module binds `WEB_PROVIDER` to `DisabledWebProvider`, which rejects every call before any network access, and the tool handlers return `WEB_DISABLED_MESSAGE` without touching the injected provider. The model prompt does not advertise either tool.

## Why not harden now

A safe fetcher needs resolved-address and connection binding, IPv6 parsing, per-hop redirect revalidation, egress controls, response byte limits and body deadlines. That surface is large, the beta is local-only with no egress infrastructure, and nothing in the five-area beta flows depends on it. Hardening is deferred, not abandoned.

## Evidence

- `api/src/jarvis/providers/web.provider.spec.ts`: `DisabledWebProvider` rejects search and open (including `http://[::1]` and `http://169.254.169.254/`) and never calls `fetch`.
- `api/src/jarvis/tools/tools.web.spec.ts`: direct tool calls return the disabled message with and without simulation, never invoke an injected provider, never call `fetch`; the system prompt omits both tools.
- No internal endpoint is probed: tests use rejected `fetch` spies, not live requests.

## Conditions to re-enable (new ticket required)

1. A hardened provider with fixtures for internal addresses, DNS rebinding, redirects to internal hosts, oversized responses and slow bodies, all run against isolated fixtures only.
2. Egress policy reviewed with JAR-040.
3. Prompt-injection evaluations (JAR-035) extended to retrieved page content.
4. Capability claims and privacy disclosures updated.

## Limitations

`direct-intent.ts` and `jarvis.service.ts` still contain web routing and summarisation code paths. They are unreachable in effect because every call returns the disabled message, but they are dead code until retrieval returns. The unused `WEB_AUTO_OPEN_*` values in `api/.env` have no effect.
