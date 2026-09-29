import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { REQUEST_LIMITS } from './request-limits';

export class ConversationQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;
}

export class MessageQueryDto extends ConversationQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.objectIdChars)
  messageId!: string;
}
