import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './session.guard';
import type { AccountSnapshotService } from '../privacy/account-snapshot.service';
import { AccountSnapshotController } from './account-snapshot.controller';

const request = {
  identity: { userId: 'signed-owner' },
} as AuthenticatedRequest;
class DownloadResponse extends EventEmitter {
  headersSent = false;
  destroyed = false;
  set = jest.fn();
  removeHeader = jest.fn();
  write = jest.fn<boolean, [string]>(() => {
    this.headersSent = true;
    return true;
  });
  end = jest.fn();
}
type Stream = AccountSnapshotService['stream'];

describe('Account snapshot HTTP download', () => {
  function fixture(stream: Stream) {
    const response = new DownloadResponse();
    const controller = new AccountSnapshotController({
      stream,
    } as AccountSnapshotService);
    return { response, controller };
  }

  it('uses signed identity, prevents caching, and ends after a successful stream', async () => {
    const stream = jest.fn<ReturnType<Stream>, Parameters<Stream>>(
      async (_owner, write) => {
        await write({ type: 'complete', records: 0 });
      },
    );
    const { controller, response } = fixture(stream);
    await controller.download(request, response as unknown as Response);
    expect(stream.mock.calls[0][0]).toBe('signed-owner');
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'no-store',
        'Content-Type': 'application/x-ndjson; charset=utf-8',
      }),
    );
    expect(response.write).toHaveBeenCalledWith(
      '{"type":"complete","records":0}\n',
    );
    expect(response.end).toHaveBeenCalledWith();
    expect(response.listenerCount('close')).toBe(0);
  });

  it('reports a sanitized HTTP failure when the database fails before any bytes', async () => {
    const { controller, response } = fixture(() =>
      Promise.reject(new Error('secret-database-details')),
    );
    await expect(
      controller.download(request, response as unknown as Response),
    ).rejects.toMatchObject({ status: 503 });
    expect(response.removeHeader).toHaveBeenCalledWith('Content-Type');
    expect(response.removeHeader).toHaveBeenCalledWith('Content-Disposition');
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
  });

  it('marks a failure after headers incomplete without exposing database details', async () => {
    const { controller, response } = fixture(async (_owner, write) => {
      await write({ type: 'header' });
      throw new Error('secret-database-details');
    });
    await controller.download(request, response as unknown as Response);
    expect(response.end).toHaveBeenCalledWith(
      '{"type":"incomplete","code":"UNAVAILABLE"}\n',
    );
  });

  it('waits for HTTP backpressure before producing the next record', async () => {
    let written = false;
    const { controller, response } = fixture(async (_owner, write) => {
      await write({ type: 'header' });
      written = true;
    });
    response.write.mockImplementationOnce(() => {
      response.headersSent = true;
      queueMicrotask(() => {
        expect(written).toBe(false);
        response.emit('drain');
      });
      return false;
    });
    await controller.download(request, response as unknown as Response);
    expect(written).toBe(true);
  });

  it('aborts a blocked writer on disconnect and removes listeners', async () => {
    let signal: AbortSignal | undefined;
    const { controller, response } = fixture(
      async (_owner, write, connection) => {
        signal = connection;
        await write({ type: 'header' });
      },
    );
    response.write.mockImplementationOnce(() => {
      response.headersSent = true;
      queueMicrotask(() => response.emit('close'));
      return false;
    });
    await controller.download(request, response as unknown as Response);
    expect(signal?.aborted).toBe(true);
    expect(response.end).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('drain')).toBe(0);
  });
});
