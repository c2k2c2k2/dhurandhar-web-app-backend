import { TestType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class TestCreateDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TestType)
  type!: TestType;

  @IsObject()
  configJson!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
