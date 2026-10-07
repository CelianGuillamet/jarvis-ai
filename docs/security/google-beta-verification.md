# JAR-038 — Google scopes and private-beta provider gate

Reviewed 7 October 2026. This is a repository and public-policy review, not a Google Cloud Console inspection or provider approval. The current operating decision in [JAR-010](../decisions/0001-private-beta-operating-model.md) is local-only development with no real-account connection, hosting or external invitations authorized. Five individual invitees are a provisional cohort assumption, not a confirmed distribution or a Google exemption.

## Minimum integration consent

Application sign-in requests basic Google identity through Better Auth; it does not grant Gmail or Calendar access. The separate, account-bound integration OAuth request in `api/src/google/google-auth.service.ts` asks for `openid` to verify the linking identity and these scopes from `api/src/google/google-scopes.ts`:

| Scope | Required use in current beta code | Provider classification / rationale |
| --- | --- | --- |
| `calendar.calendarlist.readonly` | `calendarList.list` selects visible calendars for event browsing | Narrower than `calendar.readonly` for this endpoint; used with event access below |
| `calendar.events` | Event list, insert, patch and delete | Event write permission also allows event reads |
| `gmail.modify` | Message list/full read, label changes, trash/untrash and send | Restricted scope; the Gmail `messages.send` endpoint accepts it |

`gmail.readonly`, `gmail.send`, `gmail.compose`, `gmail.labels` and broad `calendar.readonly` were removed from the requested set because they duplicate coverage or add unrelated access. Permanent Gmail deletion is deferred by server capability policy; it needs `https://mail.google.com/` and is **not** covered by `gmail.modify`. The integration still stores/transmits message content for current inbox and model-assisted drafting flows. Existing grants can retain previously authorized scopes: changing the request does not revoke a user's old Google grant. Reconnect and inspect actual granted scopes during provider validation; an owner should revoke older grants if narrowing must be enforced at the provider.

The local capability status now requires the exact scopes needed by its API path. Calendar event browsing needs both calendar-list access and event-read access. Gmail send-only or compose-only access cannot be reported as an inbox connection. Google's [messages.get scope contract](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) does not accept `gmail.compose`; the read gate now rejects it while retaining its send capability. These checks are local safeguards; they do not prove Google granted the scopes or that a real API call works.

## Applicable Google route and distribution decision

