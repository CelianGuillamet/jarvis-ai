import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'navigator', 'Element', 'Node', 'HTMLElement', 'SVGElement', 'history', 'location'])
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
const { createApp, h, nextTick } = await import('vue');
const { createPinia } = await import('pinia');
const { createRouter, createMemoryHistory } = await import('vue-router');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await cleanup(); });
async function settle() { for (let n = 0; n < 8; n++) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick(); } }
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
const job = { id: 'f08d4668-565c-432f-b7e4-c010df24ae23', state: 'queued', revocationStatus: 'pending', requestedAt: '2026-10-06T10:00:00.000Z', localDeletedAt: null, completedAt: null, receiptExpiresAt: '2026-10-13T10:00:00.000Z' };

for (const failure of [false, true]) {
  test(`deletion requires confirmation and keeps its receipt before transport; failure=${failure}`, async () => {
    dom.window.sessionStorage.clear();
    const calls = [];
    let accepted = 0;
    globalThis.fetch = async (url, init) => {
      const pending = JSON.parse(dom.window.sessionStorage.getItem('jarvis.erasure.receipt.v1'));
      const body = JSON.parse(init.body);
      assert.equal(body.receipt, pending.receipt);
      assert.equal(pending.accountId, 'owner');
      assert.equal(body.confirmEmail, 'owner@example.test');
      assert.equal(body.expectedAccountId, 'owner');
      assert.equal(Object.hasOwn(body, 'ownerId'), false);
      calls.push({ url, body });
      if (failure) throw new TypeError('lost response');
      return new Response(JSON.stringify(job), { status: 202 });
    };
    const app = createApp({ render: () => h(modules.AccountDataControls, {
      account: { id: 'owner', name: 'Owner', email: 'owner@example.test' }, onAccepted: () => { accepted++; },
    }) });
    app.use(createPinia()); app.mount('#root');
    try {
      button('Préparer la suppression').click(); await nextTick();
      const confirm = button('Confirmer la suppression');
      assert.equal(confirm.disabled, true);
      const email = document.querySelector('input[autocomplete="email"]');
      email.value = 'owner@example.test'; email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await nextTick(); assert.equal(confirm.disabled, true);
      const checkbox = document.querySelector('input[type="checkbox"]');
      checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await nextTick(); assert.equal(confirm.disabled, false);
      confirm.click(); await settle();
      assert.equal(calls.length, 1);
      assert.equal(accepted, failure ? 0 : 1);
      if (failure) {
        assert.match(document.body.textContent, /Consultez son suivi/);
        assert.ok(document.querySelector('a[href="/deletion-status"]'));
      }
      assert.match(JSON.parse(dom.window.sessionStorage.getItem('jarvis.erasure.receipt.v1')).receipt, /^[a-f0-9]{64}$/);
    } finally { app.unmount(); }
  });
}

test('the real App renders receipt tracking without making any signed-account request', async () => {
  const receipt = 'a'.repeat(64);
  dom.window.sessionStorage.setItem('jarvis.erasure.receipt.v1', JSON.stringify({ accountId: 'owner', receipt }));
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    assert.equal(url.endsWith('/account/deletion/status'), true);
    assert.equal(url.includes(receipt), false);
    assert.equal(new Headers(init.headers).get('x-erasure-receipt'), receipt);
    return new Response(JSON.stringify({ ...job, state: 'completed', revocationStatus: 'manual_required', localDeletedAt: '2026-10-06T10:01:00.000Z', completedAt: '2026-10-06T10:01:00.000Z' }));
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/deletion-status', name: 'deletion-status', component: modules.DeletionStatusView }] });
  await router.push('/deletion-status'); await router.isReady();
  const app = createApp(modules.App); app.use(createPinia()); app.use(router); app.mount('#root');
  try {
    await settle();
    assert.equal(calls.length, 1);
    assert.match(document.body.textContent, /Vos données Jarvis ont été supprimées/);
    assert.match(document.body.textContent, /Retirez manuellement/);
    assert.ok(document.querySelector('a[href="https://myaccount.google.com/connections"]'));
    assert.equal(document.querySelector('.auth-screen'), null);
  } finally { app.unmount(); dom.window.sessionStorage.clear(); }
});
