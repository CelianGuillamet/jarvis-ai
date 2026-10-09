# JAR-041 — Deployment, migration, restore and rollback runbook

Scope: local-only private beta (no hosted staging is authorized; see decision 0001). "Staging" below means a disposable PostgreSQL 16 container with production-like application settings. Rehearsed 8 October 2026 against `main` + JAR-036/040 branches.

## Artifact

`api/Dockerfile` builds a versioned API image from `package-lock.json` (Node 24.11.0, `npm ci`, Prisma client generated, `dist` compiled, non-root user, production dependencies only including the Prisma CLI for `migrate deploy`). Tag images with the git SHA, never `latest`. The web app has no deployment artifact yet.

## Required settings (names only; never commit values)

`DATABASE_URL`, `AUTH_SECRET` (≥32 chars), `AUTH_BASE_URL` and `APP_ORIGIN` (exact HTTPS origins), `PRIVACY_LEDGER_DIR` (absolute, existing, mode 0700, on storage separate from DB backups), `AUTH_GOOGLE_CLIENT_ID/SECRET` and `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` + `GOOGLE_TOKEN_KEYS/ACTIVE_KEY` when Google is enabled, `OPENAI_API_KEY` when `LLM_PROVIDER=openai`. Optional: `MUTATIONS_DISABLED`, `MUTATION_KILL_SWITCH_FILE`, `MODEL_*` limits. Startup validation names invalid fields without printing values.

## Deploy

1. Back up the database (`pg_dump -Fc`) and note the current migration count.
2. Run `npx prisma migrate deploy` from the new image with `DATABASE_URL` set (one-shot, before starting instances).
3. Start the new image. Check `GET /health/ready`: `status ok`, `database ok`, `mutations enabled`, no alerts.
4. Confirm an unauthenticated mutation is refused (401) and a response carries `X-Request-Id`.

## Roll back

Prisma has no down migrations. Before every migration take the backup from step 1, then:

1. Engage the kill switch (create `MUTATION_KILL_SWITCH_FILE`) and stop instances.
2. Drop and recreate the database, `pg_restore --no-owner` the pre-migration dump, deploy the previous image.
3. Keep the privacy ledger directory as it is (newest copy and keys): follow `docs/privacy/backup-restoration.md` so erased accounts stay erased.
4. If only the schema is wrong and data is fine, prefer a forward-repair migration over a restore.

## Evidence (`npm run rehearse:deployment`, 5/5 passed)

Run in `api/` with Docker available; it provisions and removes its own database container.

- Fresh deployment: all migrations applied, `migrate status` up to date, 50 tables.
- Upgrade: database at the pre-ownership schema with an ownerless legacy row, then deployed to head. The row is quarantined intact in `LegacyOwnershipRecord` and removed from the live table.
- Backup/restore: `pg_dump -Fc` and `pg_restore` into a new database gave identical per-table row counts and migration history.
- Rollback: pre-migration dump, migrate forward, drop, restore, 13 migrations and the legacy row back, redeploy succeeded.
- Production-like boot (`NODE_ENV=production`, HTTPS origins, 0700 ledger dir, clean working directory): ready, request ID, unauthenticated chat 401, kill-switch file observed without restart.
- Image: built from `api/Dockerfile`; `prisma migrate deploy` applied 34 migrations inside it; the container answered `/health/ready` against a disposable database.

## Owners

Single owner for every role: the repository owner. No on-call, pager or hosted monitoring exists; alerts are log lines (see `docs/security/operations-monitoring.md`).

## Limitations

- `/health/ready` checks database connectivity, not that migrations are current: an unmigrated database reads as ready. Always run step 2 and verify `migrate status`.
- The rehearsal is not wired into CI and does not exercise Google, model providers or the web app.
- Restore drills used small data; timing at real volume is unmeasured.
- Secrets handling is documented, not automated; no secret manager is in use.
