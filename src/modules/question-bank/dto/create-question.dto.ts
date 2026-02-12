import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { QuestionDifficulty, QuestionType } from '@prisma/client';

export class CreateQuestionDto {
  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsObject()
  statementJson!: Record<string, unknown>;

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
