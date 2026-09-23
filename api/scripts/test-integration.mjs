import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withIntegrationDatabase } from './integration-database.mjs';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM']) {
  process.once(name, () =>
    controller.abort(new Error(`Interrupted by ${name}`)),
  );
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: apiRoot,
      env,
      stdio: 'inherit',
      signal: controller.signal,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Integration command failed (${signal ?? code})`));
    });
  });
}

// Do not inherit API keys, database targets or provider endpoints from the caller.
const environment = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'CI', 'SystemRoot']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

try {
  await withIntegrationDatabase(
    async ({ runId, databaseUrl }) => {
      const env = {
        ...environment,
        NODE_ENV: 'test',
        AUTH_SECRET: 'isolated-integration-secret-not-for-real-use-2026',
        AUTH_BASE_URL: 'http://localhost:3000',
        APP_ORIGIN: 'http://localhost:5173',
        TZ: 'UTC',
        DATABASE_URL: databaseUrl,
        JARVIS_TEST_RUN_ID: runId,
        SIMULATION: 'false',
        LLM_PROVIDER: 'ollama',
        HUMAN_PROFILE_PERSIST: 'false',
        OPENAI_API_KEY: '',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
      };
      await runNode(
        ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
        env,
      );
      await runNode(
        [
          '--experimental-vm-modules',
          'node_modules/jest/bin/jest.js',
          '--config',
          'test/jest-integration.json',
          '--runInBand',
          ...process.argv.slice(2),
        ],
        env,
      );
    },
    { signal: controller.signal },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
