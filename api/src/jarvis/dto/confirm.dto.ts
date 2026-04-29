import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConfirmDto {
  @IsString()
  @MinLength(1)
  actionId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;
}
