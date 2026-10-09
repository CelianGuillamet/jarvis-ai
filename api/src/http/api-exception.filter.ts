import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MutationsSuspendedError } from '../ops/mutation-kill-switch';
import { opsMetrics } from '../ops/ops-metrics';
import { currentRequestId } from '../ops/request-context';
import { ApiErrorResponseSchema, errorCodeForStatus } from '../contracts/v1';

/** HTTP failure categories are stable; unknown internal failures never expose details. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) {
      opsMetrics.http5xx += 1;
      const request = host.switchToHttp().getRequest<Request>();
      // Class, status and route only: messages can embed private content.
      this.logger.error(
        `request=${currentRequestId() ?? 'none'} ${request.method} ${request.path} status=${status} error=${error instanceof Error ? error.constructor.name : 'unknown'}`,
      );
    }
    const body = error instanceof HttpException ? error.getResponse() : null;
    const parsed = ApiErrorResponseSchema.safeParse(body);
    const code = parsed.success ? parsed.data.code : errorCodeForStatus(status);
    let message =
      error instanceof MutationsSuspendedError
        ? error.message
        : status >= 500
          ? 'Le service est temporairement indisponible. Le résultat ne peut pas être confirmé.'
          : 'La requête ne peut pas être traitée.';
    if (status < 500) {
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object' && 'message' in body) {
        const detail: unknown = body.message;
        if (typeof detail === 'string') message = detail;
        else if (
          Array.isArray(detail) &&
          detail.every((item: unknown) => typeof item === 'string')
        )
          message = detail.join(' ');
      }
    }
    response.status(status).json({ code, message });
  }
}
