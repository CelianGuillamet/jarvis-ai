import type { Capture } from "./dictation.ts";

const WORKLET = `
class JarvisRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) { const copy = channel.slice(0); this.port.postMessage(copy, [copy.buffer]); }
    return true;
  }
}
registerProcessor('jarvis-recorder', JarvisRecorder);
`;

/** Opens the microphone only when called, and releases every track and the audio graph when done. */
export async function startBrowserCapture(): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const release = (context?: AudioContext) => {
    for (const track of stream.getTracks()) track.stop();
    void context?.close().catch(() => undefined);
  };
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "jarvis-recorder");
    const chunks: Float32Array[] = [];
    node.port.onmessage = (event: MessageEvent<Float32Array>) => chunks.push(event.data);
    source.connect(node);
    const rate = context.sampleRate;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      node.port.onmessage = null;
      node.disconnect();
      release(context);
    };
    return {
      stop: () => {
        finish();
        return Promise.resolve({ chunks, rate });
      },
      cancel: () => {
        chunks.length = 0;
        finish();
      },
    };
  } catch (error) {
    release(context);
    throw error;
  }
}

let output: AudioContext | null = null;

/** Plays a WAV and resolves when it ends or the signal aborts, whichever comes first. */
export async function playWav(audio: ArrayBuffer, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  output ??= new AudioContext();
  if (output.state === "suspended") await output.resume();
  const decoded = await output.decodeAudioData(audio.slice(0));
  if (signal.aborted) return;
  await new Promise<void>(resolve => {
    const source = output!.createBufferSource();
    source.buffer = decoded;
    source.connect(output!.destination);
    const end = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      end();
    };
    source.onended = end;
    signal.addEventListener("abort", onAbort, { once: true });
    source.start();
  });
}
