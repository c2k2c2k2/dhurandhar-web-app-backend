import { IsNumberString, IsOptional } from 'class-validator';

export class AnalyticsPaginationDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
