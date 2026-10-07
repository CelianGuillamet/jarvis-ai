import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisService } from '../jarvis/services/jarvis.service';

@Injectable()
export class AccountPrivateCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jarvis: JarvisService,
  ) {}

  async forgetOwner(ownerId: string): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const conversations = await this.prisma.conversation.findMany({
        where: { ownerId, ...(after ? { id: { gt: after } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const conversation of conversations)
        this.jarvis.forgetConversation(conversation.id);
      if (conversations.length < 100) return;
      after = conversations[conversations.length - 1].id;
    }
  }
}
