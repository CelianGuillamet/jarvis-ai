import { DateTime } from 'luxon';
import type {
  CalendarEventItem,
  CalendarProvider,
} from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { previewTool, runTool, type ToolContext } from './tools';

describe('previewTool', () => {
  const tz = 'Europe/Paris';
  const sessionId = 'preview-tools-spec';

  function makeCtx(calendar: CalendarProvider): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      search() {
        return Promise.resolve([]);
      },
      open(url: string) {
        return Promise.resolve({ url, content: '' });
      },
    };

    const gmail: GmailProvider = {
      listMessages: jest.fn().mockResolvedValue([]),
      getMessage: jest.fn(),
      modifyLabels: jest.fn(),
      trashMessage: jest.fn(),
      untrashMessage: jest.fn(),
      deleteMessage: jest.fn(),
      sendMessage: jest.fn(),
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
      gmail,
    };
  }

  it('previews gmail.send payload', async () => {
    const calendar: CalendarProvider = {
      listEventsInterval: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
    };

    const ctx = makeCtx(calendar);
    const out = await previewTool(ctx, {
      type: 'tool',
      name: 'gmail.send',
      args: {
        to: 'alice@example.com',
        subject: 'Objet très important',
        text: 'Bonjour Alice,\n\nPeux-tu valider ?\nMerci',
      },
    });

    expect(out).toContain('To: alice@example.com');
    expect(out).toContain('Sujet: Objet très important');
    expect(out).toContain('Message: Bonjour Alice, Peux-tu valider ? Merci');
  });

  it('previews calendar.delete when a last list is available', async () => {
    const seed: CalendarEventItem[] = [
      {
        provider: 'db',
        eventId: 'e1',
        title: 'Cours de golf',
        when: DateTime.fromISO('2026-03-17T17:30:00+01:00').toJSDate(),
        end: DateTime.fromISO('2026-03-17T18:30:00+01:00').toJSDate(),
      },
    ];

    const calendar: CalendarProvider = {
      listEventsInterval: jest.fn().mockResolvedValue(seed),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
    };

    const ctx = makeCtx(calendar);
    await runTool(ctx, {
      type: 'tool',
      name: 'calendar.list',
      args: {
        startIso: '2026-03-17T00:00:00+01:00',
        endIso: '2026-03-17T23:59:59+01:00',
        limit: 20,
      },
    });

    const preview = await previewTool(ctx, {
      type: 'tool',
      name: 'calendar.delete',
      args: { ref: 1 },
    });

    expect(preview).toContain('Cours de golf');
    expect(preview).toContain('Cible:');
  });
});
