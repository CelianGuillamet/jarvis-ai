import { Module } from '@nestjs/common';
import { CommandJournalService } from './command-journal.service';
import { CommandExecutionService } from './command-execution.service';

@Module({
  providers: [CommandJournalService, CommandExecutionService],
  exports: [CommandJournalService, CommandExecutionService],
})
export class CommandJournalModule {}
