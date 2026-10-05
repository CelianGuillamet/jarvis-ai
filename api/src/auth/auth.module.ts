import { AccountController } from './account.controller';
import { AccountExportController } from './account-export.controller';
import { AccountSnapshotController } from './account-snapshot.controller';
import { AccountSnapshotService } from '../privacy/account-snapshot.service';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { ConversationService } from './conversation.service';
import { RequestQuotaService } from '../http/request-quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    AccountController,
    AccountExportController,
    AccountSnapshotController,
  ],
  providers: [
    AuthService,
    AccountSnapshotService,
    ConversationService,
    RequestQuotaService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, ConversationService, RequestQuotaService],
})
export class AuthModule {}
