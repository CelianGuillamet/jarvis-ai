import { join } from 'node:path';

// Fake local engines: no real speech model is ever loaded by the integration suite.
process.env.VOICE_STT_ENABLED = 'true';
process.env.WHISPER_CLI_PATH = join(__dirname, 'fake-whisper.sh');
process.env.WHISPER_MODEL_PATH = join(__dirname, 'fake-model.bin');
