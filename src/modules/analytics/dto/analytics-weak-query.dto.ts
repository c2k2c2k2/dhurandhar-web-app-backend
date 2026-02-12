import { IsNumberString, IsOptional } from 'class-validator';

export class AnalyticsWeakQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
