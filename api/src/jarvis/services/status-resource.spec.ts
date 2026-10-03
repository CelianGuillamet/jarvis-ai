import { BadGatewayException } from '@nestjs/common';
import { GoogleIntegrationError } from '../../google/google-integration.error';
import { readStatusResource } from './status-resource';

describe('Status resource availability', () => {
  it('distinguishes an available empty resource, including local calendar', async () => {
    await expect(
      readStatusResource(() => Promise.resolve([])),
    ).resolves.toEqual({ data: [], availability: 'available' });
  });
  it.each([
    [new GoogleIntegrationError('GMAIL_NOT_CONNECTED'), 'disconnected'],
    [
      new GoogleIntegrationError('CALENDAR_SCOPE_MISSING'),
      'permission_required',
    ],
    [new BadGatewayException({ code: 'INVALID_RESPONSE' }), 'invalid_response'],
    [new Error('private upstream details'), 'unavailable'],
  ])(
    'reports failure without leaking error details',
    async (error, availability) => {
      await expect(
        readStatusResource(() => Promise.reject(error)),
      ).resolves.toEqual({ data: null, availability });
    },
  );
});
