# Owned application data — JAR-013

Authenticated HTTP entry points resolve the browser's conversation key through
`ConversationService` using the verified request user. The same browser key creates
different server-generated conversation IDs for different users. A known canonical
ID belonging to another user returns 404. Client keys are aliases, never ownership
proof. Chat, confirmation, status, Inbox Zero and Google authorization use this
boundary. The OAuth callback checks the current owner before accessing tokens.

## Query and cache contract

Account-level Todo, Note, ShoppingItem and CalendarEvent queries use
`PrismaService.forConversation`. It resolves the stored owner and returns an explicit
Prisma extension that filters reads, aggregates, mutations and upserts by owner.
Writes supply that owner, reject reassignment and nested owner writes, and reject
unsupported operations. A conditional native upsert returning no row fails rather
than reporting success. Database foreign keys and non-null constraints prohibit
ownerless records. This is application enforcement, not PostgreSQL row security.

Conversation-level data retains explicit canonical `sessionId` predicates. Server
memory, pending actions, cached list references and undo entries use that canonical
ID. Reminder snooze, goal status/parent links, scheduling, contextual help and audit
updates now include the conversation predicate. Task dependency links require both
tasks to belong to the owner. Search, status counts, local calendar and undo use the
same scoped domain client as ordinary writes.

New HTTP routes must resolve identity before calling internal services. New domain
operations must use the scoped client; raw Prisma is reserved for authentication,
conversation resolution and explicit administrative maintenance. Do not expose raw
queries, relation traversal or a browser-supplied owner through a tool context.

Deferred finance, habits, delegation, analytics, resources, reminders and permanent
email deletion are denied at both tool preview and execution. Deferred providers are
absent from aggregate tool context; status exposes no stored reminder/habit data.
Capability descriptions will be aligned in JAR-027.

## Maintenance cutover and recovery

Follow [the legacy migration procedure](legacy-ownership-migration.md) with writers
stopped and a verified full backup. Review mappings at the expansion migration
before applying the remaining migrations. Do not run a blanket migrate-deploy on an
existing database expecting a mapping window between migrations.

`20260928150000_owned_conversations` adds per-owner aliases to existing explicitly
owned conversations. `20260928160000_ownership_contract` preserves already assigned
rows, snapshots every remaining ownerless domain row into the operator-only
`ownership-contract-20260928` batch, removes those rows from live domain tables and
sets all four owner columns non-null in one locked transaction. It assigns no owner
and fabricates no mapping approval. Fresh databases also apply this safely.

Historical browser-session records and Google tokens are not automatically adopted
by new accounts. They remain physically in their existing tables, inaccessible
through newly resolved conversation aliases; this differs from the explicit
four-table snapshot quarantine. Their retention and deletion require JAR-039.
Google integration binding, encryption and durable OAuth state require JAR-014.

After the non-null contract, do not restore ownerless snapshots into the live schema
or restart the old ownerless writer. Restore the full pre-cutover backup into a
separate local database, inspect it and use the corresponding application revision
before switching connections. This ticket runs migrations only on disposable test
databases, not the user's application database.

## Evidence and remaining gates

Real PostgreSQL two-account tests cover identical browser aliases, foreign canonical
IDs at HTTP boundaries, known foreign object IDs, owner reassignment, bulk writes,
upserts, counts/aggregates/search, calendar, cached references, undo, reminder snooze,
goal status/parents and deferred execution. An OAuth regression rejects the wrong
owner before any token read or exchange. Five migration rehearsals include exact
snapshot preservation, transactional failure/restore behavior and non-null cutover.

JAR-016 remains the combined identity/integration security gate. Durable command
execution, browser account-change races and retention have separate tickets; these
checks alone do not establish readiness for external beta users.
