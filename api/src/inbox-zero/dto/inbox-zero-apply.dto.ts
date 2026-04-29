import {
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

export class InboxZeroApplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;

  @IsString()
  @IsIn(INBOX_ZERO_ACTION_TYPES)
  action!: InboxZeroActionType;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  messageIds!: string[];

  @ValidateIf((o) => o.action === 'remind')
  @IsString()
  @MinLength(1)
  reminderWhen!: string;

  @ValidateIf((o) => o.action === 'remind')
  @IsOptional()
  @IsString()
  @MinLength(1)
  reminderText?: string;

  @ValidateIf((o) => o.action === 'send_reply')
  @IsString()
  @MinLength(1)
  replyText!: string;

  @IsOptional()
  @IsBoolean()
  archiveAfter?: boolean;
}

