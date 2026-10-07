import { GoogleIntegrationError } from '../../google/google-integration.error';
import type { GoogleOAuthClientService } from '../../google/google-oauth-client.service';
import type { CalendarProvider } from './calendar.provider';
import { HybridCalendarProvider } from './hybrid-calendar.provider';

function build(connected: boolean, localFallback?: boolean) {
  const google = {
    listEventsInterval: jest.fn().mockResolvedValue([{ id: 'g' }]),
    createEvent: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    listEventsInterval: jest.fn().mockResolvedValue([{ id: 'local' }]),
    createEvent: jest.fn().mockResolvedValue(undefined),
  };
  const oauth = {
    isConnected: jest.fn().mockResolvedValue(connected),
  } as unknown as GoogleOAuthClientService;
  const provider = new HybridCalendarProvider(
    oauth,
    google as unknown as CalendarProvider,
    db as unknown as CalendarProvider,
    localFallback,
  );
  return { provider, google, db };
}

describe('HybridCalendarProvider', () => {
  it('reads from Google when connected', async () => {
    const { provider, google, db } = build(true);
    await expect(
      provider.listEventsInterval('s', 'a', 'b', 'Europe/Paris', 5),
    ).resolves.toEqual([{ id: 'g' }]);
    expect(db.listEventsInterval).not.toHaveBeenCalled();
    expect(google.listEventsInterval).toHaveBeenCalled();
  });

  it('does not silently read local events without Google', async () => {
    const { provider, db } = build(false);
    await expect(
      provider.listEventsInterval('s', 'a', 'b', 'Europe/Paris', 5),
    ).resolves.toEqual([]);
    expect(db.listEventsInterval).not.toHaveBeenCalled();
  });

  it('does not silently create local events without Google', async () => {
    const { provider, db } = build(false);
    await expect(
      provider.createEvent(
        's',
        'Titre',
        '2026-10-08T10:00:00+02:00',
        'Europe/Paris',
      ),
    ).rejects.toEqual(new GoogleIntegrationError('GOOGLE_NOT_CONNECTED'));
    expect(db.createEvent).not.toHaveBeenCalled();
  });

  it('uses the local calendar only when the fallback is explicitly enabled', async () => {
    const { provider, db } = build(false, true);
    await expect(
      provider.listEventsInterval('s', 'a', 'b', 'Europe/Paris', 5),
    ).resolves.toEqual([{ id: 'local' }]);
    await provider.createEvent(
      's',
      'T',
      '2026-10-08T10:00:00+02:00',
      'Europe/Paris',
    );
    expect(db.createEvent).toHaveBeenCalled();
  });
});
