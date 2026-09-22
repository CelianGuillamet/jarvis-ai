# JAR-010 — Proposed private-beta operating model

Status: **Proposed; owner confirmation pending.** Prepared 22 September 2026 against `a0c69f6`.

The confirmed launch target is a private beta for individual users. The choices below make the next implementation work concrete; they do not record approval, authorize spending, provision infrastructure, or authorize deployment.

## Proposed decisions

| Area | Proposal | Confirmation |
| --- | --- | --- |
| Authentication | Invite-only Google sign-in through Better Auth, with PostgreSQL-backed application sessions | Engineering recommendation; compatibility gate below |
| Hosting | Render, Frankfurt: one application service and managed PostgreSQL in the same region | Owner confirmation pending |
| Operating budget | €100/month total planning ceiling: up to €60 infrastructure, €30 model use, €10 contingency | Owner confirmation pending; not a provider quote or spending authorization |
| First complete language | French, including onboarding, errors and account settings | Owner confirmation pending |
| Initial cohort | Five invited individual users; expansion requires a separate review | Owner confirmation pending |
| Reminders | Defer scheduled notification delivery in the first beta; remove delivery promises and creation entry points | Owner confirmation pending |

## Authentication implementation contract

Use a maintained authentication library for provider verification, callback state and session lifecycle. Better Auth documents Google sign-in and Prisma 7/PostgreSQL integration. Keep the local User ID as the authorization subject. Google identity is keyed by the verified provider subject; a client-supplied conversation/session ID never identifies an account.

Admission must be enforced on the server before account/session creation using an active invite and a verified Google email. No open signup, password login, or email-only automatic account linking. Invite revocation must prevent new access, with session revocation handled explicitly. Authentication scopes stay separate from Gmail/Calendar authorization: signing in does not grant permission to read or change those services.

Serve the UI and API behind one application origin. Use Secure, HttpOnly cookies in production, explicit trusted origins, CSRF/origin protections for mutations, server-side expiry and logout/revocation. Do not put application or Google tokens in browser local storage. Bind provider callbacks to the authenticated account in JAR-014; retain its encryption and cross-user tests as mandatory gates.

**Compatibility gate in JAR-011:** Better Auth's documented Express integration requires ESM and mounting the auth handler before the body parser. The current Nest application must prove compatibility with its actual module output, Prisma adapter and Express version before the auth dependency is locked. Exercise login callback, invite denial, session expiry/logout and guarded endpoints in isolated tests. Make any module-format migration a separate reviewable commit. A failed compatibility check requires a revised engineering decision, not custom authentication cryptography or bypassed checks. No package is added by this decision record.

Sources checked 22 September 2026: [Google provider](https://better-auth.com/docs/authentication/google), [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [Express integration](https://better-auth.com/docs/integrations/express).

## Hosting and cost controls

Frankfurt is a supported Render region. Keep application and database there so the service can use the regional private database connection. Serve built Vue assets through the application origin to simplify cookies and routing. Use a paid persistent database with a tested backup/restore plan; do not base the beta on a temporary/free database. Final sizing and plan selection follow measured memory/load and recovery requirements in JAR-041.

The €100 ceiling is a proposed product constraint, not a claim that a specific deployment costs €100. Before provisioning, record current provider quotes, database/storage/backup costs, model budget, applicable taxes and currency conversion. If the complete estimate exceeds the ceiling, revise the proposal before spending. No paid resources are created by this ticket. Model quotas and a fail-closed spend cap remain JAR-036 implementation work; a provider billing alert alone is insufficient.

Frankfurt hosting does not imply that Google, model processing, logs or every subprocessor stays in the EU. Document actual data flows and provider arrangements under JAR-038/JAR-039 before invitations; make no unsupported residency or compliance promise.

Sources: [Render regions](https://render.com/docs/regions), [Postgres connections](https://render.com/docs/postgresql-creating-connecting), [current pricing](https://render.com/pricing). Prices must be rechecked at the deployment decision.

## Scope consequences and handoff

- JAR-011: implement the selected auth approach only after this decision is confirmed and the compatibility gate passes.
- JAR-012–016: migration, ownership and integration isolation remain required; successful sign-in alone does not prove data isolation.
- JAR-027/028/029/043: design French-first copy for a five-person invite flow, with no scheduled-reminder promises if the deferral is accepted. Existing reminder records must be preserved for export/migration; do not delete them as UI cleanup.
- JAR-036/040/041: enforce the agreed cost limits, observe failures, and rehearse backups/recovery before any deployment instruction.
- JAR-038: verify Google distribution/scope requirements for the actual cohort. Five users is a product proposal, not an exemption from provider requirements.

Alternative: shipping reminder delivery now adds a durable worker, timezone/recurrence handling, retries/deduplication, consent and delivery-state support. Choose this only with an explicit scope revision; existing stored reminders are not evidence of delivery capability.

## Decision log

| Decision | Evidence |
| --- | --- |
| Private beta for individual users | Confirmed by the owner in this task |
| Language, cohort, reminder scope, hosting and budget | Awaiting owner response to this proposal |
| Auth approach | Proposed engineering choice; compatibility test and locked dependency version still required |
| Deployment | Not authorized |

JAR-010 remains In progress/Blocked while confirmation is missing. Keep the proposal PR unmerged. After an explicit response, record it here, revise affected choices, run required PR checks, merge, then mark the ticket Done and reassess dependents. Silence or a timer does not count as confirmation.
