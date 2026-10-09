# JAR-042 — Launch gate review

Reviewed 8 October 2026 on branch `jar-040-monitoring-kill-switch` (main `33db481` + unmerged JAR-036/040/041 commits). Owner of every gate: the repository owner (single-person project). Results use only what was run or recorded; a ticket marked done is not treated as verified readiness.

## Decision: **NO-GO for external invitations today**

Three gates are open on owner actions or stale evidence, and the new readiness work is not yet merged or run in CI. Engineering work for the remaining gates is in place. Reminders stay deferred (decision 0001) and web retrieval stays disabled (`docs/security/web-retrieval-beta-decision.md`), so neither conditional scope blocks launch.

## Checks run for this review

API unit 680 passed; PostgreSQL integration 22 suites / 155 tests passed; runner tests 4 passed; API typecheck, lint, format and build clean; web typecheck, lint, build clean and 111 tests passed; `npm run rehearse:deployment` 5/5. CI was not run for the three unmerged branches.

## Gates

| # | Gate | Result | Evidence and gap |
| --- | --- | --- | --- |
| 1 | Private endpoints authenticate; cross-user tests pass | **Pass** | Ownership matrix (#15) and integration suite 155/155 today. |
| 2 | Unsafe HTML/URLs/network or feature disabled | **Pass (feature disabled)** | Markup sanitised (#1); web retrieval disabled server-side and tested (JAR-037 decision). No fetcher exists to attack. |
| 3 | OAuth ownership, expiry, revocation, encrypted tokens, redaction | **Open** | Implementation and tests merged (#13, #32). Google Cloud Console inspection (External/Testing, test users, scopes, redirect URI) is an owner action recorded as the JAR-038 blocker. No external invitation before it. |
| 4 | No duplicate external effect; safe unknown-outcome recovery | **Pass (automated)** | Journal, claims, partial-send recovery, retries/crash tests (#16–#20, JAR-022) run in the integration suite. No live Gmail/Calendar test was performed. |
| 5 | Simulation and capabilities enforced at every execution entry point | **Pass (automated)** | Shared policy (#18), deferred capabilities (JAR-027), kill switch on executor and Inbox reply sender (JAR-040). Personal-memory and preference writes are not command executions and are not covered by the kill switch. |
| 6 | Typecheck, build, lint, tests in CI; migration replay fresh + legacy | **Partial** | All pass locally today; fresh and legacy-upgrade replay passed in the rehearsal. CI has not run on JAR-036/040/041 because they are unpushed. |
| 7 | Dependencies checked and triaged | **Open (stale)** | Last scan 22 September: 0 vulnerabilities after fixes. Dependencies changed since; a new scan discloses package names to the npm registry and needs your explicit authorization. |
| 8 | Onboarding, inbox, tasks/calendar, history, cancellation, recovery in browser tests | **Pass** | JAR-034 Playwright evidence (#30), 111 web tests today. |
| 9 | Keyboard, screen reader, narrow layouts, contrast | **Open** | axe: 0 WCAG A/AA violations across 5 screens × 2 themes × 3 widths; keyboard and reduced-motion covered. A real VoiceOver pass is an owner action (JAR-034 blocker). |
| 10 | Export, delete, retention, provider access | **Partial** | Data controls merged (#31) with automated tests. Real-browser verification of export, deletion, resume and mobile was still listed as remaining in the last checkpoint and is not re-verified here. Provider-access requirements depend on gate 3. |
| 11 | Quotas, monitoring, support, backups, restore, rollout, rollback rehearsed | **Pass locally, unmerged** | Model/user budgets (JAR-036), readiness/alerts/kill switch (JAR-040), restore and rollback drills and image (JAR-041), support doc (#33). In-memory counters, log-only alerts, readiness does not check migration state, disposable local Postgres as staging. |
| 12 | Shipped capabilities match claims; deferred tools disabled server-side | **Pass (automated)** | JAR-027 and the JAR-035 evaluations run in the unit suite. Copy review by the owner not recorded. |

## Residual risks

- No duplicate-effect or isolation defect is known, but nothing was exercised against live Google.
- Budgets and metrics are per-process and reset on restart; no spending cap exists.
- No hosted staging, pager or secret manager; recovery depends on the owner being present.
- JAR-043 targets (4/5 activation in 24 h, 3/5 repeated use) and feedback channel are unconfirmed.

## To reach GO

1. Merge JAR-036/040/041 through CI.
2. Owner: Google Console inspection and dated proof (gate 3).
3. Owner: VoiceOver smoke test (gate 9) and a real-browser export/delete check (gate 10).
4. Owner: authorize a fresh dependency scan, then triage (gate 7).
5. Owner: confirm JAR-043 targets and feedback channel.
