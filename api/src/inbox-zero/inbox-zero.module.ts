import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { InboxZeroController } from './inbox-zero.controller';
import { InboxZeroService } from './inbox-zero.service';

@Module({
  imports: [AuthModule],
  controllers: [InboxZeroController],
  providers: [InboxZeroService],
})
export class InboxZeroModule {}
