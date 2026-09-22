# JAR-010 — Private-beta operating model

Status: **Accepted for local implementation; first version French only; user feedback deferred.** Prepared 22 September 2026 against `a0c69f6`.

The confirmed eventual launch target is a private beta for individual users. On 22 September 2026 the owner instructed: “don't buy anything , for now everything is local”. This supersedes the earlier Frankfurt/€100 proposal. The owner subsequently instructed: “french only first” and “feedback way later continu coding”. This authorizes continued local implementation and defers representative feedback. Five invitees and deferred reminder delivery remain reversible engineering/planning assumptions, not claims of explicit owner approval or actual invitations. No spending, provisioning or deployment is authorized.

## Operating decisions

| Area | Proposal | Confirmation |
| --- | --- | --- |
| Authentication | Invite-only Google sign-in through Better Auth, with PostgreSQL-backed application sessions | Engineering recommendation; compatibility gate below |
| Hosting | Local machine only; hosted infrastructure and region deferred | Confirmed by owner, 22 September 2026 |
| Operating budget | No purchases or new paid resources; zero authorized incremental spend | Confirmed by owner, 22 September 2026 |
| First complete language | French only, including onboarding, errors and account settings | Explicitly confirmed by owner, 22 September 2026 |
| Initial cohort | Five invited individual users; expansion requires a separate review | Provisional planning assumption; does not block coding |
| Reminders | Defer scheduled notification delivery in the first beta; remove delivery promises and creation entry points | Provisional planning assumption; does not block coding |

## Authentication implementation contract

Use a maintained authentication library for provider verification, callback state and session lifecycle. Better Auth documents Google sign-in and Prisma 7/PostgreSQL integration. Keep the local User ID as the authorization subject. Google identity is keyed by the verified provider subject; a client-supplied conversation/session ID never identifies an account.

Admission must be enforced on the server before account/session creation using an active invite and a verified Google email. No open signup, password login, or email-only automatic account linking. Invite revocation must prevent new access, with session revocation handled explicitly. Authentication scopes stay separate from Gmail/Calendar authorization: signing in does not grant permission to read or change those services.

Serve the UI and API behind one application origin. Use Secure, HttpOnly cookies in production, explicit trusted origins, CSRF/origin protections for mutations, server-side expiry and logout/revocation. Do not put application or Google tokens in browser local storage. Bind provider callbacks to the authenticated account in JAR-014; retain its encryption and cross-user tests as mandatory gates.

**Compatibility gate in JAR-011:** Better Auth's documented Express integration requires ESM and mounting the auth handler before the body parser. The current Nest application must prove compatibility with its actual module output, Prisma adapter and Express version before the auth dependency is locked. Exercise login callback, invite denial, session expiry/logout and guarded endpoints in isolated tests. Make any module-format migration a separate reviewable commit. A failed compatibility check requires a revised engineering decision, not custom authentication cryptography or bypassed checks. No package is added by this decision record.

Sources checked 22 September 2026: [Google provider](https://better-auth.com/docs/authentication/google), [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [Express integration](https://better-auth.com/docs/integrations/express).

## Hosting and cost controls

Run the application, database, prototype and validation locally. Use local models or fake providers for development and tests. Do not provision hosted resources, buy subscriptions or credits, redeem resets, or initiate paid model/API calls. No external deployment is authorized.

A hosting vendor, region and future operating budget are deferred until the owner requests deployment planning. The previous Render Frankfurt/€100 recommendation is withdrawn as the current operating proposal. These deferred choices do not block local engineering. GitHub PRs and Notion tracking remain the previously authorized collaboration workflow; they do not deploy the application.

Future Google sign-in and provider integrations remain design targets, not authorization to connect real accounts now. Verify their behavior using isolated fixtures locally. Local operation does not waive identity, ownership, privacy or execution-safety criteria for an eventual beta.

## Scope consequences and handoff

- JAR-011: implement the selected auth approach under this implementation authorization after the compatibility gate passes.
- JAR-012–016: migration, ownership and integration isolation remain required; successful sign-in alone does not prove data isolation.
- JAR-027/028/029/043: design French-first copy for a five-person invite flow, with no scheduled-reminder promises under the provisional deferral. Existing reminder records must be preserved for export/migration; do not delete them as UI cleanup.
- JAR-036/040/041: enforce the agreed cost limits, observe failures, and rehearse backups/recovery before any deployment instruction.
- JAR-038: verify Google distribution/scope requirements for the actual cohort. Five users is a product proposal, not an exemption from provider requirements.

Alternative: shipping reminder delivery now adds a durable worker, timezone/recurrence handling, retries/deduplication, consent and delivery-state support. Choose this only with an explicit scope revision; existing stored reminders are not evidence of delivery capability.

## Decision log

| Decision | Evidence |
| --- | --- |
| Private beta for individual users | Confirmed by the owner in this task |
| Local operation and no purchases | Explicit owner instruction on 22 September 2026; hosted vendor/region/budget deferred |
| Language | Owner explicitly confirmed French only for the first version |
| Cohort and reminder scope | Five invitees / deferred delivery retained as reversible planning assumptions under the instruction to continue coding |
| Representative user feedback | Explicitly deferred until later by owner; no invented feedback or claim of user validation |
| Auth approach | Proposed engineering choice; compatibility test and locked dependency version still required |
| Deployment | Not authorized |

The owner instruction supersedes the former confirmation/feedback blockers for local coding. Merge this record after required checks, then mark JAR-010 Done and begin JAR-011. Keep real-user feedback as a later validation requirement before external release, not a prerequisite for implementation. Revisit provisional cohort/reminder choices when the owner supplies different preferences.
