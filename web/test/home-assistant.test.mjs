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
const type = (selector, value) => { const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new dom.window.Event('input')); };
const light = { entityId: 'light.salon', label: 'Lampe du salon' };
const scene = { entityId: 'scene.film', label: 'Soirée film' };

test('stays inert when disabled on the server', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ enabled: false, connected: false, baseUrl: null, entities: [] }));
  const app = createApp({ render: () => h(modules.HomeAssistantCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    assert.match(document.body.textContent, /désactivée sur ce serveur/);
    assert.equal(document.querySelector('#home-token'), null);
  } finally { app.unmount(); }
});

test('connects without re-displaying the token, selects devices and disconnects after confirmation', async () => {
  let status = { enabled: true, connected: false, baseUrl: null, entities: [] };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method: init.method ?? 'GET', body });
    if (path === '/home' && (init.method ?? 'GET') === 'GET') return new Response(JSON.stringify(status));
    if (path === '/home/connect') { status = { enabled: true, connected: true, baseUrl: 'http://homeassistant.local:8123', entities: [] }; return new Response(JSON.stringify(status), { status: 201 }); }
    if (path === '/home/discover') return new Response(JSON.stringify({ entities: [light, scene] }));
    if (path === '/home/entities') { status = { ...status, entities: [light] }; return new Response(JSON.stringify(status), { status: 201 }); }
    if (path === '/home/disconnect') { status = { enabled: true, connected: false, baseUrl: null, entities: [] }; return new Response(JSON.stringify(status), { status: 201 }); }
    throw new Error(`Unexpected ${path}`);
  };
  const app = createApp({ render: () => h(modules.HomeAssistantCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    assert.equal(document.querySelector('#home-token').type, 'password');
    assert.equal(button('Connecter').disabled, true);
    type('#home-url', 'http://homeassistant.local:8123');
    type('#home-token', 'long-lived-token-0123456789'); await settle();
    button('Connecter').click(); await settle();
    assert.deepEqual(calls.find(c => c.path === '/home/connect').body, { baseUrl: 'http://homeassistant.local:8123', token: 'long-lived-token-0123456789' });
    assert.doesNotMatch(document.body.innerHTML, /long-lived-token/);
    assert.match(document.body.textContent, /Connecté à/);

    button('Choisir les appareils').click(); await settle();
    const boxes = [...document.querySelectorAll('input[type=checkbox]')];
    assert.equal(boxes.length, 2);
    assert.equal(boxes.some(box => box.checked), false);
    boxes[0].checked = true; boxes[0].dispatchEvent(new dom.window.Event('change')); await settle();
    button('Enregistrer la sélection').click(); await settle();
    assert.deepEqual(calls.find(c => c.path === '/home/entities').body, { entityIds: ['light.salon'] });
    assert.match(document.body.textContent, /1 appareil\(s\) autorisé\(s\)/);

    button('Déconnecter').click(); await settle();
    assert.equal(calls.some(c => c.path === '/home/disconnect'), false);
    button('Confirmer la déconnexion').click(); await settle();
    assert.equal(calls.filter(c => c.path === '/home/disconnect').length, 1);
    assert.match(document.body.textContent, /déconnecté et le jeton a été supprimé/);
    assert.ok(document.querySelector('#home-url'));
  } finally { app.unmount(); }
});

test('explains a refused connection without exposing the server reply', async () => {
  globalThis.fetch = async (url, init = {}) => new URL(url).pathname === '/home/connect'
    ? new Response(JSON.stringify({ code: 'CONFLICT', message: 'Seules les adresses du réseau local sont autorisées.' }), { status: 409 })
    : new Response(JSON.stringify({ enabled: true, connected: false, baseUrl: null, entities: [] }));
  const app = createApp({ render: () => h(modules.HomeAssistantCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    type('#home-url', 'http://8.8.8.8:8123'); type('#home-token', 'long-lived-token-0123456789'); await settle();
    button('Connecter').click(); await settle();
    assert.match(document.body.textContent, /Connexion refusée/);
  } finally { app.unmount(); }
});
