import { parseStoredTags } from '../lib/stored-json';
import type { JarvisKnowledgeEntry } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class JarvisKnowledgeBaseService {
  private readonly logger = new Logger(JarvisKnowledgeBaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(
    sessionId: string,
    input: {
      title: string;
      content: string;
      tags?: string[];
      category?: string;
    },
  ): Promise<KnowledgeEntry | null> {
    try {
      const entry = await this.prisma.jarvisKnowledgeEntry.create({
        data: {
          sessionId,
          title: input.title.trim(),
          content: input.content.trim(),
          tags: JSON.stringify(input.tags ?? []),
          category: input.category ?? 'general',
        },
      });
      return this.map(entry);
    } catch (error) {
      this.logger.error(`Failed to save knowledge for ${sessionId}: ${error}`);
      return null;
    }
  }

  async find(
    sessionId: string,
    input: { query: string; category?: string; limit?: number },
  ): Promise<KnowledgeEntry[]> {
    try {
      const rows = await this.prisma.jarvisKnowledgeEntry.findMany({
        where: {
          sessionId,
          ...(input.category ? { category: input.category } : {}),
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { content: { contains: input.query, mode: 'insensitive' } },
            { tags: { contains: input.query.toLowerCase() } },
          ],
        },
        orderBy: [{ useCount: 'desc' }, { updatedAt: 'desc' }],
        take: input.limit ?? 10,
      });

      for (const row of rows) {
        await this.prisma.jarvisKnowledgeEntry.update({
          where: { id: row.id },
          data: { useCount: { increment: 1 } },
        });
      }

      return rows.map((r) => this.map(r));
    } catch (error) {
      this.logger.warn(`Failed to find knowledge for ${sessionId}: ${error}`);
      return [];
    }
  }

  async list(
    sessionId: string,
    options?: { category?: string; limit?: number },
  ): Promise<KnowledgeEntry[]> {
    try {
      const rows = await this.prisma.jarvisKnowledgeEntry.findMany({
        where: {
          sessionId,
          ...(options?.category ? { category: options.category } : {}),
        },
        orderBy: [{ useCount: 'desc' }, { updatedAt: 'desc' }],
        take: options?.limit ?? 20,
      });
      return rows.map((r) => this.map(r));
    } catch (error) {
      this.logger.warn(`Failed to list knowledge for ${sessionId}: ${error}`);
      return [];
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    const entries = await this.list(sessionId, { limit: 5 });
    if (!entries.length) return '';

    const lines = ['Base de connaissances (top 5):'];
    for (const e of entries) {
      lines.push(`- [${e.category}] ${e.title}: ${e.content.slice(0, 100)}`);
    }
    return lines.join('\n');
  }

  private map(row: JarvisKnowledgeEntry): KnowledgeEntry {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      tags: parseStoredTags(row.tags),
      category: row.category,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
