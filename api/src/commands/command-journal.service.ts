import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const COMMAND_STATES = [
  'proposed',
  'waiting',
  'executing',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'unknown',
] as const;
export type CommandState = (typeof COMMAND_STATES)[number];
export type CommandProposal = {
  ownerId: string;
  conversationId: string;
  requestId: string;
  toolName: string;
  toolVersion: string;
  source?: 'confirmation' | 'chat' | 'inbox' | 'direct';
  arguments: Prisma.InputJsonObject;
  /** Resolved target snapshots, never display indices such as #1. */
  targets: Prisma.InputJsonObject[];
  expiresAt: Date;
};

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 20) throw new BadRequestException('Commande trop complexe.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item: unknown) => canonicalJson(item, depth + 1)).join(',')}]`;
  if (
    typeof value === 'object' &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key], depth + 1)}`,
      )
      .join(',')}}`;
  }
  throw new BadRequestException('Contenu de commande invalide.');
}

/** Durable foundation. Callers must pass the verified owner and resolved targets. */
@Injectable()
export class CommandJournalService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Pick<PrismaService, 'command' | 'conversation'>,
  ) {}

  private assertIdentifiers(...ids: string[]) {
    if (
      ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 256)
    )
      throw new BadRequestException('Identifiant invalide.');
  }

  async propose(input: CommandProposal) {
    input = { ...input, source: input.source ?? 'confirmation' };
    if (!['confirmation', 'chat', 'inbox', 'direct'].includes(input.source!))
      throw new BadRequestException('Origine de commande invalide.');
    this.assertIdentifiers(input.ownerId, input.conversationId);
    for (const [value, max] of [
      [input.requestId, 128],
      [input.toolName, 128],
      [input.toolVersion, 64],
    ] as const) {
      if (typeof value !== 'string' || !value.trim() || value.length > max)
        throw new BadRequestException('Identifiant de commande invalide.');
    }
    if (
      !(input.expiresAt instanceof Date) ||
      !Number.isFinite(input.expiresAt.getTime()) ||
      !input.arguments ||
      typeof input.arguments !== 'object' ||
      Array.isArray(input.arguments) ||
      !Array.isArray(input.targets) ||
      input.targets.some(
        (target) =>
          !target || Array.isArray(target) || typeof target !== 'object',
      )
    )
      throw new BadRequestException('Commande invalide.');
    const serialized = canonicalJson({
      ...input,
      expiresAt: input.expiresAt.toISOString(),
    });
    if (Buffer.byteLength(serialized) > 32768)
      throw new BadRequestException('Commande trop volumineuse.');
    // Detach the persisted envelope before the first await: callers may reuse
    // and mutate their input object while database operations are pending.
    const snapshot = JSON.parse(serialized) as Omit<
      CommandProposal,
      'expiresAt'
    > & { expiresAt: string };
    input = { ...snapshot, expiresAt: new Date(snapshot.expiresAt) };
    const digest = createHash('sha256').update(serialized).digest('hex');
    const owned = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, ownerId: input.ownerId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Conversation introuvable.');
    const key = {
      ownerId_requestId: { ownerId: input.ownerId, requestId: input.requestId },
    };
    const existing = await this.prisma.command.findUnique({ where: key });
    if (!existing) {
      if (input.expiresAt.getTime() <= Date.now())
        throw new BadRequestException('Commande expirée.');
      await this.prisma.command.createMany({
        data: [{ ...input, digest }],
        skipDuplicates: true,
      });
    }
    const row =
      existing ?? (await this.prisma.command.findUniqueOrThrow({ where: key }));
    if (row.digest !== digest)
      throw new ConflictException('Cette requête désigne une autre commande.');
    return row;
  }

  async read(ownerId: string, id: string) {
    this.assertIdentifiers(ownerId, id);
    return this.prisma.command.findFirst({
      where: { id, ownerId },
      include: { transitions: { orderBy: { revision: 'asc' } } },
    });
  }

  async approve(ownerId: string, id: string, revision: number, digest: string) {
    this.assertIdentifiers(ownerId, id);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
      throw new BadRequestException('Approbation invalide.');
    return this.update(
      {
        id,
        ownerId,
        revision,
        state: 'waiting',
        approvedAt: null,
        digest,
        expiresAt: { gt: new Date() },
      },
      { approvedAt: new Date(), approvedDigest: digest },
    );
  }

  async advance(
    ownerId: string,
    id: string,
    revision: number,
    state: CommandState,
    outcomeCode?: string,
  ) {
    this.assertIdentifiers(ownerId, id);
    if (
      !COMMAND_STATES.includes(state) ||
      (outcomeCode !== undefined && !/^[A-Z][A-Z0-9_]{0,63}$/.test(outcomeCode))
    )
      throw new BadRequestException('Transition invalide.');
    return this.update(
      { id, ownerId, revision },
      { state, outcomeCode: outcomeCode ?? null },
    );
  }

  private async update(
    where: Prisma.CommandWhereInput,
    data: Prisma.CommandUpdateManyMutationInput,
  ) {
    if (
      typeof where.revision !== 'number' ||
      !Number.isSafeInteger(where.revision) ||
      where.revision < 0
    )
      throw new BadRequestException('Révision invalide.');
    try {
      const result = await this.prisma.command.updateMany({
        where,
        data: { ...data, revision: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Commande modifiée, indisponible ou transition invalide.',
        );
      return true;
    } catch {
      // SQL constraints are authoritative; never expose their arguments or query.
      throw new ConflictException(
        'Commande modifiée, indisponible ou transition invalide.',
      );
    }
  }
}
