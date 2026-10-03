import { dataUnavailable } from '../../http/data-unavailable';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SearchResultItem = {
  type: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
  createdAt: string;
};

@Injectable()
export class JarvisSearchService {
  private readonly logger = new Logger(JarvisSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async query(
    sessionId: string,
    input: { query: string; types?: string[]; limit?: number },
  ): Promise<SearchResultItem[]> {
    const query = input.query.trim();
    if (query.length > 500)
      throw new BadRequestException('La recherche est trop longue.');
    const q = query.toLowerCase();
    const requestedLimit = input.limit ?? 20;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
      throw new BadRequestException('Limite de recherche invalide.');
    const limit = Math.min(requestedLimit, 50);
    const types = input.types ?? [
      'todo',
      'note',
      'shopping',
      'goal',
      'knowledge',
    ];
    if (!q) return [];
    const results: SearchResultItem[] = [];
    const prisma = await this.prisma.forConversation(sessionId);

    try {
      if (types.includes('todo')) {
        const rows = await prisma.todo.findMany({
          where: { text: { contains: query, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        for (const r of rows) {
          results.push({
            type: 'todo',
            id: r.id,
            title: r.text,
            snippet: `Tâche — ${r.done ? 'terminée' : 'en cours'}`,
            score: this.scoreMatch(r.text, q),
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      if (types.includes('note')) {
        const rows = await prisma.note.findMany({
          where: {
            OR: [
              { text: { contains: query, mode: 'insensitive' } },
              { title: { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        for (const r of rows) {
          const text = r.title ? `${r.title}: ${r.text}` : r.text;
          results.push({
            type: 'note',
            id: r.id,
            title: r.title ?? r.text.slice(0, 60),
            snippet: r.text.slice(0, 120),
            score: this.scoreMatch(text, q),
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      if (types.includes('shopping')) {
        const rows = await prisma.shoppingItem.findMany({
          where: { text: { contains: query, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        for (const r of rows) {
          results.push({
            type: 'shopping',
            id: r.id,
            title: r.text,
            snippet: `Courses — ${r.bought ? 'acheté' : 'à acheter'}`,
            score: this.scoreMatch(r.text, q),
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      if (types.includes('goal')) {
        const rows = await this.prisma.jarvisGoal.findMany({
          where: {
            sessionId,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        for (const r of rows) {
          results.push({
            type: 'goal',
            id: r.id,
            title: r.title,
            snippet: r.description ?? `Objectif — ${r.status}`,
            score: this.scoreMatch(r.title + ' ' + (r.description ?? ''), q),
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      if (types.includes('knowledge')) {
        const rows = await this.prisma.jarvisKnowledgeEntry.findMany({
          where: {
            sessionId,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { content: { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
        for (const r of rows) {
          results.push({
            type: 'knowledge',
            id: r.id,
            title: r.title,
            snippet: r.content.slice(0, 120),
            score: this.scoreMatch(r.title + ' ' + r.content, q),
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      return results.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch {
      this.logger.error('Search storage unavailable.');
      throw dataUnavailable();
    }
  }

  private scoreMatch(text: string, query: string): number {
    const t = text.toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const word of words) {
      const idx = t.indexOf(word);
      if (idx === -1) continue;
      score += 1;
      if (idx === 0) score += 0.5;
      // Only four non-overlapping literal occurrences affect the score.
      // User punctuation must never become executable regular-expression syntax.
      let count = 1;
      let offset = idx + word.length;
      while (count < 4) {
        const next = t.indexOf(word, offset);
        if (next === -1) break;
        count++;
        offset = next + word.length;
      }
      score += Math.min(count - 1, 3) * 0.2;
    }
    return score / Math.max(words.length, 1);
  }
}
