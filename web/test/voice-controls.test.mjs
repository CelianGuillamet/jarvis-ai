import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAccountComponents } from './helpers/components.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/' });
for (const name of ['window', 'document', 'Element', 'Node', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'Document', 'ShadowRoot', 'history', 'location', 'Event', 'DOMException'])
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createApp, h, nextTick } = await import('vue');
const { createPinia } = await import('pinia');
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await cleanup(); });
async function settle() { for (let n = 0; n < 10; n++) { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick(); } }
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);

function fakeAudio() {
  const log = { stopped: 0, closed: 0 };
  const track = { stop: () => { log.stopped++; } };
  Object.defineProperty(dom.window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => undefined;
  globalThis.AudioContext = class { constructor() { this.sampleRate = 48000; this.audioWorklet = { addModule: async () => undefined }; } createMediaStreamSource() { return { connect: () => undefined }; } close() { log.closed++; return Promise.resolve(); } };
  globalThis.AudioWorkletNode = class { constructor() { this.port = {}; } disconnect() {} };
  return log;
}
const status = (transcription, speech) => new Response(JSON.stringify({ transcription, speech }));

test('renders nothing while the voice engines are disabled', async () => {
  globalThis.fetch = async () => status('disabled', 'disabled');
  const app = createApp({ render: () => h(modules.VoiceControls) });
  app.use(createPinia()); app.mount('#root');
  try { await settle(); assert.equal(document.querySelector('[aria-label="Voix locale"]'), null); } finally { app.unmount(); }
});

test('explains a missing engine without offering the microphone', async () => {
  globalThis.fetch = async () => status('unavailable', 'unavailable');
  const app = createApp({ render: () => h(modules.VoiceControls) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    assert.match(document.body.textContent, /Dictée indisponible/);
    assert.match(document.body.textContent, /Lecture vocale indisponible/);
    assert.equal(button('Parler'), undefined);
  } finally { app.unmount(); }
});

test('listens only after a click, shows the listening state, and releases the microphone on account change', async () => {
  const audio = fakeAudio();
  globalThis.fetch = async () => status('ready', 'ready');
  const transcripts = [];
  const app = createApp({ render: () => h(modules.VoiceControls, { onTranscript: text => transcripts.push(text) }) });
  const pinia = createPinia();
  app.use(pinia); app.mount('#root');
  try {
    await settle();
    assert.equal(audio.stopped, 0);
    assert.equal(button('Parler').getAttribute('aria-pressed'), 'false');
    button('Parler').click(); await settle();
    assert.match(document.body.textContent, /Écoute en cours/);
    assert.equal(document.querySelector('[aria-pressed=true]').textContent.trim(), 'Arrêter et transcrire');
    const store = modules.useAppStore(pinia);
    store.invalidateAccount(); await settle();
    assert.ok(audio.stopped >= 1, 'microphone tracks stopped');
    assert.ok(audio.closed >= 1, 'audio graph closed');
    assert.doesNotMatch(document.body.textContent, /Écoute en cours/);
    assert.equal(button('Parler').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(transcripts, []);
  } finally { app.unmount(); }
});

test('explains a refused microphone', async () => {
  Object.defineProperty(dom.window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError'); } } });
  globalThis.fetch = async () => status('ready', 'disabled');
  const app = createApp({ render: () => h(modules.VoiceControls) });
  app.use(createPinia()); app.mount('#root');
  try {
    await settle();
    button('Parler').click(); await settle();
    assert.match(document.body.textContent, /micro est refusé/);
    assert.equal(button('Parler').disabled, false);
  } finally { app.unmount(); }
});
