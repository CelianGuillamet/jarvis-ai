import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyMessages, restoredPending } from '../src/features/chat/history.ts';

const date = '2026-10-03T12:00:00.000Z';
const pending = { id: 'command', summary: 'Supprimer la cible', risk: 'high', sideEffect: true };
const turn = {
  id: 'turn', kind: 'chat', inputText: 'Supprime cette cible', state: 'completed',
  response: { text: 'Confirme cette cible.', pending_action: pending, meta: { awaiting: 'confirm' } },
  command: { id: 'command', state: 'waiting' }, createdAt: date, updatedAt: date,
};
const page = {
  conversationId: 'conversation', fetchedAt: date, nextCursor: null, turns: [turn],
  pendingCommand: { id: 'command', state: 'waiting', expiresAt: '2026-10-04T12:00:00.000Z' },
};

test('restores stable message identities and exact assistant text without executing anything', () => {
  const messages = historyMessages(page);
  assert.deepEqual(messages.map(message => [message.id, message.role, message.text]), [
    ['turn:input', 'user', 'Supprime cette cible'],
    ['turn:response', 'assistant', 'Confirme cette cible.'],
  ]);
  assert.deepEqual(historyMessages(page), messages);
});

test('only a current unexpired waiting command restores its confirmation', () => {
  assert.deepEqual(restoredPending(page, Date.parse(date)), pending);
  assert.equal(restoredPending({ ...page, pendingCommand: null }, Date.parse(date)), null);
  assert.equal(restoredPending(page, Date.parse('2026-10-05')), null);
  assert.equal(restoredPending({ ...page, pendingCommand: { ...page.pendingCommand, id: 'other' } }, Date.parse(date)), null);
  assert.equal(restoredPending({ ...page, turns: [{ ...turn, command: { ...turn.command, state: 'completed' } }] }, Date.parse(date)), null);
});

test('interrupted requests never assert that an action failed or offer automatic retry', () => {
  for (const state of ['started', 'failed']) {
    const messages = historyMessages({ ...page, turns: [{ ...turn, state, response: null }] });
    assert.equal(messages[1].role, 'system');
    assert.match(messages[1].text, /ne permet pas de déterminer si une action a eu lieu/);
  }
});

test('confirmation history uses a human label rather than displaying an internal command ID', () => {
  const messages = historyMessages({ ...page, turns: [{ ...turn, kind: 'confirm', inputText: 'private-command-id' }] });
  assert.equal(messages[0].text, 'Confirmation de la commande proposée');
  assert.equal(messages.some(message => message.text.includes('private-command-id')), false);
});
