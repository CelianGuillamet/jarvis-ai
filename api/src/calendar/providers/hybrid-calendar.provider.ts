import type { CalendarProvider, CalendarEventItem } from './calendar.provider';
import { GoogleOAuthClientService } from '../../google/google-oauth-client.service';

export class HybridCalendarProvider implements CalendarProvider {
  constructor(
    private readonly googleOAuth: GoogleOAuthClientService,
    private readonly google: CalendarProvider,
    private readonly db: CalendarProvider,
  ) {}

  private async hasGoogle(sessionId: string) {
    return this.googleOAuth.isConnected(sessionId);
  }

  async listEventsInterval(
    sessionId: string,
    startIso: string,
    endIso: string,
    tz: string,
    limit: number,
  ): Promise<CalendarEventItem[]> {
    if (await this.hasGoogle(sessionId)) {
      return this.google.listEventsInterval(
        sessionId,
        startIso,
        endIso,
        tz,
        limit,
      );
    }
    return this.db.listEventsInterval(sessionId, startIso, endIso, tz, limit);
  }

  async createEvent(
    sessionId: string,
    title: string,
    whenIso: string,
    tz: string,
    endWhenIso?: string,
  ): Promise<void> {
    if (await this.hasGoogle(sessionId)) {
      return this.google.createEvent(sessionId, title, whenIso, tz, endWhenIso);
    }
    return this.db.createEvent(sessionId, title, whenIso, tz, endWhenIso);
  }

  async deleteEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    calendarId?: string,
  ): Promise<void> {
    if (provider === 'google')
      return this.google.deleteEvent(sessionId, provider, eventId, calendarId);
    return this.db.deleteEvent(sessionId, provider, eventId, calendarId);
  }

  async updateEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    calendarId: string | undefined,
    title: string,
    whenIso: string,
    tz: string,
    endWhenIso?: string,
  ): Promise<void> {
    if (provider === 'google') {
      return this.google.updateEvent(
        sessionId,
        provider,
        eventId,
        calendarId,
        title,
        whenIso,
        tz,
        endWhenIso,
      );
    }
    return this.db.updateEvent(
      sessionId,
      provider,
      eventId,
      calendarId,
      title,
      whenIso,
      tz,
      endWhenIso,
    );
  }
}
