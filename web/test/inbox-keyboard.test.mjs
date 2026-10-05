import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://app.example.test' });
for (const key of ['window','document','localStorage','Element','HTMLElement','SVGElement','HTMLInputElement','HTMLTextAreaElement','Document','ShadowRoot','Event']) globalThis[key] = dom.window[key];
const { createApp, nextTick } = await import('vue');
const { createPinia, setActivePinia } = await import('pinia');
const { modules, cleanup } = await loadAccountComponents();
after(async () => { dom.window.close(); await cleanup(); });
async function settle() { for (let i = 0; i < 10; i++) { await new Promise(resolve => setTimeout(resolve,0)); await nextTick(); } }
test('keyboard selects the focused item without stealing native button or text input keys', async () => {
  const pinia = createPinia(); setActivePinia(pinia);
  const status = modules.useStatusStore(); status.refresh = async () => {};
  status.snapshot = { integrations: { gmailConnected: true } };
  const inbox = modules.useInboxZeroStore();
  inbox.session = { sessionId:'conversation', step:'urgent', scannedAt:new Date().toISOString(), counts:{} };
  inbox.items = ['one','two'].map(messageId => ({ messageId, subject:messageId, from:'sender@example.invalid', snippet:'Message body', category:'urgent', priority:1, suggested:null }));
  inbox.loadSession = async () => {};
  const app = createApp(modules.InboxZeroView); app.use(pinia); app.mount('#root');
  try {
    await settle(); inbox.setCursor('one');
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'j', bubbles:true }));
    assert.equal(inbox.cursorId,'two');
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:' ', bubbles:true }));
    assert.deepEqual(inbox.selectedIds,['two']);
    const button = document.querySelector('button');
    const event = new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }); button.dispatchEvent(event);
    assert.equal(event.defaultPrevented,false);
    const input = document.createElement('textarea'); document.body.append(input);
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'j', bubbles:true }));
    assert.equal(inbox.cursorId,'two');
  } finally { app.unmount(); }
});
