export type CalendarEventItem = {
  provider: 'google' | 'db';
  calendarId?: string; // pour Google
  eventId: string; // id Google event ou id DB
  title: string;
  when: Date;
  end?: Date;
};

export interface CalendarProvider {
  listEventsInterval(
    sessionId: string,
    startIso: string,
    endIso: string,
    tz: string,
    limit: number,
  ): Promise<CalendarEventItem[]>;

  createEvent(
    sessionId: string,
    title: string,
    whenIso: string,
    tz: string,
    endWhenIso?: string,
  ): Promise<void>;

  deleteEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    calendarId?: string,
  ): Promise<void>;

  updateEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    calendarId: string | undefined,
    title: string,
    whenIso: string,
    tz: string,
    endWhenIso?: string,
  ): Promise<void>;
}
