# Isolated integration tests

From `api/`, after `npm ci --ignore-scripts --no-audit` and `npm run prisma:generate`:

```sh
npm run test:runner
npm run test:integration
```

The integration command requires a running Docker daemon. It starts a digest-pinned PostgreSQL 16 container with a random name, password, database and loopback port. Data lives in tmpfs; it never uses the Compose volume or the caller's `DATABASE_URL`. The first run may download the image. Every run applies all checked-in Prisma migrations before starting Jest, and verifies their recorded completion against the migration directories.

The runner removes its own container after success, failed migration/test setup, or test failure. SIGINT/SIGTERM trigger cancellation and cleanup; cleanup failures return a nonzero exit code and identify the container. SIGKILL, a host crash, or an unavailable Docker daemon can prevent cleanup. After confirming no test is running, inspect `docker ps -a --filter label=jarvis.integration=true` and remove only the abandoned container named in the run output with `docker rm --force <container-name>`. Never prune unrelated containers or volumes.

## Provider and credential isolation

The child environment is built from a small operating-system allowlist. Database targets, provider endpoints and credentials are replaced or excluded, and Nest ignores `.env` in test mode. Gmail and Calendar use injectable fakes in `fixtures/providers.ts`; model adapters are stubbed at their public chat methods until the provider-construction refactor in JAR-024. Fake account records contain deliberately invalid tokens and `.invalid` email addresses.

The Jest setup rejects direct runs without a runner-issued database target. Socket connections are allowed only to the disposable database and registered local HTTP server; external HTTPS/TCP and fetch calls fail. Tests explicitly probe those guards. These are safeguards for trusted application tests, not a sandbox for arbitrary code or native subprocesses. Do not supply real credentials or disable guards to make a test pass.

## Adding coverage

Place tests in `integration/*.integration-spec.ts`. Use the real Nest module and Prisma service, override external provider tokens before compiling the testing module, and register only the ephemeral HTTP server port in `allowedPorts`. Close the application in teardown. Use distinct fixture identifiers within a run and reset fake responses/call history when assertions require it. Each command invocation gets a fresh database; individual tests within that invocation share it.

Current coverage verifies migration replay, HTTP validation, persisted task/log records, calendar confirmation persistence with a recorded fake mutation, and Inbox scanning/reply persistence with a recorded fake send. It does not validate live Google OAuth or production service behavior. Unit tests remain available separately through `npm test -- --runInBand`.

Additional Jest options can be passed after `--`, for example `npm run test:integration -- --testNamePattern=calendar`. Keep the default config and safety setup in CI. JAR-008 owns CI enforcement.
