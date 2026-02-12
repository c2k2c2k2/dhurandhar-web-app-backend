import { IsNumberString, IsOptional } from 'class-validator';

export class AnalyticsTestBreakdownDto {
  @IsOptional()
  @IsNumberString()
  days?: string;
}
