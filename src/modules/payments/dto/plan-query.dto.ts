import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class PlanQueryDto {
  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
