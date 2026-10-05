import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TodayMutation } from '../contracts/v1';
import type { LocalTargets } from '../commands/local-target';
import { dataUnavailable } from '../http/data-unavailable';

/** Direct controls resolve only the selected owned ID, never a fuzzy text alias. */
@Injectable()
export class TodayTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    ownerId: string,
    input: TodayMutation,
  ): Promise<LocalTargets | undefined> {
    if (!('id' in input)) return undefined;
    const target = await this.read(ownerId, input);
    if (!target) throw new NotFoundException('Élément introuvable.');
    return target;
  }

  private async read(
    ownerId: string,
    input: TodayMutation,
  ): Promise<LocalTargets | null> {
    if (!('id' in input)) return null;
    try {
      if (input.operation === 'note.edit') {
        const row = await this.prisma.note.findFirst({
          where: { ownerId, id: input.id },
          select: { id: true, title: true, text: true },
        });
        return row ? { kind: 'note', items: [row] } : null;
      }
      const row = await this.prisma.todo.findFirst({
        where: { ownerId, id: input.id },
        select: { id: true, text: true, done: true },
      });
      return row ? { kind: 'todo', items: [row] } : null;
    } catch {
      throw dataUnavailable();
    }
  }
}
