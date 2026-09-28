import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(ownerId: string, input?: string): Promise<string> {
    if (input !== undefined && typeof input !== 'string')
      throw new BadRequestException('Identifiant de conversation invalide.');
    const clientKey = input?.trim() || 'default';
    if (clientKey.length > 128)
      throw new BadRequestException('Identifiant de conversation trop long.');
    const existing = await this.prisma.conversation.findUnique({
      where: { id: clientKey },
    });
    if (existing) {
      if (existing.ownerId !== ownerId)
        throw new NotFoundException('Conversation introuvable.');
      return existing.id;
    }
    const conversation = await this.prisma.conversation.upsert({
      where: { ownerId_clientKey: { ownerId, clientKey } },
      create: { ownerId, clientKey },
      update: {},
    });
    return conversation.id;
  }
}
