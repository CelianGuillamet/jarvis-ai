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

The local capability status now requires the exact scopes needed by its API path. Calendar event browsing needs both calendar-list access and event-read access. Gmail send-only access cannot be reported as an inbox connection. These checks are local safeguards; they do not prove Google granted the scopes or that a real API call works.

## Applicable Google route and distribution decision

Google's [restricted-scope guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) lists development/testing/staging as a verification exception when the project remains in **Testing** and users are on its test-user list. [Google's audience rules](https://support.google.com/cloud/answer/15549945?hl=en) limit external Testing to up to 100 listed test users, warn testers, and expire authorizations including offline refresh tokens after seven days for non-basic scopes. This is a **verified published-policy exception for development/testing**, not evidence that this project's console is configured that way. The current local-only development falls within the published development/testing category; no provider submission is required to continue local fixture work.

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

## Local verification — 7 October 2026

- API targeted Jest suites (`google-scopes`, `google-auth.service`, `tool-engine`): **19 tests passed** in the final rerun, including the permanent-deletion gate.
- `npm run typecheck`, `npm run lint`, `npm run build` in `api/`: **passed** in the final rerun.
- Full `npm test -- --runInBand`: **failed** in this restricted worktree: 57 suites passed, 4 failed (397 tests passed, 25 failed). The failures were HTTP/Supertest suites trying to listen on `0.0.0.0`, rejected by the filesystem/network sandbox with `EPERM`. This is not a passed full-suite claim and is not evidence of a product defect in the changed scope code.
- No integration database suite, live Google consent or external deployment was run.

This record must be revisited when the cohort, publishing status, scopes, hosting or data processing changes.
