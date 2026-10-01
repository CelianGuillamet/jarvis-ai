import { HttpException } from '@nestjs/common';
import { asGoogleIntegrationError } from '../../google/google-integration.error';
import type { z } from 'zod';
import type { ResourceAvailabilitySchema } from '../../contracts/v1';

type Availability = z.infer<typeof ResourceAvailabilitySchema>;

export async function readStatusResource<T>(read: () => Promise<T>): Promise<{
  data: T | null;
  availability: Availability;
}> {
  try {
    return { data: await read(), availability: 'available' };
  } catch (error) {
    const integration = asGoogleIntegrationError(error);
    let availability: Availability = 'unavailable';
    if (
      integration?.code === 'GMAIL_NOT_CONNECTED' ||
      integration?.code === 'GOOGLE_NOT_CONNECTED'
    )
      availability = 'disconnected';
    else if (
      integration?.code === 'GMAIL_SCOPE_MISSING' ||
      integration?.code === 'CALENDAR_SCOPE_MISSING'
    )
      availability = 'permission_required';
    else if (error instanceof HttpException) {
      const response = error.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        response.code === 'INVALID_RESPONSE'
      )
        availability = 'invalid_response';
    }
    return { data: null, availability };
  }
}
