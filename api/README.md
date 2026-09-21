# Jarvis API

NestJS API with Prisma/PostgreSQL persistence, Google Gmail/Calendar integrations, and OpenAI or Ollama model providers. Start with the repository [setup guide](../README.md).

## Configuration

Copy `.env.example` to `.env` once. Nest and Prisma load it from this directory; `npm --prefix api` commands in the root guide run here. Never commit credentials.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required to run the API or migrations. Example matches the local Compose PostgreSQL database. Not required for builds or mocked unit tests. |
| `NODE_ENV` | `development` explicitly enables `/dev/` assets. Production, test and an unset value do not serve them. |
| `PORT` | Optional API port; default 3000. Update the web proxy if changed. |
| `SIMULATION` | Defaults to true in the example. Assistant simulation is not a global guarantee against external side effects; integration tests need fake providers or test accounts. |
| `LLM_PROVIDER` | `ollama` for local models or `openai` for OpenAI. |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Ollama endpoint/model; the model must exist locally. |
| `OPENAI_API_KEY` | Required only for OpenAI. A missing key currently falls back to Ollama. |
| `OPENAI_MODEL_PRIMARY`, `OPENAI_MODEL_FALLBACK`, `OPENAI_TIMEOUT_MS` | Model selection and request timeout in milliseconds. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Required to connect Google, not to install/build/test. Register the exact redirect URI with your Google OAuth client. |
| `PENDING_TTL_MINUTES`, `CONVO_TTL_MINUTES` | Confirmation and conversation expiration in minutes. |
| `HUMAN_PROFILE_*`, `HUMANIZE_RESPONSES`, `JARVIS_DEFAULT_*` | Optional profile persistence and response preferences; example values show current defaults. |

Web retrieval is disabled. Legacy `WEB_*`, `GOOGLE_SEARCH_*` and `SERPER_*` variables cannot re-enable it. Authentication and per-user ownership are still under development; a caller-supplied session identifier is not an authenticated account.

## Commands (from api/)

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts --no-audit` | Install the committed dependency lockfile. |
| `npm run prisma:generate` | Generate Prisma client code in node_modules; no database changes. |
| `npm run db:migrate` | Apply checked-in migrations to the configured database. |
| `npm run start:dev` | Compile and run with file watching. Set NODE_ENV through `.env` for developer assets. |
| `npm run build` | Compile production artifacts into dist. |
| `npm run start:prod` | Run an existing build; requires a configured database. |
| `npm run typecheck` | Check source/tests without emitting files or incremental caches. |
| `npm run lint` | Check source/tests without changing files. |
| `npm run lint:fix` | Explicitly apply supported lint fixes. |
| `npm run format:check` | Report formatting differences without changing files. |
| `npm run format` | Rewrite source/test formatting. |
| `npm test -- --runInBand` | Mocked unit suite; no live credentials needed. |
| `npm run test:cov -- --runInBand` | Unit coverage report in coverage/. |
| `npm run test:e2e` | Existing application e2e test; requires a running configured database. Isolated integration fixtures are tracked in JAR-007. |

The two original calendar-routing failures were fixed in JAR-004. Lint debt remains tracked in JAR-008; all check commands preserve failure exit codes. Do not use `prisma db push` as a replacement for checked-in migrations during setup.
