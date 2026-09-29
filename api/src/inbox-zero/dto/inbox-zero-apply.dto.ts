import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  INBOX_ZERO_ACTION_TYPES,
  type InboxZeroActionType,
} from '../inbox-zero.types';

import { MaxLength } from 'class-validator';
import { REQUEST_LIMITS } from '../../http/request-limits';

export class InboxZeroApplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;

  @IsString()
  @IsIn(INBOX_ZERO_ACTION_TYPES)
  action!: InboxZeroActionType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(REQUEST_LIMITS.batchItems)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(REQUEST_LIMITS.objectIdChars, { each: true })
  messageIds!: string[];

  @ValidateIf((o: InboxZeroApplyDto) => o.action === 'remind')
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.queryChars)
  reminderWhen!: string;

  @ValidateIf((o: InboxZeroApplyDto) => o.action === 'remind')
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.chatChars)
  reminderText?: string;

  @ValidateIf((o: InboxZeroApplyDto) => o.action === 'send_reply')
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.replyChars)
  replyText!: string;

  @IsOptional()
  @IsBoolean()
  archiveAfter?: boolean;
}
