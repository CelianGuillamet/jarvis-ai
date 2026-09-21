import { Socket } from 'node:net';

const runId = process.env.JARVIS_TEST_RUN_ID;
if (!runId || !/^[a-f0-9]{32}$/.test(runId)) {
  throw new Error(
    'Use npm run test:integration to provision a disposable database.',
  );
}
const database = new URL(process.env.DATABASE_URL ?? '');
if (
  database.hostname !== '127.0.0.1' ||
  database.pathname !== `/jarvis_test_${runId}`
) {
  throw new Error('Integration tests refuse a non-disposable database target.');
}

export const allowedPorts = new Set([Number(database.port)]);
// Preserve the native method; Reflect.apply below supplies the calling socket.
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalConnect = Socket.prototype.connect;
const connect = jest
  .spyOn(Socket.prototype, 'connect')
  .mockImplementation(function (this: Socket, ...args: unknown[]) {
    // Node normalizes some connect overloads into an array before calling this method.
    const normalized = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
    const first = normalized[0];
    const options =
      typeof first === 'object' && first !== null
        ? (first as { host?: string; port?: number | string; path?: string })
        : { port: first, host: normalized[1] };
    const host = options.host;
    if (
      !('path' in options && options.path) &&
      (host === '127.0.0.1' || host === 'localhost') &&
      allowedPorts.has(Number(options.port))
    ) {
      return Reflect.apply(originalConnect, this, args) as Socket;
    }
    throw new Error('External network disabled in integration tests');
  });
const fetch = jest
  .spyOn(globalThis, 'fetch')
  .mockRejectedValue(new Error('External fetch disabled in integration tests'));

afterAll(() => {
  connect.mockRestore();
  fetch.mockRestore();
});
