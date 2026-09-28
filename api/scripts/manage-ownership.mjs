import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  inventoryOwnership,
  applyOwnership,
  restoreOwnership,
} from './ownership-migration.mjs';

const [command, input, confirmation, ...extra] = process.argv.slice(2);
const mutation = command === 'apply' || command === 'restore';
if (
  !['inventory', 'apply', 'restore'].includes(command) ||
  extra.length ||
  (mutation
    ? !input || confirmation !== '--maintenance-confirmed'
    : input !== undefined)
) {
  console.error(
    'Usage: npm run ownership -- inventory | apply <approved-manifest.json> --maintenance-confirmed | restore <batchId> --maintenance-confirmed',
  );
  process.exitCode = 1;
} else {
  let client;
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error('Local PostgreSQL required.');
    }
    if (
      url.searchParams.has('schema') &&
      url.searchParams.get('schema') !== 'public'
    )
      throw new Error('Only the public application schema is supported.');
    client = new pg.Client({ connectionString: url.href });
    await client.connect();
    await client.query('SET search_path TO public');
    const result =
      command === 'inventory'
        ? await inventoryOwnership(client)
        : command === 'apply'
          ? await applyOwnership(
              client,
              JSON.parse(await readFile(input, 'utf8')),
            )
          : await restoreOwnership(client, input);
    console.log(JSON.stringify(result, null, 2));
  } catch {
    // Database errors can contain row values or credentials; keep them off logs.
    console.error(
      'Ownership operation failed; transaction rolled back if started. Check the local target, reviewed manifest, maintenance window and unchanged snapshots.',
    );
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
