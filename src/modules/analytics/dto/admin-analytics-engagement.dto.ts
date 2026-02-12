import { IsNumberString, IsOptional } from 'class-validator';

export class AdminAnalyticsEngagementDto {
  @IsOptional()
  @IsNumberString()
  days?: string;
}
