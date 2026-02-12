import { PageStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PageCreateDto {
  @IsString()
  slug!: string;

  @IsString()
  title!: string;

  @IsObject()
  bodyJson!: Record<string, unknown>;

  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;
}
