import { CommandCompensationService } from './command-compensation.service';
import { Module } from '@nestjs/common';
import { CommandJournalService } from './command-journal.service';
import { CommandExecutionService } from './command-execution.service';

@Module({
  providers: [
    CommandJournalService,
    CommandExecutionService,
    CommandCompensationService,
  ],
  exports: [
    CommandJournalService,
    CommandExecutionService,
    CommandCompensationService,
  ],
})
export class CommandJournalModule {}
