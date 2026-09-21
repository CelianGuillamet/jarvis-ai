import { Module } from '@nestjs/common';

import { InboxZeroController } from './inbox-zero.controller';
import { InboxZeroService } from './inbox-zero.service';

@Module({
  controllers: [InboxZeroController],
  providers: [InboxZeroService],
})
export class InboxZeroModule {}
