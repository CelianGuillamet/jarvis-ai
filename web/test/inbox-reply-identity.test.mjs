import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replyRequestId, completeReplyRequest } from '../src/core/api/inbox-reply-identity.ts';

const values = new Map();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_key, work) => work() } } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
} });
const intent = { conversationId: 'owned-conversation', messageId: 'message', replyText: 'Bonjour', archiveAfter: true };
beforeEach(() => values.clear());

test('reuses a persisted attempt across repeated and concurrent calls', async () => {
  const ids = await Promise.all([replyRequestId(intent), replyRequestId(intent)]);
  assert.equal(ids[0], ids[1]);
  assert.equal(await replyRequestId({ ...intent }), ids[0]);
  assert.ok(![...values.values()][0].includes('Bonjour'));
});

test('blocks a changed reply while the previous attempt is unresolved', async () => {
  await replyRequestId(intent);
  await assert.rejects(replyRequestId({ ...intent, replyText: 'Autre texte' }), /précédente/);
  await assert.rejects(replyRequestId({ ...intent, archiveAfter: false }), /précédente/);
});

test('isolates conversations and clears only the acknowledged attempt', async () => {
  const first = await replyRequestId(intent);
  assert.notEqual(await replyRequestId({ ...intent, conversationId: 'other-owner-conversation' }), first);
  await completeReplyRequest(intent.conversationId, intent.messageId, 'wrong-attempt');
  assert.equal(await replyRequestId(intent), first);
  await completeReplyRequest(intent.conversationId, intent.messageId, first);
  assert.notEqual(await replyRequestId(intent), first);
});

test('binds durable attempt identity to reviewed recipient and subject', async () => {
  const reviewed = { ...intent, reviewedReply: { to: 'sender@example.invalid', subject: 'Re: Subject' } };
  await replyRequestId(reviewed);
  await assert.rejects(replyRequestId({ ...reviewed, reviewedReply: { ...reviewed.reviewedReply, to: 'other@example.invalid' } }), /précédente/);
  await assert.rejects(replyRequestId({ ...reviewed, reviewedReply: { ...reviewed.reviewedReply, subject: 'Other' } }), /précédente/);
});
