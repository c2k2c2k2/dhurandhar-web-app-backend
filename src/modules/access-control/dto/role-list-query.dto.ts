import { IsOptional, IsString } from 'class-validator';

export class RoleListQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
