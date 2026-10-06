import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthModule } from '../google/google-auth.module';
import { JarvisModule } from '../jarvis/jarvis.module';
import { AccountErasureController } from './account-erasure.controller';
import { AccountErasureStore } from './account-erasure.store';
import { AccountErasurePurgeService } from './account-erasure-purge.service';
import { AccountPrivateCacheService } from './account-private-cache.service';
import { AccountErasureWorker } from './account-erasure.worker';
import { ErasureCredentialCipher } from './erasure-credential-cipher';
import { GoogleErasureRevoker } from './google-erasure-revoker';

@Module({
  imports: [PrismaModule, AuthModule, GoogleAuthModule, JarvisModule],
  controllers: [AccountErasureController],
  providers: [
    AccountErasureStore,
    AccountErasurePurgeService,
    AccountPrivateCacheService,
    AccountErasureWorker,
    ErasureCredentialCipher,
    GoogleErasureRevoker,
  ],
  exports: [AccountErasureWorker],
})
export class PrivacyModule {}
