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

test('reviews recipient and exact text, invalidates edits, and restores draft after reconnect', async () => {
  const pinia = createPinia(); setActivePinia(pinia);
  const status = modules.useStatusStore(); status.refresh = async () => {};
  status.snapshot = { integrations: { gmailConnected: false } };
  const inbox = modules.useInboxZeroStore(); const api = modules.useAppStore().jarvis;
  inbox.session = { sessionId:'conversation', step:'urgent', scannedAt:new Date().toISOString(), counts:{} };
  inbox.loadSession = async () => {};
  const message = { id:'reply-message', subject:'Question', from:'sender@example.invalid', date:new Date().toISOString(), bodyText:'Question body', threadId:'thread' };
  const panel = { message, item:null, reply:{ to:'sender@example.invalid', subject:'Re: Question' } };
  api.inboxZeroMessage = async () => panel;
  api.inboxReplyDraft = async () => ({ draft:{ messageId:message.id, text:'Restored reply', version:1, updatedAt:new Date().toISOString() } });
  const sent = [];
  api.inboxZeroApply = async payload => { sent.push(payload); return { session:inbox.session, items:[], recentActions:[], results:[{ messageId:message.id, ok:true, outcome:'completed' }] }; };
  api.saveInboxReplyDraft = async payload => ({ draft:{ ...payload, version:payload.version+1, updatedAt:new Date().toISOString() } });
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ locks:{ request:async (_key, work) => work() } } });
  let opened;
  const originalOpen = dom.window.open;
  dom.window.open = url => { opened=url; return null; };
  const app = createApp(modules.InboxZeroView); app.use(pinia); app.mount('#root');
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  try {
    await settle(); button('Connecter Google').click();
    assert.ok(opened.includes('/auth/google'));
    status.snapshot = { integrations:{ gmailConnected:true } };
    await inbox.openMessage(message.id); await settle();
    assert.equal(document.querySelector('textarea').value,'Restored reply');
    button('Vérifier la réponse').click(); await settle();
    assert.equal(document.querySelectorAll('[aria-label="Revue avant envoi"]').length,1);
    const review = document.querySelector('[aria-label="Revue avant envoi"]');
    assert.match(review.textContent,/sender@example.invalid/);
    assert.match(review.textContent,/Restored reply/); assert.equal(sent.length,0);
    const textarea = document.querySelector('textarea'); textarea.value='Edited after review'; textarea.dispatchEvent(new dom.window.Event('input',{ bubbles:true })); await settle();
    assert.equal(document.querySelector('[aria-label="Revue avant envoi"]'),null);
    button('Vérifier la réponse').click(); await settle();
    button('Confirmer l’envoi et archiver').click(); await settle();
    assert.equal(sent.length,1); assert.equal(sent[0].replyText,'Edited after review');
    assert.deepEqual(sent[0].reviewedReply,{ to:'sender@example.invalid',subject:'Re: Question' });
    assert.equal(inbox.messagePanel,null);
  } finally { app.unmount(); dom.window.open=originalOpen; }
});
