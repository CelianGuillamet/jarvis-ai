import { google } from 'googleapis';
import { GoogleCalendarProvider } from './google-calendar.provider';
import type { GoogleOAuthClientService } from '../../google/google-oauth-client.service';

jest.mock('googleapis', () => ({ google: { calendar: jest.fn() } }));

describe('Calendar mutation receipts', () => {
  const insert = jest.fn();
  const patch = jest.fn();
  const provider = new GoogleCalendarProvider({
    createAuthorizedClient: jest.fn().mockResolvedValue({}),
  } as unknown as GoogleOAuthClientService);
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(google.calendar)
      .mockReturnValue({ events: { insert, patch } } as unknown as ReturnType<
        typeof google.calendar
      >);
  });
  it.each([null, {}, { id: '' }, { id: 1 }])(
    'rejects invalid creation receipts without repeating the mutation',
    async (data) => {
      insert.mockResolvedValueOnce({ data });
      await expect(
        provider.createEvent(
          'conversation',
          'Meeting',
          '2026-10-01T10:00:00Z',
          'UTC',
        ),
      ).rejects.toThrow('La réponse du calendrier est invalide.');
      expect(insert).toHaveBeenCalledTimes(1);
    },
  );
  it('accepts a stable creation reference', async () => {
    insert.mockResolvedValueOnce({ data: { id: 'event' } });
    await expect(
      provider.createEvent(
        'conversation',
        'Meeting',
        '2026-10-01T10:00:00Z',
        'UTC',
      ),
    ).resolves.toBeUndefined();
  });
  it('rejects malformed update receipts without retry', async () => {
    patch.mockResolvedValueOnce({ data: {} });
    await expect(
      provider.updateEvent(
        'conversation',
        'google',
        'event',
        'primary',
        'Meeting',
        '2026-10-01T10:00:00Z',
        'UTC',
      ),
    ).rejects.toThrow('La réponse du calendrier est invalide.');
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
