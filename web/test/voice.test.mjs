import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav16k } from '../src/features/voice/wav.ts';
import { chunkForSpeech, plainSpeechText, splitSentences } from '../src/features/voice/speechChunker.ts';
import { Dictation, dictationErrorMessage } from '../src/features/voice/dictation.ts';
import { Speaker } from '../src/features/voice/speaker.ts';

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

test('encodes 16 kHz mono PCM WAV from any input rate and bounds the length', () => {
  const sine = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin(i / 10));
  const wav = new DataView(encodeWav16k([sine.subarray(0, 24_000), sine.subarray(24_000)], 48_000));
  assert.equal(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4)), 'RIFF');
  assert.equal(wav.getUint32(24, true), 16_000);
  assert.equal(wav.getUint16(22, true), 1);
  assert.equal(wav.getUint16(34, true), 16);
  assert.equal(wav.getUint32(40, true), 16_000 * 2);
  assert.equal(wav.byteLength, 44 + 32_000);
  const long = new DataView(encodeWav16k([new Float32Array(16_000 * 40)], 16_000));
  assert.equal(long.getUint32(40, true), 30 * 16_000 * 2);
  assert.throws(() => encodeWav16k([], 100));
  const clipped = new DataView(encodeWav16k([Float32Array.from([2, -2, 0, 0])], 16_000));
  assert.equal(clipped.getInt16(44, true), 32767);
  assert.equal(clipped.getInt16(46, true), -32768);
});

test('splits French sentences without cutting at abbreviations, initials or decimals', () => {
  assert.deepEqual(splitSentences('Bonjour M. Dupont. Il est dix heures.'), ['Bonjour M. Dupont.', 'Il est dix heures.']);
  assert.deepEqual(splitSentences('Mme Martin et le Dr Leroy arrivent. Ils sont à l’heure !'), ['Mme Martin et le Dr Leroy arrivent.', 'Ils sont à l’heure !']);
  assert.deepEqual(splitSentences('La température est de 3.5 degrés. Il pleut.'), ['La température est de 3.5 degrés.', 'Il pleut.']);
  assert.deepEqual(splitSentences('Attends… Je regarde. Voilà ?! Oui.'), ['Attends…', 'Je regarde.', 'Voilà ?!', 'Oui.']);
  assert.deepEqual(splitSentences('Rendez-vous avec J. Dupont, M. Durand, etc. Ensuite, déjeuner.'), ['Rendez-vous avec J. Dupont, M. Durand, etc.', 'Ensuite, déjeuner.']);
  assert.deepEqual(splitSentences('Pas de point final'), ['Pas de point final']);
  assert.deepEqual(splitSentences(''), []);
});

