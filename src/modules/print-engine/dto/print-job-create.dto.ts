import { PrintJobType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PrintJobCreateDto {
  @IsEnum(PrintJobType)
  type!: PrintJobType;

  @IsOptional()
  @IsString()
  testId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];

  @IsOptional()
  @IsBoolean()
  includeAnswerKey?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;
}
