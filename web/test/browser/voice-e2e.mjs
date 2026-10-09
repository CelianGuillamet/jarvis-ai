// Real-browser verification of the local voice dialogue: headless Chrome whose getUserMedia is replaced by a stream
// playing a French fixture (Chrome's own fake-device file input delivers silence headless), the production components, and the real whisper.cpp / Piper engines behind the isolated provider.
// Run from web/: node --experimental-strip-types test/browser/voice-e2e.mjs
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url).pathname;
const fixtureDir = join(root, '../api/test/fixtures/voice');
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const manifest = JSON.parse(await readFile(join(fixtureDir, 'manifest.json'), 'utf8'));
const sample = manifest.samples.find(item => item.file === (process.env.VOICE_SAMPLE ?? 'courses.wav'));
const processes = [];
const profile = await mkdtemp(join(tmpdir(), 'jarvis-voice-e2e-'));

const spawnLogged = (command, args, options) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', () => undefined);
  processes.push(child);
  return child;
};
async function until(label, probe, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await delay(150);
  }
}

class Cdp {
  constructor(socket) { this.socket = socket; this.next = 1; this.pending = new Map(); socket.onmessage = event => { const message = JSON.parse(event.data); this.pending.get(message.id)?.(message); }; }
  send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, message => { this.pending.delete(id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluation failed');
    return result.value;
  }
}

const words = text => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/œ/g, 'oe').replace(/[^a-z0-9% ]+/g, ' ').split(/\s+/).filter(Boolean);
function wer(expected, actual) {
  const a = words(expected), b = words(actual);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const cur = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } }
  return row[b.length] / a.length;
}

try {
  spawnLogged(process.execPath, ['--experimental-strip-types', 'test/browser/local-provider.mjs'], { cwd: root });
  spawnLogged('npx', ['vite', '--port', '5189', '--host', '127.0.0.1', '--strictPort'], { cwd: root, env: { ...process.env, VITE_API_PROXY_TARGET: 'http://127.0.0.1:4319' } });
  await until('provider', async () => (await fetch('http://127.0.0.1:4319/voice')).ok);
  const voice = await (await fetch('http://127.0.0.1:4319/voice')).json();
  assert.deepEqual(voice, { transcription: 'ready', speech: 'ready' }, 'Install whisper.cpp and Piper first (docs/product/local-voice.md).');
  await until('vite', async () => (await fetch('http://127.0.0.1:5189/')).ok);

  spawnLogged(chrome, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', 'about:blank']);
  const target = await until('chrome', async () => (await (await fetch('http://127.0.0.1:9333/json')).json()).find(item => item.type === 'page'));
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const page = new Cdp(socket);
  await page.send('Page.enable');
  const wavBase64 = (await readFile(join(fixtureDir, sample.file))).toString('base64');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__micDenied = false;
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.__micDenied) throw new DOMException('Permission denied', 'NotAllowedError');
      const context = new AudioContext();
      const bytes = Uint8Array.from(atob('${wavBase64}'), c => c.charCodeAt(0));
      const source = context.createBufferSource();
      source.buffer = await context.decodeAudioData(bytes.buffer);
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      return destination.stream;
    };
  })();` });
  await page.send('Page.navigate', { url: 'http://127.0.0.1:5189/chat' });

  const click = label => page.eval(`(() => { const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const text = () => page.eval('document.body.innerText');
  const has = label => page.eval(`[...document.querySelectorAll('button')].some(n => n.textContent.trim() === ${JSON.stringify(label)})`);

  await until('onboarding or chat', async () => (await has('Enregistrer et commencer')) || (await has('Parler')), 40_000);
  if (await has('Enregistrer et commencer')) { await click('Enregistrer et commencer'); await page.send('Page.navigate', { url: 'http://127.0.0.1:5189/chat' }); }
  await until('microphone button', () => has('Parler'), 40_000);
  assert.match(await text(), /Lire les réponses à voix haute/);
  assert.equal(await page.eval("document.querySelector('#chat-composer').value"), '');

  // 1) Explicit dictation: nothing is captured before the click, the transcript lands in the editable box.
  const started = Date.now();
  await click('Parler');
  await until('listening state', async () => /Écoute en cours/.test(await text()), 10_000);
  const listeningLabel = await page.eval("document.querySelector('[aria-pressed=true]')?.textContent.trim()");
  assert.equal(listeningLabel, 'Arrêter et transcrire');
  await delay(sample.seconds * 1000 + 800 - (Date.now() - started));
  await click('Arrêter et transcrire');
  const transcript = await until('transcript in the composer', () => page.eval("document.querySelector('#chat-composer').value"), 30_000);
  const rate = wer(sample.text, transcript);
  console.log(`dictation ${sample.file}: « ${transcript} » (WER ${(rate * 100).toFixed(0)} %, ${Date.now() - started - sample.seconds * 1000} ms after the end of speech)`);
  assert.ok(rate <= 0.5, 'transcript too far from the fixture');
  assert.match(await text(), /Vérifiez et corrigez/);
  const log = await (await fetch('http://127.0.0.1:4319/__verification')).json();
  assert.equal(log.requests.some(item => item.path === '/jarvis/chat'), false, 'the dictation must not send anything to the chat');

  // 2) The user edits, then sends explicitly; the reply is read aloud and can be stopped at once.
  await page.eval("(() => { const t = document.querySelector('#chat-composer'); t.value = 'Bonjour Jarvis'; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await page.eval("(() => { const c = [...document.querySelectorAll('input[type=checkbox]')].find(i => i.parentElement.textContent.includes('Lire les réponses')); c.click(); })()");
  await click('Envoyer');
  await until('reply read aloud', () => has('Arrêter la lecture'), 30_000);
  const speakRequests = (await (await fetch('http://127.0.0.1:4319/__verification')).json()).requests.filter(item => item.path === '/voice/speak');
  assert.ok(speakRequests.length >= 1, 'speech was requested for the reply');
  await click('Arrêter la lecture');
  await until('reading stopped', async () => !(await has('Arrêter la lecture')), 3_000);

  // 3) A denied microphone is explained and leaves the chat usable.
  await until('microphone idle again', async () => !/Transcription locale|Écoute en cours/.test(await text()), 10_000);
  await page.eval('window.__micDenied = true');
  await click('Parler');
  const denied = await until('permission message', async () => /micro est refusé/.test(await text()), 10_000).then(() => true).catch(() => false);
  console.log(`denied microphone explained: ${denied}`);
  assert.ok(denied, 'a refused microphone must be explained');
  assert.equal(await has('Envoyer'), true);
  console.log('voice browser verification passed');
} finally {
  for (const child of processes) child.kill('SIGTERM');
  await delay(300);
  await rm(profile, { recursive: true, force: true });
}
