import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import type { CalendarProvider, CalendarEventItem } from './calendar.provider';

export class DbCalendarProvider implements CalendarProvider {
  constructor(private readonly prisma: PrismaService) {}

  async listEventsInterval(
    _sessionId: string,
    startIso: string,
    endIso: string,
    tz: string,
    limit: number,
  ): Promise<CalendarEventItem[]> {
    const start = DateTime.fromISO(startIso, { zone: tz }).toJSDate();
    const end = DateTime.fromISO(endIso, { zone: tz }).toJSDate();

    const rows = await this.prisma.calendarEvent.findMany({
      where: { when: { gte: start, lte: end } },
      orderBy: { when: 'asc' },
      take: limit,
      select: { id: true, title: true, when: true },
    });

    return rows.map((r) => ({
      provider: 'db',
      eventId: r.id,
      title: r.title,
      when: r.when,
      end: DateTime.fromJSDate(r.when).plus({ minutes: 60 }).toJSDate(),
    }));
  }

  async createEvent(
    _sessionId: string,
    title: string,
    whenIso: string,
    tz: string,
    _endWhenIso?: string,
  ) {
    const when = DateTime.fromISO(whenIso, { zone: tz }).toJSDate();
    await this.prisma.calendarEvent.create({ data: { title, when } });
  }

  async deleteEvent(
    _sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
  ) {
    if (provider !== 'db') throw new Error('DB_DELETE_WRONG_PROVIDER');
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
  }

  async updateEvent(
    _sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    _calendarId: string | undefined,
    title: string,
    whenIso: string,
    tz: string,
    _endWhenIso?: string,
  ) {
    if (provider !== 'db') throw new Error('DB_UPDATE_WRONG_PROVIDER');
    const when = DateTime.fromISO(whenIso, { zone: tz }).toJSDate();
    await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: { title, when },
    });
  }
}
