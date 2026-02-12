import { IsObject, IsOptional } from 'class-validator';

export class AttemptSaveDto {
  @IsOptional()
  @IsObject()
  answersJson?: Record<string, unknown>;
}
