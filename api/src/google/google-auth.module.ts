import { Module } from '@nestjs/common';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';
import { OAuthStateService } from './oauth-state.service';

@Module({
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService, GoogleOAuthClientService, OAuthStateService],
  exports: [GoogleAuthService, GoogleOAuthClientService],
})
export class GoogleAuthModule {}
