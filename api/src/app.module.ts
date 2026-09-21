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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    CalendarModule,
    GmailModule,
    GoogleAuthModule,
    JarvisModule,
    InboxZeroModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
