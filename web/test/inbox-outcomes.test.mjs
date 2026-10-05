import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadAccountComponents } from './helpers/components.mjs';
import { createPinia, setActivePinia } from 'pinia';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html/>', { url: 'https://app.example.test' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
after(() => dom.window.close());
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_key, work) => work() } } });
const { modules, cleanup } = await loadAccountComponents();
after(cleanup);
beforeEach(() => { storage.clear(); setActivePinia(createPinia()); });
function fixture(outcome) {
  const app = modules.useAppStore();
  const inbox = modules.useInboxZeroStore();
  inbox.session = { sessionId: 'conversation', step: 'urgent' };
  inbox.messagePanel = { message: { id: 'message' }, item: null };
  inbox.replyText = 'My response';
  app.jarvis.inboxZeroApply = async () => ({ session: inbox.session, items: [], recentActions: [], results: [{ messageId: 'message', outcome, ok: outcome === 'completed' }] });
  return { app, inbox };
}
for (const outcome of ['unknown', 'partial']) test(`keeps draft and visible ${outcome} outcome after sending`, async () => {
  const { inbox } = fixture(outcome);
  await inbox.sendReply('message');
  assert.equal(inbox.messagePanel.message.id, 'message');
  assert.equal(inbox.replyText, 'My response');
  assert.equal(inbox.actionResults[0].outcome, outcome);
  assert.equal(inbox.busy, false);
});
test('retains draft and persistent error after transport failure', async () => {
  const { inbox, app } = fixture('unknown');
  app.jarvis.inboxZeroApply = async () => { throw new Error('Response lost'); };
  await inbox.sendReply('message');
  assert.equal(inbox.replyText, 'My response');
  assert.ok(inbox.messagePanel);
  assert.equal(inbox.actionError, 'Response lost');
  assert.equal(inbox.actionResults.length, 0);
});
test('closes the editor only after confirmed completion', async () => {
  const { inbox } = fixture('completed');
  await inbox.sendReply('message');
  assert.equal(inbox.messagePanel, null);
  assert.equal(inbox.replyText, '');
  assert.equal(inbox.actionResults[0].outcome, 'completed');
});

test('does not close a different message opened while the reply is in flight', async () => {
  const { inbox, app } = fixture('completed');
  app.jarvis.inboxZeroApply = async () => {
    inbox.messagePanel = { message: { id: 'other' }, item: null };
    inbox.replyText = 'Other draft';
    return { session: inbox.session, items: [], recentActions: [], results: [{ messageId: 'message', outcome: 'completed', ok: true }] };
  };
  await inbox.sendReply('message');
  assert.equal(inbox.messagePanel.message.id, 'other');
  assert.equal(inbox.replyText, 'Other draft');
});
