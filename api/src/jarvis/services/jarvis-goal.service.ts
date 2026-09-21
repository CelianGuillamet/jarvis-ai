import type { JarvisGoal } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type GoalRecord = {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  targetDate: string | null;
  status: string;
  parentGoalId: string | null;
  subGoals: GoalRecord[];
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class JarvisGoalService {
  private readonly logger = new Logger(JarvisGoalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    sessionId: string,
    input: {
      title: string;
      description?: string;
      priority?: number;
      targetDate?: Date;
      parentGoalId?: string;
    },
  ): Promise<GoalRecord | null> {
    try {
      const goal = await this.prisma.jarvisGoal.create({
        data: {
          sessionId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? 0,
          targetDate: input.targetDate || null,
          parentGoalId: input.parentGoalId || null,
        },
      });

      return this.mapGoalRecord(goal);
    } catch (error) {
      this.logger.error(`Failed to create goal for ${sessionId}: ${error}`);
      return null;
    }
  }

  async list(
    sessionId: string,
    options?: { status?: 'active' | 'all'; parentGoalId?: string | null },
  ): Promise<GoalRecord[]> {
    try {
      const goals = await this.prisma.jarvisGoal.findMany({
        where: {
          sessionId,
          ...(options?.status === 'all' ? {} : { status: 'active' }),
          ...(options?.parentGoalId !== undefined
            ? { parentGoalId: options.parentGoalId }
            : {}),
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });

      return Promise.all(goals.map((g) => this.enrichGoalWithSubGoals(g)));
    } catch (error) {
      this.logger.warn(`Failed to list goals for ${sessionId}: ${error}`);
      return [];
    }
  }

  async getHierarchy(sessionId: string): Promise<GoalRecord[]> {
    try {
      const rootGoals = await this.prisma.jarvisGoal.findMany({
        where: {
          sessionId,
          status: 'active',
          parentGoalId: null,
        },
        orderBy: { priority: 'desc' },
      });

      return Promise.all(rootGoals.map((g) => this.enrichGoalWithSubGoals(g)));
    } catch (error) {
      this.logger.warn(
        `Failed to get goal hierarchy for ${sessionId}: ${error}`,
      );
      return [];
    }
  }

  async decompose(
    sessionId: string,
    parentGoalId: string,
    subGoals: Array<{ title: string; priority?: number }>,
  ): Promise<GoalRecord[]> {
    try {
      const created = await Promise.all(
        subGoals.map((sg, index) =>
          this.create(sessionId, {
            title: sg.title,
            priority: sg.priority ?? subGoals.length - index,
            parentGoalId,
          }),
        ),
      );

      return created.filter((g) => g !== null);
    } catch (error) {
      this.logger.error(`Failed to decompose goal ${parentGoalId}: ${error}`);
      return [];
    }
  }

  async updateStatus(
    goalId: string,
    status: string,
  ): Promise<GoalRecord | null> {
    try {
      const goal = await this.prisma.jarvisGoal.update({
        where: { id: goalId },
        data: { status },
      });

      return this.mapGoalRecord(goal);
    } catch (error) {
      this.logger.error(`Failed to update goal status for ${goalId}: ${error}`);
      return null;
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    const hierarchy = await this.getHierarchy(sessionId);
    if (!hierarchy.length) return '';

    const format = (goal: GoalRecord, depth: number = 0): string[] => {
      const indent = '  '.repeat(depth);
      const targetDate = goal.targetDate ? ` (d'ici ${goal.targetDate})` : '';
      const lines = [
        `${indent}- ${goal.title}${targetDate}${goal.priority > 0 ? ` [P${goal.priority}]` : ''}`,
      ];

      if (goal.description) {
        lines.push(`${indent}  ${goal.description}`);
      }

      for (const subGoal of goal.subGoals) {
        lines.push(...format(subGoal, depth + 1));
      }

      return lines;
    };

    const lines = ['Objectifs actifs:', ...hierarchy.flatMap((g) => format(g))];

    return lines.join('\n');
  }

  private async enrichGoalWithSubGoals(goal: JarvisGoal): Promise<GoalRecord> {
    const subGoals = await this.prisma.jarvisGoal.findMany({
      where: {
        parentGoalId: goal.id,
        status: 'active',
      },
      orderBy: { priority: 'desc' },
    });

    const enrichedSubGoals = await Promise.all(
      subGoals.map((sg) => this.enrichGoalWithSubGoals(sg)),
    );

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      priority: goal.priority,
      targetDate: goal.targetDate?.toISOString() || null,
      status: goal.status,
      parentGoalId: goal.parentGoalId,
      subGoals: enrichedSubGoals,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }

  private mapGoalRecord(goal: JarvisGoal): GoalRecord {
    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      priority: goal.priority,
      targetDate: goal.targetDate?.toISOString() || null,
      status: goal.status,
      parentGoalId: goal.parentGoalId,
      subGoals: [],
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }
}
