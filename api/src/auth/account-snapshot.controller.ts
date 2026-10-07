import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { once } from 'node:events';
import type { AuthenticatedRequest } from './session.guard';
import { AccountSnapshotService } from '../privacy/account-snapshot.service';
import { dataUnavailable } from '../http/data-unavailable';

@Controller('account/export')
export class AccountSnapshotController {
  constructor(private readonly snapshots: AccountSnapshotService) {}

  @Get('snapshot')
  async download(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const controller = new AbortController();
    const disconnected = () => controller.abort();
    response.once('close', disconnected);
    response.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="jarvis-data.ndjson"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    try {
      await this.snapshots.stream(
        request.identity.userId,
        async (record) => {
          if (controller.signal.aborted || response.destroyed)
            throw new Error('Export interrupted');
          if (!response.write(`${JSON.stringify(record)}\n`)) {
            await once(response, 'drain', { signal: controller.signal });
          }
        },
        controller.signal,
      );
      response.end();
    } catch {
      if (response.destroyed || controller.signal.aborted) return;
      if (!response.headersSent) {
        response.removeHeader('Content-Disposition');
        response.removeHeader('Content-Type');
        throw dataUnavailable();
      }
      // Clients must reject downloads without the final complete record.
      response.end(
        `${JSON.stringify({ type: 'incomplete', code: 'UNAVAILABLE' })}\n`,
      );
    } finally {
      response.removeListener('close', disconnected);
    }
  }
}
