import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AdminExportSubscriptionsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
