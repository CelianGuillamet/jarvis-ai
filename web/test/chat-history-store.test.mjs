import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';

const dom = new JSDOM('<!doctype html>', { url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'localStorage', 'Element', 'HTMLElement', 'SVGElement'])
  globalThis[name] = dom.window[name];
const { createPinia, setActivePinia } = await import('pinia');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  dom.window.close();
  await cleanup();
});
const date = '2026-10-03T12:00:00.000Z';
const page = (id = 'latest', nextCursor = null) => ({
  conversationId: 'owned', fetchedAt: date, nextCursor, pendingCommand: null,
  turns: [{ id, kind: 'chat', inputText: `Question ${id}`, state: 'completed',
    response: { text: `Réponse ${id}` }, command: null, createdAt: date, updatedAt: date }],
});
function store() {
  setActivePinia(createPinia());
  return modules.useChatStore();
}

test('loads server history once and prepends a bounded older page without duplicate messages', async () => {
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return new Response(JSON.stringify(url.includes('cursor=') ? page('older') : page('latest', 'latest')));
  };
  const chat = store();
  await chat.loadHistory();
  await chat.loadHistory();
  assert.equal(requests.length, 1);
  await chat.loadHistory(true);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /cursor=latest/);
  assert.match(requests[1], /limit=20/);
  assert.deepEqual(chat.messages.map(message => message.id), ['older:input', 'older:response', 'latest:input', 'latest:response']);
  assert.equal(chat.historyFetchedAt, date);
  assert.equal(chat.historyCursor, null);
});

test('reset discards a late history response from the previous conversation', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const chat = store();
  const loading = chat.loadHistory();
  chat.reset();
  resolve(new Response(JSON.stringify(page())));
  await loading;
  assert.deepEqual(chat.messages, []);
  assert.equal(chat.historyLoaded, false);
  assert.equal(chat.historyBusy, false);
});

test('history failure remains visible and retry cannot masquerade as an empty conversation', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  const chat = store();
  await chat.loadHistory();
  assert.equal(chat.historyLoaded, false);
  assert.ok(chat.historyError);
  globalThis.fetch = async () => new Response(JSON.stringify(page()));
  await chat.loadHistory();
  assert.equal(chat.historyLoaded, true);
  assert.equal(chat.historyError, null);
});

test('a received result survives a history persistence failure and warns against repeating an effect', async () => {
  globalThis.fetch = async (url) => new Response(JSON.stringify(url.includes('/jarvis/history') ? page() : {
    text: 'Envoyé', meta: { commandState: 'completed', historySaved: false },
  }));
  const chat = store();
  await chat.loadHistory();
  await chat.send('Envoyer');
  assert.equal(chat.messages.at(-2).text, 'Envoyé');
  assert.match(chat.messages.at(-1).text, /Ne relance pas une action déjà réalisée/);
});

test('a first request from a dashboard shortcut loads history before sending', async () => {
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return new Response(JSON.stringify(url.includes('/jarvis/history') ? page() : { text: 'Nouvelle réponse' }));
  };
  const chat = store();
  await chat.send('Question depuis le tableau de bord');
  assert.equal(requests.length, 2);
  assert.match(requests[0], /\/jarvis\/history/);
  assert.match(requests[1], /\/jarvis\/chat/);
  assert.equal(chat.messages.at(-1).text, 'Nouvelle réponse');
});

test('status cannot revive a command missing from the current history reference', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(page()));
  const chat = store();
  await chat.loadHistory();
  chat.restorePendingFromStatus({ id: 'old', summary: 'Ancienne commande', risk: 'high', sideEffect: true });
  assert.equal(chat.pendingAction, null);
  assert.equal(chat.canConfirmPending, false);
});

test('a passive status preserves the exact historical preview of a live confirmation', async () => {
  const pending = { id: 'current', name: 'todo.delete', args: {}, summary: 'Cible figée', preview: 'Prévisualisation exacte', risk: 'medium', sideEffect: true, planner: 'direct', confidence: 'high' };
  const history = page();
  history.pendingCommand = { id: 'current', state: 'waiting', expiresAt: new Date(Date.now() + 60000).toISOString() };
  history.turns[0].command = { id: 'current', state: 'waiting' };
  history.turns[0].response.pending_action = pending;
  globalThis.fetch = async () => new Response(JSON.stringify(history));
  const chat = store();
  await chat.loadHistory();
  chat.restorePendingFromStatus({ ...pending, preview: null });
  assert.equal(chat.pendingAction.preview, 'Prévisualisation exacte');
  assert.equal(chat.canConfirmPending, true);
  chat.restorePendingFromStatus(null);
  assert.equal(chat.pendingAction, null);
  assert.equal(chat.canConfirmPending, false);
});

test('status store uses passive reads unless provider refresh is explicitly requested', async () => {
  setActivePinia(createPinia());
  const app = modules.useAppStore();
  const status = modules.useStatusStore();
  const calls = [];
  app.jarvis.status = () => { calls.push('passive'); return Promise.resolve({}); };
  app.jarvis.refreshStatus = () => { calls.push('refresh'); return Promise.resolve({}); };
  await status.refresh();
  await status.refresh(true);
  assert.deepEqual(calls, ['passive', 'refresh']);
});
