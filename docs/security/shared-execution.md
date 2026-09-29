# Shared command execution

Chat and Inbox Zero use `CommandExecutionService` for domain mutations. Each adapter supplies the authenticated conversation owner, concrete tool name, arguments, target snapshots and required capabilities. The executor checks the policy before entering the mutation callback and records intent before effects. Simulation uses a separate callback; it cannot enter the provider/local mutation callback.

## Entry-point review

| Entry point | Execution boundary |
| --- | --- |
| Chat immediate tools | `JarvisService.executeTool` sends every `TOOL_META.sideEffect` tool through the executor. Read-only tools remain outside it. |
| Chat confirmation / confirm endpoint | The existing pending adapter atomically claims the saved command once; the shared executor checks owner, conversation, tool, source and executing state. The adapter persists the final rendered response. |
| Inbox apply / apply recommended | Each resolved item runs through the executor. Compound replies require send and modify permissions before either effect. Deferred operations are refused. |
| Mission planning | Classified as a mutation because it saves a plan. Saving runs inside the callback; a missing save result throws instead of reporting completion. |
| Undo | Enters through the same chat mutation path. Durable undo and cancellation semantics remain JAR-021. |
| Other local domain tools | Todo, shopping, notes, memory, missions, goals, dependencies, scheduling, help, knowledge, time and contacts use mutation metadata and the authenticated owner-scoped context. Deferred families remain gated. |

Production calls to `runTool` are confined to `JarvisService.executeTool`. Follow-up choices and workflow suggestions propose subsequent calls; their eventual execution uses this same boundary. Calendar/Gmail provider mutations occur in the tool callback or the Inbox callback. Session/authentication/OAuth lifecycle operations and derived conversation/audit/cache/scan/navigation metadata are not domain commands; their authenticated ownership controls remain separate.

## Targets and accounts

Calendar update/delete, Gmail selections and todo/shopping/note mutations resolve concrete snapshots before command execution or confirmation. Confirmations persist those snapshots in their immutable digest; a later list cannot change their meaning. Bulk local mutations intersect saved IDs so newly added rows are preserved. Missing legacy snapshots are non-executable.

Google commands capture the integration ID and provider subject. Confirmation rechecks that identity at claim; credential loading rechecks it inside an isolated asynchronous execution context. Inbox scans store the original identity with each item and execution rejects old/unbound scans or a changed account. No integration foreign key erases that evidence on disconnect.

## Outcomes and limits

Immediate chat and Inbox execution record proposed, waiting, approval, executing and completed transitions. `source` is immutable and separates these commands from pending confirmation replay. A callback exception or failure to save its response produces `unknown` where storage remains available; if storage is unavailable the executing intent remains. The executor never automatically retries the callback.

`TOOL_RETURNED` records the tool's returned result, not an assertion that every provider operation succeeded: legacy handlers may return explanatory failure text. Simulation records `SIMULATED`. Explicit typed failure outcomes are JAR-025. Immediate HTTP retries are not deduplicated by this change; compound send recovery is JAR-020 and the crash/retry matrix is JAR-022.

## Evidence

Disposable PostgreSQL tests verify intent before effects, ownership rejection, source immutability, simulation, unknown outcomes and isolation from confirmation replay. HTTP tests compare chat and Inbox archive provider arguments and durable outcomes, revoke permissions, reject deferred operations, and reject stale scan identities. Snapshot tests cover changed lists, bulk selections, restart, legacy commands, reconnect and concurrent account contexts. Mission tests verify simulation and persistence failure. Tests use fake providers and disposable databases only.