test('chunks a reply: short first chunk, bounded groups, no markup', () => {
  const text = '# Titre\n\nVoici **ton agenda**. [Lien](https://x.test) `code`\n\n```js\nsecret()\n```\n- Premier point.\n- Deuxième point, avec M. Dupont.';
  assert.equal(plainSpeechText(text), 'Titre Voici ton agenda. Lien code Premier point. Deuxième point, avec M. Dupont.');
  const chunks = chunkForSpeech(text);
  assert.equal(chunks[0], 'Titre Voici ton agenda.');
  assert.ok(chunks.every(chunk => chunk.length <= 300));
  const long = Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i}.`).join(' ');
  const many = chunkForSpeech(long, 120, 10);
  assert.ok(many.length <= 10 && many.every(chunk => chunk.length <= 120));
  const huge = chunkForSpeech('mot '.repeat(5000), 200, 40);
  assert.ok(huge.length <= 40 && huge.every(chunk => chunk.length <= 200));
  assert.deepEqual(chunkForSpeech('   '), []);
});

function dictation(overrides = {}) {
  const log = { phases: [], transcripts: [], errors: [], cancelled: 0, aborted: 0, stopped: 0 };
  const timers = new Map();
  let next = 1;
  const deps = {
    capture: async () => ({ stop: async () => { log.stopped++; return { chunks: [new Float32Array(16_000)], rate: 16_000 }; }, cancel: () => { log.cancelled++; } }),
    encode: () => new ArrayBuffer(8),
    transcribe: async (_audio, signal) => { signal.addEventListener('abort', () => log.aborted++); return ' Ajoute du lait '; },
    onPhase: phase => log.phases.push(phase),
    onTranscript: text => log.transcripts.push(text),
    onError: message => log.errors.push(message),
    setTimer: (work, ms) => { timers.set(next, { work, ms }); return next++; },
    clearTimer: id => timers.delete(id),
    ...overrides,
  };
  return { instance: new Dictation(deps), log, timers };
}

test('dictation needs an explicit start, passes only an editable transcript, and returns to idle', async () => {
  const { instance, log, timers } = dictation();
  assert.deepEqual(log.phases, []);
  await instance.start();
  assert.equal(instance.current, 'listening');
  assert.equal([...timers.values()][0].ms, 30_000);
  await instance.stop();
  assert.deepEqual(log.phases, ['requesting', 'listening', 'transcribing', 'idle']);
  assert.deepEqual(log.transcripts, ['Ajoute du lait']);
  assert.equal(timers.size, 0);
});

test('stops by itself after thirty seconds', async () => {
  const { instance, log, timers } = dictation();
  await instance.start();
  [...timers.values()][0].work();
  await tick();
  assert.equal(log.stopped, 1);
  assert.deepEqual(log.transcripts, ['Ajoute du lait']);
});

test('explains a refused microphone, a missing engine and an empty recording', async () => {
  const denied = dictation({ capture: async () => { throw new DOMException('no', 'NotAllowedError'); } });
  await denied.instance.start();
  assert.match(denied.log.errors[0], /micro est refusé/);
  assert.equal(denied.instance.current, 'idle');
  const missing = dictation({ transcribe: async () => { throw Object.assign(new Error('x'), { status: 503 }); } });
  await missing.instance.start(); await missing.instance.stop();
  assert.match(missing.log.errors[0], /indisponible/);
  const silent = dictation({ transcribe: async () => '  ' });
  await silent.instance.start(); await silent.instance.stop();
  assert.match(silent.log.errors[0], /rien entendu/);
  assert.deepEqual(silent.log.transcripts, []);
  assert.match(dictationErrorMessage(Object.assign(new Error('x'), { status: 409 })), /désactivée/);
  assert.match(dictationErrorMessage(new Error('boom')), /échoué/);
});

test('cancelling (account change, unmount) drops a late transcript and releases the microphone', async () => {
  let resolveText;
  const slow = dictation({ transcribe: (_audio, signal) => new Promise((resolve, reject) => { resolveText = resolve; signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))); }) });
  await slow.instance.start();
  const stopping = slow.instance.stop();
  await tick();
  slow.instance.cancel();
  resolveText?.('texte tardif');
  await stopping;
  assert.deepEqual(slow.log.transcripts, []);
  assert.deepEqual(slow.log.errors, []);
  assert.equal(slow.instance.current, 'idle');
  const listening = dictation();
  await listening.instance.start();
  listening.instance.cancel();
  assert.equal(listening.log.cancelled, 1);
  assert.equal(listening.instance.current, 'idle');
  let release;
  const pending = dictation({ capture: () => new Promise(resolve => { release = () => resolve({ stop: async () => ({ chunks: [], rate: 16_000 }), cancel: () => { pending.log.cancelled++; } }); }) });
  const starting = pending.instance.start();
  pending.instance.cancel();
  release();
  await starting;
  assert.equal(pending.log.cancelled, 1);
  assert.equal(pending.instance.current, 'idle');
});

function speaker(overrides = {}) {
  const log = { synthesized: [], played: [], speaking: [], errors: [] };
  const deps = {
    synthesize: async text => { log.synthesized.push(text); return new TextEncoder().encode(text).buffer; },
    play: async audio => { log.played.push(new TextDecoder().decode(audio)); },
    onSpeaking: value => log.speaking.push(value),
    onError: message => log.errors.push(message),
    ...overrides,
  };
  return { instance: new Speaker(deps), log };
}

test('speaks chunks in order, synthesizing one ahead', async () => {
  const { instance, log } = speaker();
  await instance.speak('Bonjour M. Dupont. ' + 'Ensuite voici la suite de la réponse. '.repeat(12));
  assert.equal(log.played[0], 'Bonjour M. Dupont.');
  assert.deepEqual(log.played, log.synthesized);
  assert.deepEqual(log.speaking, [true, false]);
});

test('stopping is immediate and a late synthesis is never played', async () => {
  let releaseSecond;
  const played = [];
  let calls = 0;
  const { instance, log } = speaker({
    synthesize: (text, signal) => ++calls === 1 ? Promise.resolve(new ArrayBuffer(1)) : new Promise(resolve => { releaseSecond = () => resolve(new ArrayBuffer(2)); signal.addEventListener('abort', () => undefined); }),
    play: async (audio, signal) => { played.push(audio.byteLength); await new Promise(resolve => signal.addEventListener('abort', resolve)); },
  });
  const speaking = instance.speak('Première phrase. Deuxième phrase plus longue qui suit. Troisième phrase.');
  await tick(5);
  assert.deepEqual(played, [1]);
  instance.stop();
  releaseSecond?.();
  await speaking;
  assert.deepEqual(played, [1]);
  assert.deepEqual(log.speaking, [true, false]);
});

test('a new reply or an account change interrupts the previous one, and failures stay quiet', async () => {
  const aborted = [];
  const { instance, log } = speaker({
    play: (audio, signal) => new Promise(resolve => signal.addEventListener('abort', () => { aborted.push(true); resolve(); })),
  });
  const first = instance.speak('Réponse numéro un.');
  await tick(5);
  const second = instance.speak('Réponse numéro deux.');
  await tick(5);
  assert.equal(aborted.length, 1);
  instance.stop();
  await Promise.all([first, second]);
  assert.deepEqual(log.errors, []);
  const failing = speaker({ synthesize: async () => { throw new Error('moteur absent'); } });
  await failing.instance.speak('Bonjour.');
  assert.match(failing.log.errors[0], /lecture vocale a échoué/);
  assert.doesNotMatch(failing.log.errors[0], /moteur absent/);
});
