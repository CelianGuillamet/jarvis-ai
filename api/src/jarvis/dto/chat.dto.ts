import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;
}
