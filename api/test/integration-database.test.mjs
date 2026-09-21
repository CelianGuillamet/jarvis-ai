import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withIntegrationDatabase } from '../scripts/integration-database.mjs';

for (const fail of [false, true]) {
  test(`removes the disposable container after ${fail ? 'failure' : 'success'}`, async () => {
    const calls = [];
    const run = async (_program, args) => {
      calls.push(args);
      return { stdout: args[0] === 'port' ? '127.0.0.1:54321\n' : '' };
    };
    const operation = withIntegrationDatabase(
      ({ databaseUrl, runId }) => {
        assert.equal(new URL(databaseUrl).pathname, `/jarvis_test_${runId}`);
        if (fail) throw new Error('fixture failure');
        return 'done';
      },
      { run },
    );
    if (fail) await assert.rejects(operation, /fixture failure/);
    else assert.equal(await operation, 'done');
    const name = calls[0][calls[0].indexOf('--name') + 1];
    assert.deepEqual(calls.at(-1), ['rm', '--force', name]);
    assert.ok(calls[0].includes('127.0.0.1::5432'));
    assert.ok(calls[0].includes('--tmpfs'));
  });
}

test('attempts cleanup when provisioning fails', async () => {
  const calls = [];
  await assert.rejects(
    withIntegrationDatabase(() => assert.fail('must not run'), {
      run: async (_program, args) => {
        calls.push(args);
        if (args[0] === 'run') throw new Error('provisioning failed');
        return { stdout: '' };
      },
    }),
    /provisioning failed/,
  );
  assert.equal(calls.at(-1)[0], 'rm');
});

test('surfaces cleanup failures rather than reporting success', async () => {
  await assert.rejects(
    withIntegrationDatabase(() => 'done', {
      run: async (_program, args) => {
        if (args[0] === 'rm') throw new Error('daemon unavailable');
        return { stdout: args[0] === 'port' ? '127.0.0.1:54321\n' : '' };
      },
    }),
    /Failed to clean up/,
  );
});
