import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { QuestionDifficulty, QuestionType } from '@prisma/client';

export class UpdateQuestionDto {
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
  @IsObject()
  statementJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  optionsJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  explanationJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  correctAnswerJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
