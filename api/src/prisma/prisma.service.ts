import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ownedDomainClient } from './owned-domain';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async forConversation(conversationId: string) {
    const conversation = await this.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { ownerId: true },
    });
    return ownedDomainClient(this, conversation.ownerId);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
