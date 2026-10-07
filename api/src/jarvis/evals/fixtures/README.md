# Assistant evaluation fixtures

Deterministic checks of the assistant's policy boundaries. They never call a model or a provider; `npm test` runs them through `jarvis-evals.spec.ts`.

| File | Checks |
|---|---|
| `intent-routing.fr.v1.json` | French utterances routed by the deterministic router to the expected tool |
| `ambiguity.fr.v1.json` | Ambiguous utterances that must not be routed to a tool |
| `timezone.v1.json` | `Europe/Paris` resolution around daylight-saving changes |
| `malformed-tool-calls.v1.json` | Model output that must be rejected by the parser |
| `permissions.v1.json` | Google scope gating per tool |
| `untrusted-content.v1.json` | Model-planned actions after third-party email/calendar content require confirmation |

## Rules

- Fixtures are synthetic and redacted. Never paste real mail, names, phone numbers or account data; only `example.com`, `example.org` and `evil.example` addresses are accepted and long digit runs are rejected by the runner.
- A user-consented real failure is rewritten into a synthetic case before it is added.
- Every case has a unique `id` and a `status`:
  - `pass`: the expectation must hold.
  - `known_gap`: a retained failure with a `gap` explanation. The runner requires the expectation to still fail; when a fix makes it hold, the test fails so the case is promoted to `pass`.
- Bump the file version suffix only for an incompatible format change.

## Adding a regression

1. Add a case with `status: "known_gap"` and a `gap` description when the behavior is wrong today and not fixed yet; otherwise `status: "pass"`.
2. Run `npm test -- src/jarvis/evals`.
