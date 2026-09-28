import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';
import { OAuthStateService } from './oauth-state.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService, GoogleOAuthClientService, OAuthStateService],
  exports: [GoogleAuthService, GoogleOAuthClientService],
})
export class GoogleAuthModule {}
