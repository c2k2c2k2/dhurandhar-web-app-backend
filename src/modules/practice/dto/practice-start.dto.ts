import { PracticeMode, QuestionDifficulty } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PracticeStartDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsEnum(PracticeMode)
  mode?: PracticeMode;

  @IsOptional()
  @IsObject()
  configJson?: {
    count?: number;
    difficulty?: QuestionDifficulty;
  };
}
