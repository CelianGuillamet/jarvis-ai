import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ownedDomainClient } from '../prisma/owned-domain';
import {
  MAX_FACTS_PER_OWNER,
  buildPersonalFactContext,
  normalizeFactText,
  type PersonalFactRow,
} from './personal-memory';

export type FactOrigin = 'chat' | 'settings';

const select = {
  id: true,
  text: true,
  origin: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function serializeFact(fact: PersonalFactRow) {
  return {
    id: fact.id,
    text: fact.text,
    origin: fact.origin as FactOrigin,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
  };
}

@Injectable()
export class PersonalMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  private owned(ownerId: string) {
    return ownedDomainClient(this.prisma, ownerId);
  }

  list(ownerId: string): Promise<PersonalFactRow[]> {
    return this.owned(ownerId).personalFact.findMany({
      select,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: MAX_FACTS_PER_OWNER,
    });
  }

  async create(ownerId: string, value: unknown, origin: FactOrigin) {
    const text = normalizeFactText(value);
    if (!text) throw new BadRequestException('Fait invalide.');
    const owned = this.owned(ownerId);
    return owned.$transaction(async (tx) => {
      if ((await tx.personalFact.count()) >= MAX_FACTS_PER_OWNER)
        throw new ConflictException(
          'La mémoire est pleine. Oubliez un fait avant d’en ajouter un autre.',
        );
      return tx.personalFact.create({
        data: { ownerId, text, origin },
        select,
      });
    });
  }

  async update(ownerId: string, id: string, value: unknown) {
    const text = normalizeFactText(value);
    if (!text) throw new BadRequestException('Fait invalide.');
    const { count } = await this.owned(ownerId).personalFact.updateMany({
      where: { id },
      data: { text },
    });
    if (!count) throw new NotFoundException('Fait introuvable.');
    return this.owned(ownerId).personalFact.findUniqueOrThrow({
      where: { id },
      select,
    });
  }

  async forget(ownerId: string, id: string) {
    const { count } = await this.owned(ownerId).personalFact.deleteMany({
      where: { id },
    });
    if (!count) throw new NotFoundException('Fait introuvable.');
  }

  async buildPromptContext(ownerId: string, userText: string) {
    return buildPersonalFactContext(await this.list(ownerId), userText);
  }
}
