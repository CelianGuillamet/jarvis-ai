import { Global, Module } from '@nestjs/common';

import { GoogleAuthModule } from '../google/google-auth.module';
import { GoogleOAuthClientService } from '../google/google-oauth-client.service';
import { GoogleGmailProvider } from './providers/google-gmail.provider';

export const GMAIL_PROVIDER = Symbol('GMAIL_PROVIDER');

@Global()
@Module({
  imports: [GoogleAuthModule],
  providers: [
    {
      provide: GMAIL_PROVIDER,
      inject: [GoogleOAuthClientService],
      useFactory: (googleOAuth: GoogleOAuthClientService) =>
        new GoogleGmailProvider(googleOAuth),
    },
  ],
  exports: [GMAIL_PROVIDER],
})
export class GmailModule {}
