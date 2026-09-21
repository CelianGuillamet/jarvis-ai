import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ContactRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  createdAt: string;
};

@Injectable()
export class JarvisContactService {
  private readonly logger = new Logger(JarvisContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(
    sessionId: string,
    input: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      role?: string;
      notes?: string;
      tags?: string[];
    },
  ): Promise<ContactRecord | null> {
    try {
      const existing = await this.prisma.contact.findFirst({
        where: {
          sessionId,
          name: { equals: input.name.trim(), mode: 'insensitive' },
        },
      });

      const data = {
        name: input.name.trim(),
        email: input.email?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        company: input.company?.trim() ?? null,
        role: input.role?.trim() ?? null,
        notes: input.notes?.trim() ?? null,
        tags: JSON.stringify(input.tags ?? []),
        lastInteractionAt: new Date(),
      };

      const contact = existing
        ? await this.prisma.contact.update({ where: { id: existing.id }, data })
        : await this.prisma.contact.create({ data: { sessionId, ...data } });

      return this.map(contact);
    } catch (err) {
      this.logger.error(`save contact failed: ${err}`);
      return null;
    }
  }

  async find(sessionId: string, query: string): Promise<ContactRecord[]> {
    try {
      const rows = await this.prisma.contact.findMany({
        where: {
          sessionId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { company: { contains: query, mode: 'insensitive' } },
            { notes: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { lastInteractionAt: 'desc' },
        take: 10,
      });
      return rows.map((r) => this.map(r));
    } catch {
      return [];
    }
  }

  async list(sessionId: string, limit = 20): Promise<ContactRecord[]> {
    try {
      const rows = await this.prisma.contact.findMany({
        where: { sessionId },
        orderBy: { name: 'asc' },
        take: limit,
      });
      return rows.map((r) => this.map(r));
    } catch {
      return [];
    }
  }

  async update(
    sessionId: string,
    id: string,
    patch: Partial<
      Omit<ContactRecord, 'id' | 'createdAt' | 'tags'> & { tags: string[] }
    >,
  ): Promise<ContactRecord | null> {
    try {
      const contact = await this.prisma.contact.updateMany({
        where: { id, sessionId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.email !== undefined ? { email: patch.email } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          ...(patch.company !== undefined ? { company: patch.company } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.tags !== undefined
            ? { tags: JSON.stringify(patch.tags) }
            : {}),
          lastInteractionAt: new Date(),
        },
      });
      if (!contact.count) return null;
      return this.map(
        await this.prisma.contact.findUniqueOrThrow({ where: { id } }),
      );
    } catch {
      return null;
    }
  }

  async delete(sessionId: string, id: string): Promise<boolean> {
    try {
      await this.prisma.contact.deleteMany({ where: { id, sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  private map(c: any): ContactRecord {
    let tags: string[] = [];
    try {
      tags = JSON.parse(c.tags);
    } catch {
      tags = [];
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      company: c.company ?? null,
      role: c.role ?? null,
      notes: c.notes ?? null,
      tags,
      lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
