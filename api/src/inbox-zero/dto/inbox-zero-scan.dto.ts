import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { MaxLength } from 'class-validator';
import { REQUEST_LIMITS } from '../../http/request-limits';

export class InboxZeroScanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.sessionChars)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(REQUEST_LIMITS.queryChars)
  query?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
