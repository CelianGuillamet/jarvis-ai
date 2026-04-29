import { DateTime } from 'luxon';
import type {
  CalendarEventItem,
  CalendarProvider,
} from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

function makeCalendarProvider(seed: CalendarEventItem[]) {
  const events = [...seed];
  let lastUpdate:
    | {
        eventId: string;
        whenIso: string;
        endWhenIso?: string;
      }
    | undefined;

  const provider: CalendarProvider = {
    async listEventsInterval() {
      return [...events];
    },
    async createEvent() {},
    async deleteEvent(_sessionId, _provider, eventId) {
      const idx = events.findIndex((e) => e.eventId === eventId);
      if (idx >= 0) events.splice(idx, 1);
    },
    async updateEvent(
      _sessionId,
      _provider,
      eventId,
      _calendarId,
      title,
      whenIso,
      _tz,
      endWhenIso,
    ) {
      const idx = events.findIndex((e) => e.eventId === eventId);
      if (idx >= 0) {
        events[idx] = {
          ...events[idx],
          title,
          when: DateTime.fromISO(whenIso).toJSDate(),
          end: endWhenIso ? DateTime.fromISO(endWhenIso).toJSDate() : undefined,
        };
      }
      lastUpdate = { eventId, whenIso, endWhenIso };
    },
  };

  return {
    provider,
    getLastUpdate: () => lastUpdate,
  };
}

describe('runTool calendar context resolver', () => {
  const tz = 'Europe/Paris';
  const sessionId = 'context-spec';

  function makeContext(calendar: CalendarProvider): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      async search() {
        return [];
      },
      async open(url: string) {
        return { url, content: '' };
      },
    };
    return {
      prisma: {} as any,
      memory: {} as any,
      simulation: false,
      tz,
      sessionId,
      calendar,
      web,
      weather: {} as any,
      gmail: {} as GmailProvider,
    };
  }

  it('uses focused event with "__last__" query', async () => {
    const seed: CalendarEventItem[] = [
      {
        provider: 'db',
        eventId: 'e1',
        title: 'Cours de golf',
        when: DateTime.fromISO('2026-03-17T17:30:00+01:00').toJSDate(),
        end: DateTime.fromISO('2026-03-17T18:30:00+01:00').toJSDate(),
      },
    ];
    const { provider } = makeCalendarProvider(seed);
    const ctx = makeContext(provider);

    await runTool(ctx, {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-03-01T00:00:00+01:00',
        endIso: '2026-03-31T23:59:59+01:00',
        limit: 20,
      },
    });

    const result = await runTool(ctx, {
      type: 'tool',
      name: 'calendar.duration',
      args: { query: '__last__' },
    });

    expect(result).toContain('Cours de golf');
  });

  it('updates focused event from day-only text', async () => {
    const seed: CalendarEventItem[] = [
      {
        provider: 'db',
        eventId: 'e1',
        title: 'Cours de golf',
        when: DateTime.fromISO('2026-03-17T17:30:00+01:00').toJSDate(),
        end: DateTime.fromISO('2026-03-17T18:30:00+01:00').toJSDate(),
      },
    ];
    const { provider, getLastUpdate } = makeCalendarProvider(seed);
    const ctx = makeContext(provider);

    await runTool(ctx, {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-03-01T00:00:00+01:00',
        endIso: '2026-03-31T23:59:59+01:00',
        limit: 20,
      },
    });

    await runTool(ctx, {
      type: 'tool',
      name: 'calendar.update',
      args: { query: '__last__', when: 'le 20 a 17h' },
    });

    const update = getLastUpdate();
    expect(update?.eventId).toBe('e1');
    expect(update?.whenIso.startsWith('2026-03-20T17:00:00')).toBe(true);
  });
});
