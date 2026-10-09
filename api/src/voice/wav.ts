export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_SECONDS = 30;
export const VOICE_MAX_BYTES = 44 + VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE * 2;

export class InvalidAudioError extends Error {}

/** Only 16 kHz mono 16-bit PCM WAV of bounded length reaches an engine. */
export function inspectWav(buffer: Buffer): { durationMs: number } {
  if (
    buffer.length < 44 ||
    buffer.length > VOICE_MAX_BYTES ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE' ||
    buffer.toString('ascii', 12, 16) !== 'fmt ' ||
    buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 ||
    buffer.readUInt16LE(22) !== 1 ||
    buffer.readUInt32LE(24) !== VOICE_SAMPLE_RATE ||
    buffer.readUInt16LE(34) !== 16 ||
    buffer.toString('ascii', 36, 40) !== 'data'
  )
    throw new InvalidAudioError('Format audio non pris en charge.');
  const dataBytes = buffer.readUInt32LE(40);
  if (
    dataBytes !== buffer.length - 44 ||
    dataBytes % 2 !== 0 ||
    dataBytes === 0
  )
    throw new InvalidAudioError('Audio incomplet.');
  return { durationMs: Math.round((dataBytes / 2 / VOICE_SAMPLE_RATE) * 1000) };
}
