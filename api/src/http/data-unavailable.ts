import { ServiceUnavailableException } from '@nestjs/common';

/** A failed read must not look like an empty account, or expose database details. */
export function dataUnavailable() {
  return new ServiceUnavailableException({
    code: 'UNAVAILABLE',
    message:
      'Les données sont temporairement indisponibles. Réessaie plus tard.',
  });
}
