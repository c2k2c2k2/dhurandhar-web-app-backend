import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PrintTestJobDto {
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
