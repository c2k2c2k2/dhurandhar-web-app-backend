import { IsDateString, IsOptional } from 'class-validator';

export class AdminAnalyticsRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
