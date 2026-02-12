import { IsNumberString, IsOptional } from 'class-validator';

export class PracticeQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
