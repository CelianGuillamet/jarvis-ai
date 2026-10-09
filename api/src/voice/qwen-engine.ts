import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';

/** api/scripts/voice from src/voice (tests, ts-node) or from dist/src/voice (built app). */
function defaultWorkerPath(): string {
  for (const up of [
    ['..', '..'],
    ['..', '..', '..'],
  ]) {
    const candidate = join(
      __dirname,
      ...up,
      'scripts',
      'voice',
      'qwen_tts_worker.py',
    );
    if (existsSync(candidate)) return candidate;
  }
  return join(__dirname, '..', '..', 'scripts', 'voice', 'qwen_tts_worker.py');
}

export type QwenState = 'idle' | 'loading' | 'ready' | 'failed';

export class QwenEngineError extends Error {
  constructor(
    readonly kind: 'loading' | 'failed' | 'timeout' | 'cancelled' | 'output',
  ) {
    super(`Moteur vocal : ${kind}.`);
  }
}

const MAX_REPLY_BYTES = 12 * 1024 * 1024;
const READY_TIMEOUT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 60_000;
const RESTART_BACKOFF_MS = 30_000;

type Pending = {
  resolve: (wav: Buffer) => void;
  reject: (error: QwenEngineError) => void;
  timer: NodeJS.Timeout;
};

/** One resident worker process: the model is loaded once, requests are strictly sequential. */
export class QwenEngine {
  private child: ChildProcess | null = null;
  private state: QwenState = 'idle';
  private buffer = '';
  private nextId = 1;
  private failedAt = 0;
  private readyTimer?: NodeJS.Timeout;
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly config: ConfigService) {}

  get current(): QwenState {
    return this.state;
  }

  /** Cheap check that the configured files exist; the model itself is loaded lazily or at warm-up. */
  configured(): boolean {
    return ['QWEN_TTS_PYTHON', 'QWEN_TTS_REF_AUDIO', 'QWEN_TTS_REF_TEXT'].every(
      (key) => !!this.config.get<string>(key),
    );
  }

  start(): void {
    if (this.child || !this.configured()) return;
    if (
      this.state === 'failed' &&
      Date.now() - this.failedAt < RESTART_BACKOFF_MS
    )
      return;
    this.state = 'loading';
    this.buffer = '';
    const get = (key: string) => this.config.get<string>(key) ?? '';
    const child = spawn(
      get('QWEN_TTS_PYTHON'),
      [get('QWEN_TTS_WORKER') || defaultWorkerPath()],
      {
        stdio: ['pipe', 'pipe', 'ignore'],
        shell: false,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          // Never download anything at run time: the model is installed beforehand.
          HF_HUB_OFFLINE: '1',
          ...(get('QWEN_TTS_MODEL')
            ? { QWEN_TTS_MODEL: get('QWEN_TTS_MODEL') }
            : {}),
          QWEN_TTS_REF_AUDIO: get('QWEN_TTS_REF_AUDIO'),
          QWEN_TTS_REF_TEXT: get('QWEN_TTS_REF_TEXT'),
          QWEN_TTS_LANG: get('QWEN_TTS_LANG') || 'french',
        },
      },
    );
    this.child = child;
    this.readyTimer = setTimeout(() => this.fail(child), READY_TIMEOUT_MS);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    child.stdin?.on('error', () => undefined);
    child.on('error', () => this.fail(child));
    child.on('close', () => this.fail(child));
  }

  async speak(
    text: string,
    speed: number,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    if (this.state !== 'ready') {
      this.start();
      throw new QwenEngineError('loading');
    }
    const child = this.child;
    if (!child?.stdin?.writable) throw new QwenEngineError('failed');
    if (signal?.aborted) throw new QwenEngineError('cancelled');
    const id = String(this.nextId++);
    return new Promise<Buffer>((resolve, reject) => {
      const finish = () => {
        clearTimeout(entry.timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
      };
      const entry: Pending = {
        resolve: (wav) => {
          finish();
          resolve(wav);
        },
        reject: (error) => {
          finish();
          reject(error);
        },
        timer: setTimeout(() => {
          this.cancel(id);
          entry.reject(new QwenEngineError('timeout'));
        }, REQUEST_TIMEOUT_MS),
      };
      const onAbort = () => {
        this.cancel(id);
        entry.reject(new QwenEngineError('cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, entry);
      child.stdin?.write(`${JSON.stringify({ id, text, speed })}\n`);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.state = 'idle';
    clearTimeout(this.readyTimer);
    for (const entry of this.pending.values())
      entry.reject(new QwenEngineError('cancelled'));
    child?.kill('SIGKILL');
  }

  private cancel(id: string) {
    this.child?.stdin?.write(`${JSON.stringify({ cancel: id })}\n`);
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_REPLY_BYTES * 2) return this.fail(this.child);
    let at: number;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at);
      this.buffer = this.buffer.slice(at + 1);
      let message: { type?: string; id?: string; wav?: string };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        continue;
      }
      if (message.type === 'ready') {
        clearTimeout(this.readyTimer);
        this.state = 'ready';
        continue;
      }
      const entry = message.id ? this.pending.get(message.id) : undefined;
      if (!entry) continue;
      if (message.type === 'audio' && typeof message.wav === 'string') {
        const wav = Buffer.from(message.wav, 'base64');
        if (wav.length > MAX_REPLY_BYTES)
          entry.reject(new QwenEngineError('output'));
        else entry.resolve(wav);
      } else if (message.type === 'cancelled')
        entry.reject(new QwenEngineError('cancelled'));
      else entry.reject(new QwenEngineError('failed'));
    }
  }

  private fail(child: ChildProcess | null) {
    if (child !== this.child) return;
    clearTimeout(this.readyTimer);
    this.child = null;
    this.state = 'failed';
    this.failedAt = Date.now();
    for (const entry of this.pending.values())
      entry.reject(new QwenEngineError('failed'));
    child?.kill('SIGKILL');
  }
}
