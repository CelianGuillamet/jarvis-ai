# JAR-048 — Local French voice dialogue

Explicit push-to-talk dictation and optional spoken replies, entirely on this machine. No audio, transcript or text goes to any remote service, and nothing is downloaded by Jarvis itself: the engines are local programs you install and point to. « Hey Jarvis » and wake-word listening are not part of this increment and would need a separate consent.

## What it does

- **Dictation**: the Chat composer shows « Parler » only when the transcription engine is ready. Click to start (the browser asks for the microphone), the button turns into « Arrêter et transcrire », a status line shows the listening time (30 s maximum, then it stops by itself). The recording is converted in the browser to 16 kHz mono WAV, sent to `POST /voice/transcribe`, transcribed by whisper.cpp, and the text is **added to the composer for editing**. It is never sent automatically and never executed as a command; sending stays an explicit « Envoyer ».
- **Spoken replies** (off by default, checkbox): each new assistant reply is split into sentences (French abbreviations such as « M. », « Mme », « Dr » are respected), synthesized by Piper one chunk ahead and played in order. « Arrêter la lecture » stops immediately; audio that finishes late is discarded.
- **Account or conversation change, sign-out, unmount**: recording and playback are cancelled, the microphone is released, in-flight requests are aborted and late results are dropped.
- **Confirmations**: the yes/no parser was made strict (whole utterance only), so « si je dis oui tu envoies quoi », « je confirme demain » or « toujours demander avant envoi » no longer confirm a pending action. This protects dictated text as much as typed text.

## Server

Off by default. `VOICE_STT_ENABLED` / `VOICE_TTS_ENABLED` plus absolute paths `WHISPER_CLI_PATH`, `WHISPER_MODEL_PATH`, `PIPER_PATH`, `PIPER_VOICE_PATH` (validated at startup when enabled). `GET /voice` reports `disabled | unavailable | ready` without revealing paths. Limits: WAV 16 kHz mono 16-bit only, 30 s and ~960 KB per upload (the upload route has its own size limit; every other body stays at 64 KiB), 1 transcription at a time with 2 queued (then 429), 30 s engine deadline, 64 KB output, text to speak 600 characters and 4 MiB of audio per chunk, 20 s deadline. Engines run without a shell, with a minimal environment, and are killed when the client disconnects. Audio exists only in a private 0700 temporary directory for the duration of one call and is deleted afterwards, including on failure; nothing is stored in the database, journals or logs.

## Local installation (done on this machine, 9 October 2026)

```sh
brew install whisper-cpp                      # whisper.cpp 1.9.5, MIT
uv tool install piper-tts                     # piper-tts 1.8.0 (OHF-Voice/piper1-gpl), GPL-3.0, run as a separate process
mkdir -p ~/.jarvis/voice/models && cd ~/.jarvis/voice/models
curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin   # 190 085 487 bytes, sha256 ae85e4a9…0411bb
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium
curl -LO $B/fr_FR-siwis-medium.onnx && curl -LO $B/fr_FR-siwis-medium.onnx.json && curl -LO $B/MODEL_CARD
```

Then in `api/.env`:

```sh
VOICE_STT_ENABLED=true
WHISPER_CLI_PATH=/opt/homebrew/bin/whisper-cli
WHISPER_MODEL_PATH=/Users/<you>/.jarvis/voice/models/ggml-small-q5_1.bin
VOICE_TTS_ENABLED=true
PIPER_PATH=/Users/<you>/.local/bin/piper
PIPER_VOICE_PATH=/Users/<you>/.jarvis/voice/models/fr_FR-siwis-medium.onnx
```

## Licences and provenance

| Component | Version | Licence | Use |
| --- | --- | --- | --- |
| whisper.cpp | 1.9.5 (Homebrew) | MIT | separate executable |
| Whisper `small` weights, ggml q5_1 | `ggml-small-q5_1.bin` | MIT (OpenAI Whisper) | local model file, not committed |
| Piper (`piper-tts`, piper1-gpl) | 1.8.0 | GPL-3.0 | separate executable; no Piper code is linked, copied or distributed with Jarvis |
| Voice `fr_FR-siwis-medium` | rhasspy/piper-voices | CC BY 4.0 (dataset: SIWIS, University of Edinburgh) | local model file; attribution required wherever its audio is redistributed |

