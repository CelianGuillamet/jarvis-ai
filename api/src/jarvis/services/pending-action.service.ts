import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { ToolOnly } from '../tools/tool-registry';
import { normalizeToolOnlyCall } from '../tools/tool-call';

@Injectable()
export class PendingActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private ttlMinutes() {
    const raw = Number(this.config.get('PENDING_TTL_MINUTES') ?? 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  private isExpired(expiresAt: Date) {
    return expiresAt.getTime() < Date.now();
  }

  private parseCall(name: string, argsJson: string): ToolOnly | null {
    try {
      const parsed = JSON.parse(argsJson) as unknown;
      return normalizeToolOnlyCall({ name, args: parsed });
    } catch {
      return null;
    }
  }

  async create(sessionId: string, call: ToolOnly) {
    const expiresAt = new Date(Date.now() + this.ttlMinutes() * 60_000);
    const argsJson = JSON.stringify(call.args);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const row = await this.prisma.$transaction(async (tx) => {
          // 1 seule action pending par session, conservé pour compatibilité produit
          await tx.pendingAction.deleteMany({ where: { sessionId } });
          return tx.pendingAction.create({
            data: {
              sessionId,
              name: call.name,
              argsJson,
              expiresAt,
            },
            select: { id: true },
          });
        });
        return row.id;
      } catch (error) {
        const isUniqueConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (isUniqueConflict && attempt === 0) continue;
        throw error;
      }
    }

    throw new Error('PENDING_ACTION_CREATE_FAILED');
  }

  private async resolveValidRow(sessionId: string) {
    const row = await this.prisma.pendingAction.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, argsJson: true, expiresAt: true },
    });
    if (!row) return null;

    if (this.isExpired(row.expiresAt)) {
      await this.prisma.pendingAction.delete({ where: { id: row.id } });
      return null;
    }

    const call = this.parseCall(row.name, row.argsJson);
    if (!call) {
      await this.prisma.pendingAction.delete({ where: { id: row.id } });
      return null;
    }

    return { id: row.id, call };
  }

  async peekLatest(
    sessionId: string,
  ): Promise<{ id: string; call: ToolOnly } | null> {
    return this.resolveValidRow(sessionId);
  }

  async consumeLatest(
    sessionId: string,
  ): Promise<{ id: string; call: ToolOnly } | null> {
    const resolved = await this.resolveValidRow(sessionId);
    if (!resolved) return null;
    await this.prisma.pendingAction.delete({ where: { id: resolved.id } });
    return resolved;
  }

  async cancelLatest(sessionId: string) {
    await this.prisma.pendingAction.deleteMany({ where: { sessionId } });
  }

  // Backup: route /confirm avec actionId
  async peek(
    id: string,
    expectedSessionId?: string,
  ): Promise<{ id: string; sessionId: string; call: ToolOnly } | null> {
    const row = await this.prisma.pendingAction.findUnique({ where: { id } });
    if (!row) return null;

    if (expectedSessionId && row.sessionId !== expectedSessionId) return null;

    if (this.isExpired(row.expiresAt)) {
      await this.prisma.pendingAction.delete({ where: { id } });
      return null;
    }

    const call = this.parseCall(row.name, row.argsJson);
    if (!call) {
      await this.prisma.pendingAction.delete({ where: { id } });
      return null;
    }

    return {
      id: row.id,
      sessionId: row.sessionId,
      call,
    };
  }

  async consume(
    id: string,
    expectedSessionId?: string,
  ): Promise<{ id: string; sessionId: string; call: ToolOnly } | null> {
    const resolved = await this.peek(id, expectedSessionId);
    if (!resolved) return null;

    await this.prisma.pendingAction.delete({ where: { id } });
    return resolved;
  }
}
