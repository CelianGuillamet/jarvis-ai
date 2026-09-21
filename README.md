# Jarvis

Personal assistant built with Vue 3, Pinia and Vite (`web/`), NestJS (`api/`), and PostgreSQL/Prisma. The private-beta rework is in progress; this checkout is for local development, not an approved external release.

## Runtime

Use Node **24.11.0** (`.nvmrc`) and npm **11.x**. Both applications declare the same supported Node 24 range. Their separate committed lockfiles are authoritative; run `npm ci`, not `npm install`, to reproduce them. Docker Compose is needed only for the local database.

```sh
nvm install
nvm use
node --version
npm --version
```

`nvm` is optional if you already have the supported runtime installed.

## Install and build from a clean checkout

Run these commands from the repository root. Builds and mocked unit tests do not need a database, Google credentials, or an LLM account.

```sh
npm --prefix api ci --ignore-scripts --no-audit
npm --prefix web ci --ignore-scripts --no-audit
npm --prefix api run prisma:generate
npm --prefix api run build
npm --prefix web run build
```

Install scripts are deliberately skipped; the required Prisma client generation is explicit. Repeat generation after changing the schema or reinstalling dependencies. `--no-audit` keeps installation separate from the dependency-disclosure check tracked in JAR-009; it does not establish that dependencies are vulnerability-free.

## Run locally

Create local environment files once; keep existing local values on subsequent setup runs:

```sh
cp -n api/.env.example api/.env
cp -n web/.env.example web/.env

docker compose up -d postgres
npm --prefix api run db:migrate
```

The migration command applies checked-in migrations to the database selected by `api/.env`; the example points at the development database. Do not point it at production as part of local setup. Schema generation does not apply migrations.

Start the API and web application in separate terminals:

```sh
npm --prefix api run start:dev
```

```sh
npm --prefix web run dev
```

Open `http://localhost:5173`. Vite proxies `/jarvis`, `/inbox-zero` and `/auth` to the API at `http://localhost:3000`. Database credentials and port match `docker-compose.yml`. To stop the local database while retaining its volume, run `docker compose stop postgres`.

The default example uses Ollama at `http://localhost:11434` with `llama3.1:latest`; install that model separately if you want model-backed conversations. Deterministic tools and tests do not require it. To use OpenAI instead, configure the provider and key described in [API setup](api/README.md). Google credentials are optional until connecting Gmail/Calendar. The example enables simulation, but simulation is not a security boundary for every existing entry point; use test accounts/data for integration development.

## Read-only quality checks

```sh
npm --prefix api run typecheck
npm --prefix web run typecheck
npm --prefix api run lint
npm --prefix web run lint
npm --prefix api test -- --runInBand
npm --prefix web test
```

Type checks disable emission; lint commands do not use `--fix`. Lint failures and test failures return nonzero exit codes. Code-changing commands are explicitly named `lint:fix` or `format` (API only). Build commands write to each application's `dist/` directory.

Existing baseline debt is not hidden: JAR-004 tracks two calendar-routing test failures and JAR-008 tracks lint cleanup/CI. See ticket evidence for the current result, rather than treating a documented command as a passing check. Database/provider integration fixtures are tracked by JAR-007; the starter API e2e command requires a database and is not the isolated unit suite.

## Repository guide

- [API configuration and commands](api/README.md)
- [Web configuration and commands](web/README.md)
- [Audit baseline](docs/2026-09-21-codebase-audit.md)
- [Private-beta roadmap](docs/2026-09-21-private-beta-rework-plan.md)
- [Notion tracker and ticket index](docs/project-tracker.md)

Web search and page retrieval are disabled pending network hardening. Developer assets under `/dev/` are available only when `NODE_ENV=development`. Deployment is a separate release gate and is not part of these setup commands.
