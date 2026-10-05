import { InboxReplyDraftService } from './inbox-reply-draft.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommandJournalModule } from '../commands/command-journal.module';

import { InboxZeroController } from './inbox-zero.controller';
import { InboxZeroService } from './inbox-zero.service';
import { InboxReplyOperationService } from './inbox-reply-operation.service';

@Module({
  imports: [AuthModule, CommandJournalModule],
  controllers: [InboxZeroController],
  providers: [
    InboxZeroService,
    InboxReplyOperationService,
    InboxReplyDraftService,
  ],
})
export class InboxZeroModule {}
