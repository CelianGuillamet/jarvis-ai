import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'navigator', 'Element', 'Node', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Document', 'ShadowRoot', 'history', 'location', 'Event'])
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
const { createApp, h, nextTick } = await import('vue');
const { createPinia } = await import('pinia');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await cleanup(); });
async function settle() { for (let n = 0; n < 10; n++) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick(); } }
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const fact = (id, text, origin = 'chat', updatedAt = new Date().toISOString()) => ({ id, text, origin, createdAt: updatedAt, updatedAt });

test('lists provenance, adds, corrects and forgets only after confirmation', async () => {
  let facts = [fact('a', 'Je préfère le thé'), fact('b', 'Ancien fait', 'settings', '2025-01-01T00:00:00.000Z')];
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    if (path === '/account/memory' && !init.method?.match(/POST/)) return new Response(JSON.stringify({ facts }));
    if (path === '/account/memory') { const created = fact('c', JSON.parse(init.body).text, 'settings'); facts = [created, ...facts]; return new Response(JSON.stringify(created), { status: 201 }); }
    if (path === '/account/memory/a') { facts[facts.findIndex(f => f.id === 'a')] = fact('a', JSON.parse(init.body).text); return new Response(JSON.stringify(facts.find(f => f.id === 'a')), { status: 201 }); }
    if (path === '/account/memory/b/forget') { facts = facts.filter(f => f.id !== 'b'); return new Response(JSON.stringify({ facts }), { status: 201 }); }
    throw new Error(`Unexpected ${path}`);
  };
  const app = createApp({ render: () => h(modules.PersonalMemoryCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    const text = document.body.textContent;
    assert.match(text, /Approuvé dans le chat/);
    assert.match(text, /Ajouté dans Réglages/);
    assert.match(text, /ancien, vérifiez/);

    const input = document.querySelector('#memory-new');
    input.value = 'Je travaille le mardi'; input.dispatchEvent(new dom.window.Event('input'));
    document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await settle();
    assert.deepEqual(calls.find(c => c.method === 'POST' && c.path === '/account/memory').body, { text: 'Je travaille le mardi' });
    assert.match(document.querySelector('[role="status"]').textContent, /Fait enregistré/);

    document.querySelector('button[aria-label="Corriger : Je préfère le thé"]').click(); await settle();
    const edit = document.querySelector('#memory-edit-a');
    edit.value = 'Je préfère le café'; edit.dispatchEvent(new dom.window.Event('input'));
    button('Enregistrer').click(); await settle();
    assert.match(document.body.textContent, /Je préfère le café/);

    document.querySelector('button[aria-label="Oublier : Ancien fait"]').click(); await settle();
    assert.equal(calls.some(c => c.path === '/account/memory/b/forget'), false);
    button('Annuler').click(); await settle();
    document.querySelector('button[aria-label="Oublier : Ancien fait"]').click(); await settle();
    button('Confirmer l’oubli').click(); await settle();
    assert.equal(calls.filter(c => c.path === '/account/memory/b/forget').length, 1);
    assert.doesNotMatch(document.body.textContent, /Ancien fait/);
  } finally { app.unmount(); }
});
