import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { ToolExecutionPlan } from '../lib/execution-policy';
import type { ToolOnly } from '../tools/tool-registry';

export type JarvisActionAuditRecord = {
  id: string;
  pendingActionId: string | null;
  source: string;
  toolName: string;
  summary: string;
  planner: string | null;
  confidence: string | null;
  risk: string | null;
  status: string;
  resultPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

@Injectable()
export class JarvisAuditService {
  private readonly logger = new Logger(JarvisAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private pendingTtlMs() {
    const raw = Number(this.config.get('PENDING_TTL_MINUTES') ?? 10);
    const minutes = Number.isFinite(raw) && raw > 0 ? raw : 10;
    return minutes * 60_000;
  }

  private compact(value: string | null | undefined, max = 220) {
    const clean = (value ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1)}…`;
  }

  private async reconcileStalePending(sessionId: string) {
    const deadline = new Date(Date.now() - this.pendingTtlMs());

    const [rows, activePending] = await Promise.all([
      this.prisma.jarvisActionEvent.findMany({
        where: {
          sessionId,
          status: 'pending',
          createdAt: { lt: deadline },
        },
        select: {
          id: true,
          pendingActionId: true,
        },
      }),
      this.prisma.pendingAction.findMany({
        where: { sessionId },
        select: { id: true },
      }),
    ]);

    if (!rows.length) return;

    const activeIds = new Set(activePending.map((row) => row.id));
    const staleIds = rows
      .filter(
        (row) => !row.pendingActionId || !activeIds.has(row.pendingActionId),
      )
      .map((row) => row.id);

    if (!staleIds.length) return;

    await this.prisma.jarvisActionEvent.updateMany({
      where: { id: { in: staleIds } },
      data: {
        status: 'expired',
        errorMessage: 'Action expirée sans confirmation.',
        completedAt: new Date(),
      },
    });
  }

  async markSessionPendingAsSuperseded(
    sessionId: string,
    reason = 'Une nouvelle action a remplacé la précédente.',
  ) {
    try {
      await this.prisma.jarvisActionEvent.updateMany({
        where: {
          sessionId,
          status: 'pending',
        },
        data: {
          status: 'superseded',
          errorMessage: reason,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible de marquer les actions pending comme remplacées pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async markSessionPendingAsCancelled(
    sessionId: string,
    reason = "Action annulée par l'utilisateur.",
  ) {
    try {
      await this.prisma.jarvisActionEvent.updateMany({
        where: {
          sessionId,
          status: 'pending',
        },
        data: {
          status: 'cancelled',
          errorMessage: reason,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible de marquer l'action pending comme annulée pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recordPending(input: {
    sessionId: string;
    pendingActionId: string;
    call: ToolOnly;
    plan: ToolExecutionPlan;
    source?: string;
  }) {
    try {
      await this.prisma.jarvisActionEvent.create({
        data: {
          sessionId: input.sessionId,
          pendingActionId: input.pendingActionId,
          source: input.source ?? 'chat',
          toolName: input.call.name,
          summary: input.plan.summary,
          argsJson: JSON.stringify(input.call.args),
          planner: input.plan.planner,
          confidence: input.plan.confidence,
          risk: input.plan.risk,
          status: 'pending',
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'enregistrer l'action pending ${input.pendingActionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recordCompletion(input: {
    sessionId: string;
    result: string;
    pendingActionId?: string;
    call?: ToolOnly;
    plan?: ToolExecutionPlan;
    source?: string;
  }) {
    const completedAt = new Date();
    const resultPreview = this.compact(input.result, 240);

    try {
      if (input.pendingActionId) {
        const updated = await this.prisma.jarvisActionEvent.updateMany({
          where: {
            pendingActionId: input.pendingActionId,
          },
          data: {
            status: 'completed',
            resultPreview,
            errorMessage: null,
            completedAt,
          },
        });
        if (updated.count > 0) return;
      }

      if (!input.call || !input.plan) return;

      await this.prisma.jarvisActionEvent.create({
        data: {
          sessionId: input.sessionId,
          source: input.source ?? 'chat',
          toolName: input.call.name,
          summary: input.plan.summary,
          argsJson: JSON.stringify(input.call.args),
          planner: input.plan.planner,
          confidence: input.plan.confidence,
          risk: input.plan.risk,
          status: 'completed',
          resultPreview,
          completedAt,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'enregistrer la completion d'action pour ${input.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recordFailure(input: {
    sessionId: string;
    errorMessage: string;
    pendingActionId?: string;
    call?: ToolOnly;
    plan?: ToolExecutionPlan;
    source?: string;
  }) {
    const completedAt = new Date();
    const errorMessage = this.compact(input.errorMessage, 240);

    try {
      if (input.pendingActionId) {
        const updated = await this.prisma.jarvisActionEvent.updateMany({
          where: {
            pendingActionId: input.pendingActionId,
          },
          data: {
            status: 'failed',
            errorMessage,
            completedAt,
          },
        });
        if (updated.count > 0) return;
      }

      if (!input.call || !input.plan) return;

      await this.prisma.jarvisActionEvent.create({
        data: {
          sessionId: input.sessionId,
          source: input.source ?? 'chat',
          toolName: input.call.name,
          summary: input.plan.summary,
          argsJson: JSON.stringify(input.call.args),
          planner: input.plan.planner,
          confidence: input.plan.confidence,
          risk: input.plan.risk,
          status: 'failed',
          errorMessage,
          completedAt,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'enregistrer l'échec d'action pour ${input.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listRecent(
    sessionId: string,
    options?: { limit?: number },
  ): Promise<JarvisActionAuditRecord[]> {
    const take = Math.min(Math.max(options?.limit ?? 8, 1), 20);

    try {
      await this.reconcileStalePending(sessionId);
      const rows = await this.prisma.jarvisActionEvent.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          pendingActionId: true,
          source: true,
          toolName: true,
          summary: true,
          planner: true,
          confidence: true,
          risk: true,
          status: true,
          resultPreview: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      });

      return rows.map((row) => ({
        id: row.id,
        pendingActionId: row.pendingActionId,
        source: row.source,
        toolName: row.toolName,
        summary: row.summary,
        planner: row.planner,
        confidence: row.confidence,
        risk: row.risk,
        status: row.status,
        resultPreview: row.resultPreview,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      }));
    } catch (error) {
      this.logger.warn(
        `Impossible de lire l'audit Jarvis pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
