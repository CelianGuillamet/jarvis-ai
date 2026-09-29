import { IsOptional, IsString, MinLength } from 'class-validator';

import { MaxLength } from 'class-validator';
import { REQUEST_LIMITS } from '../../http/request-limits';

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.chatChars)
  text!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;
}
