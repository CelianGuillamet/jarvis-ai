import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import { INBOX_ZERO_STEPS, type InboxZeroStep } from '../inbox-zero.types';

import { MaxLength } from 'class-validator';
import { REQUEST_LIMITS } from '../../http/request-limits';

export class InboxZeroStepDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;

  @IsString()
  @IsIn(INBOX_ZERO_STEPS)
  step!: InboxZeroStep;
}
