// Stand-in for scripts/voice/qwen_tts_worker.py: same JSON-lines protocol, no model.
const readline = require('node:readline');
const mode = process.env.QWEN_TTS_MODEL || 'ok';
const send = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`);
const header = Buffer.from('RIFFfakeWAVE');
let cancelledIds = new Set();
setTimeout(() => send({ type: 'ready' }), 50);
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.cancel) return cancelledIds.add(message.cancel);
  if (mode === 'crash') process.exit(3);
  if (mode === 'hang') return;
  if (mode === 'slow')
    return setTimeout(() => {
      if (cancelledIds.has(message.id))
        return send({ id: message.id, type: 'cancelled' });
      send({ id: message.id, type: 'audio', wav: header.toString('base64') });
    }, 400);
  if (mode === 'error') return send({ id: message.id, type: 'error' });
  send({
    id: message.id,
    type: 'audio',
    wav: Buffer.concat([header, Buffer.from(message.text)]).toString('base64'),
  });
});
