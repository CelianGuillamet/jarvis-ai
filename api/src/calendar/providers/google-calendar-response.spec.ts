import {
  CalendarEventsSchema,
  CalendarListSchema,
  validateCalendarResponse,
} from './google-calendar-response';

describe('Google calendar response validation', () => {
  const event = {
    id: 'event',
    start: { dateTime: '2026-10-01T10:00:00Z' },
    end: { dateTime: '2026-10-01T11:00:00Z' },
  };
  it('accepts empty lists and valid timed or all-day events', () => {
    expect(validateCalendarResponse({}, CalendarListSchema)).toEqual({});
    expect(
      validateCalendarResponse({ items: [] }, CalendarEventsSchema),
    ).toEqual({ items: [] });
    expect(
      validateCalendarResponse(
        {
          items: [
            event,
            {
              id: 'day',
              start: { date: '2026-10-01' },
              end: { date: '2026-10-02' },
            },
          ],
        },
        CalendarEventsSchema,
      ).items,
    ).toHaveLength(2);
  });
  it.each([
    null,
    { items: null },
    { items: [{}] },
    { items: [{ ...event, id: '' }] },
    { items: [{ ...event, start: { dateTime: 'invalid' } }] },
    { items: [{ ...event, end: undefined }] },
  ])(
    'rejects malformed events instead of inventing identities or hiding them',
    (payload) => {
      expect(() =>
        validateCalendarResponse(payload, CalendarEventsSchema),
      ).toThrow('La réponse du calendrier est invalide.');
    },
  );
  it('rejects selected calendars without a stable identifier', () => {
    expect(() =>
      validateCalendarResponse(
        { items: [{ selected: true }] },
        CalendarListSchema,
      ),
    ).toThrow();
  });
});
