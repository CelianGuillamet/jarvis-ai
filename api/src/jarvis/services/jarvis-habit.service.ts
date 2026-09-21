import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type HabitRecord = {
  id: string;
  name: string;
  emoji: string | null;
  frequency: string;
  streak: number;
  totalLogs: number;
  lastLogDate: string | null;
  loggedToday: boolean;
  createdAt: string;
};

@Injectable()
export class JarvisHabitService {
  private readonly logger = new Logger(JarvisHabitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    sessionId: string,
    input: { name: string; emoji?: string; frequency?: string },
  ): Promise<HabitRecord | null> {
    try {
      const habit = await this.prisma.habit.create({
        data: {
          sessionId,
          name: input.name.trim(),
          emoji: input.emoji ?? null,
          frequency: input.frequency ?? 'daily',
        },
      });
      return this.enrich(habit, []);
    } catch (err) {
      this.logger.error(`create habit failed: ${err}`);
      return null;
    }
  }

  async list(
    sessionId: string,
    includeArchived = false,
  ): Promise<HabitRecord[]> {
    try {
      const habits = await this.prisma.habit.findMany({
        where: { sessionId, ...(includeArchived ? {} : { archived: false }) },
        orderBy: { createdAt: 'asc' },
        include: { logs: { orderBy: { date: 'desc' }, take: 90 } },
      });
      return habits.map((h) => this.enrich(h, h.logs));
    } catch {
      return [];
    }
  }

  async log(
    sessionId: string,
    habitId: string,
    date: string,
    note?: string,
  ): Promise<HabitRecord | null> {
    try {
      const habit = await this.prisma.habit.findFirst({
        where: { id: habitId, sessionId },
      });
      if (!habit) return null;

      await this.prisma.habitLog.upsert({
        where: { habitId_date: { habitId, date } },
        create: { habitId, date, note: note ?? null },
        update: { note: note ?? null },
      });

      const updated = await this.prisma.habit.findUniqueOrThrow({
        where: { id: habitId },
        include: { logs: { orderBy: { date: 'desc' }, take: 90 } },
      });
      return this.enrich(updated, updated.logs);
    } catch (err) {
      this.logger.error(`log habit failed: ${err}`);
      return null;
    }
  }

  async archive(sessionId: string, habitId: string): Promise<boolean> {
    try {
      await this.prisma.habit.updateMany({
        where: { id: habitId, sessionId },
        data: { archived: true },
      });
      return true;
    } catch {
      return false;
    }
  }

  private enrich(habit: any, logs: any[]): HabitRecord {
    const today = new Date().toISOString().slice(0, 10);
    const sortedDates = [...new Set(logs.map((l: any) => l.date as string))]
      .sort()
      .reverse();

    let streak = 0;
    let cursor = today;
    for (const date of sortedDates) {
      if (date === cursor) {
        streak++;
        const d = new Date(cursor);
        d.setDate(d.getDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      } else if (date < cursor) {
        break;
      }
    }

    return {
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji ?? null,
      frequency: habit.frequency,
      streak,
      totalLogs: sortedDates.length,
      lastLogDate: sortedDates[0] ?? null,
      loggedToday: sortedDates[0] === today,
      createdAt: habit.createdAt.toISOString(),
    };
  }
}
