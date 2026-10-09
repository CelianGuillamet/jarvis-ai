import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { VoiceService } from './voice.service';

const root = join(homedir(), '.jarvis', 'voice', 'models');
const paths = {
  WHISPER_CLI_PATH:
    process.env.WHISPER_CLI_PATH ?? '/opt/homebrew/bin/whisper-cli',
  WHISPER_MODEL_PATH: join(root, 'ggml-small-q5_1.bin'),
  PIPER_PATH:
    process.env.PIPER_PATH ?? join(homedir(), '.local', 'bin', 'piper'),
  PIPER_VOICE_PATH: join(root, 'fr_FR-siwis-medium.onnx'),
};
const present = Object.values(paths).every((p) => existsSync(p));
const fixtures = join(__dirname, '../../test/fixtures/voice');

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

function wordErrorRate(expected: string, actual: string) {
  const a = words(expected);
  const b = words(actual);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length] / a.length;
}

/** Real local engines on this machine: skipped where whisper.cpp, Piper and the models are not installed. */
(present ? describe : describe.skip)(
  'local French voice with the real engines',
  () => {
    const service = new VoiceService(
      new ConfigService({
        VOICE_STT_ENABLED: 'true',
        VOICE_TTS_ENABLED: 'true',
        ...paths,
      }),
    );
    const manifest = JSON.parse(
      readFileSync(join(fixtures, 'manifest.json'), 'utf8'),
    ) as { samples: { file: string; text: string; seconds: number }[] };

    it('transcribes French fixtures within a bounded error rate and reports latency', async () => {
      expect(service.status()).toEqual({
        transcription: 'ready',
        speech: 'ready',
      });
      const rows: string[] = [];
      let total = 0;
      let worst = 0;
      // The first call pays model load; it is measured and reported separately.
      for (const [index, sample] of manifest.samples.entries()) {
        const started = Date.now();
        const text = await service.transcribe(
          readFileSync(join(fixtures, sample.file)),
        );
        const ms = Date.now() - started;
        const wer = wordErrorRate(sample.text, text);
        total += wer;
        rows.push(
          `${index === 0 ? 'cold' : 'warm'} ${sample.file.padEnd(18)} ${String(ms).padStart(5)} ms  ${sample.seconds}s audio  WER ${(wer * 100).toFixed(0)}%  « ${text} »`,
        );
        worst = Math.max(worst, wer);
      }
      if (process.env.VOICE_BENCH) console.log(`STT\n${rows.join('\n')}`);
      // Regression guard only: numbers written as digits and proper names dominate the errors,
      // which is why the transcript stays editable before it is ever sent.
      expect(worst).toBeLessThanOrEqual(0.9);
      expect(total / manifest.samples.length).toBeLessThanOrEqual(0.4);
    }, 120_000);

    it('synthesizes French speech as a playable WAV and reports latency', async () => {
      const rows: string[] = [];
      for (const sample of manifest.samples.slice(0, 4)) {
        const started = Date.now();
        const audio = await service.speak(sample.text);
        const ms = Date.now() - started;
        expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
        expect(audio.toString('ascii', 8, 12)).toBe('WAVE');
        expect(audio.length).toBeGreaterThan(20_000);
        rows.push(
          `${sample.file.padEnd(18)} ${String(ms).padStart(5)} ms  ${(audio.length / 1024).toFixed(0)} KiB`,
        );
      }
      if (process.env.VOICE_BENCH) console.log(`TTS\n${rows.join('\n')}`);
    }, 120_000);
  },
);
