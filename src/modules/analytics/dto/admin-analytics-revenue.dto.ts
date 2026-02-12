import { IsOptional, IsString } from 'class-validator';
import { AdminAnalyticsRangeDto } from './admin-analytics-range.dto';

export class AdminAnalyticsRevenueDto extends AdminAnalyticsRangeDto {
  @IsOptional()
  @IsString()
  period?: string;
}
