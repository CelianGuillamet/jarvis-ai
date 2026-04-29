import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthModule } from '../google/google-auth.module';
import { GoogleOAuthClientService } from '../google/google-oauth-client.service';

import { DbCalendarProvider } from './providers/db-calendar.provider';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { HybridCalendarProvider } from './providers/hybrid-calendar.provider';

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

@Global()
@Module({
  imports: [GoogleAuthModule],
  providers: [
    {
      provide: CALENDAR_PROVIDER,
      inject: [PrismaService, GoogleOAuthClientService],
      useFactory: (
        prisma: PrismaService,
        googleOAuth: GoogleOAuthClientService,
      ) => {
        const db = new DbCalendarProvider(prisma);
        const google = new GoogleCalendarProvider(googleOAuth);
        return new HybridCalendarProvider(googleOAuth, google, db);
      },
    },
  ],
  exports: [CALENDAR_PROVIDER],
})
export class CalendarModule {}
