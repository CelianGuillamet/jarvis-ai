import { BadRequestException } from '@nestjs/common';

/** Only throw before any side effect has been attempted by this command. */
export class CommandRejectedError extends BadRequestException {
  constructor(message: string) {
    super({ code: 'VALIDATION', message });
  }
}
