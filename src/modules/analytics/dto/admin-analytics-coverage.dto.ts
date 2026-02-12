import { IsOptional, IsString } from 'class-validator';
import { AnalyticsPaginationDto } from './analytics-pagination.dto';

export class AdminAnalyticsCoverageDto extends AnalyticsPaginationDto {
  @IsOptional()
  @IsString()
  subjectId?: string;
}
