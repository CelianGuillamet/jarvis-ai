# Tool definitions

Every assistant tool has exactly one definition in `api/src/jarvis/tools/definitions/<domain>.ts`, created with `defineTool()` (`define-tool.ts`) and registered through `definitions/index.ts` into `TOOL_DEFINITIONS` (`tool-definitions.ts`).

## Contract

| Field | Meaning |
|---|---|
| `name` | Tool name, one of `ToolName` (derived from the `ToolCall` union in `tools.ts`) |
| `risk`, `requiresConfirmation`, `sideEffect` | Execution-policy metadata |
| `requires` | Google capability: `none`, `calendar.read|write`, `gmail.read|modify|send|permanent_delete` |
| `deferred` | Disabled for the private beta; execution and preview return `DEFERRED_CAPABILITY_MESSAGE` |
| `handler(env, call)` | Executes the tool; may be sync or async |
| `preview(env, call)` | Optional confirmation preview; returns `null` when there is nothing to show |

`ToolHandlerEnv` (`support/tool-env.ts`) carries the request `ctx`, `prisma`, `tz`, `sessionId`, frozen-target selections and the resolvers.

## Derived behavior

`TOOL_META` (`tool-meta.ts`), `isDeferredCapability` (`beta-capabilities.ts`) and the scope check in `gateToolCall` (`tool-engine.ts`) read the registry. `runTool` and `previewTool` dispatch to it after the deferred check.

## Adding a tool

1. Add the call shape to the `ToolCall` union in `tools.ts` and its parser branch in `tool-call.ts`.
2. Add a `defineTool({...})` entry to the domain file (or a new one exported from `definitions/index.ts`).
3. Add the name to `EXPECTED_TOOLS` in `tool-definitions.spec.ts` (compile-time exhaustive).
4. Review the intentional change in `__snapshots__/tool-metadata.snapshot.spec.ts.snap`.

Per-session `#N` caches and shared helpers live in `support/`.