The audio fixtures in `api/test/fixtures/voice/` are synthetic speech produced by this voice and carry the same attribution; they are not human recordings. Sentence splitting logic was written for this project, informed by the reviewed Couvbat and Personal Jarvis chunkers (no code copied; see `docs/2026-10-07-open-source-source-review.md`). The late-synthesis defect found there is covered by a test.

## Measurements (Apple M1 Pro, no other load)

Transcription of the synthetic fixtures through the real service (`VOICE_BENCH=1 npx jest src/voice/voice.real`): 0.44–0.61 s per 2–4 s of audio once the model is cached (first call after install about 7 s). Synthesis: about 1.1 s per sentence (Piper starts a process per call). In a real Chrome with the browser pipeline and the isolated provider: 1.4–1.7 s from the end of speech to text in the composer.

| Fixture | Transcript | Word errors |
| --- | --- | --- |
| courses | « Ajoute du lait, des oeufs et de la farine à ma liste de courses. » | 0 % |
| météo | « Bonjour Jarvie, quel temps fait-il à Paris demain matin ? » | 10 % (name) |
| rappel | « …Madame Dupont jeudi prochain à 15h30. » | 25 % (digits) |
| tâche | « Suprime la tâche, révisez le contrat de Saint-Etienne. » | 22 % |
| rendez-vous | « Créz un rendez-vous avec Jean-Baptiste Lefebvre le 24 octobre à 9h. » | 40 % (verb, spelling, digits) |
| lumière | « Allume la lumière du salon à 40%. » | 33 % (digits) |
| confirmation | « Si je dis oui, tu en vois quoi ? » | 29 % |
| mails | « Quelles sont mes mails ? N'ont-lui des laits marchants ? » | 78 % (proper name) |

The word-error rate counts « quinze heures trente » versus « 15h30 » as errors, so it overstates real mistakes; proper names remain the weak point (« Hélène Marchand » failed). That is why the transcript is editable and is never sent on its own. These are synthetic voices; human voices, accents, noise and distance have not been measured.

## Verification

- API: 24 unit tests with fake executables (WAV validation, limiter, shell-free execution, timeout, flood, cancellation, cleanup of temporary audio, concurrency limit, status without paths), 2 tests with the real engines (skipped where not installed), HTTP-level integration (authentication, Origin check, 413/415/400, transcription with a fake engine) and the private-endpoint matrix.
- Web: unit tests for WAV encoding, French sentence splitting, the dictation state machine (30 s auto-stop, refusal, empty recording, cancellation dropping a late transcript, microphone release) and the speaker (ordering, immediate stop, late synthesis never played); component tests for the controls (hidden when disabled, missing engine, listening state, release on account change, refused microphone).
- Real Chrome (`web/test/browser/voice-e2e.mjs`, run manually): dictation of a French fixture lands in the composer, nothing is sent to the chat, the spoken reply starts and « Arrêter la lecture » stops it, a refused microphone is explained. Chrome's own fake-microphone file input delivered silence in headless mode, so `getUserMedia` is replaced by a stream that plays the fixture through Web Audio; the real permission prompt and a physical microphone were not exercised.

## Limits

- Synthetic fixtures only; no human speech, accents, noise, long dictation or non-Apple hardware measured.
- Piper starts one process per chunk (about 1 s latency); a resident server would be faster but is out of scope.
- `HOME_ASSISTANT`-style device voice (Assist, Wyoming) is not used.
- The yes/no parser now requires the entire utterance to be an affirmation or refusal of at most six words; longer natural phrasings such as « oui, vas-y envoie-le » are not accepted and must be shortened.
- Not run in CI: engines are not available there.
