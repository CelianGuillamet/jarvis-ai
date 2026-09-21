import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import { INBOX_ZERO_STEPS, type InboxZeroStep } from '../inbox-zero.types';

export class InboxZeroStepDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;

  @IsString()
  @IsIn(INBOX_ZERO_STEPS)
  step!: InboxZeroStep;
}
