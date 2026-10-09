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
const now = new Date().toISOString();
const step = (id, state, extra = {}) => ({ id, tool: id === 'agenda' ? 'calendar.list' : 'todo.list', optional: id === 'agenda', state, attempt: 1, commandId: null, text: null, evidence: null, ...extra });

test('lists routines, starts one with a fresh request ID and shows suspended steps with a resume decision', async () => {
  let enabled = true;
  let runs = [{ id: 'r1', routineKey: 'prepare-day', state: 'suspended', steps: [step('agenda', 'completed'), step('tasks', 'unknown')], result: null, cancelRequested: false, createdAt: now, updatedAt: now }];
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method: init.method ?? 'GET', body });
    const list = () => new Response(JSON.stringify({
      routines: [{ key: 'prepare-day', title: 'Prépare ma journée', description: 'Lecture seule.', enabled, steps: [{ id: 'agenda', tool: 'calendar.list', optional: true, effect: 'read-only' }] }],
      runs,
    }));
    if (path === '/routines') return list();
    if (path === '/routines/prepare-day/enabled') { enabled = body.enabled; return list(); }
    if (path === '/routines/prepare-day/runs') { runs = [{ ...runs[0], id: 'r2', state: 'completed', steps: [step('agenda', 'completed'), step('tasks', 'completed')], result: 'Agenda du jour\nAucun événement' }, ...runs]; return new Response(JSON.stringify(runs[0]), { status: 201 }); }
    if (path === '/routines/runs/r1/resume') { runs = runs.map(r => r.id === 'r1' ? { ...r, state: 'completed', steps: [step('agenda', 'completed'), step('tasks', 'completed', { attempt: 2, evidence: body.evidence })] } : r); return new Response(JSON.stringify(runs.find(r => r.id === 'r1')), { status: 201 }); }
    throw new Error(`Unexpected ${path}`);
  };
  const app = createApp({ render: () => h(modules.RoutinesCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    const text = () => document.body.textContent;
    assert.match(text(), /Prépare ma journée/);
    assert.match(text(), /En pause : résultat incertain/);
    assert.match(text(), /Rien n’est relancé automatiquement/);

    button('Lancer').click(); await settle();
    const started = calls.find(c => c.path === '/routines/prepare-day/runs');
    assert.match(started.body.requestId, /^[0-9a-f-]{36}$/);
    assert.match(text(), /Aucun événement/);

    button('Décider de la suite').click(); await settle();
    assert.equal(button('Confirmer').disabled, true);
    const input = document.querySelector('#routine-evidence-r1');
    input.value = 'Lecture seule vérifiée'; input.dispatchEvent(new dom.window.Event('input')); await settle();
    button('Confirmer').click(); await settle();
    const resume = calls.find(c => c.path === '/routines/runs/r1/resume');
    assert.deepEqual(resume.body, { stepId: 'tasks', resolution: 'retry', evidence: 'Lecture seule vérifiée' });
    assert.match(text(), /tentative 2/);

    button('Désactiver').click(); await settle();
    assert.equal(button('Lancer').disabled, true);
    assert.match(text(), /Désactivée/);
  } finally { app.unmount(); }
});

test('shows a recoverable error instead of crashing when routines cannot be read', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  const app = createApp({ render: () => h(modules.RoutinesCard) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    assert.match(document.body.textContent, /Impossible de lire les routines/);
    assert.ok(button('Réessayer'));
  } finally { app.unmount(); }
});
