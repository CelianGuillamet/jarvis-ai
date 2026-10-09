import { spawn } from 'node:child_process';

export class EngineError extends Error {
  constructor(
    readonly kind: 'missing' | 'timeout' | 'failed' | 'output',
    message: string,
  ) {
    super(message);
  }
}

export type EngineRun = {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  signal?: AbortSignal;
};

/** Run a local executable without a shell, with a minimal environment, a deadline and an output cap. */
export function runEngine(run: EngineRun): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(run.command, run.args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        LANG: 'fr_FR.UTF-8',
      },
      shell: false,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error: EngineError | null, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run.signal?.removeEventListener('abort', onAbort);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(
      () => finish(new EngineError('timeout', 'Délai dépassé.')),
      run.timeoutMs,
    );
    const onAbort = () => finish(new EngineError('failed', 'Annulé.'));
    if (run.signal?.aborted) return onAbort();
    run.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > run.maxStdoutBytes)
        return finish(new EngineError('output', 'Sortie trop volumineuse.'));
      chunks.push(chunk);
    });
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish(
        new EngineError(
          error.code === 'ENOENT' || error.code === 'EACCES'
            ? 'missing'
            : 'failed',
          'Moteur indisponible.',
        ),
      ),
    );
    child.on('close', (code) => {
      if (code === 0) finish(null, Buffer.concat(chunks));
      else finish(new EngineError('failed', 'Le moteur a échoué.'));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(run.stdin ?? '');
  });
}
