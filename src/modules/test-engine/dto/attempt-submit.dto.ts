import { IsObject, IsOptional } from 'class-validator';

export class AttemptSubmitDto {
  @IsOptional()
  @IsObject()
  answersJson?: Record<string, unknown>;
}
