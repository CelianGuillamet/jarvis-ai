import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { withIntegrationDatabase } from './integration-database.mjs';

const execute = promisify(execFile);
const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const UPGRADE_FROM =
  process.env.REHEARSAL_UPGRADE_FROM ?? '20260928140000_ownership_expansion';
const results = [];

const step = async (name, work) => {
  try {
    const detail = await work();
    results.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(
      `FAIL ${name}: ${String(error.stderr ?? error.message).slice(0, 400)}`,
    );
    throw error;
  }
};

const url = (base, database) => {
  const next = new URL(base);
  next.pathname = `/${database}`;
  return next.toString();
};

async function prisma(args, databaseUrl, cwd = apiRoot) {
  return execute('npx', ['prisma', ...args], {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_URL: databaseUrl,
    },
    timeout: 180_000,
  });
}

async function withMigrationSubset(upTo, work) {
  const dir = await mkdtemp(join(apiRoot, '.rehearsal-'));
  try {
    const all = (
      await readdir(join(apiRoot, 'prisma/migrations'), { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    await mkdir(join(dir, 'prisma/migrations'), { recursive: true });
    await cp(
      join(apiRoot, 'prisma/schema.prisma'),
      join(dir, 'prisma/schema.prisma'),
    );
    await cp(
      join(apiRoot, 'prisma/migrations/migration_lock.toml'),
      join(dir, 'prisma/migrations/migration_lock.toml'),
    );
    for (const name of all.filter((entry) => entry < upTo))
      await cp(
        join(apiRoot, 'prisma/migrations', name),
        join(dir, 'prisma/migrations', name),
        {
          recursive: true,
        },
      );
    await writeFile(
      join(dir, 'prisma.config.ts'),
      `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL ?? '' } });\n`,
    );
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await withIntegrationDatabase(async ({ runId, databaseUrl }) => {
  const container = `jarvis-integration-${runId}`;
  const admin = 'postgres';
  const sql = (database, query) =>
    execute('docker', [
      'exec',
      container,
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      'jarvis_test',
      '-d',
      database,
      '-tAc',
      query,
    ]);
  const count = async (database, table) =>
    Number(
      (await sql(database, `SELECT count(*) FROM "${table}"`)).stdout.trim(),
    );
  const tableCounts = async (database) => {
    const tables = (
      await sql(
        database,
        `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
      )
    ).stdout
      .trim()
      .split('\n');
    const out = {};
    for (const table of tables) out[table] = await count(database, table);
    return out;
  };

  for (const deadline = Date.now() + 30_000; ; await delay(500)) {
    try {
      await sql(admin, 'SELECT 1');
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
  }

  await step('fresh deployment applies every migration', async () => {
    const fresh = `fresh_${runId}`;
    await sql(admin, `CREATE DATABASE "${fresh}"`);
    await prisma(['migrate', 'deploy'], url(databaseUrl, fresh));
    const status = await prisma(['migrate', 'status'], url(databaseUrl, fresh));
    if (!/up to date/i.test(status.stdout))
      throw new Error('Schema is not up to date');
    return `${Object.keys(await tableCounts(fresh)).length} tables`;
  });

  const upgrade = `upgrade_${runId}`;
  await step('upgrade quarantines pre-ownership data', async () => {
    await sql(admin, `CREATE DATABASE "${upgrade}"`);
    await withMigrationSubset(UPGRADE_FROM, (dir) =>
      prisma(['migrate', 'deploy'], url(databaseUrl, upgrade), dir),
    );
    await sql(
      upgrade,
      `INSERT INTO "Todo"("id","text") VALUES ('rehearsal-1','legacy todo')`,
    );
    await prisma(['migrate', 'deploy'], url(databaseUrl, upgrade));
    const status = await prisma(
      ['migrate', 'status'],
      url(databaseUrl, upgrade),
    );
    if (!/up to date/i.test(status.stdout))
      throw new Error('Schema is not up to date');
    const quarantined = (
      await sql(
        upgrade,
        `SELECT count(*) FROM "LegacyOwnershipRecord" WHERE "tableName"='Todo' AND "recordId"='rehearsal-1' AND original->>'text'='legacy todo'`,
      )
    ).stdout.trim();
    if (quarantined !== '1' || (await count(upgrade, 'Todo')) !== 0)
      throw new Error(
        'Legacy row was neither quarantined nor removed from the live table',
      );
    return 'ownerless legacy row quarantined intact, live table clean';
  });

  const restored = `restored_${runId}`;
  await step('backup and restore reproduce the database', async () => {
    await execute('docker', [
      'exec',
      container,
      'pg_dump',
      '-U',
      'jarvis_test',
      '-Fc',
      '-f',
      '/tmp/rehearsal.dump',
      upgrade,
    ]);
    await sql(admin, `CREATE DATABASE "${restored}"`);
    await execute('docker', [
      'exec',
      container,
      'pg_restore',
      '-U',
      'jarvis_test',
      '--no-owner',
      '-d',
      restored,
      '/tmp/rehearsal.dump',
    ]);
    const before = JSON.stringify(await tableCounts(upgrade));
    const after = JSON.stringify(await tableCounts(restored));
    if (before !== after) throw new Error('Restored row counts differ');
    const status = await prisma(
      ['migrate', 'status'],
      url(databaseUrl, restored),
    );
    if (!/up to date/i.test(status.stdout))
      throw new Error('Restored schema is not up to date');
    return 'row counts and migration history identical';
  });

  await step(
    'rollback by pre-migration backup, then forward again',
    async () => {
      const target = `rollback_${runId}`;
      await sql(admin, `CREATE DATABASE "${target}"`);
      await withMigrationSubset(UPGRADE_FROM, (dir) =>
        prisma(['migrate', 'deploy'], url(databaseUrl, target), dir),
      );
      await sql(
        target,
        `INSERT INTO "Todo"("id","text") VALUES ('rollback-1','kept')`,
      );
      await execute('docker', [
        'exec',
        container,
        'pg_dump',
        '-U',
        'jarvis_test',
        '-Fc',
        '-f',
        '/tmp/pre-migration.dump',
        target,
      ]);
      await prisma(['migrate', 'deploy'], url(databaseUrl, target));
      await sql(admin, `DROP DATABASE "${target}" WITH (FORCE)`);
      await sql(admin, `CREATE DATABASE "${target}"`);
      await execute('docker', [
        'exec',
        container,
        'pg_restore',
        '-U',
        'jarvis_test',
        '--no-owner',
        '-d',
        target,
        '/tmp/pre-migration.dump',
      ]);
      const rolledBack = (
        await sql(target, `SELECT count(*) FROM "_prisma_migrations"`)
      ).stdout.trim();
      const todos = await count(target, 'Todo');
      if (todos !== 1) throw new Error('Pre-migration data not restored');
      await prisma(['migrate', 'deploy'], url(databaseUrl, target));
      return `restored to ${rolledBack} applied migrations, then redeployed`;
    },
  );

  await step('production-like API boots and answers readiness', async () => {
    await execute('npm', ['run', 'build'], { cwd: apiRoot, timeout: 300_000 });
    const ledger = await mkdtemp(join(tmpdir(), 'jarvis-ledger-'));
    const killFile = join(ledger, 'kill-switch');
    await mkdir(join(ledger, 'privacy'), { mode: 0o700 });
    const port = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [join(apiRoot, 'dist/src/main.js')], {
      // A clean working directory keeps a developer .env from leaking in.
      cwd: ledger,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        PORT: String(port),
        DATABASE_URL: url(databaseUrl, upgrade),
        AUTH_SECRET: randomBytes(32).toString('base64'),
        AUTH_BASE_URL: 'https://api.rehearsal.invalid',
        APP_ORIGIN: 'https://app.rehearsal.invalid',
        PRIVACY_LEDGER_DIR: join(ledger, 'privacy'),
        PRIVACY_WORKER_ENABLED: 'false',
        MUTATION_KILL_SWITCH_FILE: killFile,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    try {
      const base = `http://127.0.0.1:${port}`;
      let ready;
      for (
        const deadline = Date.now() + 60_000;
        Date.now() < deadline;
        await delay(500)
      ) {
        if (child.exitCode !== null)
          throw new Error(`API exited: ${stderr.slice(0, 300)}`);
        ready = await fetch(`${base}/health/ready`).catch(() => null);
        if (ready?.ok) break;
      }
      if (!ready?.ok) throw new Error('Readiness never succeeded');
      const body = await ready.json();
      if (body.database !== 'ok' || body.mutations !== 'enabled')
        throw new Error('Unexpected readiness state');
      if (!ready.headers.get('x-request-id'))
        throw new Error('Missing request ID');
      const chat = await fetch(`${base}/jarvis/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://app.rehearsal.invalid',
        },
        body: JSON.stringify({ text: 'bonjour' }),
      });
      if (chat.status !== 401)
        throw new Error(`Unauthenticated chat returned ${chat.status}`);
      await writeFile(killFile, '');
      const suspended = await (await fetch(`${base}/health/ready`)).json();
      if (suspended.mutations !== 'suspended')
        throw new Error('Kill switch file not observed');
      await rm(killFile);
      return 'ready, request ID present, unauthenticated chat refused, kill-switch file observed';
    } finally {
      child.kill('SIGTERM');
      await rm(ledger, { recursive: true, force: true });
    }
  });
});

console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} rehearsal steps passed`,
);
