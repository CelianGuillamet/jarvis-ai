import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DelegationRecord = {
  id: string;
  taskDescription: string;
  delegateTo: string;
  reason: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class JarvisDelegationService {
  private readonly logger = new Logger(JarvisDelegationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async delegate(
    sessionId: string,
    input: {
      taskDescription: string;
      delegateTo: string;
      reason?: string;
      priority?: string;
      dueDate?: Date;
    },
  ): Promise<DelegationRecord | null> {
    try {
      const row = await this.prisma.jarvisDelegation.create({
        data: {
          sessionId,
          taskDescription: input.taskDescription.trim(),
          delegateTo: input.delegateTo.trim(),
          reason: input.reason?.trim() || null,
          priority: input.priority ?? 'normal',
          status: 'pending',
          dueDate: input.dueDate || null,
        },
      });
      return this.map(row);
    } catch (error) {
      this.logger.error(`Failed to delegate for ${sessionId}: ${error}`);
      return null;
    }
  }

  async list(
    sessionId: string,
    options?: { status?: string; delegateTo?: string; limit?: number },
  ): Promise<DelegationRecord[]> {
    try {
      const rows = await this.prisma.jarvisDelegation.findMany({
        where: {
          sessionId,
          ...(options?.status ? { status: options.status } : {}),
          ...(options?.delegateTo
            ? {
                delegateTo: {
                  contains: options.delegateTo,
                  mode: 'insensitive',
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        take: options?.limit ?? 20,
      });
      return rows.map((r) => this.map(r));
    } catch (error) {
      this.logger.warn(`Failed to list delegations for ${sessionId}: ${error}`);
      return [];
    }
  }

  async escalate(
    sessionId: string,
    delegationId: string,
    escalateTo: string,
    reason?: string,
  ): Promise<DelegationRecord | null> {
    try {
      const row = await this.prisma.jarvisDelegation.update({
        where: { id: delegationId },
        data: {
          delegateTo: escalateTo,
          status: 'escalated',
          reason: reason?.trim() || null,
        },
      });
      return this.map(row);
    } catch (error) {
      this.logger.error(
        `Failed to escalate delegation ${delegationId}: ${error}`,
      );
      return null;
    }
  }

  async resolve(
    sessionId: string,
    delegationId: string,
    resolutionNote?: string,
  ): Promise<DelegationRecord | null> {
    try {
      const row = await this.prisma.jarvisDelegation.update({
        where: { id: delegationId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolutionNote: resolutionNote?.trim() || null,
        },
      });
      return this.map(row);
    } catch (error) {
      this.logger.error(
        `Failed to resolve delegation ${delegationId}: ${error}`,
      );
      return null;
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    const pending = await this.list(sessionId, { status: 'pending', limit: 5 });
    const escalated = await this.list(sessionId, {
      status: 'escalated',
      limit: 3,
    });

    if (!pending.length && !escalated.length) return '';

    const lines: string[] = [];
    if (pending.length) {
      lines.push('Délégations en attente:');
      for (const d of pending) {
        const due = d.dueDate ? ` (échéance: ${d.dueDate})` : '';
        lines.push(`- → ${d.delegateTo}: ${d.taskDescription}${due}`);
      }
    }
    if (escalated.length) {
      lines.push('Délégations escaladées:');
      for (const d of escalated) {
        lines.push(`- ⚠ → ${d.delegateTo}: ${d.taskDescription}`);
      }
    }
    return lines.join('\n');
  }

  private map(row: any): DelegationRecord {
    return {
      id: row.id,
      taskDescription: row.taskDescription,
      delegateTo: row.delegateTo,
      reason: row.reason,
      priority: row.priority,
      status: row.status,
      dueDate: row.dueDate?.toISOString() || null,
      resolvedAt: row.resolvedAt?.toISOString() || null,
      resolutionNote: row.resolutionNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
