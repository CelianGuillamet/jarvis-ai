import { HttpException } from '@nestjs/common';

/** Only throw before any side effect has been attempted by this command. */
export class CommandRejectedError extends HttpException {
  constructor(
    message: string,
    readonly code: 'VALIDATION' | 'NOT_FOUND' = 'VALIDATION',
  ) {
    super({ code, message }, code === 'NOT_FOUND' ? 404 : 400);
  }
}
