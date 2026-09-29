import { Module } from '@nestjs/common';
import { CommandJournalService } from './command-journal.service';

@Module({
  providers: [CommandJournalService],
  exports: [CommandJournalService],
})
export class CommandJournalModule {}
