import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DependencyRecord = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  dependencyType: string;
  estimatedDays: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDependencyGraph = {
  taskId: string;
  blockingTasks: string[];
  blockedByTasks: string[];
};

@Injectable()
export class JarvisDependencyTrackingService {
  private readonly logger = new Logger(JarvisDependencyTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addDependency(
    sessionId: string,
    sourceTaskId: string,
    targetTaskId: string,
    options?: { dependencyType?: string; estimatedDays?: number },
  ): Promise<DependencyRecord | null> {
    try {
      const existing = await this.prisma.jarvisTaskDependency.findFirst({
        where: {
          sessionId,
          sourceTaskId,
          targetTaskId,
        },
      });

      if (existing) {
        return this.mapDependencyRecord(existing);
      }

      const dep = await this.prisma.jarvisTaskDependency.create({
        data: {
          sessionId,
          sourceTaskId,
          targetTaskId,
          dependencyType: options?.dependencyType || 'blocks',
          estimatedDays: options?.estimatedDays || null,
        },
      });

      return this.mapDependencyRecord(dep);
    } catch (error) {
      this.logger.error(
        `Failed to add dependency from ${sourceTaskId} to ${targetTaskId}: ${error}`,
      );
      return null;
    }
  }

  async getDependencies(
    sessionId: string,
    taskId: string,
  ): Promise<TaskDependencyGraph> {
    try {
      const [blocking, blockedBy] = await Promise.all([
        this.prisma.jarvisTaskDependency.findMany({
          where: { sessionId, sourceTaskId: taskId },
          select: { targetTaskId: true },
        }),
        this.prisma.jarvisTaskDependency.findMany({
          where: { sessionId, targetTaskId: taskId },
          select: { sourceTaskId: true },
        }),
      ]);

      return {
        taskId,
        blockingTasks: blocking.map((d) => d.targetTaskId),
        blockedByTasks: blockedBy.map((d) => d.sourceTaskId),
      };
    } catch (error) {
      this.logger.warn(`Failed to get dependencies for ${taskId}: ${error}`);
      return { taskId, blockingTasks: [], blockedByTasks: [] };
    }
  }

  async orderTasks(sessionId: string, taskIds: string[]): Promise<string[]> {
    try {
      const allDeps = await this.prisma.jarvisTaskDependency.findMany({
        where: {
          sessionId,
          sourceTaskId: { in: taskIds },
          targetTaskId: { in: taskIds },
        },
      });

      const inDegree = new Map<string, number>();
      const graph = new Map<string, string[]>();

      for (const taskId of taskIds) {
        inDegree.set(taskId, 0);
        graph.set(taskId, []);
      }

      for (const dep of allDeps) {
        graph.get(dep.sourceTaskId)?.push(dep.targetTaskId);
        inDegree.set(
          dep.targetTaskId,
          (inDegree.get(dep.targetTaskId) || 0) + 1,
        );
      }

      const queue = taskIds.filter((id) => inDegree.get(id) === 0);
      const ordered: string[] = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        ordered.push(current);

        for (const neighbor of graph.get(current) || []) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }

      return ordered.length === taskIds.length ? ordered : taskIds;
    } catch (error) {
      this.logger.error(`Failed to order tasks for ${sessionId}: ${error}`);
      return taskIds;
    }
  }

  async detectCycles(sessionId: string): Promise<string[][]> {
    try {
      const deps = await this.prisma.jarvisTaskDependency.findMany({
        where: { sessionId },
        select: { sourceTaskId: true, targetTaskId: true },
      });

      const graph = new Map<string, string[]>();
      const allTasks = new Set<string>();

      for (const dep of deps) {
        allTasks.add(dep.sourceTaskId);
        allTasks.add(dep.targetTaskId);
        if (!graph.has(dep.sourceTaskId)) {
          graph.set(dep.sourceTaskId, []);
        }
        graph.get(dep.sourceTaskId)!.push(dep.targetTaskId);
      }

      const cycles: string[][] = [];
      const visited = new Set<string>();
      const recStack = new Set<string>();

      const dfs = (node: string, path: string[]): void => {
        visited.add(node);
        recStack.add(node);
        path.push(node);

        for (const neighbor of graph.get(node) || []) {
          if (!visited.has(neighbor)) {
            dfs(neighbor, [...path]);
          } else if (recStack.has(neighbor)) {
            const cycleStart = path.indexOf(neighbor);
            if (cycleStart >= 0) {
              cycles.push([...path.slice(cycleStart), neighbor]);
            }
          }
        }

        recStack.delete(node);
      };

      for (const task of allTasks) {
        if (!visited.has(task)) {
          dfs(task, []);
        }
      }

      return cycles;
    } catch (error) {
      this.logger.error(`Failed to detect cycles for ${sessionId}: ${error}`);
      return [];
    }
  }

  private mapDependencyRecord(dep: any): DependencyRecord {
    return {
      id: dep.id,
      sourceTaskId: dep.sourceTaskId,
      targetTaskId: dep.targetTaskId,
      dependencyType: dep.dependencyType,
      estimatedDays: dep.estimatedDays,
      createdAt: dep.createdAt.toISOString(),
      updatedAt: dep.updatedAt.toISOString(),
    };
  }
}
