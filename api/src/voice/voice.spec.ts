import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { EngineError, runEngine } from './engine';
import { Limiter, VoiceBusyError } from './limiter';
import { cleanTranscript, VoiceService } from './voice.service';
import { InvalidAudioError, inspectWav, VOICE_MAX_BYTES } from './wav';

function wav(
  overrides: Partial<{
    rate: number;
    channels: number;
    bits: number;
    seconds: number;
    format: number;
    dataBytes: number;
    magic: string;
  }> = {},
) {
  const rate = overrides.rate ?? 16_000;
  const channels = overrides.channels ?? 1;
  const bits = overrides.bits ?? 16;
  const dataBytes =
    overrides.dataBytes ?? Math.round((overrides.seconds ?? 1) * rate * 2);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write(overrides.magic ?? 'RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(overrides.format ?? 1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * channels * (bits / 8), 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

describe('WAV validation', () => {
  it('accepts 16 kHz mono PCM and reports its duration', () => {
    expect(inspectWav(wav({ seconds: 2 })).durationMs).toBe(2000);
    expect(inspectWav(wav({ seconds: 30 })).durationMs).toBe(30_000);
  });

  it.each([
    ['wrong sample rate', wav({ rate: 44_100 })],
    ['stereo', wav({ channels: 2 })],
    ['8-bit', wav({ bits: 8 })],
    ['float format', wav({ format: 3 })],
    ['not RIFF', wav({ magic: 'RIFX' })],
    ['over thirty seconds', wav({ seconds: 31 })],
    ['empty data', wav({ dataBytes: 0 })],
    ['odd data length', wav({ dataBytes: 3 })],
    ['truncated header', Buffer.alloc(20)],
    [
      'declared length mismatch',
      Buffer.concat([wav({ seconds: 1 }), Buffer.alloc(10)]),
    ],
  ])('rejects %s', (_name, buffer) => {
    expect(() => inspectWav(buffer)).toThrow(InvalidAudioError);
  });

  it('keeps the byte ceiling aligned with thirty seconds', () => {
    expect(VOICE_MAX_BYTES).toBe(44 + 30 * 16_000 * 2);
  });
});

describe('Limiter', () => {
  it('runs one at a time, queues up to the bound and refuses the rest', async () => {
    const limiter = new Limiter(1, 1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const first = limiter.run(async () => {
      order.push('first');
      await gate;
    });
    const second = limiter.run(() => {
      order.push('second');
      return Promise.resolve();
    });
    await expect(limiter.run(() => Promise.resolve())).rejects.toBeInstanceOf(
      VoiceBusyError,
    );
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('drops a queued call when its request is aborted', async () => {
    const limiter = new Limiter(1, 2);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const running = limiter.run(() => gate);
    const controller = new AbortController();
    const work = jest.fn(() => Promise.resolve());
    const queued = limiter.run(work, controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow('Annulé');
    release();
    await running;
    expect(work).not.toHaveBeenCalled();
  });
});

describe('Engine runner and voice service with fake local executables', () => {
  let directory: string;
  const script = async (name: string, body: string) => {
    const file = join(directory, name);
    await writeFile(file, `#!/bin/sh\n${body}\n`);
    await chmod(file, 0o755);
    return file;
  };
  const leftovers = async () =>
    (await readdir(privateTmp)).filter((n) => /^jarvis-(stt|tts)-/.test(n));
  const config = (values: Record<string, string>) =>
    new ConfigService({
      VOICE_STT_ENABLED: 'true',
      VOICE_TTS_ENABLED: 'true',
      VOICE_TMP_DIR: privateTmp,
      ...values,
    });

  let privateTmp: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'voice-fakes-'));
    // A private temp root keeps the leftover check immune to suites running in parallel.
    privateTmp = await mkdtemp(join(tmpdir(), 'voice-tmp-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(privateTmp, { recursive: true, force: true });
  });

  it('runs without a shell and returns stdout', async () => {
    const out = await runEngine({
      command: await script('echo', 'printf "%s" "$1"'),
      args: ['$(touch /tmp/jarvis-injection-probe); `x`'],
      timeoutMs: 2000,
      maxStdoutBytes: 1000,
    });
    expect(out.toString()).toContain('$(touch');
  });

  it.each([
    ['times out', 'sleep 5', { timeoutMs: 100 }, 'timeout'],
    ['fails', 'exit 3', {}, 'failed'],
    ['floods stdout', 'yes x | head -c 200000', {}, 'output'],
  ])('%s', async (_name, body, extra, kind) => {
    await expect(
      runEngine({
        command: await script(`engine-${kind}`, body),
        args: [],
        timeoutMs: 2000,
        maxStdoutBytes: 1000,
        ...extra,
      }),
    ).rejects.toMatchObject({ kind });
  });

  it('reports a missing executable and honours cancellation', async () => {
    await expect(
      runEngine({
        command: join(directory, 'absent'),
        args: [],
        timeoutMs: 1000,
        maxStdoutBytes: 10,
      }),
    ).rejects.toMatchObject({ kind: 'missing' });
    const controller = new AbortController();
    const running = runEngine({
      command: await script('slow', 'sleep 5'),
      args: [],
      timeoutMs: 4000,
      maxStdoutBytes: 10,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    await expect(running).rejects.toBeInstanceOf(EngineError);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('reports disabled, unavailable and ready states without exposing paths', async () => {
    const model = join(directory, 'model.bin');
    await writeFile(model, 'x');
    const whisper = await script('whisper-ok', 'echo " Bonjour"');
    expect(
      new VoiceService(
        config({ VOICE_STT_ENABLED: 'false', VOICE_TTS_ENABLED: 'false' }),
      ).status(),
    ).toEqual({ transcription: 'disabled', speech: 'disabled' });
    expect(
      new VoiceService(
        config({ WHISPER_CLI_PATH: join(directory, 'none') }),
      ).status(),
    ).toEqual({
      transcription: 'unavailable',
      speech: 'unavailable',
    });
    const ready = new VoiceService(
      config({ WHISPER_CLI_PATH: whisper, WHISPER_MODEL_PATH: model }),
    ).status();
    expect(ready.transcription).toBe('ready');
    expect(JSON.stringify(ready)).not.toContain(directory);
  });

  it('transcribes with fixed arguments, removes the audio and refuses invalid input', async () => {
    const model = join(directory, 'model.bin');
    await writeFile(model, 'x');
    const whisper = await script(
      'whisper-args',
      'for last; do :; done; test -s "$last" || exit 9; echo "[BLANC_AUDIO] Bonjour (musique) Jarvis"',
    );
    const service = new VoiceService(
      config({ WHISPER_CLI_PATH: whisper, WHISPER_MODEL_PATH: model }),
    );
    const before = await leftovers();
    await expect(service.transcribe(wav({ seconds: 1 }))).resolves.toBe(
      'Bonjour Jarvis',
    );
    expect(await leftovers()).toEqual(before);
    await expect(service.transcribe(wav({ rate: 8000 }))).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      new VoiceService(config({ VOICE_STT_ENABLED: 'false' })).transcribe(
        wav(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      new VoiceService(
        config({
          WHISPER_CLI_PATH: join(directory, 'none'),
          WHISPER_MODEL_PATH: model,
        }),
      ).transcribe(wav()),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('cleans up the audio when the engine fails or is cancelled and bounds concurrency', async () => {
    const model = join(directory, 'model.bin');
    const failing = await script('whisper-fail', 'exit 1');
    const slow = await script('whisper-slow', 'sleep 1; echo ok');
    const before = await leftovers();
    await expect(
      new VoiceService(
        config({ WHISPER_CLI_PATH: failing, WHISPER_MODEL_PATH: model }),
      ).transcribe(wav()),
    ).rejects.toMatchObject({ status: 503 });
    expect(await leftovers()).toEqual(before);
    const service = new VoiceService(
      config({ WHISPER_CLI_PATH: slow, WHISPER_MODEL_PATH: model }),
    );
    const calls = Array.from({ length: 5 }, () =>
      service.transcribe(wav()).catch((e: { status: number }) => e.status),
    );
    const results = await Promise.all(calls);
    expect(results.filter((r) => r === 429)).toHaveLength(2);
    expect(results.filter((r) => r === 'ok')).toHaveLength(3);
    expect(await leftovers()).toEqual(before);
  });

  it('synthesizes bounded text and returns the engine audio', async () => {
    const voice = join(directory, 'voice.onnx');
    await writeFile(voice, 'x');
    const piper = await script(
      'piper-ok',
      'out=""; while [ $# -gt 0 ]; do [ "$1" = "-f" ] && out="$2"; shift; done; cat > /dev/null; printf RIFFfake > "$out"',
    );
    const service = new VoiceService(
      config({ PIPER_PATH: piper, PIPER_VOICE_PATH: voice }),
    );
    const before = await leftovers();
    expect((await service.speak('Bonjour Monsieur Dupont.')).toString()).toBe(
      'RIFFfake',
    );
    await expect(service.speak('')).rejects.toMatchObject({ status: 400 });
    await expect(service.speak('a'.repeat(601))).rejects.toMatchObject({
      status: 400,
    });
    expect(await leftovers()).toEqual(before);
  });

  it('strips non-speech tags from transcripts', () => {
    expect(cleanTranscript(' [BLANC_AUDIO] ')).toBe('');
    expect(cleanTranscript('(musique)  Bonjour\n  tout le monde')).toBe(
      'Bonjour tout le monde',
    );
  });
});
