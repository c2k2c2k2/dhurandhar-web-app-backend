import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class AppConfigQueryDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
