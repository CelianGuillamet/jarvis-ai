import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UtteranceDetector } from '../src/features/voice/utteranceDetector.ts';
import { isNoiseTranscript } from '../src/features/voice/transcriptFilter.ts';
import { Conversation } from '../src/features/voice/conversation.ts';

const RATE = 16_000;
const tone = (ms, amp = 0.2) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin(i / 7) * (0.7 + 0.3 * Math.sin(i / 900)));
const hiss = (ms, amp = 0.002) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin(i * 12.9898));
const types = events => events.map(event => event.type);
const run = (detector, ...parts) => parts.flatMap(part => detector.push(part));

test('detects the end of a sentence by itself after a pause, with the beginning kept', () => {
  const detector = new UtteranceDetector(RATE);
  const events = run(detector, hiss(600), tone(1200), hiss(1100));
  assert.deepEqual(types(events), ['start', 'end']);
  const end = events[1];
  assert.ok(end.speechMs >= 1000);
  const samples = end.chunks.reduce((n, chunk) => n + chunk.length, 0);
  assert.ok(samples > RATE * 1.2 && samples < RATE * 2.8, `segment length ${samples}`);
});

test('a short pause inside a sentence does not close it, and a click is a misfire', () => {
  const detector = new UtteranceDetector(RATE);
  const sentence = run(detector, hiss(500), tone(800), hiss(500), tone(800), hiss(1000));
  assert.deepEqual(types(sentence), ['start', 'end']);
  const click = new UtteranceDetector(RATE);
  assert.deepEqual(types(run(click, hiss(500), tone(140), hiss(1200))), ['start', 'misfire']);
  const quiet = new UtteranceDetector(RATE);
  assert.deepEqual(types(run(quiet, hiss(3000))), []);
});

test('adapts to a noisy room and ignores steady noise', () => {
  const detector = new UtteranceDetector(RATE);
  assert.deepEqual(types(run(detector, hiss(4000, 0.02))), []);
  const events = run(detector, tone(1000, 0.4), hiss(1200, 0.02));
  assert.deepEqual(types(events), ['start', 'end']);
});

test('a higher sensitivity threshold ignores faint echo while the assistant speaks', () => {
  const detector = new UtteranceDetector(RATE);
  run(detector, hiss(400));
  detector.sensitivity = 2.5;
  assert.deepEqual(types(run(detector, tone(1000, 0.025), hiss(1200))), []);
});

test('drops the stock phrases speech recognition invents on silence', () => {
  for (const text of ['', ' ', '...', 'Sous-titres réalisés par la communauté d’Amara.org', 'Merci d’avoir regardé cette vidéo !', 'a'])
    assert.equal(isNoiseTranscript(text), true, text);
  for (const text of ['Ajoute du lait', 'oui', 'Quel temps fait-il ?']) assert.equal(isNoiseTranscript(text), false, text);
});

function conversation(overrides = {}) {
  const log = { states: [], heard: [], errors: [], submitted: [], spoken: [], stopped: 0, closed: 0 };
  let frame;
  const deps = {
    openMicrophone: async () => ({ rate: RATE, onFrame: callback => { frame = callback; }, close: () => { log.closed++; } }),
    encode: () => new ArrayBuffer(4),
    transcribe: async () => 'Ajoute du lait',
    submit: async text => { log.submitted.push(text); return 'Très bien, Monsieur.'; },
    speak: async reply => { log.spoken.push(reply); },
    stopSpeaking: () => { log.stopped++; },
    onState: state => log.states.push(state),
    onHeard: text => log.heard.push(text),
    onError: message => log.errors.push(message),
    ...overrides,
  };
  return { instance: new Conversation(deps), log, feed: samples => frame(samples) };
}
const say = (feed, ms = 1200) => { feed(hiss(600)); feed(tone(ms)); feed(hiss(1100)); };
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test('a full hands-free turn: listen, hear, transcribe, send, speak, listen again', async () => {
  const { instance, log, feed } = conversation();
  await instance.start();
  assert.equal(instance.current, 'listening');
  say(feed); await settle();
  assert.deepEqual(log.submitted, ['Ajoute du lait']);
  assert.deepEqual(log.spoken, ['Très bien, Monsieur.']);
  assert.deepEqual(log.states.slice(0, 7), ['starting', 'listening', 'hearing', 'transcribing', 'thinking', 'speaking', 'listening']);
  say(feed); await settle();
  assert.equal(log.submitted.length, 2);
  instance.stop();
  assert.equal(log.closed, 1);
  assert.equal(instance.current, 'off');
});

test('never sends a hallucinated transcript and keeps listening', async () => {
  const { instance, log, feed } = conversation({ transcribe: async () => 'Sous-titres réalisés par la communauté d’Amara.org' });
  await instance.start(); say(feed); await settle();
  assert.deepEqual(log.submitted, []);
  assert.equal(instance.current, 'listening');
});

test('ignores sound while the assistant answers unless barge-in is on, and stops speaking when interrupted', async () => {
  let finishSpeech;
  const talk = conversation({ speak: () => new Promise(resolve => { finishSpeech = resolve; }) });
  await talk.instance.start(); say(talk.feed); await settle();
  assert.equal(talk.instance.current, 'speaking');
  talk.feed(tone(1500, 0.5)); await settle();
  assert.equal(talk.log.stopped, 0);
  finishSpeech(); await settle();
  assert.equal(talk.instance.current, 'listening');

  let finish2;
  const barge = conversation({ bargeIn: () => true, speak: () => new Promise(resolve => { finish2 = resolve; }) });
  await barge.instance.start(); say(barge.feed); await settle();
  assert.equal(barge.instance.current, 'speaking');
  barge.feed(tone(800, 0.6)); await settle();
  assert.equal(barge.log.stopped, 1);
  assert.equal(barge.instance.current, 'hearing');
  finish2?.();
});

test('stop() during processing drops the late reply, and an account change leaves nothing open', async () => {
  let release;
  const slow = conversation({ transcribe: (_audio, signal) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))); }) });
  await slow.instance.start(); say(slow.feed); await settle();
  assert.equal(slow.instance.current, 'transcribing');
  slow.instance.stop();
  release?.('texte tardif'); await settle();
  assert.deepEqual(slow.log.submitted, []);
  assert.deepEqual(slow.log.errors, []);
  assert.equal(slow.log.closed, 1);
  assert.ok(slow.log.stopped >= 1);
});

test('keeps going after one failed sentence, but stops after repeated failures', async () => {
  let calls = 0;
  const flaky = conversation({ transcribe: async () => { calls++; if (calls === 1) throw Object.assign(new Error('x'), { status: 503 }); return 'Bonjour Jarvis'; } });
  await flaky.instance.start(); say(flaky.feed); await settle();
  assert.match(flaky.log.errors[0], /indisponible/);
  assert.equal(flaky.instance.current, 'listening');
  say(flaky.feed); await settle();
  assert.deepEqual(flaky.log.submitted, ['Bonjour Jarvis']);
  const broken = conversation({ transcribe: async () => { throw new Error('boom'); } });
  await broken.instance.start();
  for (let n = 0; n < 3; n++) { say(broken.feed); await settle(); }
  assert.equal(broken.instance.current, 'off');
  assert.match(broken.log.errors.at(-1), /arrêté/);
});

test('reports a refused microphone and does not stay half-open', async () => {
  const { instance, log } = conversation({ openMicrophone: async () => { throw new DOMException('no', 'NotAllowedError'); } });
  await instance.start();
  assert.match(log.errors[0], /micro est refusé/);
  assert.equal(instance.current, 'off');
});
