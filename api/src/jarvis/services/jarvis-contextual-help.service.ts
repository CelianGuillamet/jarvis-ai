import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ContextualHelpRecord = {
  id: string;
  sessionId: string;
  context: string;
  contentType: string;
  content: string;
  relevanceScore: number;
  viewedCount: number;
  helpful: boolean | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class JarvisContextualHelpService {
  private readonly logger = new Logger(JarvisContextualHelpService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createHelp(
    sessionId: string,
    input: {
      context: string;
      contentType: string;
      content: string;
      relevanceScore?: number;
    },
  ): Promise<ContextualHelpRecord | null> {
    try {
      const help = await this.prisma.jarvisContextualHelp.create({
        data: {
          sessionId,
          context: input.context.toLowerCase(),
          contentType: input.contentType,
          content: input.content,
          relevanceScore: input.relevanceScore ?? 0.5,
        },
      });

      return this.mapHelpRecord(help);
    } catch (error) {
      this.logger.error(`Failed to create contextual help: ${error}`);
      return null;
    }
  }

  async findRelevant(
    sessionId: string,
    context: string,
    limit: number = 3,
  ): Promise<ContextualHelpRecord[]> {
    try {
      const items = await this.prisma.jarvisContextualHelp.findMany({
        where: {
          sessionId,
          context: context.toLowerCase(),
        },
        orderBy: [{ relevanceScore: 'desc' }, { viewedCount: 'asc' }],
        take: limit,
      });

      return items.map((h) => this.mapHelpRecord(h));
    } catch (error) {
      this.logger.error(
        `Failed to find relevant help for context "${context}": ${error}`,
      );
      return [];
    }
  }

  async markViewed(helpId: string): Promise<ContextualHelpRecord | null> {
    try {
      const help = await this.prisma.jarvisContextualHelp.update({
        where: { id: helpId },
        data: { viewedCount: { increment: 1 } },
      });

      return this.mapHelpRecord(help);
    } catch (error) {
      this.logger.error(`Failed to mark help ${helpId} as viewed: ${error}`);
      return null;
    }
  }

  async markHelpful(
    helpId: string,
    helpful: boolean,
  ): Promise<ContextualHelpRecord | null> {
    try {
      const help = await this.prisma.jarvisContextualHelp.update({
        where: { id: helpId },
        data: {
          helpful,
          relevanceScore: helpful ? { increment: 0.1 } : { decrement: 0.1 },
        },
      });

      return this.mapHelpRecord(help);
    } catch (error) {
      this.logger.error(`Failed to mark helpfulness for ${helpId}: ${error}`);
      return null;
    }
  }

  async listByContext(
    sessionId: string,
    context?: string,
  ): Promise<ContextualHelpRecord[]> {
    try {
      const items = await this.prisma.jarvisContextualHelp.findMany({
        where: {
          sessionId,
          ...(context ? { context: context.toLowerCase() } : {}),
        },
        orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
      });

      return items.map((h) => this.mapHelpRecord(h));
    } catch (error) {
      this.logger.error(`Failed to list help for ${sessionId}: ${error}`);
      return [];
    }
  }

  async buildPromptContext(
    sessionId: string,
    context: string,
  ): Promise<string> {
    try {
      const items = await this.findRelevant(sessionId, context, 3);
      if (!items.length) return '';

      const lines = [`Aide contextuelle (${context}):`];
      for (const item of items) {
        lines.push(`- [${item.contentType}] ${item.content}`);
      }

      return lines.join('\n');
    } catch (error) {
      this.logger.error(
        `Failed to build prompt context for ${sessionId}: ${error}`,
      );
      return '';
    }
  }

  private mapHelpRecord(help: any): ContextualHelpRecord {
    return {
      id: help.id,
      sessionId: help.sessionId,
      context: help.context,
      contentType: help.contentType,
      content: help.content,
      relevanceScore: help.relevanceScore,
      viewedCount: help.viewedCount,
      helpful: help.helpful,
      createdAt: help.createdAt.toISOString(),
      updatedAt: help.updatedAt.toISOString(),
    };
  }
}
