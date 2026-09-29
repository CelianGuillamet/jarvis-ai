import { AccountController } from './account.controller';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { ConversationService } from './conversation.service';
import { RequestQuotaService } from '../http/request-quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountController],
  providers: [
    AuthService,
    ConversationService,
    RequestQuotaService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, ConversationService, RequestQuotaService],
})
export class AuthModule {}
