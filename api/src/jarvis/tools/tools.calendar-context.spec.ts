import { DateTime } from 'luxon';
import type {
  CalendarEventItem,
  CalendarProvider,
} from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import {
  clearLocalToolCaches,
  withLocalToolCaches,
  runTool,
  previewTool,
  prepareCalendarTarget,
  type ToolContext,
} from './tools';
import {
  freezeCalendarTarget,
  readCalendarTarget,
} from '../../commands/calendar-target';

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
    listEventsInterval() {
      return Promise.resolve([...events]);
    },
    async createEvent() {},
    deleteEvent(_sessionId, _provider, eventId) {
      const idx = events.findIndex((e) => e.eventId === eventId);
      if (idx >= 0) events.splice(idx, 1);

      return Promise.resolve();
    },
    updateEvent(
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

      return Promise.resolve();
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
      search() {
        return Promise.resolve([]);
      },
      open(url: string) {
        return Promise.resolve({ url, content: '' });
      },
    };
    return {
      prisma: {} as unknown as ToolContext['prisma'],
      memory: {} as unknown as ToolContext['memory'],
      simulation: false,
      tz,
      sessionId,
      calendar,
      web,
      weather: {} as unknown as ToolContext['weather'],
      gmail: {} as GmailProvider,
    };
  }

  it('erases calendar list and focus for only the forgotten conversation', async () => {
    const event: CalendarEventItem = {
      provider: 'db',
      eventId: 'private',
      title: 'Private appointment',
      when: new Date('2026-10-01T10:00:00Z'),
    };
    const ctx = {
      ...makeContext(makeCalendarProvider([event]).provider),
      sessionId: 'erase-calendar',
    };
    const other = { ...ctx, sessionId: 'keep-calendar' };
    const list = {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-10-01T00:00:00Z',
        endIso: '2026-10-02T00:00:00Z',
      },
    } as const;
    const target = {
      type: 'tool',
      name: 'calendar.delete',
      args: { ref: 1 },
    } as const;
    await runTool(ctx, list);
    await runTool(other, list);
    expect((await prepareCalendarTarget(ctx, target))?.title).toBe(event.title);
    clearLocalToolCaches(ctx.sessionId);
    await expect(prepareCalendarTarget(ctx, target)).rejects.toThrow();
    await expect(
      prepareCalendarTarget(ctx, { ...target, args: { query: '__last__' } }),
    ).rejects.toThrow();
    expect((await prepareCalendarTarget(other, target))?.title).toBe(
      event.title,
    );
  });

  it('rejects delayed provider publication and nested calls after erasure', async () => {
    const event: CalendarEventItem = {
      provider: 'db',
      eventId: 'late',
      title: 'Late private appointment',
      when: new Date('2026-10-01T10:00:00Z'),
    };
    const provider = makeCalendarProvider([event]).provider;
    let release!: (events: CalendarEventItem[]) => void;
    const waiting = new Promise<CalendarEventItem[]>((resolve) => {
      release = resolve;
    });
    jest.spyOn(provider, 'listEventsInterval').mockReturnValueOnce(waiting);
    const ctx = { ...makeContext(provider), sessionId: 'late-calendar' };
    const list = {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-10-01T00:00:00Z',
        endIso: '2026-10-02T00:00:00Z',
      },
    } as const;
    const pending = withLocalToolCaches(ctx.sessionId, async () => {
      await runTool(ctx, list);
      // A later tool in the same request must inherit its invalid generation.
      await runTool(ctx, list);
      await expect(
        prepareCalendarTarget(ctx, {
          type: 'tool',
          name: 'calendar.delete',
          args: { ref: 1 },
        }),
      ).rejects.toThrow();
    });
    clearLocalToolCaches(ctx.sessionId);
    release([event]);
    await pending;
    await expect(
      prepareCalendarTarget(ctx, {
        type: 'tool',
        name: 'calendar.delete',
        args: { ref: 1 },
      }),
    ).rejects.toThrow();
  });

  it('executes the persisted target after the displayed list changes', async () => {
    const first: CalendarEventItem = {
      provider: 'db',
      eventId: 'approved-event',
      title: 'Cible approuvée',
      when: new Date('2026-10-01T10:00:00Z'),
    };
    const second: CalendarEventItem = {
      provider: 'db',
      eventId: 'other-event',
      title: 'Autre rendez-vous',
      when: new Date('2026-10-01T12:00:00Z'),
    };
    const { provider } = makeCalendarProvider([first, second]);
    const ctx = makeContext(provider);
    const list = {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-10-01T00:00:00Z',
        endIso: '2026-10-02T00:00:00Z',
      },
    } as const;
    await runTool(ctx, list);
    const call = {
      type: 'tool',
      name: 'calendar.delete',
      args: { ref: 1 },
    } as const;
    const target = await prepareCalendarTarget(ctx, call);
    expect(target?.eventId).toBe('approved-event');
    if (!target) throw new Error('Expected prepared target');
    const persisted = JSON.stringify([freezeCalendarTarget(target)]);
    const decoded: unknown = JSON.parse(persisted);
    // A restart can load the snapshot without restoring the volatile list.
    const frozen = readCalendarTarget(
      decoded as import('@prisma/client').Prisma.JsonValue,
    );
    const replacement = makeCalendarProvider([second]);
    await runTool({ ...ctx, calendar: replacement.provider }, list);
    const remove = jest.spyOn(provider, 'deleteEvent');
    const executionContext = { ...ctx, frozenCalendarTarget: frozen };
    expect(await previewTool(executionContext, call)).toContain(
      'Cible approuvée',
    );
    await runTool(executionContext, call);
    expect(remove).toHaveBeenCalledWith(
      sessionId,
      'db',
      'approved-event',
      undefined,
    );
  });

  it('refuses missing or malformed persisted targets instead of resolving the current list', () => {
    expect(() => readCalendarTarget([])).toThrow('Propose à nouveau');
    expect(() =>
      readCalendarTarget([
        { kind: 'calendar', eventId: 'id', when: 'invalid' },
      ]),
    ).toThrow('Propose à nouveau');
  });

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
