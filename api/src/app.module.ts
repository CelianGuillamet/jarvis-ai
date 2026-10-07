import { PrivacyModule } from './privacy/privacy.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { CalendarModule } from './calendar/calendar.module';
import { GoogleAuthModule } from './google/google-auth.module';
import { GmailModule } from './gmail/gmail.module';
import { JarvisModule } from './jarvis/jarvis.module';
import { InboxZeroModule } from './inbox-zero/inbox-zero.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateRuntimeConfig } from './config/runtime-config';
import { CommandJournalModule } from './commands/command-journal.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateRuntimeConfig,
    }),
    PrismaModule,
    CommandJournalModule,
    AuthModule,
    CalendarModule,
    GmailModule,
    GoogleAuthModule,
    JarvisModule,
    InboxZeroModule,
    PrivacyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
