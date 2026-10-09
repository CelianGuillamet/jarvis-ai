export const TARGET_RATE = 16_000;
export const MAX_RECORDING_SECONDS = 30;

/** Mono Float32 chunks at any input rate to 16 kHz, 16-bit PCM WAV (the only format the server accepts). */
export function encodeWav16k(chunks: Float32Array[], inputRate: number): ArrayBuffer {
  if (!Number.isFinite(inputRate) || inputRate < 8_000 || inputRate > 192_000)
    throw new RangeError("Fréquence audio invalide.");
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }
  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.min(Math.floor(length / ratio), MAX_RECORDING_SECONDS * TARGET_RATE);
  const buffer = new ArrayBuffer(44 + outLength * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + outLength * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, outLength * 2, true);
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    const sample = Math.max(-1, Math.min(1, a + (b - a) * fraction));
    view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
  }
  return buffer;
}