Google's [restricted-scope guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) lists development/testing/staging as a verification exception when the project remains in **Testing** and users are on its test-user list. [Google's audience rules](https://support.google.com/cloud/answer/15549945?hl=en) limit external Testing to up to 100 listed test users, warn testers, and expire authorizations including offline refresh tokens after seven days for non-basic scopes. This is a **verified published-policy exception for development/testing**, not evidence that this project's console is configured that way. Local fixture work does not request access to real Google accounts and can continue without provider submission. The Testing exception is a candidate route only: its applicability to this project's OAuth access remains unverified until the console configuration and actual cohort are evidenced.

The proposed five-person external cohort is not itself proof of personal-use eligibility: whether every participant is personally known is unconfirmed. Do not rely on that exception. Google classifies `gmail.modify` as restricted in its [Gmail scope table](https://developers.google.com/workspace/gmail/api/auth/scopes). For a production distribution without an applicable exception, Google's restricted-scope verification applies; its [guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) says access to restricted user data through a third-party server can require an independent security assessment. Jarvis has a server that processes/transmits Gmail content, so plan for assessment unless Google confirms a relevant exception for the actual distribution and configuration. A small invite list alone does not establish approval, assessment completion or production eligibility.

No external invitation may be released based on this document alone. Before any release, the owner must choose and record **one** evidenced route:

1. **Testing cohort:** confirm in Google Cloud Console that the relevant OAuth project is External / Testing, the actual invitees are added as test users, the consent-screen Data Access scopes match the live request, the OAuth client redirect URI matches the deployed/local origin, and the lifetime/cap/warning are acceptable for the intended cohort. Record a redacted dated screenshot or exported configuration and a dedicated test-account consent/API result. Keep the cohort inside testing; do not present this as production verification.
2. **Production distribution:** record Google's completed restricted-scope/brand approval and any required security assessment for the exact client, scopes and server data flow. A submission, pending review or unverified-app warning is not approval. Recheck if scopes, architecture or distribution change.

Also check Workspace organization policies for each test account; a project test-user listing does not override a domain administrator's restrictions. Never record client secrets, tokens, message content or personal addresses in this evidence.

## Evidence and handoff

| Item | Result / remaining evidence |
| --- | --- |
| Code and scope inventory | Reviewed `google-auth.service.ts`, `google-scopes.ts`, Gmail/Calendar providers, tool gates and deferred capability policy; narrowed the request and added exact-scope tests. |
| Public Google requirements | Reviewed the linked Google developer/support pages on 7 October 2026. Testing exception and restricted-scope classification are documented above. |
| Actual Cloud Console project, consent screen, OAuth client and test-user list | **Not inspected**; this task is restricted to the worktree and no external account access is authorized. Configuration, publishing status and invite eligibility remain unverified. |
| Google approval / security assessment | **No completion evidence** in the repository; applicability to any eventual production distribution must be resolved with the actual configuration and data flow. |
| Live consent, refresh, API use and revocation | **Not run**; see [JAR-014 live checklist](google-authorization.md#verification). |
| Release decision | **Blocked for external invitations** until the chosen route above has dated project-specific evidence and the other private-beta launch gates pass. |

## Verification feedback follow-up — 7 October 2026

The coordinator's integration run found an obsolete pre-revocation assertion: `gmail.send` was expected to report inbox access. The test now asserts a connected Google grant with no inbox access and explicitly checks that `gmail.send` is allowed before consuming the approval. Its existing assertions still require revoked access to prevent provider execution and prevent replay after restart. This preserves the send-only fixture and the safety test rather than broadening consent to make the assertion pass.

Implementation and regression coverage:

- [Scope predicates](../../api/src/google/google-scopes.ts): reject compose-only consent for message reads; sending remains allowed.
- [Scope tests](../../api/src/google/google-scopes.spec.ts): partial Gmail grants, metadata-only consent, absent/revoked grants and exact scope matching.
- [Tool gate tests](../../api/src/jarvis/tools/tool-engine.spec.ts): send-only and compose-only grants permit sending but reject inbox reads.
- [Integration revocation scenario](../../api/test/integration/execution-failure-gate.integration-spec.ts): validates the actual send capability before revocation, then retains the execution/replay checks.

## Prompt regression follow-up — 7 October 2026

The assistant previously interpreted inbox connectivity as permission for every Gmail tool. This incorrectly discouraged sending with legacy send-only or compose-only grants even though the server allowed it. [The assistant prompt](../../api/src/jarvis/services/jarvis.service.ts) now describes Gmail read, send and modification permissions separately using the same scope predicates as the tool gate. Calendar read and write permissions are also independent, so event-write consent without calendar-list access does not imply browsing access or disable writes. Missing capabilities require additional consent; sending without read access requires user-supplied details. Permanent deletion remains deferred.

[Prompt regression tests](../../api/src/jarvis/services/jarvis.service.spec.ts) exercise the public chat path and inspect the actual model input for send-only, compose-only, read-only, modify, metadata-only, absent and revoked Gmail grants, plus partial/read-only/full Calendar grants. These fixture tests prove the prompt construction, not real model compliance or provider approval.

Current checks, rebased on `main` after JAR-039 (7 October 2026):

- `npm --prefix api test`: **passed**, 78 suites / 539 tests. The JAR-039 privacy disclosure test was updated to expect `gmail.modify` instead of the removed `gmail.send` request scope.
- `npm --prefix api run test:integration` with Docker access: **passed**, 20 suites / 149 tests, including the edited revocation scenario in `execution-failure-gate.integration-spec.ts`.
- `npm --prefix api run typecheck`, `npm --prefix api run lint`, `npm --prefix api run format:check`: **passed**.
- No live Google consent, console inspection, approval submission, external account access or invitation occurred.

This record must be revisited when the cohort, publishing status, scopes, hosting or data processing changes.

Acceptance status: minimum requested scopes and provisional distribution are documented. **Project-specific approval or applicable-exception evidence is still missing; JAR-038 is not ready for Done or external invitations.** No Google account, console, invitation or deployment was accessed or changed. The owner must attach the dated project/client identity, chosen route, actual cohort count and eligibility, console scope/audience/redirect evidence, consent/API/refresh/revocation results, reviewer identity and approval or exception rationale before clearing the release gate. For production, include assessment evidence and its expiry where required. Store only redacted evidence references here.
