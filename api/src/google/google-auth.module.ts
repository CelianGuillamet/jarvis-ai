import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';
import { OAuthStateService } from './oauth-state.service';
import { GoogleCredentialService } from './google-credential.service';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleAuthController],
  providers: [
    GoogleAuthService,
    GoogleOAuthClientService,
    OAuthStateService,
    GoogleCredentialService,
    TokenEncryptionService,
  ],
  exports: [GoogleAuthService, GoogleOAuthClientService],
})
export class GoogleAuthModule {}
