import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PrintTestJobDto {
  @IsOptional()
  @IsBoolean()
  includeAnswerKey?: boolean;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;
}
