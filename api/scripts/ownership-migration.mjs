import { createHash } from 'node:crypto';

// SQL identifiers are always selected from this closed list, never the manifest.
export const ownershipTables = Object.freeze([
  'Todo',
  'Note',
  'ShoppingItem',
  'CalendarEvent',
]);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const keyOf = (table, id) => JSON.stringify([table, id]);
const text = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 500;

export function validateManifest(manifest) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    !text(manifest.batchId) ||
    !text(manifest.approvedBy) ||
    !Array.isArray(manifest.mappings)
  ) {
    throw new Error('Expected version 1, batchId, approvedBy and mappings.');
  }
  if (
    Object.keys(manifest).some(
      (key) => !['version', 'batchId', 'approvedBy', 'mappings'].includes(key),
    )
  )
    throw new Error('Unknown manifest field.');
  const keys = new Set();
  for (const row of manifest.mappings) {
    if (
      !row ||
      !ownershipTables.includes(row.table) ||
      !text(row.id) ||
      !text(row.ownerId) ||
      !text(row.reason) ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    ) {
      throw new Error(
        'Each mapping requires a known table, id, ownerId, snapshot sha256 and approval reason.',
      );
    }
    if (
      Object.keys(row).some(
        (key) => !['table', 'id', 'ownerId', 'sha256', 'reason'].includes(key),
      )
    )
      throw new Error('Unknown mapping field.');
    const key = keyOf(row.table, row.id);
    if (keys.has(key)) throw new Error('Duplicate ownership mapping.');
    keys.add(key);
  }
  return manifest;
}

async function readUnowned(client) {
  const records = [];
  for (const table of ownershipTables) {
    const { rows } = await client.query(
      `SELECT id, to_jsonb(t)::text AS snapshot FROM "${table}" t WHERE "ownerId" IS NULL ORDER BY id`,
    );
    for (const row of rows)
      records.push({
        table,
        id: row.id,
        snapshot: row.snapshot,
        sha256: sha256(row.snapshot),
      });
  }
  return records;
}

export async function inventoryOwnership(client) {
  const records = await readUnowned(client);
  return records.map(({ table, id, sha256: fingerprint }) => ({
    table,
    id,
    sha256: fingerprint,
  }));
}

