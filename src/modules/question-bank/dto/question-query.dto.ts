import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { QuestionDifficulty, QuestionType } from '@prisma/client';

export class QuestionQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsOptional()
  @IsBooleanString()
  isPublished?: string;
}
