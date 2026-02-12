import { QuestionDifficulty } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PrintPracticeJobDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topicIds?: string[];

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsInt()
  @Min(1)
  count!: number;

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
