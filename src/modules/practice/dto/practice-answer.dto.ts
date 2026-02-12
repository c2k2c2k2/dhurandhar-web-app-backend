import { PracticeEventType } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PracticeAnswerDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsObject()
  answerJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @IsEnum(PracticeEventType)
  eventType?: PracticeEventType;
}
