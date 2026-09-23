# Jarvis project tracking

The execution tracker is in Notion. Update ticket status and evidence there as work progresses.

- [Project](https://app.notion.com/p/3e28931c9eb9818a897fe19ffab48a2b)
- [Tickets and board views](https://app.notion.com/p/789a53cbb3f949a2be6d915ff7161c40)
- [Audit reference](https://app.notion.com/p/3e28931c9eb981eb8f04eb3f453f96c6)
- [Rework plan reference](https://app.notion.com/p/3e28931c9eb9817ca101d39f5c978a27)

Initial snapshot, 21 September 2026: 46 tickets; 2 completed (audit and plan), 44 not started. Readiness and current status are maintained in Notion. The local execution-checkpoint.md (not versioned) records the latest work and resume instructions.

Owner direction, 23 September 2026: resume exactly one ticket, JAR-011 and its existing PR #10, then pause ticket processing again. The hourly automation was deleted after the earlier pause request; do not recreate it or start another ticket without a new instruction. Work remains local, with no purchases or deployment; GitHub and Notion updates remain authorized.

## Updating work

1. Re-read the ticket and its dependencies before starting.
2. Mark Status In progress when implementation starts.
3. Record branch/PR links, acceptance evidence, checks run and remaining limitations.
4. Mark Done only after acceptance criteria and required checks pass, review findings are resolved, and the PR is merged.
5. Reassess dependent tickets and update Readiness, explicit blockers and the project snapshot.

## Connector identifiers

- Projects data source: `56042072-35a4-4e00-acdb-654990d80b7e`
- Project page: `3e28931c-9eb9-818a-897f-e19ffab48a2b`
- Tickets data source: `c7ef45b1-c419-45db-8d77-206e4ecb5d1d`

## Ticket index

- [JAR-001 — Complete the codebase audit](https://app.notion.com/p/3e28931c9eb981ff8fccc71720b797f0?pvs=204)
- [JAR-002 — Define the private-beta roadmap and launch gates](https://app.notion.com/p/3e28931c9eb9816095d2e031f2e3953c?pvs=204)
- [JAR-003 — Make local setup and quality checks reproducible](https://app.notion.com/p/3e28931c9eb9815b8ca0c2bbdaf71a17?pvs=204)
- [JAR-004 — Resolve the two failing calendar routing tests](https://app.notion.com/p/3e28931c9eb981e1bb80e345e351943a?pvs=204)
- [JAR-005 — Sanitize assistant Markdown and the OAuth return page](https://app.notion.com/p/3e28931c9eb9813db7d0ef9f2e0c7d3e?pvs=204)
- [JAR-006 — Contain unsafe web access and developer-only surfaces](https://app.notion.com/p/3e28931c9eb981f0a4c9ccac6098acbf?pvs=204)
- [JAR-007 — Add isolated database and fake-provider integration fixtures](https://app.notion.com/p/3e28931c9eb9816f80bad598c746a846?pvs=204)
- [JAR-008 — Enforce CI and remove shipped-surface lint debt](https://app.notion.com/p/3e28931c9eb981c29b03f30c96a9002c?pvs=204)
- [JAR-009 — Complete and triage the dependency vulnerability check](https://app.notion.com/p/3e28931c9eb981e495bbd2bc3ac88ede?pvs=204)
- [JAR-010 — Choose authentication, hosting and beta operating constraints](https://app.notion.com/p/3e28931c9eb981089936c7942325ad5a?pvs=204)
- [JAR-011 — Implement invite-only accounts and guarded sessions](https://app.notion.com/p/3e28931c9eb98174807fcda2d396f056?pvs=204)
- [JAR-012 — Design and rehearse the legacy ownership migration](https://app.notion.com/p/3e28931c9eb98125ab7de48f9a0316be?pvs=204)
- [JAR-013 — Scope all retained data access and cached references by owner](https://app.notion.com/p/3e28931c9eb9811da88ce65b0813f130?pvs=204)
- [JAR-014 — Bind Google OAuth to accounts and encrypt stored tokens](https://app.notion.com/p/3e28931c9eb981bfbc8ad5f45d9fd76b?pvs=204)
- [JAR-015 — Validate runtime configuration and enforce API limits](https://app.notion.com/p/3e28931c9eb981038163f169691fd9a8?pvs=204)
- [JAR-016 — Verify the complete identity and ownership boundary](https://app.notion.com/p/3e28931c9eb9816488bacec1ffe6c9ed?pvs=204)
- [JAR-017 — Add a durable command journal and explicit state machine](https://app.notion.com/p/3e28931c9eb981158b65dd3b2c8f4e47?pvs=204)
- [JAR-018 — Make confirmation claims atomic and replay-safe](https://app.notion.com/p/3e28931c9eb9814681f9fecaed633ca7?pvs=204)
- [JAR-019 — Route chat and Inbox Zero through one execution policy](https://app.notion.com/p/3e28931c9eb981cc833ef13b9a160c6e?pvs=204)
- [JAR-020 — Prevent duplicate sends after partial Inbox Zero failures](https://app.notion.com/p/3e28931c9eb981348013d2acc2749392?pvs=204)
- [JAR-021 — Implement safe command cancellation and supported undo](https://app.notion.com/p/3e28931c9eb981ecaeeef314a2296633?pvs=204)
- [JAR-022 — Verify retries, crashes and unknown execution outcomes](https://app.notion.com/p/3e28931c9eb981549283d21031493df8?pvs=204)
- [JAR-023 — Extract domain tool handlers and a single tool definition contract](https://app.notion.com/p/3e28931c9eb981ad9011c1bf012d9c45?pvs=204)
- [JAR-024 — Separate assistant orchestration and inject all providers](https://app.notion.com/p/3e28931c9eb981f49b07f9cad4c80257?pvs=204)
- [JAR-025 — Publish typed API contracts and explicit failure outcomes](https://app.notion.com/p/3e28931c9eb981a98e48efe906bda296?pvs=204)
- [JAR-026 — Persist conversation history and bound query/cache behavior](https://app.notion.com/p/3e28931c9eb981eea2dbdca95d50674c?pvs=204)
- [JAR-027 — Disable deferred features and align capability claims](https://app.notion.com/p/3e28931c9eb981889b40cb074487f7f0?pvs=204)
- [JAR-028 — Prototype the five-area product and validate core flows](https://app.notion.com/p/3e28931c9eb981bc8402c8ad545a2018?pvs=204)
- [JAR-029 — Build onboarding and account-centered Settings](https://app.notion.com/p/3e28931c9eb981ba870cef9261cf4c97?pvs=204)
- [JAR-030 — Build Today with direct task and note controls](https://app.notion.com/p/3e28931c9eb9814482f4ec7a733b7789?pvs=204)
- [JAR-031 — Rebuild Inbox around review and per-item outcomes](https://app.notion.com/p/3e28931c9eb981b3b022d079716ad0dd?pvs=204)
- [JAR-032 — Fix chat cancellation, history and account-change races](https://app.notion.com/p/3e28931c9eb9810d85d6d347ef927c82?pvs=204)
- [JAR-033 — Add Activity and consistent recovery states](https://app.notion.com/p/3e28931c9eb98192ad71f588be413af8?pvs=204)
- [JAR-034 — Verify browser flows, accessibility and responsive behavior](https://app.notion.com/p/3e28931c9eb981f7b06ad26c4971facd?pvs=204)
- [JAR-035 — Build AI routing and prompt-injection evaluations](https://app.notion.com/p/3e28931c9eb981f2976cec562be6f990?pvs=204)
- [JAR-036 — Enforce model deadlines, quotas and cost budgets](https://app.notion.com/p/3e28931c9eb98138877bd92b37409c7a?pvs=204)
- [JAR-037 — Harden web retrieval or formally keep it disabled for beta](https://app.notion.com/p/3e28931c9eb9819aa91cfc2a86024bd2?pvs=204)
- [JAR-038 — Resolve Google scope and beta verification requirements](https://app.notion.com/p/3e28931c9eb981b7a9ced37baeaeff0f?pvs=204)
- [JAR-039 — Implement export, deletion, retention and data disclosures](https://app.notion.com/p/3e28931c9eb9811d8a24f8d197a52fa3?pvs=204)
- [JAR-040 — Add production monitoring and a mutation kill switch](https://app.notion.com/p/3e28931c9eb981fdaf44c08b226ff103?pvs=204)
- [JAR-041 — Rehearse deployment, migrations, restore and rollback](https://app.notion.com/p/3e28931c9eb981578098ce3fcf62b9f8?pvs=204)
- [JAR-042 — Review every launch gate with recorded evidence](https://app.notion.com/p/3e28931c9eb981a68645db8d7575354c?pvs=204)
- [JAR-043 — Prepare beta onboarding, support and success metrics](https://app.notion.com/p/3e28931c9eb9814eb177ca92a92b6531?pvs=204)
- [JAR-044 — Release to the approved private-beta cohort](https://app.notion.com/p/3e28931c9eb98172be8bf22b9225505d?pvs=204)
- [JAR-045 — Observe two weeks of beta usage and prioritize feedback](https://app.notion.com/p/3e28931c9eb981029a6bc99dbb8f0061?pvs=204)
- [JAR-046 — Decide whether to expand the beta](https://app.notion.com/p/3e28931c9eb98120be27e58c74eac085?pvs=204)
