import { IsDateString, IsOptional } from 'class-validator';

export class AdminOpsSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
