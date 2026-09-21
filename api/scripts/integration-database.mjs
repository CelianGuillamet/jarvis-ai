import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);

export async function withIntegrationDatabase(
  task,
  { run = execute, signal } = {},
) {
  const runId = randomUUID().replaceAll('-', '');
  const name = `jarvis-integration-${runId}`;
  const database = `jarvis_test_${runId}`;
  const password = randomUUID();
  const command = (args) => run('docker', args, { timeout: 180_000, signal });
  let taskError;
  try {
    await command([
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--label',
      'jarvis.integration=true',
      '--tmpfs',
      '/var/lib/postgresql/data:rw',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_USER=jarvis_test',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      '--env',
      `POSTGRES_DB=${database}`,
      'postgres:16@sha256:a3b7f434b2dc57ce85a67e171163eb8ab1a1ebcb39d27484661f26b1dfbe30d6',
    ]);
    const { stdout } = await command(['port', name, '5432/tcp']);
    const address = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
    if (!address) throw new Error('Unexpected disposable database binding');
    const port = Number(address[1]);
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        await command([
          'exec',
          name,
          'pg_isready',
          '-U',
          'jarvis_test',
          '-d',
          database,
        ]);
        break;
      } catch (error) {
        if (signal?.aborted || Date.now() >= deadline) throw error;
        await delay(250, undefined, { signal });
      }
    }
    console.log(`Integration database: ${name} (loopback port ${port})`);
    return await task({
      runId,
      databaseUrl: `postgresql://jarvis_test:${password}@127.0.0.1:${port}/${database}?schema=public`,
    });
  } catch (error) {
    taskError = error;
    throw error;
  } finally {
    // Cleanup is deliberately independent of an aborted test/setup signal.
    try {
      await run('docker', ['rm', '--force', name], { timeout: 30_000 });
      console.log(`Removed integration database: ${name}`);
    } catch (error) {
      if (
        !String(error.stderr ?? error.message).includes('No such container')
      ) {
        throw new AggregateError(
          [taskError, error].filter(Boolean),
          `Failed to clean up ${name}`,
        );
      }
    }
  }
}
