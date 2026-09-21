import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ReminderRecord = {
  id: string;
  text: string;
  triggerAt: string;
  done: boolean;
  doneAt: string | null;
  snoozedUntil: string | null;
  recurring: boolean;
  rrule: string | null;
  createdAt: string;
};

@Injectable()
export class JarvisReminderService {
  private readonly logger = new Logger(JarvisReminderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    sessionId: string,
    input: {
      text: string;
      triggerAt: Date;
      recurring?: boolean;
      rrule?: string;
    },
  ): Promise<ReminderRecord | null> {
    try {
      const r = await this.prisma.reminder.create({
        data: {
          sessionId,
          text: input.text.trim(),
          triggerAt: input.triggerAt,
          recurring: input.recurring ?? false,
          rrule: input.rrule ?? null,
        },
      });
      return this.map(r);
    } catch (err) {
      this.logger.error(`create reminder failed for ${sessionId}: ${err}`);
      return null;
    }
  }

  async list(
    sessionId: string,
    options?: { done?: boolean; limit?: number },
  ): Promise<ReminderRecord[]> {
    try {
      const rows = await this.prisma.reminder.findMany({
        where: {
          sessionId,
          ...(options?.done !== undefined ? { done: options.done } : {}),
        },
        orderBy: { triggerAt: 'asc' },
        take: options?.limit ?? 20,
      });
      return rows.map((r) => this.map(r));
    } catch {
      return [];
    }
  }

  async markDone(
    sessionId: string,
    id: string,
  ): Promise<ReminderRecord | null> {
    try {
      const r = await this.prisma.reminder.updateMany({
        where: { id, sessionId, done: false },
        data: { done: true, doneAt: new Date() },
      });
      if (!r.count) return null;
      return this.map(
        await this.prisma.reminder.findUniqueOrThrow({ where: { id } }),
      );
    } catch {
      return null;
    }
  }

  async snooze(
    sessionId: string,
    id: string,
    until: Date,
  ): Promise<ReminderRecord | null> {
    try {
      const r = await this.prisma.reminder.update({
        where: { id },
        data: { snoozedUntil: until, triggerAt: until },
      });
      return this.map(r);
    } catch {
      return null;
    }
  }

  async delete(sessionId: string, id: string): Promise<boolean> {
    try {
      await this.prisma.reminder.deleteMany({ where: { id, sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async upcoming(
    sessionId: string,
    withinMs: number = 24 * 60 * 60 * 1000,
  ): Promise<ReminderRecord[]> {
    const now = new Date();
    const until = new Date(now.getTime() + withinMs);
    try {
      const rows = await this.prisma.reminder.findMany({
        where: { sessionId, done: false, triggerAt: { gte: now, lte: until } },
        orderBy: { triggerAt: 'asc' },
        take: 10,
      });
      return rows.map((r) => this.map(r));
    } catch {
      return [];
    }
  }

  private map(r: any): ReminderRecord {
    return {
      id: r.id,
      text: r.text,
      triggerAt: r.triggerAt.toISOString(),
      done: r.done,
      doneAt: r.doneAt?.toISOString() ?? null,
      snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
      recurring: r.recurring,
      rrule: r.rrule ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
