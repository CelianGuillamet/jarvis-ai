import { DateTime } from 'luxon';
import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import type { CalendarProvider, CalendarEventItem } from './calendar.provider';
import { GoogleOAuthClientService } from '../../google/google-oauth-client.service';

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly googleOAuth: GoogleOAuthClientService) {}

  private async authedCalendar(sessionId: string) {
    const oauth2 = await this.googleOAuth.createAuthorizedClient(
      sessionId,
      'GOOGLE_NOT_CONNECTED',
    );
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  private async getSelectedCalendarIds(sessionId: string) {
    const calendar = await this.authedCalendar(sessionId);
    const res = await calendar.calendarList.list({ minAccessRole: 'reader' });
    const items = res.data.items ?? [];

    const isNoiseCalendar = (summary: string) => {
      const s = summary.toLowerCase();
      return (
        s.includes('numéros de semaine') ||
        s.includes('numeros de semaine') ||
        s.includes('week numbers') ||
        s.includes('jours fériés') ||
        s.includes('jours feries') ||
        s.includes('holidays') ||
        s.includes('fêtes') ||
        s.includes('fetes')
      );
    };

    const selected = items
      .filter((c) => c.selected || c.primary)
      .map((c) => ({
        id: c.id!,
        summary: c.summary ?? c.id!,
        primary: !!c.primary,
      }))
      .filter((c) => !!c.id)
      .filter((c) => c.primary || !isNoiseCalendar(c.summary));

    const seen = new Set<string>();
    return selected.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  async listEventsInterval(
    sessionId: string,
    startIso: string,
    endIso: string,
    tz: string,
    limit: number,
  ): Promise<CalendarEventItem[]> {
    const calendar = await this.authedCalendar(sessionId);
    const calendars = await this.getSelectedCalendarIds(sessionId);

    const perCal = Math.min(Math.max(limit, 1), 50);

    const results = await Promise.all(
      calendars.map(async (cal) => {
        const res = await calendar.events.list({
          calendarId: cal.id,
          timeMin: startIso,
          timeMax: endIso,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: perCal,
          timeZone: tz,
        });

        const items = res.data.items ?? [];
        return items
          .map((it) => {
            const baseTitle = it.summary ?? '(Sans titre)';
            const title = cal.primary
              ? baseTitle
              : `[${cal.summary}] ${baseTitle}`;

            const startRaw = it.start?.dateTime || it.start?.date;
            if (!startRaw) return null;
            const endRaw = it.end?.dateTime || it.end?.date;

            const when =
              startRaw.length === 10
                ? DateTime.fromISO(startRaw, { zone: tz })
                    .startOf('day')
                    .toJSDate()
                : DateTime.fromISO(startRaw).toJSDate();

            const end = endRaw
              ? endRaw.length === 10
                ? DateTime.fromISO(endRaw, { zone: tz })
                    .startOf('day')
                    .toJSDate()
                : DateTime.fromISO(endRaw).toJSDate()
              : DateTime.fromJSDate(when).plus({ minutes: 60 }).toJSDate();

            return {
              provider: 'google' as const,
              calendarId: cal.id,
              eventId: it.id ?? randomUUID(),
              title,
              when,
              end,
            };
          })
          .filter(Boolean) as CalendarEventItem[];
      }),
    );

    const merged = results.flat();
    merged.sort((a, b) => a.when.getTime() - b.when.getTime());
    return merged.slice(0, Math.min(Math.max(limit, 1), 250));
  }

  async createEvent(
    sessionId: string,
    title: string,
    whenIso: string,
    tz: string,
    endWhenIso?: string,
  ) {
    const calendar = await this.authedCalendar(sessionId);

    const start = DateTime.fromISO(whenIso, { zone: tz });
    const parsedEnd = endWhenIso
      ? DateTime.fromISO(endWhenIso, { zone: tz })
      : DateTime.invalid('no-end');
    const end =
      parsedEnd.isValid && parsedEnd > start
        ? parsedEnd
        : start.plus({ minutes: 60 });

    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        start: {
          dateTime: start.toISO({ suppressMilliseconds: true })!,
          timeZone: tz,
        },
        end: {
          dateTime: end.toISO({ suppressMilliseconds: true })!,
          timeZone: tz,
        },
      },
    });
  }

  async deleteEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    calendarId?: string,
  ) {
    if (provider !== 'google') throw new Error('GOOGLE_DELETE_WRONG_PROVIDER');
    const calendar = await this.authedCalendar(sessionId);
    await calendar.events.delete({
      calendarId: calendarId ?? 'primary',
      eventId,
    });
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
  ) {
    if (provider !== 'google') throw new Error('GOOGLE_UPDATE_WRONG_PROVIDER');
    const calendar = await this.authedCalendar(sessionId);

    const start = DateTime.fromISO(whenIso, { zone: tz });
    const parsedEnd = endWhenIso
      ? DateTime.fromISO(endWhenIso, { zone: tz })
      : DateTime.invalid('no-end');
    const end =
      parsedEnd.isValid && parsedEnd > start
        ? parsedEnd
        : start.plus({ minutes: 60 });

    await calendar.events.patch({
      calendarId: calendarId ?? 'primary',
      eventId,
      requestBody: {
        summary: title,
        start: {
          dateTime: start.toISO({ suppressMilliseconds: true })!,
          timeZone: tz,
        },
        end: {
          dateTime: end.toISO({ suppressMilliseconds: true })!,
          timeZone: tz,
        },
      },
    });
  }
}
