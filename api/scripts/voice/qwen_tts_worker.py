"""Long-lived local speech worker (Qwen3-TTS via mlx-audio). JSON lines on stdin/stdout.

Requests : {"id": "1", "text": "...", "speed": 1.0}   or   {"cancel": "1"}
Replies  : {"type": "ready"}, {"id": "1", "type": "audio", "wav": "<base64 WAV>"},
           {"id": "1", "type": "cancelled"}, {"id": "1", "type": "error"}
The voice is a clone of a reference clip that was itself designed from a text description
(see design_reference.py), so it is stable across sentences and belongs to no real person.
"""
import base64, io, json, os, queue, sys, threading, wave

import numpy as np
from mlx_audio.tts.utils import load_model

MODEL = os.environ.get("QWEN_TTS_MODEL") or "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
REF_AUDIO = os.environ["QWEN_TTS_REF_AUDIO"]
REF_TEXT = open(os.environ["QWEN_TTS_REF_TEXT"], encoding="utf-8").read().strip()
LANG = os.environ.get("QWEN_TTS_LANG") or "french"
MAX_TEXT = 700

requests: "queue.Queue[dict]" = queue.Queue()
cancelled: set = set()
lock = threading.Lock()


def reader() -> None:
    for line in sys.stdin:
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if "cancel" in message:
            with lock:
                cancelled.add(str(message["cancel"]))
        else:
            requests.put(message)
    requests.put({"quit": True})


def send(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def wav_base64(samples: np.ndarray, rate: int) -> str:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm.tobytes())
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def main() -> None:
    model = load_model(MODEL)
    threading.Thread(target=reader, daemon=True).start()
    send({"type": "ready"})
    while True:
        message = requests.get()
        if message.get("quit"):
            return
        request_id = str(message.get("id", ""))
        text = str(message.get("text", "")).strip()[:MAX_TEXT]
        speed = float(message.get("speed", 1.0))
        try:
            parts = []
            was_cancelled = False
            for result in model.generate(
                text=text,
                ref_audio=REF_AUDIO,
                ref_text=REF_TEXT,
                lang_code=LANG,
                speed=speed,
                stream=True,
                streaming_interval=1.5,
            ):
                with lock:
                    if request_id in cancelled:
                        cancelled.discard(request_id)
                        was_cancelled = True
                        break
                parts.append(np.array(result.audio))
            if was_cancelled:
                send({"id": request_id, "type": "cancelled"})
            elif parts:
                send({"id": request_id, "type": "audio", "wav": wav_base64(np.concatenate(parts), model.sample_rate)})
            else:
                send({"id": request_id, "type": "error"})
        except Exception:  # noqa: BLE001 - never leak details; the parent logs only the kind
            send({"id": request_id, "type": "error"})
        with lock:
            cancelled.discard(request_id)


if __name__ == "__main__":
    main()
