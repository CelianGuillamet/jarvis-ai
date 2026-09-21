import type { JarvisSchedulingSuggestion } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SchedulingSuggestionRecord = {
  id: string;
  sessionId: string;
  taskId: string | null;
  suggestedTime: string;
  rationale: string;
  priority: number;
  applied: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class JarvisSmartSchedulingService {
  private readonly logger = new Logger(JarvisSmartSchedulingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async suggestSchedule(
    sessionId: string,
    input: {
      taskId?: string;
      suggestedTime: Date;
      rationale: string;
      priority?: number;
    },
  ): Promise<SchedulingSuggestionRecord | null> {
    try {
      const suggestion = await this.prisma.jarvisSchedulingSuggestion.create({
        data: {
          sessionId,
          taskId: input.taskId || null,
          suggestedTime: input.suggestedTime,
          rationale: input.rationale,
          priority: input.priority ?? 0,
          applied: false,
        },
      });

      return this.mapSuggestionRecord(suggestion);
    } catch (error) {
      this.logger.error(`Failed to create scheduling suggestion: ${error}`);
      return null;
    }
  }

  async listSuggestions(
    sessionId: string,
    options?: { applied?: boolean; taskId?: string },
  ): Promise<SchedulingSuggestionRecord[]> {
    try {
      const suggestions = await this.prisma.jarvisSchedulingSuggestion.findMany(
        {
          where: {
            sessionId,
            ...(options?.applied !== undefined
              ? { applied: options.applied }
              : {}),
            ...(options?.taskId ? { taskId: options.taskId } : {}),
          },
          orderBy: [{ priority: 'desc' }, { suggestedTime: 'asc' }],
        },
      );

      return suggestions.map((s) => this.mapSuggestionRecord(s));
    } catch (error) {
      this.logger.error(
        `Failed to list suggestions for ${sessionId}: ${error}`,
      );
      return [];
    }
  }

  async applySuggestion(
    suggestionId: string,
  ): Promise<SchedulingSuggestionRecord | null> {
    try {
      const updated = await this.prisma.jarvisSchedulingSuggestion.update({
        where: { id: suggestionId },
        data: { applied: true },
      });

      return this.mapSuggestionRecord(updated);
    } catch (error) {
      this.logger.error(`Failed to apply suggestion ${suggestionId}: ${error}`);
      return null;
    }
  }

  async findNextAvailableSlot(
    sessionId: string,
    afterDate: Date = new Date(),
    durationMinutes: number = 60,
  ): Promise<Date | null> {
    try {
      const existingSuggestions =
        await this.prisma.jarvisSchedulingSuggestion.findMany({
          where: {
            sessionId,
            applied: false,
            suggestedTime: { gte: afterDate },
          },
          orderBy: { suggestedTime: 'asc' },
        });

      const existingEvents = await this.prisma.calendarEvent.findMany({
        where: {
          when: { gte: afterDate },
        },
        orderBy: { when: 'asc' },
        take: 50,
      });

      const busySlots = [
        ...existingSuggestions.map((s) => s.suggestedTime),
        ...existingEvents.map((e) => e.when),
      ].sort((a, b) => a.getTime() - b.getTime());

      const durationMs = durationMinutes * 60 * 1000;
      let candidate = new Date(afterDate);

      // Round up to next hour boundary
      candidate.setMinutes(0, 0, 0);
      candidate.setHours(candidate.getHours() + 1);

      for (let attempts = 0; attempts < 48; attempts++) {
        const candidateEnd = new Date(candidate.getTime() + durationMs);

        const hasConflict = busySlots.some((slot) => {
          const slotEnd = new Date(slot.getTime() + durationMs);
          return candidate < slotEnd && candidateEnd > slot;
        });

        if (!hasConflict) {
          return candidate;
        }

        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to find next available slot: ${error}`);
      return null;
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    try {
      const pending = await this.listSuggestions(sessionId, { applied: false });
      if (!pending.length) return '';

      const lines = ['Suggestions de planification:'];

      for (const suggestion of pending.slice(0, 5)) {
        const time = new Date(suggestion.suggestedTime).toLocaleString(
          'fr-FR',
          {
            dateStyle: 'short',
            timeStyle: 'short',
          },
        );
        const taskInfo = suggestion.taskId
          ? ` [tâche: ${suggestion.taskId}]`
          : '';
        lines.push(`- ${time}${taskInfo}: ${suggestion.rationale}`);
      }

      return lines.join('\n');
    } catch (error) {
      this.logger.error(
        `Failed to build prompt context for ${sessionId}: ${error}`,
      );
      return '';
    }
  }

  private mapSuggestionRecord(
    suggestion: JarvisSchedulingSuggestion,
  ): SchedulingSuggestionRecord {
    return {
      id: suggestion.id,
      sessionId: suggestion.sessionId,
      taskId: suggestion.taskId,
      suggestedTime: suggestion.suggestedTime.toISOString(),
      rationale: suggestion.rationale,
      priority: suggestion.priority,
      applied: suggestion.applied,
      createdAt: suggestion.createdAt.toISOString(),
      updatedAt: suggestion.updatedAt.toISOString(),
    };
  }
}
