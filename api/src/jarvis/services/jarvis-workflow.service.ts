import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { ToolOnly } from '../tools/tool-registry';

export type WorkflowMemoryRecord = {
  id: string;
  triggerToolName: string;
  triggerSummary: string;
  followUpToolName: string;
  followUpPrompt: string;
  usageCount: number;
  lastUsedAt: string;
};

const NON_LEARNING_TOOL_NAMES = new Set([
  'action.history',
  'workflow.list',
  'undo.last_action',
]);

function normalizePromptKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 180);
}

function cleanPrompt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

@Injectable()
export class JarvisWorkflowService {
  private readonly logger = new Logger(JarvisWorkflowService.name);
  private readonly lookbackMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = Number(config.get('JARVIS_WORKFLOW_LOOKBACK_MINUTES') ?? 30);
    const minutes = Number.isFinite(raw) && raw > 0 ? raw : 30;
    this.lookbackMs = minutes * 60_000;
  }

  async observeSuccessfulTool(input: {
    sessionId: string;
    userText: string;
    call: ToolOnly;
  }) {
    const prompt = cleanPrompt(input.userText);
    const promptKey = normalizePromptKey(prompt);
    if (promptKey.length < 4) return null;
    if (NON_LEARNING_TOOL_NAMES.has(input.call.name)) return null;

    try {
      const previous = await this.prisma.jarvisActionEvent.findFirst({
        where: {
          sessionId: input.sessionId,
          status: 'completed',
          createdAt: {
            gte: new Date(Date.now() - this.lookbackMs),
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          toolName: true,
          summary: true,
        },
      });

      if (!previous) return null;
      if (NON_LEARNING_TOOL_NAMES.has(previous.toolName)) return null;
      if (previous.toolName === input.call.name) return null;

      const existing = await this.prisma.jarvisWorkflowMemory.findFirst({
        where: {
          sessionId: input.sessionId,
          triggerToolName: previous.toolName,
          followUpPromptKey: promptKey,
        },
        select: { id: true },
      });

      if (existing) {
        return this.prisma.jarvisWorkflowMemory.update({
          where: { id: existing.id },
          data: {
            triggerSummary: previous.summary,
            followUpToolName: input.call.name,
            followUpPrompt: prompt,
            usageCount: { increment: 1 },
            lastUsedAt: new Date(),
          },
          select: { id: true },
        });
      }

      return this.prisma.jarvisWorkflowMemory.create({
        data: {
          sessionId: input.sessionId,
          triggerToolName: previous.toolName,
          triggerSummary: previous.summary,
          followUpToolName: input.call.name,
          followUpPrompt: prompt,
          followUpPromptKey: promptKey,
        },
        select: { id: true },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'apprendre le workflow pour ${input.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async list(
    sessionId: string,
    options?: { limit?: number; triggerToolName?: string },
  ): Promise<WorkflowMemoryRecord[]> {
    const take = Math.min(Math.max(options?.limit ?? 5, 1), 12);

    try {
      const rows = await this.prisma.jarvisWorkflowMemory.findMany({
        where: {
          sessionId,
          ...(options?.triggerToolName
            ? { triggerToolName: options.triggerToolName }
            : {}),
        },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take,
        select: {
          id: true,
          triggerToolName: true,
          triggerSummary: true,
          followUpToolName: true,
          followUpPrompt: true,
          usageCount: true,
          lastUsedAt: true,
        },
      });

      return rows.map((row) => ({
        id: row.id,
        triggerToolName: row.triggerToolName,
        triggerSummary: row.triggerSummary,
        followUpToolName: row.followUpToolName,
        followUpPrompt: row.followUpPrompt,
        usageCount: row.usageCount,
        lastUsedAt: row.lastUsedAt.toISOString(),
      }));
    } catch (error) {
      this.logger.warn(
        `Impossible de lire les workflows pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async suggestNextPrompts(
    sessionId: string,
    triggerToolName: string,
    options?: { limit?: number },
  ) {
    const rows = await this.list(sessionId, {
      limit: options?.limit ?? 3,
      triggerToolName,
    });

    return rows
      .map((row) => row.followUpPrompt)
      .filter((prompt, index, list) => list.indexOf(prompt) === index)
      .slice(0, Math.min(Math.max(options?.limit ?? 3, 1), 5));
  }

  async buildPromptContext(sessionId: string) {
    const workflows = await this.list(sessionId, { limit: 3 });
    if (!workflows.length) return '';

    return [
      'Workflows utilisateur observes:',
      ...workflows.map(
        (workflow) =>
          `- Après ${workflow.triggerSummary}, l'utilisateur enchaine souvent avec: ${workflow.followUpPrompt} (${workflow.usageCount} fois)`,
      ),
    ].join('\n');
  }
}
