import { BadGatewayException, Logger, UseInterceptors } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import type { z } from 'zod';
import { CONTRACT_VERSION } from '../contracts/v1';

/** Validate the serialized wire shape, including Date -> ISO string conversion. */
class ResponseContractInterceptor implements NestInterceptor {
  constructor(private readonly schema: z.ZodType) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('X-Jarvis-Contract', CONTRACT_VERSION);
    return next.handle().pipe(
      map((value: unknown) => {
        try {
          const wire: unknown = JSON.parse(JSON.stringify(value));
          const result = this.schema.safeParse(wire);
          if (result.success) return result.data;
          Logger.error(
            result.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              code: issue.code,
            })),
            'ResponseContract',
          );
        } catch {
          /* Serialization failures must not leak payload contents. */
        }
        throw new BadGatewayException({
          code: 'INVALID_RESPONSE',
          message: 'La réponse ne peut pas être confirmée.',
        });
      }),
    );
  }
}

export const ResponseContract = (schema: z.ZodType) =>
  UseInterceptors(new ResponseContractInterceptor(schema));
