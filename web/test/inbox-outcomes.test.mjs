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
  inbox.messagePanel = { message: { id: 'message' }, item: null, reply: { to: 'sender@example.invalid', subject: 'Re: Test question' } };
  inbox.replyText = 'My response';
  inbox.reviewReply('message');
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

test('does not send without review or after reviewed text changes', async () => {
  const { inbox, app } = fixture('completed');
  let calls = 0;
  app.jarvis.inboxZeroApply = async () => { calls++; throw new Error('Must not send'); };
  inbox.replyReview = null;
  await inbox.sendReply('message');
  inbox.reviewReply('message');
  inbox.replyText = 'Changed after review';
  await inbox.sendReply('message');
  assert.equal(calls, 0);
});

test('recovers validated per-message outcomes from the persisted action journal', async () => {
  const { inbox, app } = fixture('unknown');
  app.jarvis.inboxZeroSession = async () => ({ session: inbox.session, items: [], recentActions: [{ id: 'history', payload: { results: [{ messageId: 'message', outcome: 'unknown', ok: false }, { messageId: 'corrupt', outcome: 'completed', ok: false }] } }] });
  await inbox.loadSession();
  assert.equal(inbox.actionResults.length, 1);
  assert.equal(inbox.actionResults[0].outcome, 'unknown');
  let calls = 0;
  app.jarvis.inboxZeroApply = async () => { calls++; throw new Error('Must not resend'); };
  await inbox.sendReply('message');
  assert.equal(calls, 0);
  assert.match(inbox.actionError, /incertain/);
});

test('saves draft revisions and keeps text when another editor conflicts', async () => {
  const { inbox, app } = fixture('unknown');
  let payload;
  app.jarvis.saveInboxReplyDraft = async input => { payload = input; return { draft: { messageId: input.messageId, text: input.text, version: 1, updatedAt: new Date().toISOString() } }; };
  await inbox.saveReplyDraft();
  assert.equal(payload.version, 0);
  assert.equal(inbox.savedDraft.text, 'My response');
  inbox.replyText = 'Unsaved change';
  app.jarvis.saveInboxReplyDraft = async () => { throw new Error('Concurrent edit'); };
  await inbox.saveReplyDraft();
  assert.equal(inbox.replyText, 'Unsaved change');
  assert.equal(inbox.savedDraft.version, 1);
  assert.equal(inbox.draftSaveError, 'Concurrent edit');
  inbox.closeMessage();
  assert.ok(inbox.messagePanel);
});

test('restores a saved draft when opening the message in a fresh editor', async () => {
  const { inbox, app } = fixture('unknown');
  inbox.messagePanel = null; inbox.replyText = '';
  app.jarvis.inboxZeroMessage = async () => ({ message: { id: 'message' }, item: null, reply: { to: 'sender@example.invalid', subject: 'Re: Subject' } });
  app.jarvis.inboxReplyDraft = async () => ({ draft: { messageId: 'message', text: 'Saved before reconnect', version: 3, updatedAt: new Date().toISOString() } });
  await inbox.openMessage('message');
  assert.equal(inbox.replyText, 'Saved before reconnect');
  assert.equal(inbox.savedDraft.version, 3);
  inbox.closeMessage(); assert.equal(inbox.messagePanel, null);
});

test('restores only confirmed archived messages through the typed action', async () => {
  const { inbox, app } = fixture('completed');
  inbox.recentActions = [{ id:'archive', actionType:'archive', payload:{ results:[{ messageId:'one', ok:true, outcome:'completed' }, { messageId:'two', ok:false, outcome:'unknown' }] } }];
  let sent;
  app.jarvis.inboxZeroApply = async input => { sent=input; return { session:inbox.session, items:[], recentActions:[], results:[{ messageId:'one',ok:true,outcome:'completed' }] }; };
  await inbox.restoreArchivedAction('archive');
  assert.equal(sent.action,'restore_inbox'); assert.deepEqual(sent.messageIds,['one']);
});