async function transaction(client, task) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    // Serialize operator runs with each other and with writes. Application must
    // also be stopped for the full backfill/verify/contract maintenance window.
    await client.query('LOCK TABLE "User" IN SHARE MODE');
    await client.query(
      `LOCK TABLE "LegacyOwnershipBatch", "LegacyOwnershipRecord", ${ownershipTables.map((table) => `"${table}"`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const result = await task();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function applyOwnership(client, input) {
  const manifest = validateManifest(input);
  const digest = sha256(JSON.stringify(manifest));
  return transaction(client, async () => {
    const previous = await client.query(
      'SELECT digest, "restoredAt" FROM "LegacyOwnershipBatch" WHERE id = $1',
      [manifest.batchId],
    );
    if (previous.rowCount) {
      if (previous.rows[0].digest !== digest || previous.rows[0].restoredAt)
        throw new Error(
          'Batch ID already used by a different or restored migration.',
        );
      return { replay: true, ...(await batchCounts(client, manifest.batchId)) };
    }
    const records = await readUnowned(client);
    const recordsByKey = new Map(
      records.map((row) => [keyOf(row.table, row.id), row]),
    );
    const owners = new Map();
    for (const mapping of manifest.mappings) {
      const record = recordsByKey.get(keyOf(mapping.table, mapping.id));
      if (!record || record.sha256 !== mapping.sha256)
        throw new Error(
          'Mapping references a missing, owned or changed record. Re-inventory and review.',
        );
      const user = await client.query(
        'SELECT id FROM "User" WHERE id = $1 AND "emailVerified" = true AND disabled = false',
        [mapping.ownerId],
      );
      if (!user.rowCount)
        throw new Error(
          'Mapping owner must be an existing verified enabled user.',
        );
      owners.set(keyOf(mapping.table, mapping.id), mapping.ownerId);
    }
    await client.query(
      'INSERT INTO "LegacyOwnershipBatch" (id, digest, manifest) VALUES ($1, $2, $3::jsonb)',
      [manifest.batchId, digest, JSON.stringify(manifest)],
    );
    for (const record of records) {
      const ownerId = owners.get(keyOf(record.table, record.id)) ?? null;
      await client.query(
        'INSERT INTO "LegacyOwnershipRecord" ("batchId", "tableName", "recordId", original, "assignedOwnerId") VALUES ($1,$2,$3,$4::jsonb,$5)',
        [manifest.batchId, record.table, record.id, record.snapshot, ownerId],
      );
      const result = ownerId
        ? await client.query(
            `UPDATE "${record.table}" SET "ownerId" = $1 WHERE id = $2 AND "ownerId" IS NULL`,
            [ownerId, record.id],
          )
        : await client.query(
            `DELETE FROM "${record.table}" WHERE id = $1 AND "ownerId" IS NULL`,
            [record.id],
          );
      if (result.rowCount !== 1)
        throw new Error('Ownership migration count mismatch.');
    }
    if ((await readUnowned(client)).length !== 0)
      throw new Error('Unowned rows remain after backfill.');
    const counts = await batchCounts(client, manifest.batchId);
    if (counts.assigned + counts.quarantined !== records.length)
      throw new Error('Snapshot count mismatch.');
    return { replay: false, ...counts };
  });
}

async function batchCounts(client, batchId) {
  const {
    rows: [counts],
  } = await client.query(
    'SELECT count(*) FILTER (WHERE "assignedOwnerId" IS NOT NULL)::int AS assigned, count(*) FILTER (WHERE "assignedOwnerId" IS NULL)::int AS quarantined FROM "LegacyOwnershipRecord" WHERE "batchId" = $1',
    [batchId],
  );
  return counts;
}

export async function restoreOwnership(client, batchId) {
  if (!text(batchId)) throw new Error('Batch ID required.');
  return transaction(client, async () => {
    const batch = await client.query(
      'SELECT "restoredAt" FROM "LegacyOwnershipBatch" WHERE id = $1',
      [batchId],
    );
    if (!batch.rowCount) throw new Error('Unknown batch.');
    if (batch.rows[0].restoredAt) return { replay: true, restored: 0 };
    const { rows } = await client.query(
      'SELECT "tableName", "recordId", original::text, "assignedOwnerId" FROM "LegacyOwnershipRecord" WHERE "batchId" = $1 ORDER BY "tableName", "recordId"',
      [batchId],
    );
    for (const record of rows) {
      const table = record.tableName;
      if (!ownershipTables.includes(table))
        throw new Error('Unknown snapshot table.');
      if (record.assignedOwnerId !== null) {
        // Never overwrite edits made after the migration, including owner changes.
        const result = await client.query(
          `UPDATE "${table}" t SET "ownerId" = NULL WHERE id = $1 AND to_jsonb(t) = ($2::jsonb || jsonb_build_object('ownerId', $3::text))`,
          [record.recordId, record.original, record.assignedOwnerId],
        );
        if (result.rowCount !== 1)
          throw new Error(
            'Live record changed; restore refused without overwriting it.',
          );
      } else {
        const exists = await client.query(
          `SELECT id FROM "${table}" WHERE id = $1`,
          [record.recordId],
        );
        if (exists.rowCount)
          throw new Error('Quarantined ID now exists; restore refused.');
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}", $1::jsonb)`,
          [record.original],
        );
      }
      const verified = await client.query(
        `SELECT id FROM "${table}" t WHERE id = $1 AND to_jsonb(t) = $2::jsonb`,
        [record.recordId, record.original],
      );
      if (verified.rowCount !== 1)
        throw new Error('Restoration snapshot mismatch.');
    }
    await client.query(
      'UPDATE "LegacyOwnershipBatch" SET "restoredAt" = CURRENT_TIMESTAMP WHERE id = $1',
      [batchId],
    );
    return { replay: false, restored: rows.length };
  });
}
