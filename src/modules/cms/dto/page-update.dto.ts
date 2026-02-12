import { PageStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PageUpdateDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  bodyJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;
}
