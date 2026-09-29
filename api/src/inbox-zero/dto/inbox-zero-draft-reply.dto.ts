import { IsOptional, IsString, MinLength } from 'class-validator';

import { MaxLength } from 'class-validator';
import { REQUEST_LIMITS } from '../../http/request-limits';

export class InboxZeroDraftReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.objectIdChars)
  messageId!: string;
}
