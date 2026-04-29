import { IsOptional, IsString, MinLength } from 'class-validator';

export class InboxZeroDraftReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;

  @IsString()
  @MinLength(1)
  messageId!: string;
}

