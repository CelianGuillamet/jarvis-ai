import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAccountSnapshot } from '../src/features/privacy/account-snapshot.ts';
import { prepareErasureReceipt, readErasureReceipt, ERASURE_RECEIPT_KEY } from '../src/features/privacy/erasure-receipt.ts';

const header = { type: 'header', formatVersion: 1, accountId: 'owner', exportedAt: '2026-10-06T10:00:00.000Z' };
const record = { type: 'record', collection: 'Note', data: { text: 'Préférence privée 🌍' } };
const footer = { type: 'complete', records: 1 };
const ndjson = (...records) => records.map((value) => JSON.stringify(value)).join('\n') + '\n';
function streamed(text, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize));
    controller.close();
  } }));
}

test('validates an export across split UTF-8 characters before creating its download blob', async () => {
  const contents = ndjson(header, record, footer);
  const blob = await readAccountSnapshot(streamed(contents), 'owner');
  assert.equal(await blob.text(), contents);
});
for (const [name, contents] of [
  ['truncated export', ndjson(header, record)],
  ['wrong footer count', ndjson(header, record, { ...footer, records: 2 })],
  ['foreign owner', ndjson({ ...header, accountId: 'foreign' }, record, footer)],
  ['incomplete marker', ndjson(header, record, { type: 'incomplete', code: 'UNAVAILABLE' })],
  ['record after completion', ndjson(header, record, footer, record)],
  ['malformed record', ndjson(header, { type: 'record', collection: 'Note', data: null }, footer)],
]) {
  test(`rejects ${name} and aborts a native destination`, async () => {
    let closed = false;
    let aborted = 0;
    const destination = { async write() {}, async close() { closed = true; }, async abort() { aborted++; } };
    await assert.rejects(readAccountSnapshot(streamed(contents, 7), 'owner', destination));
    assert.equal(closed, false);
    assert.equal(aborted, 1);
  });
}
test('streams a native export and closes it only after validating its footer', async () => {
  const writes = [];
  let closed = false;
  const destination = { async write(chunk) { writes.push(chunk); }, async close() { closed = true; }, async abort() { assert.fail('unexpected abort'); } };
  const contents = ndjson(header, record, footer);
  assert.equal(await readAccountSnapshot(streamed(contents, 9), 'owner', destination), null);
  assert.equal(closed, true);
  assert.equal(await new Blob(writes).text(), contents);
});
test('aborts a partial native export after a network interruption', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection lost')); } }));
  let aborted = false;
  await assert.rejects(readAccountSnapshot(response, 'owner', { async write() {}, async close() { assert.fail('must not commit'); }, async abort() { aborted = true; } }));
  assert.equal(aborted, true);
});
test('persists a cryptographic receipt before mutation and reuses it after interruption', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = prepareErasureReceipt('owner', storage);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(values.get(ERASURE_RECEIPT_KEY)).receipt, first);
  assert.equal(prepareErasureReceipt('owner', storage), first);
  assert.equal(readErasureReceipt(storage), first);
});
test('rejects silently losing a receipt when browser storage fails', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('storage unavailable'); } };
  assert.throws(() => prepareErasureReceipt('owner', storage));
});


test('never reuses a previous account receipt for a different account', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = prepareErasureReceipt('first-owner', storage);
  const second = prepareErasureReceipt('second-owner', storage);
  assert.notEqual(second, first);
  assert.equal(prepareErasureReceipt('second-owner', storage), second);
});
