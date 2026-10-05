import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { submitTodayRequest, beginNewTodayIntent } from '../src/core/api/today-request-identity.ts';
const values = new Map();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_key, work) => work() } } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
const scope = { ownerId: 'owner', sessionId: 'session' };
const mutation = { operation: 'task.create', text: 'Private task text' };
beforeEach(() => values.clear());
const outcome = state => ({ commandId: crypto.randomUUID(), state, simulation: false, text: 'Result' });
test('reuses durable identity after lost response and stores no text', async () => {
  let first;
  await assert.rejects(submitTodayRequest(scope, mutation, async id => { first = id; throw new Error('timeout'); }));
  assert.ok(![...values.values()][0].includes(mutation.text));
  await submitTodayRequest(scope, { ...mutation }, async id => { assert.equal(id, first); return outcome('completed'); });
  assert.equal(values.size, 1);
  await submitTodayRequest(scope, mutation, async id => { assert.equal(id, first); return outcome('completed'); });
  await beginNewTodayIntent(scope, mutation);
  assert.equal(values.size, 0);
});
test('keeps uncertain outcomes and refuses changed intent', async () => {
  await submitTodayRequest(scope, mutation, async () => outcome('unknown'));
  await assert.rejects(submitTodayRequest(scope, { ...mutation, text: 'Changed' }, async () => outcome('completed')), /précédente/);
});
test('isolates accounts and conversations', async () => {
  const ids = [];
  for (const scoped of [scope, { ...scope, ownerId: 'other' }, { ...scope, sessionId: 'other' }]) await submitTodayRequest(scoped, mutation, async id => { ids.push(id); return outcome('executing'); });
  assert.equal(new Set(ids).size, 3);
});
test('blocks a different operation on an unresolved resource', async () => {
  const id = crypto.randomUUID();
  await submitTodayRequest(scope, { operation: 'task.complete', id }, async () => outcome('executing'));
  await assert.rejects(submitTodayRequest(scope, { operation: 'task.edit', id, text: 'Edit' }, async () => outcome('completed')), /précédente/);
});

test('refuses to discard an unresolved identity for a new intent', async () => {
  await submitTodayRequest(scope, mutation, async () => outcome('unknown'));
  await assert.rejects(beginNewTodayIntent(scope, mutation), /vérifier/);
});

test('allows a distinct action after a settled resource operation', async () => {
  const id = crypto.randomUUID();
  let first;
  await submitTodayRequest(scope, { operation: 'task.complete', id }, async requestId => { first = requestId; return outcome('completed'); });
  await submitTodayRequest(scope, { operation: 'task.reopen', id }, async requestId => { assert.notEqual(requestId, first); return outcome('completed'); });
});
