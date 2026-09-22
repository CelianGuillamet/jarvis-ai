import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTask,
  confirmSend,
  createPrototypeState,
  reconcileSend,
} from '../src/prototype/model.ts';

test('unknown email outcomes cannot be resent; reconciliation records no new send', () => {
  const state = createPrototypeState('unknown');
  assert.equal(confirmSend(state), false);
  assert.equal(state.activities.length, 0);
  assert.equal(reconcileSend(state), true);
  assert.equal(state.sendState, 'sent');
  assert.equal(confirmSend(state), false);
  assert.equal(reconcileSend(state), false);
  assert.equal(state.activities.length, 1);
  assert.match(state.activities[0].detail, /Aucun nouvel envoi/);
});

test('confirmation creates one outcome, and disconnected/unavailable states deny sends', () => {
  for (const scenario of ['expired', 'unavailable', 'empty']) {
    assert.equal(confirmSend(createPrototypeState(scenario)), false);
  }
  const state = createPrototypeState();
  assert.equal(confirmSend(state), true);
  assert.equal(confirmSend(state), false);
  assert.equal(state.activities.length, 1);
});

test('tasks work without Google but cannot be fabricated during data failure', () => {
  const state = createPrototypeState('expired');
  assert.equal(addTask(state, '  Préparer le rendez-vous  '), true);
  assert.equal(state.tasks.at(-1).title, 'Préparer le rendez-vous');
  assert.equal(addTask(state, '   '), false);
  assert.equal(addTask(state, 'x'.repeat(161)), false);
  const unavailable = createPrototypeState('unavailable');
  assert.equal(addTask(unavailable, 'Tâche'), false);
  assert.equal(unavailable.tasks.length, 2);
});
