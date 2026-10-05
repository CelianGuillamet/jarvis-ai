import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://app.example.test/' });
for (const key of ['window', 'document', 'localStorage', 'Element', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Document', 'ShadowRoot', 'Event']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_key, work) => work() } } });
globalThis.history = dom.window.history;
const { createApp, nextTick } = await import('vue');
const { createPinia, setActivePinia } = await import('pinia');
const { createRouter, createMemoryHistory } = await import('vue-router');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await cleanup(); });
async function settle() { for (let i = 0; i < 20; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick(); } }
const id = crypto.randomUUID();
const noteId = crypto.randomUUID();
async function mount({ unavailable = false, uncertain = false, failNextPage = false } = {}) {
  localStorage.clear();
  const requests = [];
  const pinia = createPinia(); setActivePinia(pinia);
  const status = modules.useStatusStore();
  status.refresh = async () => {};
  status.snapshot = { freshness: { calendar: { expiresAt: null } }, availability: { calendar: 'not_refreshed' }, focus: { nextEvent: null }, pendingAction: null };
  let hasMore = true;
  let done = false;
  const conversationId = crypto.randomUUID();
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, ...options });
    if (url.endsWith('/account/me')) return new Response(JSON.stringify({ id: 'owner', name: 'Owner', email: 'owner@example.test' }));
    if (failNextPage && url.includes('taskOffset=50')) return new Response('{}', { status: 503 });
    if (url.includes('/today?')) return new Response(JSON.stringify(unavailable ? {} : { conversationId, fetchedAt: new Date().toISOString(), tasks: [{ id, text: url.includes('taskOffset=50') ? 'Next page' : 'Existing task', done, doneAt: done ? new Date().toISOString() : null, createdAt: new Date().toISOString() }], notes: [{ id: noteId, title: 'Existing note', text: 'Body', createdAt: new Date().toISOString() }], tasksHasMore: hasMore, notesHasMore: false }), { status: unavailable ? 503 : 200 });
    if (url.endsWith('/today/mutations')) { const operation = JSON.parse(options.body).mutation.operation; if (!uncertain && operation === 'task.complete') done = true; if (!uncertain && operation === 'task.reopen') done = false; hasMore = false; return new Response(JSON.stringify({ commandId: crypto.randomUUID(), state: uncertain ? 'unknown' : 'completed', simulation: false, text: uncertain ? 'Résultat à vérifier' : 'Action enregistrée' })); }
    throw new Error(`Unexpected ${url}`);
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: modules.TodayView }, { path: '/chat', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  const app = createApp(modules.TodayView); app.use(pinia).use(router); app.mount('#root'); await settle();
  return { requests, close: () => app.unmount() };
}
function input(selector, text) { const node = document.querySelector(selector); node.value = text; node.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }
function submit(selector) { document.querySelector(selector).closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }
test('renders Today and pages tasks independently from notes', async () => {
  const fixture = await mount();
  try {
    assert.match(document.body.textContent, /Aujourd’hui/);
    assert.match(document.body.textContent, /Actualisez pour consulter/);
    assert.match(document.body.textContent, /Existing note/);
    document.querySelector('nav[aria-label="Pages des tâches"] button:last-child').click(); await settle();
    assert.ok(fixture.requests.some(row => row.url.includes('taskOffset=50') && row.url.includes('noteOffset=0')));
    assert.match(document.body.textContent, /Next page/);
  } finally { fixture.close(); }
});
test('submits task and note forms with deterministic contracts and refreshes reads', async () => {
  const fixture = await mount();
  try {
    input('#task-text', 'New task'); submit('#task-text'); await settle();
    input('#note-title', 'New title'); input('#note-text', 'New note'); submit('#note-text'); await settle();
    const mutations = fixture.requests.filter(row => row.url.endsWith('/today/mutations')).map(row => JSON.parse(row.body));
    assert.equal(mutations[0].mutation.operation, 'task.create');
    assert.equal(mutations[1].mutation.operation, 'note.create');
    assert.ok(mutations.every(row => /^[0-9a-f-]{36}$/.test(row.requestId)));
    assert.ok(fixture.requests.filter(row => row.url.includes('/today?')).length >= 3);
    assert.equal(document.querySelector('#task-text').value, '');
    assert.equal(document.querySelector('#note-text').value, '');
  } finally { fixture.close(); }
});
test('keeps uncertain input and reuses its identity on explicit retry', async () => {
  const fixture = await mount({ uncertain: true });
  try {
    input('#task-text', 'Uncertain task'); submit('#task-text'); await settle();
    assert.equal(document.querySelector('#task-text').value, 'Uncertain task');
    submit('#task-text'); await settle();
    const ids = fixture.requests.filter(row => row.url.endsWith('/today/mutations')).map(row => JSON.parse(row.body).requestId);
    assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  } finally { fixture.close(); }
});
test('does not present unavailable reads as empty tasks or notes', async () => {
  const fixture = await mount({ unavailable: true });
  try { assert.ok(document.querySelector('[role="alert"]')); assert.doesNotMatch(document.body.textContent, /Aucune tâche sur cette page/); }
  finally { fixture.close(); }
});

test('edits exact task and note IDs and completes and reopens a task', async () => {
  const fixture = await mount();
  try {
    document.querySelector('ul li button:last-child').click(); await settle();
    input('#task-text', 'Edited task'); submit('#task-text'); await settle();
    const noteEdit = [...document.querySelectorAll('ul li button')].find(button => button.textContent.includes('Existing note'));
    noteEdit.click(); await settle(); input('#note-text', 'Edited note'); submit('#note-text'); await settle();
    document.querySelector('button[aria-label="Terminer : Existing task"]').click(); await settle();
    document.querySelector('button[aria-label="Rouvrir : Existing task"]').click(); await settle();
    const requests = fixture.requests.filter(row => row.url.endsWith('/today/mutations')).map(row => JSON.parse(row.body));
    assert.deepEqual(requests.map(row => row.mutation.operation), ['task.edit', 'note.edit', 'task.complete', 'task.reopen']);
    assert.equal(requests[0].mutation.id, id); assert.equal(requests[1].mutation.id, noteId); assert.equal(requests[2].mutation.id, id);
  } finally { fixture.close(); }
});
test('retains the last successful page after a pagination failure', async () => {
  const fixture = await mount({ failNextPage: true });
  try {
    document.querySelector('nav[aria-label="Pages des tâches"] button:last-child').click(); await settle();
    assert.match(document.body.textContent, /Existing task/);
    assert.ok(document.querySelector('nav[aria-label="Pages des tâches"] button:first-child').disabled);
    assert.ok(document.querySelector('[role="alert"]'));
  } finally { fixture.close(); }
});
