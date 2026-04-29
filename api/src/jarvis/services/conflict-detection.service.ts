import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisMemoryService } from './jarvis-memory.service';

export type ConflictSeverity = 'critical' | 'warning' | 'info';
export type ConflictType = 'scheduling' | 'duplicate' | 'contradiction';

export type ConflictItem = {
  id: string;
  title: string;
  type: string;
  context?: string;
};

export type ConflictReport = {
  id: string;
  sessionId: string;
  type: ConflictType;
  severity: ConflictSeverity;
  items: ConflictItem[];
  remediation: string;
  detectedAt: Date;
};

@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: JarvisMemoryService,
  ) {}

  async detectSchedulingConflicts(
    sessionId: string,
  ): Promise<ConflictReport | null> {
    try {
      const [todos, events] = await Promise.all([
        this.prisma.todo.findMany({
          where: {
            /* filtered by session somehow */
          },
          select: { id: true, text: true, doneAt: true, createdAt: true },
        }),
        this.prisma.calendarEvent.findMany({
          where: {
            /* filtered by session */
          },
          select: { id: true, title: true, when: true, createdAt: true },
        }),
      ]);

      const conflicts: ConflictItem[] = [];

      // Check todos with dueAt against calendar events
      // This is a simplified check; actual implementation would need explicit dueAt field
      for (const event of events) {
        for (const todo of todos) {
          if (todo.doneAt) continue; // Skip completed todos

          // Simple overlap detection: if todo created near event time
          const timeDiff = Math.abs(
            event.when.getTime() - todo.createdAt.getTime(),
          );
          if (timeDiff < 3600000) {
            // Within 1 hour
            conflicts.push({
              id: `${todo.id}-${event.id}`,
              title: `Task "${todo.text}" near event "${event.title}"`,
              type: 'scheduling',
              context: `Todo at ${todo.createdAt.toISOString()}, Event at ${event.when.toISOString()}`,
            });
          }
        }
      }

      if (conflicts.length === 0) return null;

      return {
        id: `conflict-${sessionId}-${Date.now()}`,
        sessionId,
        type: 'scheduling',
        severity: 'warning',
        items: conflicts,
        remediation: `Review ${conflicts.length} potential scheduling overlap(s). Consolidate or reschedule as needed.`,
        detectedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to detect scheduling conflicts for ${sessionId}: ${error}`,
      );
      return null;
    }
  }

  async detectDuplicates(sessionId: string): Promise<ConflictReport | null> {
    try {
      const todos = await this.prisma.todo.findMany({
        where: {
          /* filtered by session */
        },
        select: { id: true, text: true },
      });

      const normalize = (value: string) => {
        return value
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/['']/g, ' ')
          .replace(/\s+/g, ' ');
      };

      const normalized = new Map<string, string[]>();
      for (const todo of todos) {
        const key = normalize(todo.text);
        if (!normalized.has(key)) {
          normalized.set(key, []);
        }
        normalized.get(key)!.push(todo.id);
      }

      const conflicts: ConflictItem[] = [];
      for (const [key, ids] of normalized) {
        if (ids.length > 1) {
          const matchingTodos = todos.filter((t) => ids.includes(t.id));
          conflicts.push({
            id: `dup-${ids.join('-')}`,
            title: `Duplicate tasks: "${matchingTodos[0].text}"`,
            type: 'duplicate',
            context: `Found ${ids.length} similar items`,
          });
        }
      }

      if (conflicts.length === 0) return null;

      return {
        id: `conflict-${sessionId}-${Date.now()}`,
        sessionId,
        type: 'duplicate',
        severity: 'warning',
        items: conflicts,
        remediation: `Merge or delete ${conflicts.length} duplicate task(s) to reduce clutter.`,
        detectedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to detect duplicates for ${sessionId}: ${error}`,
      );
      return null;
    }
  }

  async detectContradictions(
    sessionId: string,
  ): Promise<ConflictReport | null> {
    try {
      const snapshot = await this.memory.getSnapshot(sessionId);
      const conflicts: ConflictItem[] = [];

      // Check for contradictory values within same layer
      for (const [layer, items] of Object.entries(snapshot.factsByLayer)) {
        const keyMap = new Map<string, string[]>();
        for (const item of items) {
          if (!keyMap.has(item.key)) {
            keyMap.set(item.key, []);
          }
          keyMap.get(item.key)!.push(item.value);
        }

        for (const [key, values] of keyMap) {
          const unique = new Set(values);
          if (unique.size > 1) {
            conflicts.push({
              id: `contra-${layer}-${key}`,
              title: `Contradictory ${layer}: ${key}`,
              type: 'contradiction',
              context: `Values: ${Array.from(unique).join(', ')}`,
            });
          }
        }
      }

      if (conflicts.length === 0) return null;

      return {
        id: `conflict-${sessionId}-${Date.now()}`,
        sessionId,
        type: 'contradiction',
        severity: 'critical',
        items: conflicts,
        remediation: `Clarify ${conflicts.length} conflicting preference(s) with the user.`,
        detectedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to detect contradictions for ${sessionId}: ${error}`,
      );
      return null;
    }
  }

  async detectAllConflicts(sessionId: string): Promise<ConflictReport[]> {
    const reports: ConflictReport[] = [];

    const scheduling = await this.detectSchedulingConflicts(sessionId);
    const duplicates = await this.detectDuplicates(sessionId);
    const contradictions = await this.detectContradictions(sessionId);

    if (scheduling) reports.push(scheduling);
    if (duplicates) reports.push(duplicates);
    if (contradictions) reports.push(contradictions);

    return reports.sort((a, b) => {
      const severityMap = { critical: 0, warning: 1, info: 2 };
      return severityMap[a.severity] - severityMap[b.severity];
    });
  }
}
