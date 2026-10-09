"""Design the reference voice once from a written description (no real person is imitated).

Usage: python design_reference.py OUTPUT.wav OUTPUT.txt ["description"]
Listen to the result, adjust the description, and keep the file you like: the worker clones it
for every sentence so the voice stays identical.
"""
import sys

import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model

DEFAULT = (
    "A deep, calm adult male voice with a refined British accent. Quick, fluent and energetic delivery, "
    "speaking a little faster than normal, crisp articulation, confident and slightly amused. "
    "Very subtle synthetic clarity."
)
TEXT = (
    "Bonsoir, Monsieur. Votre agenda est prêt : trois rendez-vous aujourd'hui, le premier à neuf heures "
    "trente. Souhaitez-vous que je vous les détaille ?"
)

wav_path, text_path = sys.argv[1], sys.argv[2]
instruct = sys.argv[3] if len(sys.argv) > 3 else DEFAULT
model = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit")
audio = np.concatenate(
    [np.array(r.audio) for r in model.generate_voice_design(text=TEXT, instruct=instruct, language="french")]
)
audio_write(wav_path, audio, model.sample_rate)
open(text_path, "w", encoding="utf-8").write(TEXT)
print("written", wav_path)
