import assert from 'node:assert/strict';
// Google credential rehearsals share the same isolated historical schemas.
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { TokenCipher } from '../src/google/token-cipher.ts';
import { sealGoogleTokens } from '../scripts/google-token-maintenance.mjs';
import {
  applyOwnership,
  inventoryOwnership,
  restoreOwnership,
  validateManifest,
  ownershipTables,
} from '../scripts/ownership-migration.mjs';

const expansion = '20260928140000_ownership_expansion';
const root = new URL('../prisma/migrations/', import.meta.url);
const runId = process.env.JARVIS_TEST_RUN_ID;
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (
  !runId ||
  !/^[a-f0-9]{32}$/.test(runId) ||
  url.hostname !== '127.0.0.1' ||
  url.pathname !== `/jarvis_test_${runId}`
) {
  throw new Error(
    'Ownership rehearsal requires the disposable integration database.',
  );
}

async function fixture(name, task) {
  const client = new pg.Client({ connectionString: url.href });
  const schema = `ownership_${name}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const migrations = (await readdir(root))
      .filter((name) => name !== 'migration_lock.toml')
      .sort();
    for (const migration of migrations.filter((name) => name < expansion)) {
      await client.query(
        await readFile(new URL(`${migration}/migration.sql`, root), 'utf8'),
      );
    }
    await task(client, async () =>
      client.query(
        await readFile(new URL(`${expansion}/migration.sql`, root), 'utf8'),
      ),
    );
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}

async function seed(client) {
  await client.query(
    `INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ('owner-a','A','a@example.invalid',true,now()), ('owner-b','B','b@example.invalid',true,now())`,
  );
  for (const table of ownershipTables) {
    const columns = table === 'CalendarEvent' ? 'id,title,"when"' : 'id,text';
    const values =
      table === 'CalendarEvent'
        ? "$1,'Réunion', '2026-09-28T14:00:00'"
        : "$1,'Données à préserver 📝'";
    for (const suffix of ['known', 'ambiguous'])
      await client.query(
        `INSERT INTO "${table}" (${columns}) VALUES (${values})`,
        [`${table}-${suffix}`],
      );
  }
}

async function snapshots(client) {
  const all = {};
  for (const table of ownershipTables) {
    all[table] = (
      await client.query(
        `SELECT to_jsonb(t) - 'ownerId' AS original FROM "${table}" t ORDER BY id`,
      )
    ).rows;
  }
  return all;
}

test('non-null cutover preserves mapped rows and quarantines every ambiguous legacy row', async () => {
  await fixture('contract', async (client, expand) => {
    await seed(client);
    const before = await snapshots(client);
    await expand();
    await client.query(
      `UPDATE "Todo" SET "ownerId" = 'owner-a' WHERE id = 'Todo-known'`,
    );
    await client.query(
      await readFile(
        new URL('20260928160000_ownership_contract/migration.sql', root),
        'utf8',
      ),
    );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM "LegacyOwnershipRecord" WHERE "batchId" = $1',
          ['ownership-contract-20260928'],
        )
      ).rows[0].count,
      7,
    );
    assert.equal(
      (await client.query('SELECT "ownerId" FROM "Todo"')).rows[0].ownerId,
      'owner-a',
    );
    for (const table of ownershipTables) {
      const saved = await client.query(
        'SELECT original - \'ownerId\' AS original FROM "LegacyOwnershipRecord" WHERE "tableName" = $1 ORDER BY "recordId"',
        [table],
      );
      const live = await snapshots(client);
      const restoredSet = [...saved.rows, ...live[table]].sort((a, b) =>
        a.original.id.localeCompare(b.original.id),
      );
      assert.deepEqual(restoredSet, before[table]);
    }
    await assert.rejects(
      client.query(
        `INSERT INTO "Todo" (id,text) VALUES ('unowned-new','forbidden')`,
      ),
      /not-null/,
    );
  });
});

function manifestFor(inventory, batchId = 'reviewed-fixture') {
  return {
    version: 1,
    batchId,
    approvedBy: 'isolated-test-reviewer',
    mappings: inventory
      .filter((row) => row.id.endsWith('-known'))
      .map((row, i) => ({
        ...row,
        ownerId: i % 2 ? 'owner-b' : 'owner-a',
        reason:
          'Explicit synthetic fixture ownership, not inferred from content.',
      })),
  };
}

test('fresh migration has owner foreign keys, query indexes and distinct identity records', async () => {
  await fixture('fresh', async (client, expand) => {
    await expand();
    assert.deepEqual(await inventoryOwnership(client), []);
    for (const table of ownershipTables) {
      const indexes = await client.query(
        'SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1',
        [table],
      );
      assert.ok(indexes.rows.some((row) => row.indexdef.includes('"ownerId"')));
    }
    await assert.rejects(
      client.query(
        `INSERT INTO "Todo" (id,text,"ownerId") VALUES ('bad','bad','missing-owner')`,
      ),
      /foreign key/,
    );
    await assert.rejects(
      client.query(
        `INSERT INTO "Conversation" (id,"ownerId") VALUES ('bad','missing-owner')`,
      ),
      /foreign key/,
    );
    await seed(client);
    await client.query(
      `INSERT INTO "Conversation" (id,"ownerId") VALUES ('conversation-id','owner-a')`,
    );
    await client.query(
      `INSERT INTO "IntegrationAccount" (id,"ownerId",provider,"providerSubject") VALUES ('integration-id','owner-a','google','verified-subject')`,
    );
    await assert.rejects(
      client.query(
        `INSERT INTO "IntegrationAccount" (id,"ownerId",provider,"providerSubject") VALUES ('other','owner-b','google','verified-subject')`,
      ),
      /unique/,
    );
  });
});

test('legacy backfill assigns only approved snapshots, quarantines the rest, replays and restores exactly', async () => {
  await fixture('legacy', async (client, expand) => {
    await seed(client);
    const before = await snapshots(client);
    await expand();
    const manifest = manifestFor(await inventoryOwnership(client));
    assert.equal(manifest.mappings.length, 4);
    assert.deepEqual(await applyOwnership(client, manifest), {
      replay: false,
      assigned: 4,
      quarantined: 4,
    });
    assert.deepEqual(await inventoryOwnership(client), []);
    for (const table of ownershipTables) {
      const { rows } = await client.query(
        `SELECT id, "ownerId" FROM "${table}"`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, `${table}-known`);
      assert.ok(['owner-a', 'owner-b'].includes(rows[0].ownerId));
    }
    assert.deepEqual(await applyOwnership(client, manifest), {
      replay: true,
      assigned: 4,
      quarantined: 4,
    });
    await assert.rejects(
      applyOwnership(client, { ...manifest, approvedBy: 'someone-else' }),
      /already used/,
    );
    assert.deepEqual(await restoreOwnership(client, manifest.batchId), {
      replay: false,
      restored: 8,
    });
    assert.deepEqual(await snapshots(client), before);
    assert.equal((await inventoryOwnership(client)).length, 8);
    assert.deepEqual(await restoreOwnership(client, manifest.batchId), {
      replay: true,
      restored: 0,
    });
    await assert.rejects(applyOwnership(client, manifest), /already used/);
  });
});

test('invalid or stale approval rolls back the entire migration without changing any data', async () => {
  await fixture('stale', async (client, expand) => {
    await seed(client);
    await expand();
    const manifest = manifestFor(await inventoryOwnership(client));
    assert.throws(
      () =>
        validateManifest({
          ...manifest,
          mappings: [...manifest.mappings, manifest.mappings[0]],
        }),
      /Duplicate/,
    );
    assert.throws(
      () => validateManifest({ ...manifest, mapping: [] }),
      /Unknown manifest field/,
    );
    assert.throws(
      () =>
        validateManifest({
          ...manifest,
          mappings: [{ ...manifest.mappings[0], table: 'User' }],
        }),
      /known table/,
    );
    await assert.rejects(
      applyOwnership(client, {
        ...manifest,
        mappings: [{ ...manifest.mappings[0], ownerId: 'missing-owner' }],
      }),
      /existing verified/,
    );
    await client.query(
      `UPDATE "Todo" SET text = 'changed after review' WHERE id = 'Todo-known'`,
    );
    const before = await snapshots(client);
    await assert.rejects(applyOwnership(client, manifest), /changed record/);
    assert.deepEqual(await snapshots(client), before);
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM "LegacyOwnershipBatch"',
        )
      ).rows[0].count,
      0,
    );
    assert.equal((await inventoryOwnership(client)).length, 8);
  });
});

test('restore refuses post-migration edits atomically; snapshot storage also rolls back on failure', async () => {
  await fixture('rollback', async (client, expand) => {
    await seed(client);
    await expand();
    const manifest = manifestFor(await inventoryOwnership(client));
    // Fail after some records have been processed to verify transaction rollback.
    await client.query(
      `ALTER TABLE "LegacyOwnershipRecord" ADD CONSTRAINT fixture_failure CHECK ("tableName" <> 'Note')`,
    );
    await assert.rejects(applyOwnership(client, manifest), /fixture_failure/);
    assert.equal((await inventoryOwnership(client)).length, 8);
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM "LegacyOwnershipRecord"',
        )
      ).rows[0].count,
      0,
    );
    await client.query(
      'ALTER TABLE "LegacyOwnershipRecord" DROP CONSTRAINT fixture_failure',
    );
    await applyOwnership(client, manifest);
    await client.query(
      `UPDATE "Todo" SET text = 'new user work' WHERE id = 'Todo-known'`,
    );
    const before = await snapshots(client);
    await assert.rejects(restoreOwnership(client, manifest.batchId), /changed/);
    assert.deepEqual(await snapshots(client), before);
    assert.deepEqual(await inventoryOwnership(client), []);
    assert.equal(
      (
        await client.query(
          'SELECT "restoredAt" FROM "LegacyOwnershipBatch" WHERE id = $1',
          [manifest.batchId],
        )
      ).rows[0].restoredAt,
      null,
    );
  });
});

test('Google token cutover refuses plaintext, seals legacy data without adopting it, and rotates keys', async () => {
  await fixture('google_seal', async (client, expand) => {
    await expand();
    await client.query(`INSERT INTO "GoogleOAuthToken" (id,"sessionId","refreshToken","accessToken","updatedAt") VALUES ('legacy-google','unknown-browser','refresh-secret','access-secret',now())`);
    const sql = await readFile(new URL('20260928190000_google_credentials/migration.sql', root), 'utf8');
    await assert.rejects(client.query(sql));
    await client.query('ROLLBACK');
    const oldKey = Buffer.alloc(32, 21).toString('base64');
    const newKey = Buffer.alloc(32, 22).toString('base64');
    const original = new TokenCipher(JSON.stringify({ old: oldKey }), 'old');
    assert.deepEqual(await sealGoogleTokens(client, original), { sealedRecords: 1 });
    const before = (await client.query('SELECT * FROM "GoogleOAuthToken"')).rows[0];
    assert.equal(original.decrypt(before.refreshToken, 'google:legacy-google:refresh'), 'refresh-secret');
    assert.equal(original.decrypt(before.accessToken, 'google:legacy-google:access'), 'access-secret');
    assert.equal(before.integrationAccountId, null);
    assert.equal(before.sessionId, 'unknown-browser');
    await client.query(sql);
    await assert.rejects(client.query(`INSERT INTO "GoogleOAuthToken" (id,"sessionId","refreshToken","updatedAt") VALUES ('rejected','other','plaintext',now())`));
    const rotated = new TokenCipher(JSON.stringify({ old: oldKey, current: newKey }), 'current');
    await sealGoogleTokens(client, rotated);
    const after = (await client.query('SELECT * FROM "GoogleOAuthToken"')).rows[0];
    const retired = new TokenCipher(JSON.stringify({ current: newKey }), 'current');
    assert.equal(retired.decrypt(after.refreshToken, 'google:legacy-google:refresh'), 'refresh-secret');
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.equal(after.integrationAccountId, null);
  });
});

test('Google token maintenance rolls back atomically if a required old key is unavailable', async () => {
  await fixture('google_rollback', async (client, expand) => {
    await expand();
    await client.query(`INSERT INTO "GoogleOAuthToken" (id,"sessionId","refreshToken","updatedAt") VALUES ('plain','one','secret',now()), ('unknown','two','v1.missing.invalid',now())`);
    const before = (await client.query('SELECT * FROM "GoogleOAuthToken" ORDER BY id')).rows;
    const cipher = new TokenCipher(JSON.stringify({ current: Buffer.alloc(32, 1).toString('base64') }), 'current');
    await assert.rejects(sealGoogleTokens(client, cipher));
    assert.deepEqual((await client.query('SELECT * FROM "GoogleOAuthToken" ORDER BY id')).rows, before);
  });
});
