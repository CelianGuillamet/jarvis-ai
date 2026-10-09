import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { QwenEngine, QwenEngineError } from './qwen-engine';
import { VoiceService } from './voice.service';

const worker = join(__dirname, '../../test/fixtures/fake-qwen-worker.js');
const ref = join(__dirname, '../../test/fixtures/fake-model.bin');
const settings = (mode = 'ok', extra: Record<string, string> = {}) => ({
  VOICE_TTS_ENABLED: 'true',
  VOICE_TTS_ENGINE: 'qwen',
  QWEN_TTS_PYTHON: process.execPath,
  QWEN_TTS_WORKER: worker,
  QWEN_TTS_REF_AUDIO: ref,
  QWEN_TTS_REF_TEXT: ref,
  ...extra,
  // The worker's minimal environment forwards only the model name, which doubles as the fake's mode.
  QWEN_TTS_MODEL: mode,
});
const engineFor = (mode = 'ok') =>
  new QwenEngine(new ConfigService(settings(mode)));
const until = async (probe: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!probe()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('Qwen speech worker manager', () => {
  const engines: QwenEngine[] = [];
  afterEach(() => {
    for (const e of engines.splice(0)) e.stop();
  });
  const make = (mode?: string) => {
    const e = engineFor(mode);
    engines.push(e);
    return e;
  };

  it('is idle until started, reports loading, then serves requests in order', async () => {
    const engine = make();
    expect(engine.current).toBe('idle');
    await expect(engine.speak('Bonjour', 1)).rejects.toMatchObject({
      kind: 'loading',
    });
    expect(engine.current).toBe('loading');
    await until(() => engine.current === 'ready');
    const [a, b] = await Promise.all([
      engine.speak('un', 1),
      engine.speak('deux', 1),
    ]);
    expect(a.toString()).toBe('RIFFfakeWAVEun');
    expect(b.toString()).toBe('RIFFfakeWAVEdeux');
  });

  it('cancels an in-flight request when the caller aborts', async () => {
    const engine = make('slow');
    engine.start();
    await until(() => engine.current === 'ready');
    const controller = new AbortController();
    const started = Date.now();
    const running = engine.speak('long texte', 1, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(running).rejects.toMatchObject({ kind: 'cancelled' });
    expect(Date.now() - started).toBeLessThan(300);
    await expect(engine.speak('encore', 1)).resolves.toBeDefined();
  });

  it('reports a worker error and a worker crash without leaking details', async () => {
    const failing = make('error');
    failing.start();
    await until(() => failing.current === 'ready');
    await expect(failing.speak('x', 1)).rejects.toMatchObject({
      kind: 'failed',
    });
    const crashing = make('crash');
    crashing.start();
    await until(() => crashing.current === 'ready');
    await expect(crashing.speak('x', 1)).rejects.toBeInstanceOf(
      QwenEngineError,
    );
    await until(() => crashing.current === 'failed');
    // A failed worker is not restarted in a tight loop.
    crashing.start();
    expect(crashing.current).toBe('failed');
  });

  it('does not start without its configuration', () => {
    const engine = new QwenEngine(new ConfigService({}));
    expect(engine.configured()).toBe(false);
    engine.start();
    expect(engine.current).toBe('idle');
  });

  it('runs the worker without a shell, offline and with a minimal environment', async () => {
    const engine = make();
    engine.start();
    await until(() => engine.current === 'ready');
    expect(engine.current).toBe('ready');
  });
});

describe('voice service with the Qwen engine', () => {
  it('reports unavailable files, loading and ready, and refuses invalid text', async () => {
    const missing = new VoiceService(
      new ConfigService(
        settings('ok', { QWEN_TTS_REF_AUDIO: '/nonexistent/ref.wav' }),
      ),
    );
    expect(missing.status().speech).toBe('unavailable');
    const service = new VoiceService(new ConfigService(settings()));
    expect(service.status().speech).toBe('loading');
    await expect(service.speak('Bonjour')).rejects.toMatchObject({
      status: 503,
    });
    await until(() => service.status().speech === 'ready');
    const audio = await service.speak('  Bonjour   Monsieur  ');
    expect(audio.toString()).toBe('RIFFfakeWAVEBonjour Monsieur');
    await expect(service.speak('')).rejects.toMatchObject({ status: 400 });
    await expect(service.speak('a'.repeat(601))).rejects.toMatchObject({
      status: 400,
    });
    service.onModuleDestroy();
  });
});
