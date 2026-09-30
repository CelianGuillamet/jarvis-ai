import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient, HttpError, InvalidResponseError, TimeoutError } from '../src/core/api/http.ts';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const events = [];
globalThis.window = { setTimeout, clearTimeout, dispatchEvent: event => events.push(event.type) };
afterEach(() => { globalThis.fetch = originalFetch; events.length = 0; });
process.on('exit', () => { globalThis.window = originalWindow; });
const client = createHttpClient();

for (const body of ['', '<html>upstream error</html>', '{"text":']) {
  test(`rejects malformed successful JSON: ${JSON.stringify(body)}`, async () => {
    globalThis.fetch = async () => new Response(body);
    await assert.rejects(client.get('/api/test'), InvalidResponseError);
  });
}

test('preserves valid JSON including legitimate empty collections', async () => {
  globalThis.fetch = async () => new Response('[]');
  assert.deepEqual(await client.get('/api/test'), []);
});

test('does not turn a broken response stream into a successful empty result', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => { throw new Error('private stream details'); } });
  await assert.rejects(client.get('/api/test'), error => error instanceof InvalidResponseError && !error.message.includes('private'));
});

test('preserves HTTP status and session expiry when an error body is not JSON', async () => {
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
  await assert.rejects(client.get('/api/test'), error => error instanceof HttpError && error.status === 401);
  assert.deepEqual(events, ['jarvis:session-expired']);
});

test('preserves an abort during body reading as a timeout', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => { throw new DOMException('Aborted', 'AbortError'); } });
  await assert.rejects(client.get('/api/test'), TimeoutError);
});
