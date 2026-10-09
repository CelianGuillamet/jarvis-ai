import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'localStorage', 'Element', 'HTMLElement', 'SVGElement', 'history', 'Event']) globalThis[name] = dom.window[name];
const { createApp, h, nextTick } = await import('vue');
const { createPinia, setActivePinia } = await import('pinia');
const { createRouter, createMemoryHistory } = await import('vue-router');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await cleanup(); });
const date = '2026-10-05T12:00:00.000Z';
const command = (id, state) => ({ id, operation: 'note.add', source: 'direct', state, outcomeCode: null, createdAt: date, updatedAt: date, expiresAt: date, undoRecorded: state === 'completed' });
const page = (commands = [], nextCursor = null) => ({ conversationId: 'owned', fetchedAt: date, commands, nextCursor });
async function settle() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick(); } }
async function mount(shell = false) {
  const pinia = createPinia(); setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: modules.ActivityView }, { path: '/chat', component: modules.ActivityView }] });
  await router.push('/'); await router.isReady();
  const app = createApp({ render: () => shell ? h(modules.AppShell, {}, { default: () => h('p', { id: 'screen' }, 'Écran privé') }) : h(modules.ActivityView) });
  app.use(pinia); app.use(router); app.mount('#root'); await settle(); return app;
}
test('shows durable results, safe unknown guidance and bounded older pages', async () => {
  const urls = [];
  globalThis.fetch = async url => { if (new URL(url).pathname === '/routines') return new Response(JSON.stringify({ routines: [], runs: [] })); urls.push(url); return new Response(JSON.stringify(url.includes('cursor=') ? page([command('older', 'failed')]) : page([command('one', 'completed'), command('two', 'unknown')], 'two'))); };
  const mounted = await mount();
  try {
    assert.match(document.body.textContent, /Terminée/);
    assert.match(document.body.textContent, /Résultat incertain/);
    assert.match(document.body.textContent, /avant toute nouvelle action/);
    assert.equal(document.querySelectorAll('li').length, 2);
    [...document.querySelectorAll('button')].find(button => button.textContent.includes('précédentes')).click(); await settle();
    assert.equal(document.querySelectorAll('li').length, 3);
    assert.match(urls[1], /cursor=two/); assert.match(urls[1], /limit=20/);
  } finally { mounted.unmount(); }
});
test('unavailable reads are distinct from a successfully empty journal', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  const mounted = await mount();
  try {
    assert.match(document.body.textContent, /Activité indisponible/);
    assert.doesNotMatch(document.body.textContent, /Aucune action enregistrée/);
    globalThis.fetch = async () => new Response(JSON.stringify(page()));
    [...document.querySelectorAll('button')].find(button => button.textContent.includes('Actualiser')).click(); await settle();
    assert.match(document.body.textContent, /Aucune action enregistrée/);
  } finally { mounted.unmount(); }
});
test('a server outage has one recovery path and suppresses stacked generic notifications', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const mounted = await mount(true);
  try {
    const app = modules.useAppStore(); const toast = modules.useToastStore();
    await assert.rejects(app.jarvis.status());
    toast.push({ title: 'Erreur status', tone: 'danger' });
    toast.push({ title: 'Erreur Inbox', tone: 'danger' });
    await nextTick();
    assert.equal(document.querySelector('#screen').parentElement.style.display, 'none');
    assert.match(document.body.textContent, /temporairement indisponible/);
    assert.equal(toast.items.length, 0);
    assert.equal([...document.querySelectorAll('button')].filter(button => button.textContent.includes('Réessayer la connexion')).length, 1);
    const retained = document.querySelector('#screen');
    app.jarvis.status = async () => ({ pendingAction: null });
    [...document.querySelectorAll('button')].find(button => button.textContent.includes('Réessayer la connexion')).click();
    await settle();
    assert.equal(app.apiUnavailable, false);
    assert.equal(document.querySelector('#screen'), retained);
    assert.equal(retained.parentElement.style.display, '');
  } finally { mounted.unmount(); }
});
