import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import type { CalendarProvider, CalendarEventItem } from './calendar.provider';

export class DbCalendarProvider implements CalendarProvider {
  constructor(private readonly prisma: PrismaService) {}

  async listEventsInterval(
    sessionId: string,
    startIso: string,
    endIso: string,
    tz: string,
    limit: number,
  ): Promise<CalendarEventItem[]> {
    const prisma = await this.prisma.forConversation(sessionId);
    const start = DateTime.fromISO(startIso, { zone: tz }).toJSDate();
    const end = DateTime.fromISO(endIso, { zone: tz }).toJSDate();

    const rows = await prisma.calendarEvent.findMany({
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
    sessionId: string,
    title: string,
    whenIso: string,
    tz: string,
  ) {
    const prisma = await this.prisma.forConversation(sessionId);
    const when = DateTime.fromISO(whenIso, { zone: tz }).toJSDate();
    await prisma.calendarEvent.create({
      data: { ownerId: prisma.ownerId, title, when },
    });
  }

  async deleteEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
  ) {
    if (provider !== 'db') throw new Error('DB_DELETE_WRONG_PROVIDER');
    const prisma = await this.prisma.forConversation(sessionId);
    await prisma.calendarEvent.delete({ where: { id: eventId } });
  }

  async updateEvent(
    sessionId: string,
    provider: 'google' | 'db',
    eventId: string,
    _calendarId: string | undefined,
    title: string,
    whenIso: string,
    tz: string,
  ) {
    if (provider !== 'db') throw new Error('DB_UPDATE_WRONG_PROVIDER');
    const prisma = await this.prisma.forConversation(sessionId);
    const when = DateTime.fromISO(whenIso, { zone: tz }).toJSDate();
    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: { ownerId: prisma.ownerId, title, when },
    });
  }
}
