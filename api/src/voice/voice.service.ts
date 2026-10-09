import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { constants, accessSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineError, runEngine } from './engine';
import { Limiter, VoiceBusyError } from './limiter';
import { InvalidAudioError, inspectWav } from './wav';

export const STT_TIMEOUT_MS = 30_000;
export const TTS_TIMEOUT_MS = 20_000;
export const MAX_SPEECH_CHARS = 600;
export const MAX_SPEECH_BYTES = 4 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 2_000;

export type VoiceStatus = {
  transcription: 'disabled' | 'unavailable' | 'ready';
  speech: 'disabled' | 'unavailable' | 'ready';
};

const executable = (path: string | undefined) => {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
const readable = (path: string | undefined) => {
  if (!path) return false;
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/** Whisper marks silence and noise with bracketed tags, which are not speech. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]{0,60}\]|\([^)]{0,60}\)|♪[^♪]*♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Local speech engines. Audio lives only in a private temporary file for the length of one call. */
@Injectable()
export class VoiceService {
  private readonly stt = new Limiter(1, 2);
  private readonly tts = new Limiter(1, 4);

  constructor(private readonly config: ConfigService) {}

  status(): VoiceStatus {
    const get = (key: string) => this.config.get<string>(key);
    const state = (
      flag: string,
      ready: boolean,
    ): 'disabled' | 'unavailable' | 'ready' =>
      get(flag) !== 'true' ? 'disabled' : ready ? 'ready' : 'unavailable';
    return {
      transcription: state(
        'VOICE_STT_ENABLED',
        executable(get('WHISPER_CLI_PATH')) &&
          readable(get('WHISPER_MODEL_PATH')),
      ),
      speech: state(
        'VOICE_TTS_ENABLED',
        executable(get('PIPER_PATH')) && readable(get('PIPER_VOICE_PATH')),
      ),
    };
  }

  async transcribe(audio: Buffer, signal?: AbortSignal): Promise<string> {
    this.require('transcription');
    try {
      inspectWav(audio);
    } catch (error) {
      if (error instanceof InvalidAudioError)
        throw new BadRequestException(error.message);
      throw error;
    }
    return this.guard(() =>
      this.stt.run(async () => {
        const directory = await mkdtemp(join(this.tempRoot(), 'jarvis-stt-'), {
          mode: 0o700,
        } as never);
        try {
          const file = join(directory, 'audio.wav');
          await writeFile(file, audio, { mode: 0o600 });
          const output = await runEngine({
            command: this.config.get<string>('WHISPER_CLI_PATH')!,
            args: [
              '-m',
              this.config.get<string>('WHISPER_MODEL_PATH')!,
              '-l',
              'fr',
              '-nt',
              '-np',
              '-f',
              file,
            ],
            timeoutMs: STT_TIMEOUT_MS,
            maxStdoutBytes: 64 * 1024,
            ...(signal ? { signal } : {}),
          });
          return cleanTranscript(output.toString('utf8'));
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }, signal),
    );
  }

  async speak(text: string, signal?: AbortSignal): Promise<Buffer> {
    this.require('speech');
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > MAX_SPEECH_CHARS)
      throw new BadRequestException('Texte à lire invalide.');
    return this.guard(() =>
      this.tts.run(async () => {
        const directory = await mkdtemp(join(this.tempRoot(), 'jarvis-tts-'), {
          mode: 0o700,
        } as never);
        try {
          const file = join(directory, 'speech.wav');
          await runEngine({
            command: this.config.get<string>('PIPER_PATH')!,
            args: [
              '-m',
              this.config.get<string>('PIPER_VOICE_PATH')!,
              '-f',
              file,
            ],
            stdin: clean,
            timeoutMs: TTS_TIMEOUT_MS,
            maxStdoutBytes: 1024,
            ...(signal ? { signal } : {}),
          });
          if ((await stat(file)).size > MAX_SPEECH_BYTES)
            throw new EngineError('output', 'Audio trop volumineux.');
          return await readFile(file);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }, signal),
    );
  }

  private tempRoot() {
    return this.config.get<string>('VOICE_TMP_DIR') || tmpdir();
  }

  private require(kind: keyof VoiceStatus) {
    const state = this.status()[kind];
    if (state === 'disabled')
      throw new ConflictException(
        kind === 'transcription'
          ? 'La transcription vocale est désactivée.'
          : 'La lecture vocale est désactivée.',
      );
    if (state === 'unavailable')
      throw new ServiceUnavailableException(
        'Le moteur vocal local est introuvable. Consultez la documentation d’installation.',
      );
  }

  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof VoiceBusyError)
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Le moteur vocal est occupé.' },
          429,
        );
      if (error instanceof EngineError)
        throw new ServiceUnavailableException(
          error.kind === 'timeout'
            ? 'Le moteur vocal a dépassé le délai.'
            : 'Le moteur vocal a échoué.',
        );
      throw error;
    }
  }
}
